# Запуск и настройка

> Инструкция для **локальной разработки**, а не для публикации сервера в интернете.

[На главную](../README.md) · [Архитектура](ARCHITECTURE.md) · [Дорожная карта](ROADMAP.md)

## 1. Получение репозитория

Нужен Git с поддержкой подмодулей:

```bash
git clone --recurse-submodules https://github.com/Zeihos/VARKENZA-RolePlay.git
cd VARKENZA-RolePlay
```

Если проект уже скачан без подмодуля, запустите из корня:

```bash
git submodule update --init --recursive
```

`upstream/open.RP` — **игровая основа**, а `game/gamemodes/varkenza.pwn` — отдельный ранний прототип. Они не являются одной сборкой.

## 2. Сайт и кабинет (Node.js/SQLite)

Нужен **Node.js 22.13+**. Из корня проекта на Windows:

```powershell
cd web
Copy-Item .env.example .env
```

Для Linux/macOS вместо `Copy-Item` используйте `cp .env.example .env`.

Откройте файл `web/.env` и замените значения вида `REPLACE_WITH_...` на **разные** собственные секреты. Создать случайный URL-safe секрет можно так:

```powershell
node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"
```

Не отправляйте этот файл в GitHub. **Шаблон `PLAYER_SESSION_SECRET` автоматически отклоняется**: пока не установлен случайный секрет, веб-прототип применяет временный секрет для текущего процесса, поэтому сессии не переживут перезапуск.

На Windows можно использовать `scripts/windows/START_WEBSITE_WINDOWS.bat`: он читает `web/.env` и не запускается без него. Затем запустите вручную:

```powershell
node --env-file=.env server.js
```

Локальный адрес: [http://127.0.0.1:3000](http://127.0.0.1:3000). Установка дополнительных npm-пакетов в текущем прототипе не требуется.

**Замечание:** `GAME_BRIDGE_SECRET` используется веб-мостом. Старый Pawn-прототип имеет собственную настройку, поэтому нельзя считать его автоматически связанным с новым `open.RP`.

## 3. Игровая основа open.RP

Оригинальный `open.RP` использует **SA-MP 0.3.DL, MySQL и сторонние Pawn-зависимости**. Для подготовки нужны Python 3, sampctl, доступная MySQL-база и оригинальный подмодуль.

Переменные `VARKENZA_MYSQL_PASSWORD` и `VARKENZA_RCON_PASSWORD` нужно установить **в локальной среде**, не записывая реальные пароли в Git. RCON-пароль должен состоять минимум из 16 символов.

Пример для PowerShell (вставьте собственные значения):

```powershell
$env:VARKENZA_MYSQL_PASSWORD = "ЗАДАЙТЕ_СВОЙ_ПАРОЛЬ"
$env:VARKENZA_RCON_PASSWORD = "ЗАДАЙТЕ_ДЛИННЫЙ_СЛУЧАЙНЫЙ_ПАРОЛЬ"
python tools/prepare_openrp.py
```

Будет создана рабочая копия в `build/openrp` и приватный `mysql.ini`. Исходный подмодуль не изменяется. На Windows есть [`tools/BUILD_OPENRP_WINDOWS.bat`](../tools/BUILD_OPENRP_WINDOWS.bat), но **он пока не является подтверждённым способом получить рабочий сервер**.

> [!WARNING]
> В актуальной работе над сборкой были выявлены проблемы с зависимостями. Подробности — [задача #3](https://github.com/Zeihos/VARKENZA-RolePlay/issues/3) и [PR #5](https://github.com/Zeihos/VARKENZA-RolePlay/pull/5). Не смешивайте MySQL-базу `open.RP` с локальной SQLite-базой сайта.

## 4. Проверки разработчика

Из корня проекта:

```bash
npm --prefix web test
python -m unittest discover -s tools/tests -v
```

Можно проверить синтаксис сервера:

```bash
node --check web/server.js
```

Результаты автоматических GitHub Actions находятся во вкладке [Actions](https://github.com/Zeihos/VARKENZA-RolePlay/actions).

## 5. Если возникла проблема

- **Подмодуль пустой:** `git submodule update --init --recursive`.
- **Нет Node.js нужной версии:** проверьте `node --version`.
- **Отсутствует `web/.env`:** создайте его из `web/.env.example`.
- **Ошибка Pawn-компиляции:** приложите вывод компилятора в [Issue](https://github.com/Zeihos/VARKENZA-RolePlay/issues), убрав приватные пути, токены и пароли.
- **Хотите открыть сервер для всех:** не публикуйте альфа-версию без отдельной настройки безопасности, MySQL, HTTPS и резервных копий.
