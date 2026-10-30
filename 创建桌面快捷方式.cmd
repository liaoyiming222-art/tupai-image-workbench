@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0启动工作台.cmd" --build-only
if not exist "%~dp0图派启动器.exe" exit /b 1
"%~dp0图派启动器.exe" --install-shortcut
