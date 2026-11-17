@echo off
cd /d "%~dp0..\.."
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "apps\admin-software\admin_console.py"
) else (
  python "apps\admin-software\admin_console.py"
)
if errorlevel 1 pause
