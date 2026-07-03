@echo off
echo Stopping The Agency Local Workspace on port 5173...

:: Find PID of process listening on port 5173 and kill it
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
    echo Process %%a terminated.
)

echo Workspace stopped successfully.
timeout /t 2 >nul
exit
