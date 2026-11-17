@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
where git >nul 2>&1 || (echo [ERROR] Git not found. & exit /b 1)
where python >nul 2>&1 || (echo [ERROR] Python 3 not found. & exit /b 1)
where sampctl >nul 2>&1 || (echo [ERROR] sampctl not found. & exit /b 1)
if "%VARKENZA_MYSQL_PASSWORD%"=="" (
    echo [ERROR] Set VARKENZA_MYSQL_PASSWORD before running.
    exit /b 1
)
if "%VARKENZA_RCON_PASSWORD%"=="" (
    echo [ERROR] Set VARKENZA_RCON_PASSWORD to a strong value of 16+ characters.
    exit /b 1
)
if not exist "upstream\open.RP\gamemodes\main.pwn" (
    git submodule update --init --recursive
    if errorlevel 1 exit /b 1
)
python tools\prepare_openrp.py --replace
if errorlevel 1 exit /b 1
pushd "build\openrp"
echo [INFO] Preparing dependencies for legacy SA-MP 0.3.DL...
sampctl ensure --platform windows
if errorlevel 1 (popd & exit /b 1)
python ..\..\tools\ensure_mapandreas.py --runtime .
if errorlevel 1 (popd & exit /b 1)
python ..\..\tools\ensure_mysql_include.py --runtime .
if errorlevel 1 (popd & exit /b 1)
sampctl build
if errorlevel 1 (popd & exit /b 1)
popd
echo [OK] Staged and built VARKENZA legacy gamemode.
echo [IMPORTANT] This does not confirm compatibility with open.mp server.
echo [IMPORTANT] Import the SQL schema into the local MySQL database before launching.
endlocal
