@echo off
cd /d "%~dp0web"
echo [VARKENZA] Checking SQLite database...
if exist .env (
  node --env-file=.env scripts/db-doctor.js
) else (
  node scripts/db-doctor.js
)
pause
