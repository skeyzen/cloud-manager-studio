@echo off
setlocal
cd /d "%~dp0"

echo Installing npm dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo npm dependencies installed successfully.
pause
exit /b 0
