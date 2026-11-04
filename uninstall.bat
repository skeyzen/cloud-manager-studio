@echo off
setlocal
cd /d "%~dp0"

echo This removes npm dependencies and generated build output.
echo package.json and package-lock.json will be preserved.
echo.
choice /C YN /N /M "Continue? [Y/N] "
if errorlevel 2 (
  echo Uninstall cancelled.
  exit /b 0
)

echo.
if exist "node_modules" (
  echo Removing node_modules...
  rmdir /s /q "node_modules"
)
if exist "dist" (
  echo Removing dist...
  rmdir /s /q "dist"
)
if exist "dist-electron" (
  echo Removing dist-electron...
  rmdir /s /q "dist-electron"
)

echo.
echo npm dependencies and generated output removed.
pause
exit /b 0
