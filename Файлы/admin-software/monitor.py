"""VARKENZA Control Monitor v0.4 — read-only tkinter dashboard for local development.

This is NOT an authenticated admin client and intentionally cannot issue moderation commands.
"""
import json
import tkinter as tk
from tkinter import ttk, messagebox
from urllib.request import Request, urlopen
from urllib.error import URLError
import webbrowser

BASE_URL = "http://127.0.0.1:3000"


def get_json(path):
    request = Request(BASE_URL + path, headers={"User-Agent": "VARKENZA-Local-Monitor/0.2"})
    with urlopen(request, timeout=4) as r:
        return json.load(r)


class Monitor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("VARKENZA • Control Monitor 0.4")
        self.geometry("770x540")
        self.minsize(580, 420)
        self.configure(bg="#0e1013")
        ttk.Style(self).theme_use("clam")
        content = tk.Frame(self, bg="#0e1013", padx=32, pady=26)
        content.pack(fill="both", expand=True)
        tk.Label(content, text="VARKENZA", fg="#ff943b", bg="#0e1013", font=("Segoe UI", 27, "bold")).pack(anchor="w")
        tk.Label(content, text="CONTROL MONITOR  •  LOCAL DEVELOPMENT ONLY", fg="#a9a8af", bg="#0e1013", font=("Segoe UI", 9)).pack(anchor="w")
        self.status = tk.Label(content, text="Проверка соединения...", fg="#eeeeee", bg="#0e1013", font=("Segoe UI", 14), pady=18)
        self.status.pack(anchor="w")
        row = tk.Frame(content, bg="#0e1013"); row.pack(fill="x")
        tk.Button(row, text="Обновить статус", command=self.refresh, padx=16, pady=9).pack(side="left", padx=(0, 8))
        tk.Button(row, text="Открыть админку ↗", command=lambda: webbrowser.open(BASE_URL + "/admin"), padx=16, pady=9).pack(side="left", padx=(0, 8))
        tk.Button(row, text="Открыть сайт ↗", command=lambda: webbrowser.open(BASE_URL), padx=16, pady=9).pack(side="left")
        tk.Label(content, text="Последние новости", fg="#ffb16e", bg="#0e1013", font=("Segoe UI", 14, "bold"), pady=15).pack(anchor="w")
        self.listbox = tk.Listbox(content, bg="#1b1e23", fg="#f5eeee", selectbackground="#bd632e", relief="flat", font=("Segoe UI", 11))
        self.listbox.pack(fill="both", expand=True)
        tk.Label(content, text="Управление игроками — через веб-админку. Монитор только читает публичные API.", fg="#a9a8af", bg="#0e1013", font=("Segoe UI", 9), pady=12).pack(anchor="w")
        self.after(250, self.refresh)

    def refresh(self):
        try:
            health = get_json("/healthz")
            news = get_json("/api/news")
            site = get_json("/api/site")
            online = site.get('gameOnline')
            game_label = 'мост выключен' if online is None else f'игроков: {online}'
            self.status.config(text=f"● Портал {health.get('version', '?')} • {game_label}", fg="#89df9f")
            self.listbox.delete(0, tk.END)
            for entry in news.get("items", [])[:20]:
                self.listbox.insert(tk.END, "  " + entry.get("title", "(без названия)"))
            if not news.get("items"):
                self.listbox.insert(tk.END, "  Публикаций пока нет")
        except (URLError, TimeoutError, OSError, ValueError, KeyError) as e:
            self.status.config(text="● Сайт недоступен: запустите START_WEBSITE_WINDOWS.bat", fg="#ff9b85")
            self.listbox.delete(0, tk.END)
            self.listbox.insert(tk.END, "  " + str(e))


if __name__ == "__main__":
    Monitor().mainloop()
