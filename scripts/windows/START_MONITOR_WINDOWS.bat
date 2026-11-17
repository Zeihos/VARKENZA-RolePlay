@echo off
cd /d "%~dp0..\.."
python apps\admin-software\monitor.py
if errorlevel 1 echo Python 3 with tkinter is required.
pause
