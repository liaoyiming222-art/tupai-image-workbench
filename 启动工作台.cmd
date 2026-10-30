@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0图派启动器.exe" goto launch
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" goto missing
"%CSC%" /nologo /codepage:65001 /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"%~dp0图派启动器.exe" "%~dp0native\Launcher.cs"
if errorlevel 1 goto failed
:launch
if /I "%~1"=="--build-only" exit /b 0
start "" "%~dp0图派启动器.exe"
exit /b
:missing
echo 缺少 Windows .NET Framework。也可以在项目目录运行 node server.mjs。
:failed
pause
