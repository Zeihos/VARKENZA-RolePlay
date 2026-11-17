'use strict';
// VARKENZA player service v0.4: local accounts, characters, reports and forum.
// SQLite default; legacy JSON mode is retained only for migration/diagnostics.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStateStore } = require('./state-store');
const { catalog, findModel, sellPrice, MAX_GARAGE_SLOTS } = require('./vehicle-catalog');
const { vehicleState, repairPrice } = require('./vehicle-services');
const { bankBalance, bankAmount, applyBankOperation } = require('./banking');
const { playerSessionSecret } = require('./runtime-secrets');

const STORE_FILE = process.env.VARKENZA_PLAYERS_FILE || path.join(__dirname, '..', 'data', 'players.json');
const cookieName = 'vk_player_session';
// Never use a publicly documented .env.example placeholder to sign sessions.
const secret = playerSessionSecret(process.env.PLAYER_SESSION_SECRET);
const sessions = new Map();
const attempts = new Map();
const SESSION_MS = 2 * 60 * 60 * 1000;
const SKINS = [0, 7, 14, 26, 46, 60, 98, 120, 188, 193, 211, 250];
let writeQueue = Promise.resolve();

const safeEqual = (a, b) => {
  const aa = Buffer.from(a || ''); const bb = Buffer.from(b || '');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
const sign = id => crypto.createHmac('sha256', secret).update(id).digest('base64url');
const sanitizeUser = u => ({ id: u.id, nickname: u.nickname, email: u.email, blocked: Boolean(u.blocked), createdAt: u.createdAt });
function getCookie(req) {
  const cookie = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
  return cookie ? cookie.slice(cookieName.length + 1) : '';
}
function currentSession(req) {
  const bits = getCookie(req).split('.');
  if (bits.length !== 2 || !bits[0] || !safeEqual(bits[1], sign(bits[0]))) return null;
  const session = sessions.get(bits[0]);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { sessions.delete(bits[0]); return null; }
  return { sid: bits[0], ...session };
}
function setCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookieName}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
function startSession(userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  sessions.set(id, { userId, expiresAt: Date.now() + SESSION_MS });
  return setCookie(`${id}.${sign(id)}`, SESSION_MS / 1000);
}
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}
function passwordMatches(password, stored) {
  const [algo, salt, expected] = String(stored).split('$');
  if (algo !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return safeEqual(actual, expected);
}
async function jsonReadStore() {
  try {
    const obj = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
    if (!obj || !Array.isArray(obj.users) || !Array.isArray(obj.characters) || !Array.isArray(obj.tickets)) throw Error('Broken players store');
    obj.topics ||= []; obj.replies ||= []; obj.gameReports ||= []; obj.staffUsers ||= []; obj.vehicles ||= [];
    if (!Array.isArray(obj.topics) || !Array.isArray(obj.replies) || !Array.isArray(obj.gameReports) || !Array.isArray(obj.staffUsers) || !Array.isArray(obj.vehicles)) throw Error('Broken forum or garage store');
    return obj;
  } catch (e) {
    if (e.code === 'ENOENT') return { users: [], characters: [], tickets: [], topics: [], replies: [], gameReports: [], staffUsers: [], vehicles: [] };
    throw e;
  }
}
function jsonWriteStore(fn) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const state = await jsonReadStore();
    const result = await fn(state);
    // No write on rejected validation; never write while partially mutating.
    await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
    const tmp = `${STORE_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, STORE_FILE);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}
// SQLite default in v0.4. Set VARKENZA_STORAGE=json only to run/rollback legacy tests.
const useJson = process.env.VARKENZA_STORAGE === 'json';
const database = useJson ? null : createStateStore({
  databaseFile: process.env.VARKENZA_SQLITE_FILE || path.join(__dirname, '..', 'data', 'varkenza.sqlite3'),
  legacyFile: STORE_FILE
});
const readStore = useJson ? jsonReadStore : database.readStore;
const writeStore = useJson ? jsonWriteStore : database.writeStore;

function reject(code, message) { const e = new Error(message); e.status = code; throw e; }
function limited(ip, bucket, max = 8) {
  // Bound the size of the in-memory attempt map in this small local prototype.
  if (attempts.size > 2500) attempts.clear();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let item = attempts.get(key);
  if (!item || item.until < now) item = { count: 0, until: now + 10 * 60_000 };
  item.count++;
  attempts.set(key, item);
  if (item.count > max) reject(429, 'Слишком много запросов. Попробуйте позднее.');
}
function clearLimit(ip, bucket) { attempts.delete(`${bucket}:${ip}`); }
function verifyNickname(v) { return typeof v === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(v); }
function verifyEmail(v) { return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function verifyPassword(v) { return typeof v === 'string' && v.length >= 12 && v.length <= 128; }

function makePlayerApi({ send, error, jsonBody, requestOriginAllowed, audit, sessionForAdmin, hasAdminPermission, issueGameCode, revokeGameUser, isGameCharacterOnline }) {
  async function authorizedUser(req) {
    const session = currentSession(req);
    if (!session) return null;
    const state = await readStore();
    const user = state.users.find(x => x.id === session.userId);
    if (!user || user.blocked) return null;
    return { session, state, user };
  }
  async function route(req, res, pathname) {
    const method = req.method;
    const playerApi = pathname.startsWith('/api/auth/') || pathname === '/api/me' || pathname.startsWith('/api/characters') || pathname.startsWith('/api/garage/') || pathname.startsWith('/api/vehicles/') || pathname.startsWith('/api/tickets') || pathname === '/api/reports';
    const forumApi = pathname === '/api/forum/topics' || /^\/api\/forum\/topics\/[^/]+(\/replies)?$/.test(pathname);
    const staffApi = /^\/api\/admin\/forum\/topics\/[^/]+\/lock$/.test(pathname) || pathname === '/api/admin/reports' || /^\/api\/admin\/reports\/[^/]+(\/claim)?$/.test(pathname) || pathname === '/api/admin/players' || pathname === '/api/admin/tickets' || /^\/api\/admin\/tickets\/[^/]+$/.test(pathname) || /^\/api\/admin\/players\/[^/]+\/ban$/.test(pathname);
    if (!playerApi && !staffApi && !forumApi) return false;
    try {
      if (method !== 'GET' && !requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник запроса'), true;
      const ip = req.socket.remoteAddress || 'unknown';
      if (method === 'POST' && pathname === '/api/auth/register') {
        limited(ip, 'register', 6);
        const b = await jsonBody(req);
        const nickname = typeof b.nickname === 'string' ? b.nickname.trim() : '';
        const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
        if (!verifyNickname(nickname) || !verifyEmail(email) || !verifyPassword(b.password)) reject(422, 'Ник: 3–20 латинских символов, цифр или _. Email и пароль (12–128 символов) обязательны.');
        // Hash before enqueue so the write lock isn't held during scrypt.
        const hash = passwordHash(b.password);
        const user = await writeStore(state => {
          if (state.users.some(u => u.nickname.toLowerCase() === nickname.toLowerCase() || u.email === email)) reject(409, 'Никнейм или email уже используются.');
          if (state.users.length >= 20000) reject(503, 'Локальное хранилище заполнено.');
          const u = { id: crypto.randomUUID(), nickname, email, passwordHash: hash, blocked: false, blockReason: '', createdAt: new Date().toISOString() };
          state.users.push(u);
          return sanitizeUser(u);
        });
        await audit('player.registered', { userId: user.id });
        return send(res, 201, { user }, { 'Set-Cookie': startSession(user.id) }), true;
      }
      if (method === 'POST' && pathname === '/api/auth/login') {
        limited(ip, 'login');
        const b = await jsonBody(req);
        const identifier = typeof b.identifier === 'string' ? b.identifier.trim().toLowerCase() : '';
        const pass = b.password;
        if (!identifier || !verifyPassword(pass)) reject(401, 'Неверные учётные данные.');
        const state = await readStore();
        const user = state.users.find(u => u.email === identifier || u.nickname.toLowerCase() === identifier);
        if (!user || !passwordMatches(pass, user.passwordHash)) reject(401, 'Неверные учётные данные.');
        if (user.blocked) reject(403, 'Доступ к аккаунту ограничен.');
        clearLimit(ip, 'login');
        await audit('player.login', { userId: user.id });
        return send(res, 200, { user: sanitizeUser(user) }, { 'Set-Cookie': startSession(user.id) }), true;
      }
      if (method === 'POST' && pathname === '/api/auth/logout') {
        const session = currentSession(req);
        if (session) sessions.delete(session.sid);
        return send(res, 200, { ok: true }, { 'Set-Cookie': setCookie('', 0) }), true;
      }
      if (forumApi) {
        if (method === 'GET' && pathname === '/api/forum/topics') {
          const state = await readStore();
          const items = state.topics.slice(-150).reverse().map(t => ({ ...t,
            author: state.users.find(u => u.id === t.userId)?.nickname || 'Удалённый пользователь',
            replyCount: state.replies.filter(r => r.topicId === t.id).length
          }));
          return send(res, 200, { items }), true;
        }
        if (method === 'GET' && /^\/api\/forum\/topics\/[^/]+$/.test(pathname)) {
          const id = pathname.slice('/api/forum/topics/'.length);
          const state = await readStore();
          const topic = state.topics.find(t => t.id === id);
          if (!topic) return error(res, 404, 'Тема не найдена.'), true;
          const authorName = uid => state.users.find(u => u.id === uid)?.nickname || 'Удалённый пользователь';
          return send(res, 200, { topic: { ...topic, author: authorName(topic.userId) },
            replies: state.replies.filter(r => r.topicId === id).map(r => ({ ...r, author: authorName(r.userId) })) }), true;
        }
        const auth = await authorizedUser(req);
        if (!auth) return error(res, 401, 'Чтобы писать на форуме, войдите в аккаунт.'), true;
        if (method === 'POST' && pathname === '/api/forum/topics') {
          limited(ip, `forum-topic:${auth.user.id}`, 7);
          const b = await jsonBody(req);
          const title = typeof b.title === 'string' ? b.title.trim() : '';
          const content = typeof b.content === 'string' ? b.content.trim() : '';
          if (!['general', 'suggestions', 'factions', 'technical'].includes(b.category) || title.length < 6 || title.length > 120 || content.length < 20 || content.length > 3000) reject(422, 'Категория, название 6–120 и текст 20–3000 символов обязательны.');
          const item = await writeStore(state => {
            if (state.topics.filter(t => t.userId === auth.user.id).length >= 50) reject(409, 'Достигнут лимит тем на тестовом форуме.');
            const t = { id: crypto.randomUUID(), userId: auth.user.id, category: b.category, title, content, locked: false, createdAt: new Date().toISOString() };
            state.topics.push(t); return t;
          });
          await audit('forum.topic_created', { userId: auth.user.id, topicId: item.id });
          return send(res, 201, { item }), true;
        }
        if (method === 'POST' && /^\/api\/forum\/topics\/[^/]+\/replies$/.test(pathname)) {
          const id = pathname.split('/')[4];
          limited(ip, `forum-reply:${auth.user.id}`, 25);
          const b = await jsonBody(req);
          const content = typeof b.content === 'string' ? b.content.trim() : '';
          if (content.length < 3 || content.length > 2000) reject(422, 'Ответ: 3–2000 символов.');
          const item = await writeStore(state => {
            const t = state.topics.find(x => x.id === id);
            if (!t) reject(404, 'Тема не найдена.');
            if (t.locked) reject(403, 'Обсуждение закрыто.');
            const r = { id: crypto.randomUUID(), userId: auth.user.id, topicId: id, content, createdAt: new Date().toISOString() };
            state.replies.push(r); return r;
          });
          await audit('forum.reply_created', { userId: auth.user.id, topicId: id, replyId: item.id });
          return send(res, 201, { item }), true;
        }
        return error(res, 405, 'Метод не поддерживается.'), true;
      }
      if (staffApi) {
        if (!sessionForAdmin(req)) return error(res, 401, 'Требуется авторизация сотрудника.'), true;
        const capability = pathname.includes('/forum/') ? 'forum.moderate'
          : pathname === '/api/admin/reports' ? 'reports.read'
          : pathname.startsWith('/api/admin/reports/') ? 'reports.write'
          : pathname === '/api/admin/players' ? 'players.read'
          : pathname.startsWith('/api/admin/players/') ? 'players.ban'
          : pathname === '/api/admin/tickets' ? 'tickets.read'
          : pathname.startsWith('/api/admin/tickets/') ? 'tickets.write' : '';
        if (!capability || !hasAdminPermission(req, capability)) return error(res, 403, 'Нет прав для этого действия.'), true;
        if (method === 'POST' && /^\/api\/admin\/forum\/topics\/[^/]+\/lock$/.test(pathname)) {
          const id = pathname.split('/')[5];
          const b = await jsonBody(req);
          if (typeof b.locked !== 'boolean') reject(422, 'Укажите locked: boolean.');
          const topic = await writeStore(state => {
            const t = state.topics.find(x => x.id === id);
            if (!t) reject(404, 'Тема не найдена.');
            t.locked = b.locked; return t;
          });
          await audit('forum.topic_lock_changed', { topicId: id, locked: topic.locked });
          return send(res, 200, { item: topic }), true;
        }
        if (!sessionForAdmin(req)) return error(res, 401, 'Требуется авторизация сотрудника.'), true;
        if (method === 'GET' && pathname === '/api/admin/reports') {
          const state = await readStore();
          const reports = state.gameReports.slice(-100).reverse().map(r => ({ ...r,
            author: state.users.find(u => u.id === r.userId)?.nickname || 'Неизвестен' }));
          return send(res, 200, { items: reports, open: state.gameReports.filter(r => r.status === 'open').length }), true;
        }
        if (method === 'POST' && /^\/api\/admin\/reports\/[^/]+\/claim$/.test(pathname)) {
          const id = pathname.split('/')[4];
          if (!/^[0-9a-f-]{36}$/.test(id)) reject(400, 'Неверный ID репорта.');
          const staff = sessionForAdmin(req);
          const b = await jsonBody(req);
          if (typeof b.claim !== 'boolean') reject(422, 'Укажите claim: boolean.');
          const updated = await writeStore(state => {
            const r = state.gameReports.find(x => x.id === id);
            if (!r) reject(404, 'Репорт не найден.');
            if (r.status === 'closed') reject(409, 'Закрытый репорт нельзя взять в работу.');
            const holder = r.assignedToStaffId || '';
            if (b.claim && holder && holder !== staff.staffId && staff.role !== 'owner' && staff.role !== 'administrator') reject(409, 'Репорт уже взят другим сотрудником.');
            if (!b.claim && holder && holder !== staff.staffId && staff.role !== 'owner' && staff.role !== 'administrator') reject(403, 'Снять назначение может только исполнитель или руководство.');
            r.assignedToStaffId = b.claim ? staff.staffId : '';
            r.claimedAt = b.claim ? new Date().toISOString() : null;
            r.updatedAt = new Date().toISOString();
            return r;
          });
          await audit('game.report_claimed', { reportId: id, staffId: staff.staffId, claim: b.claim });
          return send(res, 200, { item: updated }), true;
        }
        if (method === 'PATCH' && /^\/api\/admin\/reports\/[^/]+$/.test(pathname)) {
          const id = pathname.slice('/api/admin/reports/'.length);
          if (!/^[0-9a-f-]{36}$/.test(id)) reject(400, 'Неверный ID репорта.');
          const b = await jsonBody(req);
          if (!['open', 'reviewed', 'closed'].includes(b.status) || typeof b.reply !== 'string' || b.reply.length > 1000) reject(422, 'Укажите статус и ответ до 1000 символов.');
          const report = await writeStore(state => {
            const r = state.gameReports.find(x => x.id === id);
            if (!r) reject(404, 'Репорт не найден.');
            if (r.assignedToStaffId && r.assignedToStaffId !== sessionForAdmin(req).staffId && !['owner','administrator'].includes(sessionForAdmin(req).role)) reject(403, 'Репорт назначен другому сотруднику.');
            r.status = b.status;
            r.reply = b.reply.trim();
            r.updatedAt = new Date().toISOString();
            return r;
          });
          await audit('game.report_updated', { reportId: id, status: report.status, staffId: sessionForAdmin(req).staffId });
          return send(res, 200, { item: report }), true;
        }
        if (method === 'GET' && pathname === '/api/admin/players') {
          const state = await readStore();
          return send(res, 200, { items: state.users.slice(-100).reverse().map(sanitizeUser), total: state.users.length, characterCount: state.characters.length }), true;
        }
        if (method === 'GET' && pathname === '/api/admin/tickets') {
          const state = await readStore();
          return send(res, 200, { items: state.tickets.slice(-100).reverse().map(t => ({ ...t, author: state.users.find(u => u.id === t.userId)?.nickname || 'Неизвестен' })) }), true;
        }
        if (method === 'PATCH' && /^\/api\/admin\/tickets\/[^/]+$/.test(pathname)) {
          const id = pathname.slice('/api/admin/tickets/'.length);
          if (!/^[0-9a-f-]{36}$/.test(id)) reject(400, 'Неверный идентификатор.');
          const b = await jsonBody(req);
          if (!['open', 'answered', 'closed'].includes(b.status) || typeof b.reply !== 'string' || b.reply.length > 1500) reject(422, 'Укажите корректный статус и ответ до 1500 символов.');
          const item = await writeStore(state => {
            const t = state.tickets.find(x => x.id === id);
            if (!t) reject(404, 'Обращение не найдено.');
            t.status = b.status; t.reply = b.reply.trim(); t.updatedAt = new Date().toISOString(); return t;
          });
          await audit('ticket.updated', { ticketId: id, status: item.status });
          return send(res, 200, { item }), true;
        }
        if (method === 'POST' && /^\/api\/admin\/players\/[^/]+\/ban$/.test(pathname)) {
          const id = pathname.split('/')[4];
          if (!/^[0-9a-f-]{36}$/.test(id)) reject(400, 'Неверный идентификатор.');
          const b = await jsonBody(req);
          if (typeof b.blocked !== 'boolean' || typeof b.reason !== 'string' || b.reason.length > 300 || (b.blocked && b.reason.trim().length < 4)) reject(422, 'Укажите статус и причину блокировки (4–300 символов).');
          const result = await writeStore(state => {
            const u = state.users.find(x => x.id === id);
            if (!u) reject(404, 'Пользователь не найден.');
            u.blocked = b.blocked; u.blockReason = b.blocked ? b.reason.trim() : '';
            return sanitizeUser(u);
          });
          if (result.blocked) revokeGameUser(id);
          await audit('player.access_changed', { userId: id, blocked: result.blocked });
          return send(res, 200, { user: result }), true;
        }
        return error(res, 405, 'Метод не поддерживается.'), true;
      }
      const auth = await authorizedUser(req);
      if (!auth) return error(res, 401, 'Войдите в аккаунт игрока.'), true;
      const { state, user } = auth;
      if (method === 'GET' && pathname === '/api/me') return send(res, 200, { user: sanitizeUser(user), characters: state.characters.filter(c => c.userId === user.id).length, tickets: state.tickets.filter(t => t.userId === user.id).length, reports: state.gameReports.filter(r => r.userId === user.id).length }), true;
      if (method === 'GET' && pathname === '/api/characters') return send(res, 200, { items: state.characters.filter(c => c.userId === user.id) }), true;
      // Banking in the cabinet is offline-only: a connected game session must use /deposit or /withdraw.
      if (/^\/api\/characters\/[0-9a-f-]{36}\/bank$/.test(pathname)) {
        const characterId = pathname.split('/')[3];
        const found = state.characters.find(c => c.id === characterId && c.userId === user.id);
        if (!found) reject(404, 'Персонаж не найден.');
        if (method === 'GET') return send(res, 200, {cash:found.cash||0,bank:bankBalance(found)}), true;
        if (method !== 'POST') reject(405, 'Метод не поддерживается.');
        limited(ip, `bank:${user.id}`, 35);
        const body = await jsonBody(req);
        const action = typeof body.action === 'string' ? body.action.toUpperCase() : '';
        const amount = bankAmount(String(body.amount ?? ''));
        if (!['DEPOSIT','WITHDRAW'].includes(action) || amount === null) reject(422, 'Укажите операцию и целую сумму от $1 до $1 000 000.');
        if (isGameCharacterOnline(characterId)) reject(409, 'Выйдите из игры для операции через сайт.');
        const result = await writeStore(s => {
          const u = s.users.find(x=>x.id===user.id);
          const c = s.characters.find(x=>x.id===characterId && x.userId===user.id);
          if (!u || u.blocked || !c) reject(403, 'Доступ к персонажу запрещён.');
          if (isGameCharacterOnline(characterId)) reject(409, 'Выйдите из игры для операции через сайт.');
          const applied = applyBankOperation(c, action, amount);
          if (applied.error) reject(409, applied.error);
          return applied;
        });
        await audit('bank.operation', {userId:user.id,characterId,action,amount});
        return send(res, 200, result), true;
      }
      if (method === 'GET' && pathname === '/api/garage/catalog') {
        return send(res, 200, { items: catalog, slots: MAX_GARAGE_SLOTS, saleRate: 0.7 }), true;
      }
      if (method === 'GET' && /^\/api\/characters\/[0-9a-f-]{36}\/vehicles$/.test(pathname)) {
        const characterId = pathname.split('/')[3];
        if (!state.characters.some(c => c.id === characterId && c.userId === user.id)) reject(404, 'Персонаж не найден.');
        return send(res, 200, { items: state.vehicles.filter(v => v.characterId === characterId).sort((a,b)=>a.slot-b.slot).map(v=>({...v, ...vehicleState(v), repairPrice:repairPrice(vehicleState(v).health)})) }), true;
      }
      if (method === 'POST' && /^\/api\/characters\/[0-9a-f-]{36}\/vehicles$/.test(pathname)) {
        limited(ip, `garage-buy:${user.id}`, 20);
        const characterId = pathname.split('/')[3];
        const b = await jsonBody(req);
        const spec = Number.isInteger(b.model) ? findModel(b.model) : null;
        if (!spec) reject(422, 'Недоступная модель транспорта.');
        if (isGameCharacterOnline(characterId)) reject(409, 'Выйдите из игры перед покупкой автомобиля.');
        const purchase = await writeStore(s => {
          const u = s.users.find(x=>x.id===user.id);
          const c = s.characters.find(x => x.id === characterId && x.userId === user.id);
          if (!u || u.blocked || !c) reject(404, 'Персонаж не найден.');
          if (isGameCharacterOnline(characterId)) reject(409, 'Выйдите из игры перед покупкой автомобиля.');
          const own = s.vehicles.filter(v=>v.characterId===characterId);
          if (own.length >= MAX_GARAGE_SLOTS) reject(409, 'Все три места в гараже заняты.');
          if (!Number.isSafeInteger(c.cash) || c.cash < spec.price) reject(409, 'Недостаточно денег у персонажа.');
          const slot = Array.from({length:MAX_GARAGE_SLOTS}, (_,i)=>i+1).find(n=>!own.some(v=>v.slot===n));
          c.cash -= spec.price;
          const vehicle = { id:crypto.randomUUID(), userId:user.id, characterId, slot,
            model:spec.model, name:spec.name, purchasePrice:spec.price,
            createdAt:new Date().toISOString(), parkedAt:null, position:null, fuel:60, health:1000, locked:true };
          s.vehicles.push(vehicle);
          return { vehicle, cash:c.cash };
        });
        await audit('garage.vehicle_bought', { userId:user.id, characterId, vehicleId:purchase.vehicle.id, model:spec.model, amount:spec.price });
        return send(res, 201, purchase), true;
      }
      if (method === 'POST' && /^\/api\/vehicles\/[0-9a-f-]{36}\/sell$/.test(pathname)) {
        limited(ip, `garage-sell:${user.id}`, 20);
        const vehicleId = pathname.split('/')[3];
        if (isGameCharacterOnline(state.vehicles.find(v=>v.id===vehicleId)?.characterId)) reject(409, 'Выйдите из игры перед продажей автомобиля.');
        const sale = await writeStore(s => {
          const vehicle = s.vehicles.find(v=>v.id===vehicleId && v.userId===user.id);
          const u = s.users.find(x=>x.id===user.id);
          const c = vehicle && s.characters.find(x=>x.id===vehicle.characterId && x.userId===user.id);
          if (!u || u.blocked || !vehicle || !c) reject(404, 'Автомобиль не найден.');
          if (isGameCharacterOnline(vehicle.characterId)) reject(409, 'Выйдите из игры перед продажей автомобиля.');
          const refund = sellPrice(vehicle.purchasePrice);
          if (!Number.isSafeInteger(c.cash) || c.cash + refund > 100000000) reject(409, 'Превышен лимит баланса.');
          c.cash += refund;
          s.vehicles.splice(s.vehicles.indexOf(vehicle), 1);
          return { cash:c.cash, refund, vehicleId };
        });
        await audit('garage.vehicle_sold', { userId:user.id, vehicleId, amount:sale.refund });
        return send(res, 200, sale), true;
      }
      if (method === 'POST' && /^\/api\/characters\/[0-9a-f-]{36}\/link-code$/.test(pathname)) {
        limited(ip, `game-code:${user.id}`, 12);
        const characterId = pathname.split('/')[3];
        const link = await issueGameCode(user.id, characterId);
        return send(res, 201, link), true;
      }
      if (method === 'POST' && pathname === '/api/characters') {
        limited(ip, `character:${user.id}`, 10);
        const b = await jsonBody(req);
        const first = typeof b.firstName === 'string' ? b.firstName.trim() : '';
        const last = typeof b.lastName === 'string' ? b.lastName.trim() : '';
        const name = `${first}_${last}`;
        if (!/^[A-Za-z]{2,16}$/.test(first) || !/^[A-Za-z]{2,16}$/.test(last) || name.length > 20 || !SKINS.includes(b.skin)) reject(422, 'Имя и фамилия: 2–16 латинских букв, полное имя до 20 символов (ограничение клиента SA-MP). Выберите доступный скин.');
        const item = await writeStore(s => {
          if (s.characters.filter(c => c.userId === user.id).length >= 3) reject(409, 'Доступно не больше трёх персонажей.');
          if (s.characters.some(c => c.name.toLowerCase() === name.toLowerCase())) reject(409, 'Такое имя уже занято.');
          const c = { id: crypto.randomUUID(), userId: user.id, name, skin: b.skin, level: 1, experience: 0, cash: 0, bank: 0, job: 0, lastWorkAt: 0, createdAt: new Date().toISOString(), gameSync: false };
          s.characters.push(c); return c;
        });
        await audit('character.created', { userId: user.id, characterId: item.id });
        return send(res, 201, { item }), true;
      }
      if (method === 'GET' && pathname === '/api/reports') return send(res, 200, { items: state.gameReports.filter(r => r.userId === user.id).reverse() }), true;
      if (method === 'GET' && pathname === '/api/tickets') return send(res, 200, { items: state.tickets.filter(t => t.userId === user.id).reverse() }), true;
      if (method === 'POST' && pathname === '/api/tickets') {
        limited(ip, `tickets:${user.id}`, 8);
        const b = await jsonBody(req);
        const topic = typeof b.topic === 'string' ? b.topic.trim() : '';
        const message = typeof b.message === 'string' ? b.message.trim() : '';
        if (!['bug', 'account', 'question'].includes(b.category) || topic.length < 5 || topic.length > 100 || message.length < 15 || message.length > 1500) reject(422, 'Категория, тема 5–100 и текст 15–1500 символов обязательны.');
        const item = await writeStore(s => {
          if (s.tickets.filter(t => t.userId === user.id && t.status !== 'closed').length >= 5) reject(409, 'Достигнут лимит открытых обращений (5).');
          const t = { id: crypto.randomUUID(), userId: user.id, category: b.category, topic, message, reply: '', status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          s.tickets.push(t); return t;
        });
        await audit('ticket.created', { userId: user.id, ticketId: item.id });
        return send(res, 201, { item }), true;
      }
      return error(res, 405, 'Метод не поддерживается.'), true;
    } catch (e) {
      if (e.status && e.status < 500) return error(res, e.status, e.message), true;
      if (e.statusCode && e.statusCode < 500) return error(res, e.statusCode, e.message), true;
      console.error('Player API failure:', e);
      return error(res, 500, 'Ошибка сервера.'), true;
    }
  }
  return { route, readStore, writeStore, storageKind: useJson ? 'json' : 'sqlite' };
}

module.exports = { makePlayerApi };
