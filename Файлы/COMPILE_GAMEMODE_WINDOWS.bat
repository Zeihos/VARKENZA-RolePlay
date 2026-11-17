@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo [VARKENZA] Pawn build helper v0.11
if not defined OPENMP_SERVER_DIR (
    set /p "OPENMP_SERVER_DIR=Path to your extracted open.mp Server folder: "
)
if not exist "%OPENMP_SERVER_DIR%\qawno\pawncc.exe" (
    echo [ERROR] Expected "%OPENMP_SERVER_DIR%\qawno\pawncc.exe"
    echo Extract the official open.mp Windows Server package first.
    pause
    exit /b 1
)
if not exist "%OPENMP_SERVER_DIR%\gamemodes" mkdir "%OPENMP_SERVER_DIR%\gamemodes"
if not exist "%OPENMP_SERVER_DIR%\qawno\include\open.mp.inc" (
    echo [WARNING] open.mp.inc was not found: verify your installation.
)
echo [VARKENZA] Copying source to your server folder...
copy /Y "game\gamemodes\varkenza.pwn" "%OPENMP_SERVER_DIR%\gamemodes\varkenza.pwn" >NUL
set "BUILD_AMX=%OPENMP_SERVER_DIR%\gamemodes\varkenza_v011_build.amx"
if exist "%BUILD_AMX%" del /Q "%BUILD_AMX%"
pushd "%OPENMP_SERVER_DIR%\qawno"
"%OPENMP_SERVER_DIR%\qawno\pawncc.exe" "%OPENMP_SERVER_DIR%\gamemodes\varkenza.pwn" -i"%OPENMP_SERVER_DIR%\qawno\include" -o"%BUILD_AMX%"
set "COMPILE_RESULT=%ERRORLEVEL%"
popd
if not "%COMPILE_RESULT%"=="0" (
    echo [ERROR] Pawn compiler returned %COMPILE_RESULT%. Review errors above.
    pause
    exit /b %COMPILE_RESULT%
)
if not exist "%BUILD_AMX%" (
    echo [ERROR] No NEW AMX produced. Old varkenza.amx remains untouched.
    pause
    exit /b 1
)
move /Y "%BUILD_AMX%" "%OPENMP_SERVER_DIR%\gamemodes\varkenza.amx" >NUL
if errorlevel 1 (echo [ERROR] Cannot move the compiled AMX. & exit /b 1)
echo [OK] Compiled game file: "%OPENMP_SERVER_DIR%\gamemodes\varkenza.amx"
echo [IMPORTANT] Configure matching secrets in web\.env and game\gamemodes\varkenza.pwn.
pause
endlocal
