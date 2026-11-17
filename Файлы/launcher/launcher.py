"""VARKENZA Launcher mockup v0.3 (standard-library-only, Windows-first).

The launcher starts only an executable explicitly selected by the local user.
No game files are bundled or downloaded. This is not an updater or installer.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from urllib.request import Request, urlopen
import webbrowser

APP = Path(__file__).resolve().parent
CONFIG = APP / 'local-launcher.json'
SITE = 'http://127.0.0.1:3000'


def read_path():
    try:
        obj = json.loads(CONFIG.read_text(encoding='utf-8'))
        return str(obj.get('client_path', ''))
    except (OSError, ValueError, TypeError):
        return ''


def save_path(p):
    CONFIG.write_text(json.dumps({'client_path': p}, ensure_ascii=False, indent=2), encoding='utf-8')


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('VARKENZA ROLEPLAY | Launcher 0.3 Preview')
        self.geometry('820x560')
        self.minsize(650, 500)
        self.configure(bg='#0d0e12')
        self.path_var = tk.StringVar(value=read_path())
        body = tk.Frame(self, bg='#0d0e12', padx=38, pady=35)
        body.pack(fill='both', expand=True)
        tk.Label(body, text='VARKENZA', font=('Segoe UI', 42, 'bold'), fg='#ff9936', bg='#0d0e12').pack(anchor='w')
        tk.Label(body, text='ROLEPLAY  /  DEVELOPMENT LAUNCHER', font=('Segoe UI', 10, 'bold'), fg='#e4a77e', bg='#0d0e12').pack(anchor='w')
        tk.Label(body, text='Твой мир. Твои правила. Твоя история.', font=('Segoe UI', 16), fg='#e7dfe0', bg='#0d0e12', pady=24).pack(anchor='w')
        self.state_label = tk.Label(body, text='Проверяем сайт...', fg='#a9a7ae', bg='#0d0e12', font=('Segoe UI', 12))
        self.state_label.pack(anchor='w')
        tk.Label(body, text='Путь к установленному клиенту (EXE)', fg='#bfb9bf', bg='#0d0e12', pady=15).pack(anchor='w')
        row = tk.Frame(body, bg='#0d0e12'); row.pack(fill='x')
        tk.Entry(row, textvariable=self.path_var, bg='#17191e', fg='#f4edf0', insertbackground='#ff9936', relief='flat', font=('Segoe UI', 11)).pack(side='left', fill='x', expand=True, ipady=11)
        tk.Button(row, text='Обзор...', command=self.browse, padx=13, pady=8).pack(side='left', padx=(9, 0))
        buttons = tk.Frame(body, bg='#0d0e12', pady=28); buttons.pack(anchor='w')
        tk.Button(buttons, text='▶ ЗАПУСТИТЬ КЛИЕНТ', command=self.launch, bg='#ff942b', fg='#21140b', font=('Segoe UI', 12, 'bold'), padx=21, pady=11).pack(side='left', padx=(0, 10))
        tk.Button(buttons, text='Новости / сайт ↗', command=lambda: webbrowser.open(SITE), padx=14, pady=11).pack(side='left', padx=(0, 10))
        tk.Button(buttons, text='Обновить статус', command=self.refresh, padx=14, pady=11).pack(side='left')
        tk.Label(body, text='АЛЬФА: сейчас нет автоматического обновления, установки клиента, игрового входа и подключения к серверу.',
                 wraplength=700, justify='left', fg='#b5a6a2', bg='#0d0e12', pady=20).pack(anchor='w')
        self.after(250, self.refresh)

    def browse(self):
        filename = filedialog.askopenfilename(title='Выберите уже установленный игровой клиент', filetypes=[('Windows executable', '*.exe')])
        if filename:
            self.path_var.set(filename)
            save_path(filename)

    def launch(self):
        executable = Path(self.path_var.get())
        if not executable.is_file() or executable.suffix.lower() != '.exe':
            messagebox.showerror('VARKENZA', 'Выберите существующий EXE-файл установленного клиента.')
            return
        if sys.platform != 'win32':
            messagebox.showerror('VARKENZA', 'Демо-запуск клиентского EXE доступен только на Windows.')
            return
        if not messagebox.askyesno('Запуск игры', f'Запустить выбранный файл?\n{executable}'):
            return
        try:
            subprocess.Popen([str(executable)], cwd=str(executable.parent), shell=False)
        except OSError as e:
            messagebox.showerror('Не удалось запустить', str(e))

    def refresh(self):
        try:
            with urlopen(Request(SITE + '/healthz', headers={'User-Agent': 'VARKENZA-Launcher/0.2'}), timeout=4) as r:
                obj = json.load(r)
            with urlopen(Request(SITE + '/api/site', headers={'User-Agent': 'VARKENZA-Launcher/0.3'}), timeout=4) as r:
                site = json.load(r)
            online = site.get('gameOnline')
            online_label = 'мост отключён' if online is None else f'связанных игроков: {online}'
            self.state_label.config(text=f'● Сайт {obj.get("version", "?")} • {online_label}', fg='#88dca0')
        except (OSError, ValueError, TimeoutError):
            self.state_label.config(text='● Сайт недоступен. Это нормально, если локальный Node.js-сервер выключен.', fg='#f6ac80')


if __name__ == '__main__':
    Launcher().mainloop()
