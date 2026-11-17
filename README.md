# VARKENZA ROLEPLAY

![VARKENZA ROLEPLAY](assets/branding/cover.jpg)

**Статус: техническая альфа.** Здесь хранятся исходники игрового проекта, локального сайта и утилит. Готовый публичный сервер и совместимость игрового мода с open.mp **пока не подтверждены**.

## Структура репозитория

| Каталог | Содержимое |
| --- | --- |
| [upstream/open.RP](upstream/open.RP) | Оригинальный игровой мод [open.RP](https://github.com/ZanderOperator/open.RP) как Git-подмодуль на фиксированном коммите (SA-MP 0.3.DL + MySQL) |
| [tools](tools) | Подготовка приватной рабочей копии open.RP, Windows-сборка и тесты |
| [game](game) | Более ранний **отдельный** Pawn-прототип VARKENZA для open.mp; не основа open.RP |
| [web](web) | Локальный сайт, кабинет, форум-прототип и SQLite/API на Node.js |
| [apps](apps) | Прототипы Windows Admin Console, монитора и лаунчера |
| [scripts/windows](scripts/windows) | Скрипты запуска сайта и старого прототипа |
| [assets](assets) | Брендинг, изображения публикаций и превью интерфейсов |

Исходники перенесены из папки `Файлы`, а графика — из `Оформление`. Старые SQLite/WAL/SHM удалены **из текущего дерева**, но остаются в предыдущей истории Git.

## Запуск сайта на локальном ПК

Нужен **Node.js 22.13+**. В PowerShell:

```powershell
cd web
Copy-Item .env.example .env
# В .env задать свои секреты и пароль администратора
node --env-file=.env server.js
```

Веб-прототип предназначен **только для 127.0.0.1**. Не открывайте его в интернет без полноценного аудита безопасности. Никогда не коммитьте `.env` или реальные пользовательские данные.

## Игровая основа open.RP

```bash
git clone --recurse-submodules https://github.com/Zeihos/VARKENZA-RolePlay.git
```

Для локальной подготовки игровой сборки задайте переменные окружения `VARKENZA_MYSQL_PASSWORD` и `VARKENZA_RCON_PASSWORD` (RCON не короче 16 символов), затем выполните `python tools/prepare_openrp.py`. Скрипт создаст приватную копию мода в `build/openrp/` без изменения исходного подмодуля. На Windows доступен `tools/BUILD_OPENRP_WINDOWS.bat`.

**Ограничения:** оригинальный мод работает на SA-MP 0.3.DL и MySQL. Совместимость с open.mp и настоящая компиляция прорабатываются в [#3](https://github.com/Zeihos/VARKENZA-RolePlay/issues/3); соединение старой Node.js/SQLite-экосистемы с MySQL-модом — задача [#4](https://github.com/Zeihos/VARKENZA-RolePlay/issues/4).

## Правила разработки

- Исходники и графику храним в Git, но не временные базы, пароли, логи или скомпилированные файлы.
- Несовместимые игровые основы не смешиваем, пока нет подтверждённых тестов.
- Проверяем код в GitHub Actions и не выдаём успешную подготовку среды за успешную игровую сборку.
- Условия MIT для основы open.RP сохранены в [OPENRP_LICENSE](OPENRP_LICENSE) и в подмодуле. Другие части могут иметь отдельные условия.
