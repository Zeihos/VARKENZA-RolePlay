'use strict';
// Local-only transport for the open.mp Pawn HTTP native. This is a single-process
// integration prototype, not a public game gateway or a replacement for a DB.
const crypto = require('node:crypto');
const { DEPOT, MAX_GARAGE_SLOTS } = require('./vehicle-catalog');
const {bankBalance,bankAmount,validBankLocation,applyBankOperation} = require('./banking');
const { FUEL_CAPACITY, FUEL_COST, FUEL_BURN_INTERVAL_MS, VEHICLE_WEAR_PER_TICK, FUEL_STATION, REPAIR_STATION, repairPrice, validStation, vehicleState } = require('./vehicle-services');

const LINK_MS = 5 * 60_000;
const ONLINE_MS = 95_000;
const SHIFT_MS = 120_000;
const REPORT_MS = 60_000;
const STAFF_CODE_MS = 2 * 60_000;
const POSITION_MS = 20_000;
const CASH_TRANSFER_COOLDOWN_MS = 5_000;
const CASH_LIMIT = 100_000_000;
const GAME_SECRET = process.env.GAME_BRIDGE_SECRET || '';
const enabled = /^[A-Za-z0-9_-]{32,128}$/.test(GAME_SECRET) && !/^replace[-_]/i.test(GAME_SECRET);

function makeGameBridge({ readStore, writeStore, audit, formBody, resolveStaff }) {
  const codes = new Map();      // sha256(one-time code) -> {userId, characterId, expiresAt}
  const sessions = new Map();   // 48-character opaque game sid -> {userId, characterId, seen}
  const attempts = new Map();
  const staffCodes = new Map(); // hash -> staffId + bound online character + expiry
  const staffAttempts = new Map();
  const commands = new Map(); // game sid -> pending command array, local RAM until restart
  const MAX_COMMANDS = 4;
  const transferLocks = new Set();
  const transferTimes = new Map();
  function issueStaffCode(staff, characterId) {
    prune();
    if (!enabled) return null;
    if (![...sessions.values()].some(x => x.characterId === characterId)) return null;
    for (const [key, item] of staffCodes) if (item.characterId === characterId || item.staffId === staff.staffId) staffCodes.delete(key);
    const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
    staffCodes.set(hash(code), { staffId: staff.staffId, characterId, expiresAt: Date.now() + STAFF_CODE_MS });
    return { code, expiresAt: new Date(Date.now() + STAFF_CODE_MS).toISOString() };
  }
  async function activeStaff(session) {
    if (!session.staffId) return null;
    const staff = await resolveStaff(session.staffId);
    if (!staff) { delete session.staffId; return null; }
    return staff;
  }

  function enqueueAdminAction(characterId, type, message) {
    prune();
    const entry = [...sessions].find(([, s]) => s.characterId === characterId);
    if (!entry) return null;
    const [sid] = entry;
    const list = commands.get(sid) || [];
    if (list.length >= MAX_COMMANDS || list.some(c => c.type === 'KICK')) return { error: 'Очередь игрока заполнена или уже есть kick.' };
    const cmd = { id: crypto.randomBytes(8).toString('hex'), type, message, at: Date.now() };
    if (type === 'KICK') commands.set(sid, [cmd]);
    else { list.push(cmd); commands.set(sid, list); }
    return { id: cmd.id };
  }

  const hash = code => crypto.createHash('sha256').update(code).digest('hex');
  const isLoopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  const safeEqual = (left, right) => {
    const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const fail = (res, status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(`ERR|${message}\n`);
  };
  const ok = (res, fields) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(`OK|${fields.join('|')}`);
  };
  function prune() {
    const now = Date.now();
    for (const [code, c] of codes) if (c.expiresAt < now) codes.delete(code);
    for (const [code, c] of staffCodes) if (c.expiresAt < now) staffCodes.delete(code);
    for (const [sid, attempt] of staffAttempts) if (attempt.until < now) staffAttempts.delete(sid);
    for (const [sid, s] of sessions) if (s.seen + ONLINE_MS < now) { sessions.delete(sid); commands.delete(sid); transferTimes.delete(sid); transferLocks.delete(sid); }
    for (const [ip, r] of attempts) if (r.until < now) attempts.delete(ip);
  }
  async function issueCode(userId, characterId) {
    if (!enabled) { const err = new Error('Игровой мост не настроен (GAME_BRIDGE_SECRET).'); err.status = 503; throw err; }
    const state = await readStore();
    const user = state.users.find(u => u.id === userId);
    const character = state.characters.find(c => c.id === characterId && c.userId === userId);
    if (!user || user.blocked || !character) { const err = new Error('Персонаж не найден.'); err.status = 404; throw err; }
    prune();
    // Invalidate older unused codes for this character.
    for (const [key, c] of codes) if (c.characterId === characterId) codes.delete(key);
    const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
    const expiresAt = Date.now() + LINK_MS;
    codes.set(hash(code), { userId, characterId, expiresAt });
    await audit('game.code_issued', { userId, characterId }); // never log codes
    return { code, character: character.name, expiresAt: new Date(expiresAt).toISOString() };
  }
  function currentSessions() { prune(); return [...sessions.values()]; }
  function isCharacterOnline(characterId) { return currentSessions().some(s => s.characterId === characterId); }
  function status() {
    const live = currentSessions();
    return { bridgeEnabled: enabled, online: enabled ? live.length : null, gameAuth: 'one-time-code', shiftCooldownSeconds: SHIFT_MS / 1000 };
  }
  async function adminStatus() {
    const state = await readStore();
    const live = currentSessions();
    return { ...status(), players: live.map(s => ({
      name: state.characters.find(c => c.id === s.characterId)?.name || '?',
      characterId: s.characterId, connectedAt: new Date(s.connected).toISOString(), staffLinked: Boolean(s.staffId), pendingCommands: (commands.get([...sessions].find(([, x]) => x === s)?.[0]) || []).length
    })) };
  }
  function revokeStaff(staffId) {
    for (const [key, item] of staffCodes) if (item.staffId === staffId) staffCodes.delete(key);
    for (const session of sessions.values()) if (session.staffId === staffId) delete session.staffId;
  }
  function revokeCharacter(characterId) {
    for (const [sid, item] of sessions) if (item.characterId === characterId) { sessions.delete(sid); commands.delete(sid); transferTimes.delete(sid); transferLocks.delete(sid); }
    for (const [key, item] of codes) if (item.characterId === characterId) codes.delete(key);
  }
  function revokeUser(userId) {
    for (const [sid, s] of sessions) if (s.userId === userId) { sessions.delete(sid); commands.delete(sid); transferTimes.delete(sid); transferLocks.delete(sid); }
    for (const [key, c] of codes) if (c.userId === userId) codes.delete(key);
  }
  async function route(req, res, pathname) {
    if (!/^\/api\/game\/(link|job|work|ping|logout|report|ack|position|garage|staff-link|staff-off|staff-command|bank|pay)$/.test(pathname)) return false;
    if (req.method !== 'POST') { fail(res, 405, 'METHOD'); return true; }
    if (!enabled) { fail(res, 503, 'NOT_CONFIGURED'); return true; }
    if (!isLoopback(req.socket.remoteAddress)) { fail(res, 403, 'LOCAL_ONLY'); return true; }
    try {
      const body = await formBody(req);
      if (!safeEqual(body.key || '', GAME_SECRET)) { fail(res, 403, 'ACCESS_DENIED'); return true; }
      prune();
      if (pathname === '/api/game/link') {
        const ip = req.socket.remoteAddress || '';
        let attempt = attempts.get(ip);
        if (!attempt) attempt = { count: 0, until: Date.now() + 10 * 60_000 };
        attempt.count++;
        attempts.set(ip, attempt);
        if (attempt.count > 40) { fail(res, 429, 'RATE_LIMIT'); return true; }
        const code = String(body.code || '');
        const name = String(body.name || '');
        if (!/^\d{8}$/.test(code) || !/^[A-Za-z]{2,16}_[A-Za-z]{2,16}$/.test(name) || name.length > 20) {
          fail(res, 422, 'BAD_CODE_OR_NAME'); return true;
        }
        const codeKey = hash(code);
        const item = codes.get(codeKey);
        if (!item || item.expiresAt < Date.now()) { fail(res, 401, 'INVALID_OR_EXPIRED_CODE'); return true; }
        const state = await readStore();
        const user = state.users.find(u => u.id === item.userId);
        const char = state.characters.find(c => c.id === item.characterId && c.userId === item.userId);
        if (!user || user.blocked || !char) { fail(res, 403, 'ACCOUNT_BLOCKED'); return true; }
        if (char.name.toLowerCase() !== name.toLowerCase()) { fail(res, 403, 'NAME_MISMATCH'); return true; }
        // Consume only once authorization and name are confirmed.
        codes.delete(codeKey);
        for (const [sid, s] of sessions) if (s.characterId === char.id) { sessions.delete(sid); commands.delete(sid); transferTimes.delete(sid); transferLocks.delete(sid); }
        const sid = crypto.randomBytes(24).toString('hex');
        sessions.set(sid, { userId: user.id, characterId: char.id, seen: Date.now(), connected: Date.now() });
        await audit('game.character_linked', { characterId: char.id, userId: user.id });
        const pos = char.position;
        ok(res, [sid, char.name, char.skin, char.cash || 0, char.job || 0, char.level || 1,
          pos ? Number(pos.x).toFixed(3) : '', pos ? Number(pos.y).toFixed(3) : '', pos ? Number(pos.z).toFixed(3) : '',
          pos ? Number(pos.a).toFixed(3) : '', pos ? pos.interior : '', pos ? pos.world : '']);
        return true;
      }
      const sid = String(body.sid || '');
      if (!/^[a-f0-9]{48}$/.test(sid)) { fail(res, 401, 'INVALID_SESSION'); return true; }
      const session = sessions.get(sid);
      if (!session) { fail(res, 401, 'SESSION_EXPIRED'); return true; }
      const state = await readStore();
      const user = state.users.find(u => u.id === session.userId);
      const character = state.characters.find(c => c.id === session.characterId && c.userId === session.userId);
      if (!user || user.blocked || !character) {
        sessions.delete(sid); fail(res, 403, 'ACCOUNT_BLOCKED'); return true;
      }
      if (sessions.get(sid) !== session) { fail(res, 401, 'SESSION_EXPIRED'); return true; }
      session.seen = Date.now();
      if (pathname === '/api/game/pay') {
        // The bridge is local-only and the Pawn gamemode verifies RP proximity.
        // Never accept balances or character names from the client.
        const targetSid = String(body.target || '');
        const amountText = String(body.amount || '');
        const amount = Number(amountText);
        if (!/^[a-f0-9]{48}$/.test(targetSid) || !/^[1-9]\d{0,5}$/.test(amountText) || amount > 100000)
          { fail(res, 422, 'INVALID_TRANSFER'); return true; }
        const targetSession = sessions.get(targetSid);
        if (!targetSession || targetSession === session || targetSession.characterId === session.characterId)
          { fail(res, 409, 'TARGET_OFFLINE'); return true; }
        const now = Date.now();
        if (transferLocks.has(sid) || now - (transferTimes.get(sid) || 0) < CASH_TRANSFER_COOLDOWN_MS)
          { fail(res, 429, 'TRANSFER_COOLDOWN'); return true; }
        transferLocks.add(sid);
        let result;
        try {
          result = await writeStore(data => {
            if (sessions.get(sid) !== session || sessions.get(targetSid) !== targetSession)
              return { error: 'SESSION_EXPIRED' };
            const fromUser = data.users.find(u => u.id === session.userId);
            const toUser = data.users.find(u => u.id === targetSession.userId);
            const from = data.characters.find(c => c.id === session.characterId && c.userId === session.userId);
            const to = data.characters.find(c => c.id === targetSession.characterId && c.userId === targetSession.userId);
            if (!fromUser || !toUser || fromUser.blocked || toUser.blocked || !from || !to)
              return { error: 'ACCOUNT_BLOCKED' };
            const cash = from.cash ?? 0, recipientCash = to.cash ?? 0;
            if (!Number.isSafeInteger(cash) || !Number.isSafeInteger(recipientCash) || cash < 0 || recipientCash < 0 || cash > CASH_LIMIT || recipientCash > CASH_LIMIT)
              return { error: 'INVALID_CASH' };
            if (cash < amount) return { error: 'INSUFFICIENT_CASH' };
            if (recipientCash + amount > CASH_LIMIT) return { error: 'CASH_LIMIT' };
            from.cash = cash - amount;
            to.cash = recipientCash + amount;
            return { senderCash: from.cash, recipientCash: to.cash, recipientName: to.name, fromId: from.id, toId: to.id };
          });
          if (!result.error) transferTimes.set(sid, now);
        } finally { transferLocks.delete(sid); }
        if (result.error) { fail(res, result.error === 'SESSION_EXPIRED' ? 401 : 409, result.error); return true; }
        await audit('economy.cash_transfer', { fromCharacterId: result.fromId, toCharacterId: result.toId, amount });
        ok(res, ['TRANSFER', result.senderCash, result.recipientName, amount]);
        return true;
      }
      if (pathname === '/api/game/bank') {
        const action = String(body.action || '').toUpperCase();
        if (action === 'BALANCE') {ok(res,['BANK',character.cash||0,bankBalance(character),'BALANCE',0]);return true;}
        const amount = bankAmount(String(body.amount ?? ''));
        if (!['DEPOSIT','WITHDRAW'].includes(action) || amount === null) {fail(res,422,'INVALID_AMOUNT');return true;}
        if (!validBankLocation(body)) {fail(res,422,'NOT_AT_BANK');return true;}
        const result = await writeStore(data => {
          if (sessions.get(sid) !== session) return {error:'SESSION_EXPIRED'};
          const u = data.users.find(u=>u.id===session.userId);
          const c = data.characters.find(c=>c.id===character.id && c.userId===session.userId);
          if (!u || u.blocked || !c) return {error:'ACCOUNT_BLOCKED'};
          return applyBankOperation(c,action,amount);
        });
        if (result.error) {fail(res,result.error === 'SESSION_EXPIRED' ? 401 : 409,result.error);return true;}
        await audit('bank.game_operation',{characterId:character.id,userId:session.userId,action,amount});
        ok(res,['BANK',result.cash,result.bank,action,amount]);return true;
      }
      // v0.10: record measured car damage even if the player disconnects without /park.
      // Damage can only lower persisted health; absent health keeps legacy client behavior.
      async function saveActiveVehicleDamage() {
        if (body.health === undefined || !session.activeVehicle) return true;
        if (!/^[0-9]{1,4}$/.test(String(body.health))) return false;
        const health = Number(body.health);
        if (!Number.isInteger(health) || health < 250 || health > 1000) return false;
        return await writeStore(s => {
          if (sessions.get(sid) !== session) return false;
          const v = s.vehicles.find(x=>x.id===session.activeVehicle && x.characterId===character.id && x.userId===session.userId);
          if (!v) return false;
          v.health = Math.min(vehicleState(v).health,health);
          return true;
        });
      }
      if (pathname === '/api/game/staff-link') {
        const entry = staffAttempts.get(sid) || { count: 0, until: Date.now() + 600_000 };
        entry.count += 1; staffAttempts.set(sid, entry);
        if (entry.count > 10) { fail(res, 429, 'RATE_LIMIT'); return true; }
        const code = String(body.code || '');
        if (!/^\d{8}$/.test(code)) { fail(res, 422, 'BAD_STAFF_CODE'); return true; }
        const codeKey = hash(code);
        const offer = staffCodes.get(codeKey);
        if (!offer || offer.expiresAt < Date.now() || offer.characterId !== session.characterId) {
          fail(res, 401, 'INVALID_STAFF_CODE'); return true;
        }
        const staff = await resolveStaff(offer.staffId);
        if (!staff || !['owner','administrator','moderator'].includes(staff.role)) {
          fail(res, 403, 'STAFF_ACCESS_DENIED'); return true;
        }
        staffCodes.delete(codeKey);
        for (const other of sessions.values()) if (other.staffId === staff.staffId) delete other.staffId;
        session.staffId = staff.staffId;
        session.hadStaff = true;
        await audit('game.staff_linked', { characterId: session.characterId, staffId: staff.staffId });
        ok(res, [staff.role.toUpperCase()]); return true;
      }
      if (pathname === '/api/game/staff-off') {
        delete session.staffId; ok(res, ['STAFF_DISABLED']); return true;
      }
      if (pathname === '/api/game/staff-command') {
        const type = String(body.action || '').toUpperCase();
        const permitted = ['GOTO','GETHERE','FREEZE','UNFREEZE','SPEC','SPECOFF','VEH','CHAT'];
        if (!permitted.includes(type)) { fail(res, 422, 'UNKNOWN_STAFF_ACTION'); return true; }
        const staff = await activeStaff(session);
        if (!staff || !['owner','administrator','moderator'].includes(staff.role)) {
          fail(res, 403, 'STAFF_ACCESS_DENIED'); return true;
        }
        if (type === 'CHAT') {
          const message = String(body.message || '');
          if (!/^[A-Za-z0-9 ,.?!()_\-]{1,100}$/.test(message)) { fail(res, 422, 'BAD_CHAT'); return true; }
          await audit('game.staff_chat', { characterId: session.characterId, staffId: staff.staffId, length: message.length });
          ok(res, ['CHAT']); return true;
        }
        if (type === 'VEH') {
          const model = Number(body.model);
          if (!Number.isInteger(model) || model < 400 || model > 611) { fail(res, 422, 'BAD_MODEL'); return true; }
          await audit('game.staff_vehicle', { characterId: session.characterId, model, staffId: staff.staffId });
          ok(res, [type, model]); return true;
        }
        if (type === 'SPECOFF') { ok(res, [type]); return true; }
        const targetSid = String(body.target || '');
        const target = sessions.get(targetSid);
        if (!/^[a-f0-9]{48}$/.test(targetSid) || !target || target === session || target.seen + ONLINE_MS < Date.now()) {
          fail(res, 404, 'TARGET_NOT_ONLINE'); return true;
        }
        const targetState = await readStore();
        const targetUser = targetState.users.find(u => u.id === target.userId);
        if (!targetUser || targetUser.blocked) { fail(res, 404, 'TARGET_NOT_ONLINE'); return true; }
        await audit('game.staff_command', { type, staffId: staff.staffId, source: session.characterId, target: target.characterId });
        ok(res, [type]); return true;
      }
      if (pathname === '/api/game/garage') {
        const action = String(body.action || '').toUpperCase();
        if (action === 'LIST') {
          const cars = state.vehicles.filter(v => v.characterId === character.id).sort((a,b)=>a.slot-b.slot);
          ok(res, ['GARAGE', ...(cars.length ? cars.map(v=>`${v.slot},${v.model},${v.name}`) : ['EMPTY'])]);
          return true;
        }
        const liveCar = () => state.vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id && v.userId === session.userId);
        if (action === 'SPAWN') {
          const slot = Number(body.slot);
          if (!Number.isInteger(slot) || slot < 1 || slot > MAX_GARAGE_SLOTS) { fail(res, 422, 'BAD_SLOT'); return true; }
          if (session.activeVehicle) { fail(res, 409, 'PARK_CURRENT_VEHICLE_FIRST'); return true; }
          const v = state.vehicles.find(v=>v.characterId===character.id && v.slot===slot);
          if (!v) { fail(res, 404, 'VEHICLE_NOT_FOUND'); return true; }
          const pos = v.position || DEPOT;
          const car = vehicleState(v);
          session.activeVehicle = v.id;
          session.engineOn = false;
          session.lastFuelBurn = Date.now();
          ok(res, ['SPAWN', v.slot, v.model,
            Number(pos.x).toFixed(3), Number(pos.y).toFixed(3), Number(pos.z).toFixed(3),
            Number(pos.a).toFixed(3), pos.interior, pos.world, car.fuel, car.health, Number(car.locked)]);
          return true;
        }
        if (['STATUS','ENGINE','LOCK','DRIVE','REFUEL','REPAIR'].includes(action)) {
          if (!session.activeVehicle) { fail(res, 409, 'NO_ACTIVE_VEHICLE'); return true; }
          const current = liveCar();
          if (!current) { fail(res, 404, 'VEHICLE_NOT_FOUND'); return true; }
          if (action === 'ENGINE') {
            const turnOn = String(body.value) === '1';
            if (body.value !== '1' && body.value !== '0') { fail(res, 422, 'BAD_ENGINE_VALUE'); return true; }
            if (turnOn && vehicleState(current).fuel <= 0) { fail(res, 409, 'OUT_OF_FUEL'); return true; }
            if (turnOn && vehicleState(current).health < 300) { fail(res, 409, 'ENGINE_DAMAGED'); return true; }
            session.engineOn = turnOn;
            session.lastFuelBurn = Date.now();
          }
          if (action === 'LOCK') {
            const updated = await writeStore(s => {
              const v = s.vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id && v.userId === session.userId);
              if (!v || sessions.get(sid) !== session) return null;
              v.locked = !vehicleState(v).locked;
              return vehicleState(v);
            });
            if (!updated) { fail(res, 409, 'SESSION_EXPIRED'); return true; }
          }
          if (action === 'DRIVE') {
            if (!session.engineOn) { fail(res, 409, 'ENGINE_OFF'); return true; }
            const now = Date.now();
            if (now - session.lastFuelBurn >= FUEL_BURN_INTERVAL_MS) {
              const updated = await writeStore(s => {
                const v = s.vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id && v.userId === session.userId);
                if (!v || sessions.get(sid) !== session) return null;
                const saved = vehicleState(v);
                const observed = Number(body.health);
                // The game server may report further collision damage, never a free health increase.
                const physical = Number.isFinite(observed) && observed >= 250 && observed <= 1000 ? Math.round(observed) : saved.health;
                v.health = Math.max(250, Math.min(saved.health, physical) - VEHICLE_WEAR_PER_TICK);
                v.fuel = Math.max(0, saved.fuel - 1);
                return vehicleState(v);
              });
              if (!updated) { fail(res, 409, 'SESSION_EXPIRED'); return true; }
              session.lastFuelBurn = now;
              if (updated.fuel === 0) session.engineOn = false;
            }
          }
          if (action === 'REPAIR') {
            if (session.engineOn) { fail(res, 409, 'TURN_ENGINE_OFF'); return true; }
            if (!validStation(body, REPAIR_STATION)) { fail(res, 422, 'NOT_AT_REPAIR_STATION'); return true; }
            const observed = Number(body.health);
            if (!Number.isFinite(observed) || observed < 250 || observed > 1000) {
              fail(res, 422, 'INVALID_VEHICLE_HEALTH'); return true;
            }
            const repaired = await writeStore(s => {
              if (sessions.get(sid) !== session) return null;
              const c = s.characters.find(c => c.id === character.id && c.userId === session.userId);
              const v = s.vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id && v.userId === session.userId);
              const u = s.users.find(u => u.id === session.userId && !u.blocked);
              if (!c || !v || !u) return null;
              // Prevent overlapping/stale physical-health reports from charging twice.
              if (session.lastRepairAt && Date.now() - session.lastRepairAt < 10_000) return {error:'REPAIR_COOLDOWN'};
              const health = Math.min(vehicleState(v).health, Math.round(observed));
              const price = repairPrice(health);
              if (price === 0) return {error:'VEHICLE_FULLY_REPAIRED'};
              if (!Number.isSafeInteger(c.cash) || c.cash < price) return {error:'INSUFFICIENT_FUNDS'};
              c.cash -= price;
              v.health = 1000;
              v.repairedAt = new Date().toISOString();
              session.lastRepairAt = Date.now();
              return {price, cash:c.cash, vehicleId:v.id};
            });
            if (!repaired) { fail(res, 409, 'SESSION_EXPIRED'); return true; }
            if (repaired.error) { fail(res, 409, repaired.error); return true; }
            await audit('garage.vehicle_repaired', {userId:session.userId, characterId:character.id, vehicleId:repaired.vehicleId, amount:repaired.price});
          }
          if (action === 'REFUEL') {
            if (session.engineOn) { fail(res, 409, 'TURN_ENGINE_OFF'); return true; }
            if (!validStation(body, FUEL_STATION)) { fail(res, 422, 'NOT_AT_FUEL_STATION'); return true; }
            const charged = await writeStore(s => {
              if (sessions.get(sid) !== session) return null;
              const c = s.characters.find(c => c.id === character.id && c.userId === session.userId);
              const v = s.vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id && v.userId === session.userId);
              if (!c || !v) return null;
              const amount = FUEL_CAPACITY - vehicleState(v).fuel;
              if (amount < 1) return {error:'TANK_FULL'};
              const price = amount * FUEL_COST;
              if (!Number.isSafeInteger(c.cash) || c.cash < price) return {error:'INSUFFICIENT_FUNDS'};
              c.cash -= price;
              v.fuel = FUEL_CAPACITY;
              return {price, cash:c.cash, vehicleId:v.id};
            });
            if (!charged) { fail(res, 409, 'SESSION_EXPIRED'); return true; }
            if (charged.error) { fail(res, 409, charged.error); return true; }
            session.lastFuelBurn = Date.now();
            await audit('garage.refueled', {userId:session.userId, characterId:character.id, vehicleId:charged.vehicleId, amount:charged.price});
          }
          const fresh = ['STATUS','ENGINE'].includes(action) ? current :
            (await readStore()).vehicles.find(v => v.id === session.activeVehicle && v.characterId === character.id);
          if (!fresh) { fail(res, 409, 'VEHICLE_NOT_FOUND'); return true; }
          const values = vehicleState(fresh);
          ok(res, ['STATE', values.fuel, FUEL_CAPACITY, values.health, Number(values.locked), Number(Boolean(session.engineOn))]);
          return true;
        }
        if (action === 'PARK') {
          if (!session.activeVehicle) { fail(res, 409, 'NO_ACTIVE_VEHICLE'); return true; }
          if (session.engineOn) { fail(res, 409, 'TURN_ENGINE_OFF'); return true; }
          const keys = ['x','y','z','a','interior','world'];
          if (keys.some(k => typeof body[k] !== 'string' || !body[k].trim())) { fail(res, 422, 'INVALID_POSITION'); return true; }
          const vals = keys.map(k=>Number(body[k]));
          const [x,y,z,a,interior,world] = vals;
          const health = body.health === undefined ? vehicleState(liveCar() || {}).health : Number(body.health);
          if (vals.some(n=>!Number.isFinite(n)) || !Number.isFinite(health) || Math.abs(x)>20000 || Math.abs(y)>20000 || z < -300 || z > 2500 || a < 0 || a >= 360 ||
              health < 250 || health > 1000 || !Number.isInteger(interior) || interior < 0 || interior > 255 ||
              !Number.isInteger(world) || world < 0 || world > 999) {
            fail(res, 422, 'INVALID_POSITION'); return true;
          }
          const stored = await writeStore(s => {
            if (sessions.get(sid) !== session) return null;
            const v = s.vehicles.find(x=>x.id===session.activeVehicle && x.characterId===character.id && x.userId===session.userId);
            if (!v) return null;
            v.position = {x,y,z,a,interior,world};
            v.health = Math.min(vehicleState(v).health, Math.round(health));
            v.parkedAt = new Date().toISOString();
            return {slot:v.slot, vehicleId:v.id};
          });
          if (!stored) { fail(res, 409, 'VEHICLE_NOT_FOUND'); return true; }
          delete session.activeVehicle;
          session.engineOn = false;
          await audit('garage.vehicle_parked', {characterId:character.id, vehicleId:stored.vehicleId});
          ok(res, ['PARKED', stored.slot]); return true;
        }
        if (action === 'DESPAWN') { // Vehicle destroyed or CreateVehicle failed; leave parking coordinates unchanged.
          if (!session.activeVehicle) { fail(res, 409, 'NO_ACTIVE_VEHICLE'); return true; }
          if (!await saveActiveVehicleDamage()) {fail(res,422,'INVALID_HEALTH');return true;}
          delete session.activeVehicle;
          session.engineOn = false;
          ok(res, ['DESPAWNED']); return true;
        }
        fail(res, 422, 'UNKNOWN_GARAGE_ACTION'); return true;
      }
      if (pathname === '/api/game/position') {
        if (session.lastPositionAt && Date.now() - session.lastPositionAt < POSITION_MS) {
          fail(res, 429, 'POSITION_COOLDOWN'); return true;
        }
        const keys = ['x','y','z','a','interior','world'];
        if (keys.some(k => typeof body[k] !== 'string' || !body[k].trim())) { fail(res, 422, 'INVALID_POSITION'); return true; }
        const numbers = keys.map(k => Number(body[k]));
        const [x,y,z,a,interior,world] = numbers;
        if (numbers.some(n => !Number.isFinite(n)) ||
            Math.abs(x) > 20000 || Math.abs(y) > 20000 || z < -300 || z > 2500 || a < 0 || a >= 360 ||
            !Number.isInteger(interior) || interior < 0 || interior > 255 ||
            !Number.isInteger(world) || world < 0 || world > 999) {
          fail(res, 422, 'INVALID_POSITION'); return true;
        }
        const pos = { x, y, z, a, interior, world, savedAt: new Date().toISOString() };
        const stored = await writeStore(data => {
          if (sessions.get(sid) !== session) return false;
          const u = data.users.find(u => u.id === session.userId);
          const c = data.characters.find(c => c.id === session.characterId && c.userId === session.userId);
          if (!u || u.blocked || !c) return false;
          c.position = pos; return true;
        });
        if (!stored) { fail(res, 403, 'SESSION_EXPIRED'); return true; }
        session.lastPositionAt = Date.now();
        ok(res, ['POSITION_SAVED']); return true;
      }
      if (pathname === '/api/game/ping') {
        const next = commands.get(sid)?.[0];
        const fields = [character.cash || 0, character.job || 0];
        if (next) fields.push(next.id, next.type, next.message);
        else if (session.hadStaff) fields.push(await activeStaff(session) ? 'STAFF_ON' : 'STAFF_OFF');
        ok(res, fields);
        return true;
      }
      if (pathname === '/api/game/ack') {
        const id = String(body.command || '');
        if (!/^[a-f0-9]{16}$/.test(id)) { fail(res, 422, 'BAD_ACK'); return true; }
        const list = commands.get(sid) || [];
        // Ack only the front command to prevent arbitrary queue changes.
        if (!list.length || list[0].id !== id) { fail(res, 409, 'ACK_NOT_PENDING'); return true; }
        const sent = list.shift();
        if (!list.length) commands.delete(sid);
        if (sent.type === 'KICK') { sessions.delete(sid); commands.delete(sid); }
        await audit('game.staff_action_delivered', { userId: session.userId, characterId: session.characterId, commandId: id, type: sent.type });
        ok(res, ['ACKED']); return true;
      }
      if (pathname === '/api/game/logout') {
        if (!await saveActiveVehicleDamage()) {fail(res,422,'INVALID_HEALTH');return true;}
        sessions.delete(sid); commands.delete(sid); transferTimes.delete(sid); transferLocks.delete(sid); ok(res, ['BYE']); return true;
      }
      if (pathname === '/api/game/report') {
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (message.length < 10 || message.length > 160 || /[\x00-\x1F\x7F]/.test(message)) {
          fail(res, 422, 'INVALID_REPORT'); return true;
        }
        const result = await writeStore(data => {
          const u = data.users.find(u => u.id === session.userId);
          const c = data.characters.find(c => c.id === session.characterId && c.userId === session.userId);
          if (!u || u.blocked || !c || sessions.get(sid) !== session) return { error: 'ACCOUNT_BLOCKED', status: 403 };
          const own = data.gameReports.filter(r => r.userId === u.id);
          const last = own.at(-1);
          if (last && Date.now() - new Date(last.createdAt).getTime() < REPORT_MS) return { error: 'REPORT_COOLDOWN', status: 429 };
          if (own.filter(r => r.status !== 'closed').length >= 3) return { error: 'TOO_MANY_OPEN_REPORTS', status: 429 };
          const now = new Date().toISOString();
          const report = {
            id: crypto.randomUUID(), userId: u.id, characterId: c.id,
            characterName: c.name, message, status: 'open', reply: '', createdAt: now, updatedAt: now
          };
          data.gameReports.push(report);
          return { id: report.id };
        });
        if (result.error) { fail(res, result.status, result.error); return true; }
        await audit('game.report_created', { userId: session.userId, characterId: character.id, reportId: result.id });
        ok(res, ['REPORT_RECEIVED']); return true;
      }
      if (pathname === '/api/game/job') {
        const job = Number(body.job);
        if (![1, 2, 3].includes(job)) { fail(res, 422, 'INVALID_JOB'); return true; }
        const updated = await writeStore(data => {
          const c = data.characters.find(c => c.id === character.id);
          if (!c) throw new Error('Missing character');
          c.job = job;
          return c;
        });
        await audit('game.job_changed', { characterId: character.id, job });
        ok(res, [updated.job]); return true;
      }
      if (pathname === '/api/game/work') {
        const now = Date.now();
        // Serialize validation + payout in the same write lock (prevents double-spend).
        const result = await writeStore(data => {
          const c = data.characters.find(c => c.id === character.id);
          const u = data.users.find(u => u.id === session.userId);
          if (!c || !u || u.blocked || sessions.get(sid) !== session) return { error: 'ACCOUNT_BLOCKED', status: 403 };
          if (![1, 2, 3].includes(c.job)) return { error: 'CHOOSE_JOB', status: 409 };
          const wait = SHIFT_MS - (now - (c.lastWorkAt || 0));
          if (wait > 0) return { error: 'COOLDOWN', status: 429, wait: Math.ceil(wait / 1000) };
          if ((c.cash || 0) > 99_999_000) return { error: 'CASH_LIMIT', status: 409 };
          const earned = crypto.randomInt(160, 251);
          c.cash = (c.cash || 0) + earned;
          c.experience = (c.experience || 0) + 10;
          c.level = 1 + Math.floor(c.experience / 100);
          c.lastWorkAt = now;
          c.gameSync = true;
          return { cash: c.cash, earned, level: c.level, job: c.job };
        });
        if (result.error) { fail(res, result.status, result.error === 'COOLDOWN' ? `COOLDOWN|${result.wait}` : result.error); return true; }
        await audit('game.shift_completed', { userId: session.userId, characterId: character.id, earned: result.earned });
        ok(res, [result.cash, result.earned, result.level]); return true;
      }
      fail(res, 404, 'UNKNOWN'); return true;
    } catch (e) {
      if (e.statusCode && e.statusCode < 500) fail(res, e.statusCode, 'BAD_REQUEST');
      else { console.error('Game bridge error:', e); fail(res, 500, 'SERVER_ERROR'); }
      return true;
    }
  }
  return { route, issueCode, issueStaffCode, status, adminStatus, isCharacterOnline, revokeUser, revokeCharacter, revokeStaff, enqueueAdminAction };
}
module.exports = { makeGameBridge };
