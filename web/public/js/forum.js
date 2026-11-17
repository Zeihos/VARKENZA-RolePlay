'use strict';
const q = id => document.getElementById(id);
const n = (tag, cls, value) => { const e = document.createElement(tag); if (cls) e.className = cls; if (value !== undefined) e.textContent = value; return e; };
const msg = text => { q('forum-message').textContent = text; };
const categories = { general: 'Общение', suggestions: 'Предложения', factions: 'Фракции', technical: 'Технические вопросы' };
let allTopics = []; let currentTopic = null; let loggedIn = false;
async function api(url, method = 'GET', body) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers = { 'Content-Type': 'application/json' }; }
  const response = await fetch(url, opts); const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Не удалось получить данные.');
  return data;
}
async function initUser() {
  try { await api('/api/me'); loggedIn = true; }
  catch { loggedIn = false; }
  q('topic-form').hidden = !loggedIn; q('forum-guest').hidden = loggedIn;
  q('reply-form').hidden = !loggedIn;
}
function drawList() {
  const list = q('forum-list'); list.replaceChildren();
  const filter = q('forum-category').value;
  const rows = allTopics.filter(t => filter === 'all' || t.category === filter);
  if (!rows.length) return list.append(n('p', 'dim', 'Пока нет тем в этой категории.'));
  for (const t of rows) {
    const btn = n('button', 'topic-card'); btn.type = 'button';
    btn.append(n('span', 'eyebrow', categories[t.category] || t.category), n('strong', '', t.title),
      n('small', 'dim', `${t.author} • ${new Date(t.createdAt).toLocaleDateString('ru-RU')} • ${t.replyCount} ответов ${t.locked ? '• Закрыта' : ''}`));
    btn.addEventListener('click', () => showThread(t.id)); list.append(btn);
  }
}
async function refresh() {
  try { allTopics = (await api('/api/forum/topics')).items; drawList(); }
  catch (e) { msg(e.message); }
}
async function showThread(id) {
  try {
    const { topic, replies } = await api('/api/forum/topics/' + encodeURIComponent(id));
    currentTopic = id;
    q('forum-thread').hidden = false; q('thread-title').textContent = topic.title;
    const body = q('thread-content'); body.replaceChildren();
    body.append(n('p', 'dim', `${topic.author} · ${categories[topic.category] || topic.category}`), n('p', 'forum-paragraph', topic.content));
    const root = q('thread-replies'); root.replaceChildren();
    if (!replies.length) root.append(n('p', 'dim', 'Ответов пока нет.'));
    for (const r of replies) {
      const row = n('div', 'ticket-row'); row.append(n('strong', '', r.author), n('p', 'forum-paragraph', r.content)); root.append(row);
    }
    q('reply-form').hidden = !loggedIn || topic.locked;
    if (topic.locked) root.append(n('p', 'notice', 'Тема закрыта сотрудником.'));
    q('forum-thread').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { msg(e.message); }
}
q('forum-category').addEventListener('change', drawList);
q('forum-refresh').addEventListener('click', refresh);
q('forum-back').addEventListener('click', () => { q('forum-thread').hidden = true; currentTopic = null; });
q('topic-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
  try { const r = await api('/api/forum/topics', 'POST', { category: f.get('category'), title: f.get('title'), content: f.get('content') }); form.reset(); msg('Тема создана.'); await refresh(); await showThread(r.item.id); }
  catch (err) { msg(err.message); }
});
q('reply-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!currentTopic) return;
  const form = e.currentTarget, f = new FormData(form);
  try { await api('/api/forum/topics/' + encodeURIComponent(currentTopic) + '/replies', 'POST', { content: f.get('content') }); form.reset(); msg('Ответ добавлен.'); await showThread(currentTopic); await refresh(); }
  catch (err) { msg(err.message); }
});
Promise.all([initUser(), refresh()]).catch(e => msg(e.message));
