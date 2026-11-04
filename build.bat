@echo off
setlocal
cd /d "%~dp0"

echo Building Cloud Manager Studio...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build completed successfully.
pause
exit /b 0
