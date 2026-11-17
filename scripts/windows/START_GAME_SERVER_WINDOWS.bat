@echo off
setlocal EnableExtensions
cd /d "%~dp0..\.."
echo [VARKENZA] open.mp standalone prototype
if not defined OPENMP_SERVER_DIR (
    set /p "OPENMP_SERVER_DIR=Path to the extracted open.mp Windows Server folder: "
)
if not exist "%OPENMP_SERVER_DIR%\omp-server.exe" (
    echo [ERROR] omp-server.exe was not found in the folder.
    pause
    exit /b 1
)
if not exist "%OPENMP_SERVER_DIR%\gamemodes\varkenza.amx" (
    echo [ERROR] Compile first using scripts\windows\COMPILE_GAMEMODE_WINDOWS.bat
    pause
    exit /b 1
)
if not exist "%OPENMP_SERVER_DIR%\config.json" (
    echo [VARKENZA] Creating first-time open.mp config from game\config.example.json
    copy "game\config.example.json" "%OPENMP_SERVER_DIR%\config.json" >NUL
)
echo [INFO] Ensure main_scripts includes: varkenza 1
echo [INFO] Start web bridge separately with START_FULL_STACK_WINDOWS.bat
pushd "%OPENMP_SERVER_DIR%"
"%OPENMP_SERVER_DIR%\omp-server.exe"
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" echo [ERROR] open.mp returned exit code %RESULT%
pause
exit /b %RESULT%
