@echo off
setlocal EnableExtensions
cd /d "%~dp0..\..\web"
if not exist ".env" (
    echo [VARKENZA] Create web\.env from web\.env.example and configure local secrets.
    pause
    exit /b 1
)
node --env-file=.env server.js
if errorlevel 1 pause
endlocal
