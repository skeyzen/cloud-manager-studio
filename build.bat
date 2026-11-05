@echo off
setlocal
cd /d "%~dp0"

echo Building the portable Cloud Manager Studio executable...
call npm run build:win
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build completed. Check the release folder for the portable executable.
pause
exit /b 0
