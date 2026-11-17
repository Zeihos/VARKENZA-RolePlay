"""VARKENZA RolePlay local administrative console v0.6.

Uses only Python standard library; server-side permissions are enforced by Node.
Credentials and session cookies live only in this Python process.
"""
from __future__ import annotations

import json
import os
import tkinter as tk
from dataclasses import dataclass
from http.cookiejar import CookieJar
from tkinter import messagebox, ttk
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


@dataclass
class ApiError(Exception):
    message: str
    status: int = 0

    def __str__(self) -> str:
        return self.message


class AdminClient:
    def __init__(self, port: int = 3000):
        if not 1 <= port <= 65535:
            raise ValueError('Port must be 1..65535')
        self.base = f'http://127.0.0.1:{port}'
        self.cookies = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookies))

    def request(self, route: str, method: str = 'GET', body: dict | None = None) -> dict:
        if not route.startswith('/api/'):
            raise ValueError('Only API routes allowed')
        payload = json.dumps(body).encode('utf-8') if body is not None else None
        headers = {'Accept': 'application/json'}
        if method != 'GET':
            headers['Origin'] = self.base
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        req = Request(self.base + route, data=payload, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=5) as response:
                return json.load(response)
        except HTTPError as exc:
            try:
                data = json.loads(exc.read().decode('utf-8'))
                msg = data.get('error') or f'HTTP {exc.code}'
            except (ValueError, UnicodeDecodeError):
                msg = f'HTTP {exc.code}'
            raise ApiError(msg, exc.code) from exc
        except (URLError, OSError, TimeoutError) as exc:
            raise ApiError(f'Нет соединения с локальным сайтом: {exc}') from exc

    def clear_session(self) -> None:
        self.cookies.clear()


class AdminConsole(tk.Tk):
    def __init__(self, port: int):
        super().__init__()
        self.title('VARKENZA • Admin Console v0.6 [LOCAL ALPHA]')
        self.geometry('940x680')
        self.minsize(790, 530)
        self.configure(bg='#16191f')
        self.client = AdminClient(port)
        self.players: list[dict] = []
        self.user = None
        self.notice = tk.StringVar(value='Подключение только к 127.0.0.1. Никогда не публикуйте панель в интернет.')
        self._style()
        self._login_screen()

    def _style(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TFrame', background='#16191f')
        style.configure('TLabel', background='#16191f', foreground='#f1f0ee', font=('Segoe UI', 10))
        style.configure('TButton', padding=9, font=('Segoe UI', 10))
        style.configure('TEntry', padding=7)
        style.configure('Treeview', rowheight=30, background='#232832', foreground='#fafafa', fieldbackground='#232832')
        style.configure('Treeview.Heading', background='#30343f', foreground='#fafafa')
        style.map('Treeview', background=[('selected', '#a55e2e')])

    def _clear(self):
        for item in self.winfo_children():
            item.destroy()

    def _label(self, parent, text, font=None, color='#f1f0ee'):
        return tk.Label(parent, text=text, bg='#16191f', fg=color,
                        font=font or ('Segoe UI', 10), anchor='w', wraplength=780)

    def _login_screen(self):
        self._clear()
        frame = ttk.Frame(self, padding=40)
        frame.pack(fill='both', expand=True)
        self._label(frame, 'VARKENZA ROLEPLAY', ('Segoe UI', 23, 'bold'), '#ffa45e').pack(anchor='w', pady=(35, 3))
        self._label(frame, 'ADMIN CONSOLE • локальный прототип v0.6').pack(anchor='w', pady=(0, 22))
        self._label(frame, 'Email сотрудника').pack(anchor='w', pady=(8, 0))
        email = ttk.Entry(frame, width=52); email.pack(anchor='w', pady=5)
        self._label(frame, 'Пароль').pack(anchor='w', pady=(12, 0))
        password = ttk.Entry(frame, show='*', width=52); password.pack(anchor='w', pady=5)
        def login():
            try:
                self.client.request('/api/admin/login', 'POST', {'email': email.get().strip(), 'password': password.get()})
                password.delete(0, 'end')
                self.user = self.client.request('/api/admin/session')
                self._dashboard()
            except ApiError as exc:
                self.notice.set(str(exc)); messagebox.showerror('Вход', str(exc))
        ttk.Button(frame, text='Войти в панель', command=login).pack(anchor='w', pady=20)
        self._label(frame, 'Используются учётные записи сотрудников из веб-админки.\nПароли и cookies не сохраняются на диск.',
                    color='#aeb4c2').pack(anchor='w', pady=25)
        self._label(frame, self.notice.get(), color='#ffa45e').pack(anchor='w')
        password.bind('<Return>', lambda _: login())

    def _dashboard(self):
        self._clear()
        toolbar = ttk.Frame(self, padding=(18, 15, 18, 10)); toolbar.pack(fill='x')
        self._label(toolbar, 'VARKENZA • Управление сервером', ('Segoe UI', 16, 'bold'), '#ffa45e').pack(side='left')
        ttk.Button(toolbar, text='Выйти', command=self._logout).pack(side='right', padx=3)
        ttk.Button(toolbar, text='Обновить', command=self.refresh).pack(side='right', padx=3)
        self._label(self, f"Сотрудник: {self.user['email']}  ·  Роль: {self.user['role']}", color='#b7bdc9').pack(anchor='w', padx=20)
        self._label(self, 'Игра: связь с онлайн-персонажами через heartbeat. WARN/KICK ставятся в очередь, не доставляются мгновенно.',
                    color='#aeb4c2').pack(anchor='w', padx=20, pady=(6, 8))
        area = ttk.Frame(self, padding=16); area.pack(fill='both', expand=True)
        cols=('name', 'characterId','staffLinked','pendingCommands')
        self.table = ttk.Treeview(area, columns=cols, show='headings', selectmode='browse')
        for col,title,width in [('name','Персонаж',220),('characterId','ID персонажа',270),('staffLinked','Админ в игре',120),('pendingCommands','Очередь',80)]:
            self.table.heading(col,text=title)
            self.table.column(col,width=width,stretch=col in ('name','characterId'))
        self.table.pack(fill='both',expand=True)
        actionRow = ttk.Frame(area,padding=(0,12,0,6)); actionRow.pack(fill='x')
        ttk.Button(actionRow, text='WARN', command=lambda:self._action('WARN')).pack(side='left',padx=2)
        ttk.Button(actionRow, text='KICK', command=lambda:self._action('KICK')).pack(side='left',padx=2)
        ttk.Button(actionRow, text='Код /staff', command=self._staff_code).pack(side='left',padx=2)
        self._label(area, 'Причина (только латиница, 5–80 символов):').pack(anchor='w')
        self.reason = ttk.Entry(area,width=100)
        self.reason.pack(fill='x',pady=6)
        self._label(area, 'Последние репорты (только просмотр):', color='#ffa45e').pack(anchor='w',pady=(9,4))
        self.reports = tk.Text(area, height=6, bg='#232832', fg='#f2f3f5', insertbackground='#fff', relief='flat', wrap='word', state='disabled')
        self.reports.pack(fill='x')
        self._label(self, 'ЛОКАЛЬНАЯ АЛЬФА. Административные действия журналируются сервером.',color='#aeb4c2').pack(anchor='w',padx=20,pady=4)
        self.noticeLabel=self._label(self,self.notice.get(),color='#ffa45e')
        self.noticeLabel.pack(anchor='w',padx=20,pady=(0,12))
        self.refresh()

    def _selection(self) -> dict | None:
        selected=self.table.selection()
        if not selected:
            messagebox.showwarning('Выбор', 'Выберите игрока в таблице.'); return None
        idx=int(selected[0]);return self.players[idx] if idx<len(self.players) else None

    def _action(self, action: str):
        player=self._selection()
        if not player:return
        reason=self.reason.get().strip()
        if not 5 <= len(reason) <= 80:
            messagebox.showwarning('Причина', 'Нужна причина от 5 до 80 символов.');return
        if action == 'KICK' and not messagebox.askyesno('Подтверждение', f"Поставить KICK для {player['name']}?"):
            return
        try:
            self.client.request('/api/admin/game/action', 'POST', {'characterId':player['characterId'],'type':action,'message':reason})
            self._status(f'{action} для {player["name"]} поставлен в очередь.')
            self.refresh()
        except ApiError as exc:
            messagebox.showerror('Действие',str(exc))

    def _staff_code(self):
        player=self._selection()
        if not player:return
        if not messagebox.askyesno('Привязка сотрудника', f'Создать код привязки ВАШЕЙ учётной записи для {player["name"]}?'):
            return
        try:
            response=self.client.request('/api/admin/game/staff-code','POST',{'characterId':player['characterId']})
            messagebox.showinfo('Одноразовый код', f"{player['name']}: /staff {response['code']}\nДействует 2 минуты. Не передавайте третьим лицам.")
        except ApiError as exc:
            messagebox.showerror('Код',str(exc))

    def _status(self, note):
        self.notice.set(note)
        if hasattr(self,'noticeLabel') and self.noticeLabel.winfo_exists():
            self.noticeLabel.configure(text=note)

    def refresh(self):
        try:
            info=self.client.request('/api/admin/game')
            self.players=info['players']
            self.table.delete(*self.table.get_children())
            for n,player in enumerate(self.players):
                self.table.insert('', 'end', iid=str(n), values=(player['name'],player['characterId'],
                       'да' if player['staffLinked'] else 'нет', player['pendingCommands']))
            try:
                reports=self.client.request('/api/admin/reports')['items'][:15]
                lines=[f"{r.get('characterName','?')} — {r.get('status','?')}: {r.get('message','')}" for r in reports]
            except ApiError:
                lines=['Нет прав на просмотр репортов.']
            self.reports.configure(state='normal')
            self.reports.delete('1.0','end')
            self.reports.insert('1.0','\n'.join(lines) if lines else 'Репортов пока нет.')
            self.reports.configure(state='disabled')
            self._status(f"Мост: {'включён' if info['bridgeEnabled'] else 'выключен'} · Онлайн: {info['online']}")
        except ApiError as exc:
            self._status(str(exc))
            if exc.status == 401: self.client.clear_session(); self._login_screen()

    def _logout(self):
        try: self.client.request('/api/admin/logout','POST')
        except ApiError: pass
        self.client.clear_session()
        self.user = None
        self._login_screen()


def main():
    raw=os.environ.get('VARKENZA_WEB_PORT','3000')
    if not raw.isdecimal():
        raise SystemExit('VARKENZA_WEB_PORT must be an integer 1..65535')
    app=AdminConsole(int(raw))
    app.mainloop()


if __name__=='__main__':
    main()
