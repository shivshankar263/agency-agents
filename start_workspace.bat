@echo off
cd /d "%~dp0"
echo Starting The Agency Local Workspace...

:: Create a temporary VBScript to launch the process silently
echo CreateObject("Wscript.Shell").Run "cmd.exe /c npm --prefix client run dev", 0, False > "%temp%\launch_agency.vbs"
wscript.exe "%temp%\launch_agency.vbs"
del "%temp%\launch_agency.vbs"

echo Server started in the background.
echo Opening browser...

:: Wait 2 seconds for Vite to start and then launch the default browser
timeout /t 2 /nobreak >nul
start http://localhost:5173
exit
