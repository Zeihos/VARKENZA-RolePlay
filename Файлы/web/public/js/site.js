'use strict';
const $ = (selector) => document.querySelector(selector);
const newsRoot = $('#news-list');
if ($('#year')) $('#year').textContent = new Date().getFullYear();
if (newsRoot) {
  fetch('/api/news')
    .then(r => { if (!r.ok) throw Error('API error'); return r.json(); })
    .then(({ items }) => {
      newsRoot.replaceChildren();
      if (!items.length) { newsRoot.textContent = 'Публикаций пока нет.'; return; }
      for (const item of items) {
        const card = document.createElement('article'); card.className = 'news-card';
        const time = document.createElement('time'); time.dateTime = item.date;
        time.textContent = new Date(item.date).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
        const title = document.createElement('h3'); title.textContent = item.title;
        const body = document.createElement('p'); body.textContent = item.body;
        card.append(time, title, body); newsRoot.append(card);
      }
    })
    .catch(() => { newsRoot.textContent = 'Новости сейчас недоступны.'; });
}
