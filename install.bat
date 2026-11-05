@echo off
setlocal
cd /d "%~dp0"

echo Installing npm dependencies from the lockfile...
call npm ci --ignore-scripts --legacy-peer-deps
if errorlevel 1 (
  echo.
  echo npm install failed.
  pause
  exit /b 1
)

echo Installing the Electron runtime...
call node node_modules\electron\install.js
if errorlevel 1 (
  echo.
  echo Electron runtime setup failed.
  pause
  exit /b 1
)

echo.
echo npm dependencies installed successfully.
pause
exit /b 0
