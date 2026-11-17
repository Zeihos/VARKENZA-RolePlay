@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "admin-software\admin_console.py"
) else (
  python "admin-software\admin_console.py"
)
if errorlevel 1 pause
