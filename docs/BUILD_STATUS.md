# Состояние сборки игрового мода VARKENZA

[← На главную](../README.md) · [Запуск](SETUP.md) · [План разработки](ROADMAP.md)

> **Статус: техническая альфа.** Этот документ фиксирует фактические результаты проверки оригинальной основы `open.RP` (SA-MP 0.3.DL / Pawn / MySQL). Не подтверждены ни успешная компиляция `main.amx`, ни запуск сервера, ни совместимость с open.mp.

## Что исправлено и проверено

При подготовке **отдельной локальной копии**, не изменяя исходный Git-подмодуль:

- Настроено получение зависимостей через актуальный `sampctl`.
- Исправлено имя включаемого `rBits` для Linux.
- Установлен заголовок `mapandreas.inc` из зафиксированного источника с проверкой хеша.
- Установлен `a_mysql.inc`, сгенерированный из официального шаблона **pBlueG MySQL R41-4**, с проверкой точного Git blob SHA-1 исходника.
- Исправлены пути `#include` с Windows-разделителями и ошибками регистра (только при наличии локального файла), без перекодирования исходников.
- В подготовленную Windows-копию перенесены необходимые библиотеки `libmariadb.dll` и `log-core.dll`.
- Добавлены автоматические тесты подготовки и проверки заголовочных файлов.

## Текущий блокер

Последняя строгая компиляция Pawn на GitHub Actions дошла до исходных систем сервера и завершилась **26 диагностическими ошибками** (не создан `main.amx`). Среди них:

| Функция | Где компилятор сообщил ошибку | Где найдена реализация в оригинальном open.RP |
| --- | --- | --- |
| `Player_SafeSpawned` | `Server/GMX.pwn`, `Zones.pwn` | `Player/SaveLoad/player_crashes.pwn` |
| `Vehicle_Exists` | `Server/Vehicles.pwn` | `Systems/Vehicles/Vehicles_Core.pwn` |
| `House_Exists`, `Player_InHouse` | `Systems/House/Furniture.pwn` | `Systems/House/House.pwn` |
| `Storage_PlayerNearRack`, `HouseStorage_SaveWep` | `Systems/House/RobStorage.pwn` | `Systems/House/HouseStorage.pwn` |
| `RotateBizzFurDoor` | `Systems/House/Furniture.pwn` | `Systems/Bizz/BizzFurniture.pwn` |

### Проверка 18 ноября 2026 — причина уточнена

В [PR #12](https://github.com/Zeihos/VARKENZA-RolePlay/pull/12) добавлены проверяемые изменения объявлений и порядка включения модулей. Препроцессор и CI подтвердили, что в локальной копии были изменены **семь файлов**, а тесты Python прошли. Однако **26 ошибок Pawn остались**, и `main.amx` всё ещё не создаётся.

При диагностической сборке с аргументом `-l` получен `main.lst`. В нём видны вызовы проблемных функций, но поиск определений их не обнаружил. Присутствуют маркеры `Furniture.pwn` и `RobStorage.pwn`; маркеры `House.pwn`, `HouseStorage.pwn`, `Vehicles_Core.pwn`, `player_crashes.pwn`, `BizzFurniture.pwn` и `Factions.pwn` не найдены.

Это **наблюдение о фактическом результате препроцессора**, а не доказательство точного механизма пропуска. Нельзя делать вывод о готовности игры, пока не установлена причина и не собран рабочий AMX.

- [CI с проверкой исходных модулей](https://github.com/Zeihos/VARKENZA-RolePlay/actions/runs/44323339468)
- [PR #12 — диагностика и экспериментальные изменения](https://github.com/Zeihos/VARKENZA-RolePlay/pull/12)

**Следующая работа:** выяснить, почему нужные файлы не появляются в развёрнутом Pawn-коде; исправить разрешение `#include` или исключающие директивы, не заменяя игровые функции заглушками. После этого повторить строгую компиляцию и только затем тестировать сервер с MySQL.

Это не повод удалять вызовы или добавлять пустые реализации. Следующий шаг — проверить точное включение файлов, прототипы и порядок разрешения функций Pawn, исправить ошибки **на основе исходного кода**, затем повторить сборку.

Лог ошибки: [GitHub Actions — VARKENZA Pawn build](https://github.com/Zeihos/VARKENZA-RolePlay/actions/runs/44171900039).

## Как воспроизвести

1. Получите репозиторий с подмодулем: `git clone --recurse-submodules https://github.com/Zeihos/VARKENZA-RolePlay.git`.
2. Задайте локально собственные значения `VARKENZA_MYSQL_PASSWORD` и `VARKENZA_RCON_PASSWORD` (не публикуйте их).
3. Выполните `python tools/prepare_openrp.py` из корня репозитория.
4. Установите `sampctl` и выполните из `build/openrp`: `sampctl ensure --platform windows` (на Linux: `linux`).
5. Из `build/openrp` запустите `python ../../tools/ensure_mapandreas.py --runtime .` и `python ../../tools/ensure_mysql_include.py --runtime .`.
6. Запустите `sampctl build dev`; фиксируйте **реальный** вывод компилятора.

Для Windows есть `tools/BUILD_OPENRP_WINDOWS.bat`, объединяющий подготовку и сборку.

**Важно:** это инструкции для локальной разработки. Успешные тесты подготовки не равны готовому серверу. Публичный запуск требует отдельной проверки игрового процесса, MySQL, безопасности и резервного копирования.

Связанная задача: [#3 — компиляция и проверка open.mp](https://github.com/Zeihos/VARKENZA-RolePlay/issues/3).
