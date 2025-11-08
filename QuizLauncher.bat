@echo off
REM Learnverse Quiz System - Control Panel Launcher
REM This replaces the two terminal windows with a single GUI control panel

cd /d "%~dp0"

REM Check if this is first time run
if not exist "node_modules" (
    echo First time setup detected...
    echo Running setup.ps1 to install dependencies...
    echo.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
    echo.
    echo Setup complete! Starting control panel...
    timeout /t 2 /nobreak > nul
)

REM Launch the control panel (start minimized and hidden to avoid blank cmd)
start /min powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0ControlPanel.ps1"
exit