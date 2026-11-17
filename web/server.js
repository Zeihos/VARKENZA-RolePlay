'use strict';

// VARKENZA local website + opt-in localhost Pawn game bridge.
// This is a prototype, NOT a production-ready identity/game backend.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { version: APP_VERSION } = require('./package.json');
const { makePlayerApi } = require('./lib/player-api');
const { makeGameBridge } = require('./lib/game-bridge');
const staffAuth = require('./lib/staff-auth');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = process.env.VARKENZA_DATA_FILE || path.join(ROOT, 'data', 'news.json');
const AUDIT_FILE = process.env.VARKENZA_AUDIT_FILE || path.join(ROOT, 'data', 'audit.jsonl');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const configured = v => typeof v === 'string' && !/^replace[-_]/i.test(v);
const ADMIN_READY = ADMIN_EMAIL.length > 3 && ADMIN_PASSWORD.length >= 16 && SESSION_SECRET.length >= 32 && configured(ADMIN_PASSWORD) && configured(SESSION_SECRET);
const sessions = new Map();
const loginAttempts = new Map();
const sessionMaxAgeMs = 4 * 60 * 60 * 1000;
const pages = new Map([
  ['/', 'index.html'], ['/forum', 'forum.html'], ['/cabinet', 'cabinet.html'],
  ['/login', 'login.html'], ['/admin', 'admin.html']
]);
const extensions = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let newsWriteQueue = Promise.resolve();
let gameBridge;
const playerApi = makePlayerApi({ send, error, jsonBody, requestOriginAllowed, audit,
  sessionForAdmin: sessionFor, hasAdminPermission,
  issueGameCode: (...args) => gameBridge.issueCode(...args),
  revokeGameUser: (...args) => gameBridge.revokeUser(...args),
  isGameCharacterOnline: (...args) => gameBridge.isCharacterOnline(...args) });
gameBridge = makeGameBridge({ readStore: playerApi.readStore, writeStore: playerApi.writeStore, audit, formBody,
  resolveStaff: async staffId => {
    if (staffId === 'owner') return ADMIN_READY ? { staffId: 'owner', role: 'owner' } : null;
    const state = await playerApi.readStore();
    const item = state.staffUsers.find(x => x.id === staffId && !x.disabled);
    return item ? { staffId: item.id, role: item.role } : null;
  } });

function send(res, status, value, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(value));
}
function redirect(res, dest) { res.writeHead(302, { Location: dest, 'Cache-Control': 'no-store' }); res.end(); }
function error(res, status, message) { send(res, status, { error: message }); }
function digest(value) { return crypto.createHash('sha256').update(String(value)).digest(); }
function sameSecret(a, b) { return crypto.timingSafeEqual(digest(a), digest(b)); }
function hmac(id) { return crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('base64url'); }
function getCookie(req, name) {
  const item = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return item ? item.substring(name.length + 1) : '';
}
function sessionFor(req) {
  if (!ADMIN_READY) return null;
  const token = getCookie(req, 'varkenza_dev_session');
  const [id, sig, ...rest] = token.split('.');
  if (!id || !sig || rest.length || !sameSecret(sig, hmac(id))) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt < Date.now()) { sessions.delete(id); return null; }
  return { id, ...session };
}
function hasAdminPermission(req, permission) { return staffAuth.has(sessionFor(req), permission); }
function requireAdmin(req, res, capability) {
  if (!sessionFor(req)) { error(res, 401, 'Нет сессии'); return false; }
  if (!hasAdminPermission(req, capability)) { error(res, 403, 'Недостаточно прав'); return false; }
  return true;
}
function cookie(value, seconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `varkenza_dev_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure}`;
}
function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    const u = new URL(origin);
    return u.host === host && (u.protocol === 'http:' || u.protocol === 'https:');
  } catch { return false; }
}
async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    const e = new Error('Требуется application/json'); e.statusCode = 415; throw e;
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) { const e = new Error('Слишком большой запрос'); e.statusCode = 413; throw e; }
    chunks.push(chunk);
  }
  try {
    const out = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!out || typeof out !== 'object' || Array.isArray(out)) throw Error();
    return out;
  } catch { const e = new Error('Неверный JSON'); e.statusCode = 400; throw e; }
}
async function formBody(req) {
  // The Pawn HTTP_POST native sends URL-encoded form data without custom headers.
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (type && type !== 'application/x-www-form-urlencoded' && type !== 'text/plain') {
    const err = new Error('Form encoding required'); err.statusCode = 415; throw err;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2048) { const err = new Error('Body too big'); err.statusCode = 413; throw err; }
    chunks.push(chunk);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const out = Object.create(null);
  for (const [key, value] of form) {
    if (!/^(key|code|name|sid|job|message|command|action|target|model|slot|x|y|z|a|interior|world|health|value|amount)$/.test(key) || Object.hasOwn(out, key) || value.length > 256) {
      const err = new Error('Malformed form'); err.statusCode = 400; throw err;
    }
    out[key] = value;
  }
  return out;
}
async function readNews() {
  let text;
  try { text = await fs.readFile(DATA_FILE, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw Error('Invalid news store');
  return data;
}
async function modifyNews(fn) {
  // Writes run serially within this *single* local dev process.
  const operation = newsWriteQueue.catch(() => {}).then(async () => {
    const arr = await readNews();
    const result = fn(arr);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const temp = `${DATA_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
    await fs.rename(temp, DATA_FILE);
    return result;
  });
  newsWriteQueue = operation.catch(() => {});
  return operation;
}
async function audit(action, detail) {
  const event = { at: new Date().toISOString(), action, detail };
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.appendFile(AUDIT_FILE, JSON.stringify(event) + '\n', 'utf8');
}
async function staticResource(res, file, status = 200) {
  const ext = path.extname(file);
  const kind = extensions[ext];
  if (!kind) return error(res, 404, 'Не найдено');
  try {
    const bytes = await fs.readFile(file);
    res.writeHead(status, { 'Content-Type': kind, 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
    res.end(bytes);
  } catch (e) {
    if (e.code === 'ENOENT') return error(res, 404, 'Не найдено');
    throw e;
  }
}

async function handler(req, res) {
  // No user-editable HTML; only explicit static asset paths are served.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/healthz') return send(res, 200, { ok: true, service: 'VARKENZA Foundation', version: APP_VERSION });
    if (req.method === 'GET' && pathname === '/api/site') {
      return send(res, 200, {
        name: 'VARKENZA ROLEPLAY', phase: 'Разработка', gameOnline: gameBridge.status().online,
        components: [
          { name: 'Сайт', status: 'Dev-прототип' }, { name: 'Игра', status: 'Локальный bridge v0.11' },
          { name: 'Форум', status: 'Локальный прототип' }, { name: 'Личный кабинет', status: 'Dev-прототип' },
          { name: 'Админ-панель', status: 'Dev-прототип' }, { name: 'Лаунчер', status: 'Запланирован' }
        ]
      });
    }
    if (await gameBridge.route(req, res, pathname)) return;
    if (await playerApi.route(req, res, pathname)) return;
    if (req.method === 'POST' && pathname === '/api/admin/game/kick') {
      if (!requireAdmin(req, res, 'game.kick')) return;
      if (!requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник');
      const body = await jsonBody(req);
      if (typeof body.characterId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.characterId) || typeof body.reason !== 'string' || body.reason.trim().length < 4 || body.reason.length > 200) {
        return error(res, 422, 'Укажите characterId и причину (4–200 символов).');
      }
      const online = await gameBridge.adminStatus();
      const active = online.players.some(p => p.characterId === body.characterId);
      if (!active) return error(res, 404, 'Персонаж не в сети');
      gameBridge.revokeCharacter(body.characterId);
      await audit('game.session_revoked', { characterId: body.characterId, reason: body.reason.trim() });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/admin/game/staff-code') {
      if (!requireAdmin(req, res, 'game.tools')) return;
      if (!requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник');
      const b = await jsonBody(req);
      if (!/^[0-9a-f-]{36}$/.test(String(b.characterId || ''))) return error(res, 422, 'Некорректный ID персонажа');
      const code = gameBridge.issueStaffCode(sessionFor(req), b.characterId);
      if (!code) return error(res, 404, 'Игрок не в сети или мост отключён');
      await audit('game.staff_code_issued', { staffId: sessionFor(req).staffId, characterId: b.characterId });
      return send(res, 201, code);
    }
    if (req.method === 'GET' && pathname === '/api/admin/game') {
      if (!requireAdmin(req, res, 'game.read')) return;
      return send(res, 200, await gameBridge.adminStatus());
    }
    if (req.method === 'POST' && pathname === '/api/admin/game/action') {
      if (!requireAdmin(req, res, 'game.read')) return;
      if (!requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник');
      const b = await jsonBody(req);
      if (!['WARN','KICK'].includes(b.type)) return error(res, 422, 'Неизвестная команда');
      if (!hasAdminPermission(req, b.type === 'WARN' ? 'game.warn' : 'game.kick')) return error(res, 403, 'Недостаточно прав');
      if (typeof b.characterId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.characterId)
        || typeof b.message !== 'string' || !/^[A-Za-z0-9 ,.?!()_-]{5,80}$/.test(b.message))
        return error(res, 422, 'Нужен ID персонажа и причина латиницей (5–80 символов, без специальных разделителей).');
      const result = gameBridge.enqueueAdminAction(b.characterId, b.type, b.message.trim());
      if (!result) return error(res, 404, 'Персонаж не в сети');
      if (result.error) return error(res, 409, result.error);
      await audit('game.staff_action_queued', { type: b.type, characterId: b.characterId, staffId: sessionFor(req).staffId, reason: b.message.trim(), commandId: result.id });
      return send(res, 202, { queued: true, commandId: result.id });
    }
    if (req.method === 'GET' && pathname === '/api/news') {
      const data = (await readNews()).slice().sort((a, b) => b.date.localeCompare(a.date));
      return send(res, 200, { items: data });
    }
    if (req.method === 'GET' && pathname === '/api/admin/session') {
      const staff = sessionFor(req);
      if (!staff) return error(res, 401, 'Нет сессии');
      return send(res, 200, { authenticated: true, email: staff.email,
        role: staff.role, staffId: staff.staffId, permissions: staffAuth.ROLES[staff.role] });
    }
    if (req.method === 'GET' && pathname === '/api/admin/audit') {
      if (!requireAdmin(req, res, 'audit.read')) return;
      let lines = '';
      try { lines = await fs.readFile(AUDIT_FILE, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const items = lines.split('\n').filter(Boolean).slice(-30).reverse().map(line => JSON.parse(line));
      return send(res, 200, { items });
    }
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      if (!requestOriginAllowed(req)) return error(res, 403, 'Неверный источник запроса');
      if (!ADMIN_READY) return error(res, 503, 'Вход не настроен. Настройте переменные окружения для локальной разработки.');
      const ip = req.socket.remoteAddress || 'unknown';
      const record = loginAttempts.get(ip) || { attempts: 0, resetAt: Date.now() + 10 * 60_000 };
      if (record.resetAt < Date.now()) { record.attempts = 0; record.resetAt = Date.now() + 10 * 60_000; }
      if (record.attempts >= 5) return error(res, 429, 'Слишком много попыток. Попробуйте позже.');
      const body = await jsonBody(req);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const owner = sameSecret(email, ADMIN_EMAIL.toLowerCase()) && sameSecret(password, ADMIN_PASSWORD);
      let authenticated = owner ? { staffId: 'owner', email: ADMIN_EMAIL, role: 'owner' } : null;
      if (!authenticated && email && password) {
        const store = await playerApi.readStore();
        const staff = store.staffUsers.find(s => s.email.toLowerCase() === email && !s.disabled);
        if (staff && staffAuth.verifyPassword(password, staff.passwordHash)) {
          authenticated = { staffId: staff.id, email: staff.email, role: staff.role };
        }
      }
      if (!authenticated) {
        record.attempts++; loginAttempts.set(ip, record);
        await audit('admin.login_failed', { ip });
        return error(res, 401, 'Неверный логин или пароль');
      }
      loginAttempts.delete(ip);
      const id = crypto.randomBytes(32).toString('base64url');
      sessions.set(id, { expiresAt: Date.now() + sessionMaxAgeMs, ...authenticated });
      await audit('admin.login', { ip, staffId: authenticated.staffId });
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(`${id}.${hmac(id)}`, sessionMaxAgeMs / 1000) });
    }
    if (pathname === '/api/admin/staff' && req.method === 'GET') {
      if (!requireAdmin(req, res, 'staff.read')) return;
      const state = await playerApi.readStore();
      return send(res, 200, { items: state.staffUsers.map(staffAuth.publicStaff) });
    }
    if (pathname === '/api/admin/staff' && req.method === 'POST') {
      if (!requireAdmin(req, res, 'staff.manage')) return;
      if (!requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник');
      const b = await jsonBody(req);
      if (typeof b.email !== 'string' || !/^[^\s@]{1,80}@[^\s@]{1,100}\.[^\s@]{2,20}$/.test(b.email) ||
          typeof b.password !== 'string' || b.password.length < 16 || b.password.length > 128 || !staffAuth.isRole(b.role))
        return error(res, 422, 'Email, пароль 16–128 символов и роль обязательны.');
      const passwordHash = staffAuth.hashPassword(b.password);
      const item = await playerApi.writeStore(state => {
        const email = b.email.toLowerCase();
        if (email === ADMIN_EMAIL.toLowerCase() || state.staffUsers.some(x => x.email.toLowerCase() === email)) {
          const err = new Error('Сотрудник с этим email уже существует.'); err.statusCode = 409; throw err;
        }
        const staff = { id: crypto.randomUUID(), email, role: b.role, passwordHash, disabled: false, createdAt: new Date().toISOString() };
        state.staffUsers.push(staff);
        return staffAuth.publicStaff(staff);
      });
      await audit('staff.created', { staffId: item.id, role: item.role, actor: sessionFor(req).staffId });
      return send(res, 201, { item });
    }
    if (/^\/api\/admin\/staff\/[0-9a-f-]{36}$/.test(pathname) && req.method === 'PATCH') {
      if (!requireAdmin(req, res, 'staff.manage')) return;
      if (!requestOriginAllowed(req)) return error(res, 403, 'Недопустимый источник');
      const id = pathname.split('/')[4];
      const b = await jsonBody(req);
      if (typeof b.disabled !== 'boolean' || !staffAuth.isRole(b.role)) return error(res, 422, 'Укажите роль и disabled.');
      const updated = await playerApi.writeStore(state => {
        const staff = state.staffUsers.find(s => s.id === id);
        if (!staff) { const e = new Error('Сотрудник не найден.'); e.statusCode = 404; throw e; }
        staff.role = b.role; staff.disabled = b.disabled;
        return staffAuth.publicStaff(staff);
      });
      // Revokes active sessions on role changes, too: prevent permission reuse.
      for (const [key, s] of sessions) if (s.staffId === id) sessions.delete(key);
      gameBridge.revokeStaff(id);
      await audit('staff.updated', { staffId: id, role: b.role, disabled: b.disabled, actor: sessionFor(req).staffId });
      return send(res, 200, { item: updated });
    }
    if (pathname.startsWith('/api/admin/') && (req.method === 'POST' || req.method === 'DELETE')) {
      const active = sessionFor(req);
      if (!active) return error(res, 401, 'Нет сессии');
      if (!requestOriginAllowed(req)) return error(res, 403, 'Неверный источник запроса');
      if (req.method === 'POST' && pathname === '/api/admin/logout') {
        sessions.delete(active.id);
        gameBridge.revokeStaff(active.staffId);
        await audit('admin.logout', {});
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
      }
      if (req.method === 'POST' && pathname === '/api/admin/news') {
        if (!requireAdmin(req, res, 'news.write')) return;
        const body = await jsonBody(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        if (title.length < 4 || title.length > 120 || text.length < 10 || text.length > 3000) {
          return error(res, 422, 'Заголовок: 4–120 символов. Текст: 10–3000 символов.');
        }
        const entry = { id: crypto.randomUUID(), title, body: text, date: new Date().toISOString() };
        await modifyNews(rows => rows.unshift(entry));
        await audit('news.created', { id: entry.id, title });
        return send(res, 201, { item: entry });
      }
      if (req.method === 'DELETE' && pathname.startsWith('/api/admin/news/')) {
        if (!requireAdmin(req, res, 'news.write')) return;
        const id = pathname.substring('/api/admin/news/'.length);
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return error(res, 400, 'Неверный id');
        const removed = await modifyNews(rows => {
          const index = rows.findIndex(row => row.id === id);
          if (index < 0) return false;
          rows.splice(index, 1);
          return true;
        });
        if (!removed) return error(res, 404, 'Новость не найдена');
        await audit('news.deleted', { id });
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === 'GET' && pages.has(pathname)) {
      if (pathname === '/admin' && !sessionFor(req)) return redirect(res, '/login');
      return staticResource(res, path.join(PUBLIC, pages.get(pathname)));
    }
    if (req.method === 'GET' && /^\/(css|js)\/[a-z0-9_/-]+\.(css|js)$/.test(pathname)) {
      const file = path.resolve(PUBLIC, `.${pathname}`);
      if (!file.startsWith(PUBLIC + path.sep)) return error(res, 403, 'Запрещено');
      return staticResource(res, file);
    }
    return error(res, 404, 'Страница не найдена');
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return error(res, e.statusCode, e.message);
    console.error('Request error:', e);
    return error(res, 500, 'Внутренняя ошибка');
  }
}

const server = http.createServer(handler);
if (require.main === module) {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be in 1..65535');
  if (!['127.0.0.1', '::1'].includes(HOST)) throw new Error('VARKENZA local server only supports loopback HOST for security.');
  server.listen(PORT, HOST, () => {
    console.log(`VARKENZA Foundation v${APP_VERSION}: http://${HOST}:${PORT}`);
    if (!ADMIN_READY) console.log('Admin demo disabled: configure ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_SESSION_SECRET.');
    console.log('DEV ONLY — not hardened for exposure on the public Internet.');
  });
}
module.exports = { server };
