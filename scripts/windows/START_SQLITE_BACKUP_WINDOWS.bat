@echo off
cd /d "%~dp0web"
echo [VARKENZA] Creating SQLite backup...
if exist .env (
  node --env-file=.env scripts/db-backup.js
) else (
  node scripts/db-backup.js
)
pause
