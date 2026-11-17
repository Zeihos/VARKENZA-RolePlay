@echo off
cd /d "%~dp0..\..\web"
if not exist .env (
 echo [VARKENZA] Create web\.env from .env.example and configure GAME_BRIDGE_SECRET first.
 pause
 exit /b 1
)
node --env-file=.env server.js
pause
