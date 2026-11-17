'use strict';
const byId = id => document.getElementById(id);
const msg = text => { byId('cabinet-message').textContent = text; };
let garageCatalog = [];
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
async function call(url, method = 'GET', data) {
  const opts = { method, credentials: 'same-origin' };
  if (data !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(data); }
  const res = await fetch(url, opts);
  const body = await res.json();
  if (!res.ok) throw Error(body.error || 'Не удалось выполнить запрос.');
  return body;
}
async function loadCharacters() {
  const { items } = await call('/api/characters');
  const root = byId('characters-list'); root.replaceChildren();
  byId('stat-characters').textContent = String(items.length);
  if (!items.length) root.append(node('p', 'dim', 'Персонажей ещё нет.'));
  for (const c of items) {
    const row = node('article', 'data-row');
    const info = node('div'); info.append(node('strong', '', c.name), node('small', 'dim', `Скин ${c.skin} · уровень ${c.level} · наличные $${c.cash || 0} · банк $${c.bank || 0} · работа ${c.job || 0}`));
    const button = node('button', 'button outline small', 'Код входа');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await call(`/api/characters/${encodeURIComponent(c.id)}/link-code`, 'POST');
        byId('link-result').textContent = `${result.character}: код ${result.code}. Команда: /link ${result.code}. Действителен до ${new Date(result.expiresAt).toLocaleTimeString('ru-RU')}. Не передавайте код другим.`;
      } catch (e) { byId('link-result').textContent = e.message; }
      finally { button.disabled = false; }
    });
    row.append(node('span', 'dot-status', '●'), info, button); root.append(row);
  }
  byId('character-form').hidden = items.length >= 3;
  const selector = byId('garage-character');
  const chosen = selector.value;
  selector.replaceChildren();
  if (!items.length) { const option = node('option','', 'Создайте персонажа'); option.value=''; selector.append(option); }
  for (const c of items) { const option = node('option','',c.name); option.value=c.id; selector.append(option); }
  if (items.some(c=>c.id===chosen)) selector.value = chosen;
  const bankSelector = byId('bank-character');
  const prevBank = bankSelector.value; bankSelector.replaceChildren();
  for (const c of items) {const opt=node('option','',c.name);opt.value=c.id;bankSelector.append(opt);}
  if (items.some(c => c.id===prevBank)) bankSelector.value=prevBank;
  await Promise.all([loadGarage(),loadBank()]);
}
async function loadBank() {
  const id=byId('bank-character').value;
  if (!id) {byId('bank-balance').textContent='Создайте персонажа.';return;}
  try {const data=await call(`/api/characters/${encodeURIComponent(id)}/bank`);
    byId('bank-balance').textContent=`Наличные: $${data.cash} · Счёт: $${data.bank}`;
  } catch(e) {byId('bank-balance').textContent=e.message;}
}

async function loadGarage() {
  const select = byId('garage-character');
  const characterId = select.value;
  const owned = byId('garage-owned');
  const shop = byId('garage-catalog');
  owned.replaceChildren(); shop.replaceChildren();
  if (!characterId) { owned.append(node('p', 'dim', 'Сначала создайте персонажа.')); return; }
  try {
    if (!garageCatalog.length) garageCatalog = (await call('/api/garage/catalog')).items;
    const { items } = await call(`/api/characters/${encodeURIComponent(characterId)}/vehicles`);
    if (!items.length) owned.append(node('p', 'dim', 'Машин пока нет.'));
    for (const car of items) {
      const row = node('article','data-row');
      const info = node('div');
      info.append(node('strong','', `№${car.slot} · ${car.name} (${car.model})`),
                  node('small','dim', car.position ? 'Местоположение сохранено' : 'Выдача у гаража в Los Santos'),
                  node('small','dim', `Топливо: ${Number.isInteger(car.fuel)?car.fuel:60}/60 · Состояние: ${Number.isInteger(car.health)?car.health:1000}/1000 · ${car.locked===false?'Открыт':'Закрыт'} · Ремонт: $${car.repairPrice ?? 0} (в игре, /gps repair)`));
      const button = node('button','button outline small',`Продать за $${Math.floor(car.purchasePrice*.7)}`);
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (!window.confirm(`Продать ${car.name}?`)) return;
        button.disabled = true;
        try { await call(`/api/vehicles/${encodeURIComponent(car.id)}/sell`, 'POST', {}); byId('garage-message').textContent = 'Автомобиль продан.'; await loadCharacters(); }
        catch(e) { byId('garage-message').textContent = e.message; button.disabled=false; }
      });
      row.append(info,button); owned.append(row);
    }
    for (const spec of garageCatalog) {
      const row = node('article','data-row');
      const info = node('div');
      info.append(node('strong','',spec.name),node('small','dim',`Модель ${spec.model} · $${spec.price}`));
      const button = node('button','button primary small','Купить');
      button.type = 'button';
      button.disabled = items.length >= 3;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await call(`/api/characters/${encodeURIComponent(characterId)}/vehicles`, 'POST', {model:spec.model});
          byId('garage-message').textContent = `${spec.name} куплен. Откройте /garage в игре.`; await loadCharacters(); }
        catch(e) { byId('garage-message').textContent = e.message; button.disabled=false; }
      });
      row.append(info,button); shop.append(row);
    }
  } catch(e) { byId('garage-message').textContent=e.message; }
}
async function loadTickets() {
  const { items } = await call('/api/tickets'); const root = byId('tickets-list'); root.replaceChildren();
  byId('stat-tickets').textContent = String(items.length);
  if (!items.length) root.append(node('p', 'dim', 'Обращений пока нет.'));
  const statuses = { open: 'Открыто', answered: 'Ответ получен', closed: 'Закрыто' };
  for (const t of items) {
    const row = node('article', 'ticket-row'); row.append(node('strong', '', t.topic), node('span', 'pill', statuses[t.status] || t.status), node('p', 'dim', t.message));
    if (t.reply) row.append(node('p', 'staff-reply', 'Ответ администрации: ' + t.reply));
    root.append(row);
  }
}
async function loadReports() {
  const root = byId('player-reports'); if (!root) return;
  const { items } = await call('/api/reports'); root.replaceChildren();
  byId('stat-reports').textContent = String(items.length);
  if (!items.length) return root.append(node('p', 'dim', 'Игровых репортов пока нет.'));
  const labels = { open: 'Открыт', reviewed: 'Рассмотрен', closed: 'Закрыт' };
  for (const r of items) {
    const row = node('article', 'ticket-row');
    row.append(node('strong', '', r.characterName), node('span', 'pill', labels[r.status] || r.status), node('p', 'dim', r.message));
    if (r.reply) row.append(node('p', 'staff-reply', 'Ответ администрации: ' + r.reply));
    root.append(row);
  }
}
async function refresh() {
  try {
    const { user, characters, tickets, reports } = await call('/api/me');
    byId('guest-area').hidden = true; byId('member-area').hidden = false;
    byId('member-name').textContent = user.nickname;
    byId('member-email').textContent = user.email + ' · с ' + new Date(user.createdAt).toLocaleDateString('ru-RU');
    byId('stat-characters').textContent = String(characters); byId('stat-tickets').textContent = String(tickets); byId('stat-reports').textContent = String(reports);
    await Promise.all([loadCharacters(), loadTickets(), loadReports()]);
  } catch (e) { byId('member-area').hidden = true; byId('guest-area').hidden = false; if (!e.message.includes('Войдите')) msg(e.message); }
}
for (const [id, endpoint, fields] of [
  ['player-login', '/api/auth/login', ['identifier', 'password']],
  ['player-register', '/api/auth/register', ['nickname', 'email', 'password']],
  ['character-form', '/api/characters', ['firstName', 'lastName', 'skin']],
  ['ticket-form', '/api/tickets', ['category', 'topic', 'message']]
]) {
  byId(id).addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const body = {};
    for (const key of fields) body[key] = key === 'skin' ? Number(data.get(key)) : String(data.get(key));
    const btn = form.querySelector('button[type=submit],button'); btn.disabled = true;
    msg('Выполняется запрос…');
    try { await call(endpoint, 'POST', body); msg('Готово. Данные сохранены.'); form.reset(); await refresh(); }
    catch (e) { msg(e.message); } finally { btn.disabled = false; }
  });
}
byId('garage-character').addEventListener('change', loadGarage);
byId('bank-character').addEventListener('change', loadBank);
byId('bank-form').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget;
  const id=byId('bank-character').value;
  const amount=Number(new FormData(form).get('amount'));
  const action=String(new FormData(form).get('action'));
  const btn=form.querySelector('button');btn.disabled=true;
  try {if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw Error('Сумма от 1 до 1 000 000.');
    await call(`/api/characters/${encodeURIComponent(id)}/bank`,'POST',{action,amount});
    byId('bank-message').textContent='Операция выполнена.';form.reset();await loadCharacters();
  } catch(e) {byId('bank-message').textContent=e.message;}
  finally {btn.disabled=false;}
});
byId('player-logout').addEventListener('click', async () => {
  try { await call('/api/auth/logout', 'POST'); msg('Вы вышли из аккаунта.'); await refresh(); }
  catch (e) { msg(e.message); }
});
refresh();
