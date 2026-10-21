@echo off
title rrchat - Setup
cd /d "%~dp0"

echo ========================================================
echo             rrchat - Initial Setup Script
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [!] Node.js is not installed or not found in PATH.
  echo Attempting automatic installation via Windows Package Manager (winget)...
  echo.
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Automatic installation failed.
    echo Please download and install Node.js (LTS version) from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
  echo.
  echo ========================================================
  echo Node.js was successfully installed!
  echo Please close this window and run setup.bat again.
  echo ========================================================
  echo.
  pause
  exit /b 0
)

echo [1/3] Installing server dependencies...
cd server
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install server dependencies.
  pause
  exit /b 1
)
cd ..

echo.
echo [2/3] Installing client dependencies...
cd client
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install client dependencies.
  pause
  exit /b 1
)
cd ..

echo.
echo [3/3] Building client and server...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo Installation finished successfully!
echo You can now launch rrchat by running run-chat.bat.
echo.
echo If this is your first run, the interactive Setup Wizard
echo will automatically open in your browser.
echo ========================================================
echo.
pause
