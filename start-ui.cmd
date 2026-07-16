@echo off
cd /d "%~dp0"
set UI_OPEN_BROWSER=1
npm.cmd run ui
if errorlevel 1 pause
