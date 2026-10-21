@echo off
title rrchat
cd /d "%~dp0"
echo ========================================================
echo Starting rrchat Server...
echo ========================================================

REM Free port 3000 if lingering process exists
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
  echo Port 3000 is occupied by PID %%a, stopping old instance...
  taskkill /PID %%a /F >nul 2>&1
)

echo.
call node server/dist/index.js
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Server exited with error code %errorlevel%.
)
echo.
pause
