'use strict';
const loginForm = document.querySelector('#login-form');
const newsForm = document.querySelector('#news-form');
let currentStaff = null;
const can = perm => Boolean(currentStaff && (currentStaff.role === 'owner' || currentStaff.permissions.includes(perm)));
const message = (id, text) => { const el = document.querySelector(id); if (el) el.textContent = text; };
const api = async (url, method = 'GET', data) => {
  const options = { method, credentials: 'same-origin' };
  if (data) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(data); }
  const res = await fetch(url, options);
  const json = await res.json();
  if (res.status === 401 && url !== '/api/admin/login') window.location.assign('/login');
  if (!res.ok) throw Error(json.error || 'Ошибка сервера');
  return json;
};
if (loginForm) loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); message('#auth-message', 'Проверка…');
  const form = new FormData(loginForm);
  try {
    await api('/api/admin/login', 'POST', { email: form.get('email'), password: form.get('password') });
    window.location.assign('/admin');
  } catch (error) { message('#auth-message', error.message); }
});

async function loadAdminNews() {
  const root = document.querySelector('#admin-news');
  if (!root) return;
  const { items } = await api('/api/news'); root.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'admin-news-row';
    const title = document.createElement('span'); title.textContent = item.title;
    const button = document.createElement('button'); button.className = 'button danger small'; button.textContent = 'Удалить'; button.type = 'button';
    button.addEventListener('click', async () => {
      if (!confirm(`Удалить публикацию «${item.title}»?`)) return;
      try { await api(`/api/admin/news/${encodeURIComponent(item.id)}`, 'DELETE'); await loadAdminNews(); if (can('audit.read')) await loadAudit(); }
      catch (error) { message('#news-message', error.message); }
    });
    row.append(title, button); root.append(row);
  }
  if (!items.length) root.textContent = 'Публикаций пока нет.';
}
async function loadAudit() {
  const root = document.querySelector('#audit-list'); if (!root) return;
  const { items } = await api('/api/admin/audit'); root.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'audit-row';
    const date = new Date(item.at).toLocaleString('ru-RU');
    row.textContent = `${date} — ${item.action}`; root.append(row);
  }
  if (!items.length) root.textContent = 'Записей нет.';
}
if (newsForm) {

  newsForm.addEventListener('submit', async (event) => {
    event.preventDefault(); message('#news-message', 'Сохранение…');
    const form = new FormData(newsForm);
    try {
      await api('/api/admin/news', 'POST', { title: form.get('title'), body: form.get('body') });
      message('#news-message', 'Новость опубликована.'); newsForm.reset();
      await loadAdminNews(); if (can('audit.read')) await loadAudit();
    } catch (error) { message('#news-message', error.message); }
  });
}
const logout = document.querySelector('#logout');
if (logout) logout.addEventListener('click', async () => {
  try { await api('/api/admin/logout', 'POST'); window.location.assign('/login'); } catch (e) { message('#news-message', e.message); }
});

// v0.3: Staff tools for WEBSITE accounts and support requests.
const element = (tag, cls, content) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = content;
  return n;
};
async function loadPlayers() {
  const root = document.querySelector('#admin-players'); if (!root) return;
  const { items } = await api('/api/admin/players'); root.replaceChildren();
  if (!items.length) return root.append(element('p', 'dim', 'Аккаунтов ещё нет.'));
  for (const player of items) {
    const row = element('div', 'data-row'); const info = element('div');
    info.append(element('strong', '', player.nickname), element('small', 'dim', `${player.email} · ${player.blocked ? 'Заблокирован' : 'Активен'}`));
    const button = element('button', 'button small ' + (player.blocked ? 'outline' : 'danger'), player.blocked ? 'Разблок.' : 'Блок.');
    button.disabled = !can('players.ban');
    button.addEventListener('click', async () => {
      const reason = player.blocked ? '' : prompt(`Причина блокировки ${player.nickname}:`);
      if (reason === null || (!player.blocked && reason.trim().length < 4)) return;
      try {
        await api(`/api/admin/players/${encodeURIComponent(player.id)}/ban`, 'POST', { blocked: !player.blocked, reason });
        await loadPlayers(); if (can('audit.read')) await loadAudit();
      } catch (e) { message('#staff-message', e.message); }
    });
    row.append(info, button); root.append(row);
  }
}
async function loadTickets() {
  const root = document.querySelector('#admin-tickets'); if (!root) return;
  const { items } = await api('/api/admin/tickets'); root.replaceChildren();
  if (!items.length) return root.append(element('p', 'dim', 'Обращений нет.'));
  for (const t of items) {
    const row = element('div', 'ticket-row');
    row.append(element('strong', '', t.topic), element('span', 'pill', `${t.author} · ${t.status}`), element('p', 'dim', t.message));
    const reply = element('textarea', 'small-field'); reply.rows = 2; reply.maxLength = 1500; reply.placeholder = 'Ответ сотрудника'; reply.value = t.reply;
    const status = element('select', 'small-field');
    for (const [value, label] of [['open', 'Открыто'], ['answered', 'Ответили'], ['closed', 'Закрыто']]) {
      const opt = document.createElement('option'); opt.value = value; opt.textContent = label; opt.selected = t.status === value; status.append(opt);
    }
    const button = element('button', 'button primary small', 'Сохранить');
    button.disabled = !can('tickets.write');
    button.addEventListener('click', async () => {
      try {
        await api(`/api/admin/tickets/${encodeURIComponent(t.id)}`, 'PATCH', { status: status.value, reply: reply.value });
        message('#staff-message', 'Обращение обновлено.'); await loadTickets(); if (can('audit.read')) await loadAudit();
      } catch (e) { message('#staff-message', e.message); }
    });
    row.append(reply, status, button); root.append(row);
  }
}
if (document.querySelector('#admin-players')) {
  const note = element('p', 'form-msg'); note.id = 'staff-message';
  document.querySelector('#admin-tickets').parentElement.append(note);
  
}

async function loadGame() {
  const root = document.querySelector('#admin-game'); if (!root) return;
  const info = await api('/api/admin/game'); root.replaceChildren();
  root.append(element('p', 'dim', info.bridgeEnabled
    ? `Игровой мост включён. Онлайн: ${info.online} (heartbeat до 95 секунд).`
    : 'GAME_BRIDGE_SECRET не установлен. Мост отключён.'));
  for (const player of info.players) {
    const row = element('div', 'data-row');
    row.append(element('span', '', `${player.name} · ${player.staffLinked ? 'сотрудник в игре' : 'игрок'} · соединён ${new Date(player.connectedAt).toLocaleTimeString('ru-RU')}`));
    const button = element('button', 'button danger small', 'Сбросить сессию');
    button.addEventListener('click', async () => {
      const reason = prompt(`Причина отзыва доступа ${player.name}:`);
      if (reason === null || reason.trim().length < 4) return;
      try {
        await api('/api/admin/game/kick', 'POST', { characterId: player.characterId, reason });
        await loadGame(); if (can('audit.read')) await loadAudit();
      } catch (e) { message('#staff-message', e.message); }
    });
    row.append(button);
    button.disabled = !can('game.kick');
    for (const [type, caption] of [['WARN','Предупредить'],['KICK','Кикнуть']]) {
      const action = element('button', 'button small ' + (type === 'KICK' ? 'danger' : 'outline'), caption);
      action.disabled = !can(type === 'WARN' ? 'game.warn' : 'game.kick');
      action.addEventListener('click', async () => {
        const reason = prompt(`Причина ${caption.toLowerCase()} ${player.name} (латиница, 5–80 символов):`);
        if (reason === null) return;
        try {
          await api('/api/admin/game/action', 'POST', { characterId: player.characterId, type, message: reason.trim() });
          message('#staff-message', 'Команда поставлена в очередь. Доставка при следующем heartbeat.');
          await loadGame(); if (can('audit.read')) await loadAudit();
        } catch (e) { message('#staff-message', e.message); }
      });
      row.append(action);
    }
    if (can('game.tools')) {
      const grant = element('button', 'button outline small', 'Код для /staff');
      grant.type = 'button';
      grant.addEventListener('click', async () => {
        if (!confirm(`Выдать код привязки ВАШЕЙ админ-сессии персонажу ${player.name}? Код надо ввести лично в игре.`)) return;
        try {
          const result = await api('/api/admin/game/staff-code', 'POST', { characterId: player.characterId });
          message('#staff-message', `Код для ${player.name}: ${result.code} (действует 2 минуты). Введите в игре /staff ${result.code}. Не передавайте третьим лицам.`);
        } catch (e) { message('#staff-message', e.message); }
      });
      row.append(grant);
    }
    root.append(row);
  }
}

async function loadReports() {
  const root = document.querySelector('#admin-reports'); if (!root) return;
  const { items } = await api('/api/admin/reports'); root.replaceChildren();
  if (!items.length) return root.append(element('p', 'dim', 'Репортов пока нет.'));
  for (const report of items) {
    const row = element('div', 'ticket-row');
    row.append(element('strong', '', report.characterName),
      element('span', 'pill', `${report.author} · ${report.status}`),
      element('p', 'dim', report.message));
    const reply = element('textarea', 'small-field');
    reply.rows = 2; reply.maxLength = 1000; reply.placeholder = 'Комментарий администрации'; reply.value = report.reply;
    const select = element('select', 'small-field');
    for (const [value, label] of [['open', 'Открыт'], ['reviewed', 'Рассмотрен'], ['closed', 'Закрыт']]) {
      const option = document.createElement('option'); option.value = value;
      option.textContent = label; option.selected = report.status === value; select.append(option);
    }
    const submit = element('button', 'button primary small', 'Сохранить');
    submit.addEventListener('click', async () => {
      try {
        await api(`/api/admin/reports/${encodeURIComponent(report.id)}`, 'PATCH', { status: select.value, reply: reply.value });
        await loadReports(); if (can('audit.read')) await loadAudit();
        message('#staff-message', 'Репорт обновлён.');
      } catch (e) { message('#staff-message', e.message); }
    });
    submit.disabled = !can('reports.write');
    const claim = element('button', 'button outline small', report.assignedToStaffId === currentStaff.staffId ? 'Снять с себя' : (report.assignedToStaffId ? 'Назначен' : 'Взять репорт'));
    claim.disabled = !can('reports.write') || report.status === 'closed' || Boolean(report.assignedToStaffId && report.assignedToStaffId !== currentStaff.staffId && !['owner','administrator'].includes(currentStaff.role));
    claim.addEventListener('click', async () => {
      try {
        await api(`/api/admin/reports/${encodeURIComponent(report.id)}/claim`, 'POST', { claim: report.assignedToStaffId !== currentStaff.staffId });
        await loadReports(); if (can('audit.read')) await loadAudit();
      } catch (e) { message('#staff-message', e.message); }
    });
    row.append(claim, reply, select, submit); root.append(row);
  }
}


async function loadStaff() {
  const root = document.querySelector('#staff-list'); if (!root) return;
  const { items } = await api('/api/admin/staff'); root.replaceChildren();
  if (!items.length) root.append(element('p', 'dim', 'Дополнительных сотрудников нет.'));
  for (const item of items) {
    const row = element('div', 'data-row');
    const info = element('div'); info.append(element('strong', '', item.email), element('small', 'dim', `${item.role} · ${item.disabled ? 'отключён' : 'активен'}`));
    row.append(info);
    if (can('staff.manage')) {
      const role = element('select', 'small-field');
      for (const value of ['administrator','moderator','support']) {
        const option = document.createElement('option'); option.value = value; option.textContent = value; option.selected = item.role === value; role.append(option);
      }
      const toggle = element('button', 'button small outline', item.disabled ? 'Включить' : 'Выключить');
      const save = element('button', 'button small', 'Сохранить роль');
      async function update(disabled) {
        try { await api(`/api/admin/staff/${item.id}`, 'PATCH', { role: role.value, disabled }); await loadStaff(); if (can('audit.read')) await loadAudit(); }
        catch (e) { message('#staff-create-message', e.message); }
      }
      toggle.addEventListener('click', () => update(!item.disabled));
      save.addEventListener('click', () => update(item.disabled));
      row.append(role, save, toggle);
    }
    root.append(row);
  }
}
const staffForm = document.querySelector('#staff-create');
if (staffForm) staffForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(staffForm);
  try {
    await api('/api/admin/staff', 'POST', { email: values.get('email'), password: values.get('password'), role: values.get('role') });
    staffForm.reset(); message('#staff-create-message', 'Сотрудник добавлен.'); await loadStaff(); if (can('audit.read')) await loadAudit();
  } catch (e) { message('#staff-create-message', e.message); }
});
if (document.querySelector('#admin-game')) {
  api('/api/admin/session').then(async session => {
    currentStaff = session;
    message('#my-staff-role', `Сотрудник: ${session.email} • роль: ${session.role}`);
    for (const panel of document.querySelectorAll('[data-permission]')) {
      panel.hidden = !can(panel.dataset.permission);
    }
    const tasks = [];
    if (can('news.write')) tasks.push(loadAdminNews());
    if (can('players.read')) tasks.push(loadPlayers());
    if (can('tickets.read')) tasks.push(loadTickets());
    if (can('reports.read')) tasks.push(loadReports());
    if (can('game.read')) tasks.push(loadGame());
    if (can('staff.read')) tasks.push(loadStaff());
    if (can('audit.read')) tasks.push(loadAudit());
    const results = await Promise.allSettled(tasks);
    for (const result of results) if (result.status === 'rejected') message('#staff-message', result.reason.message);
  }).catch(e => message('#staff-message', e.message));
}
