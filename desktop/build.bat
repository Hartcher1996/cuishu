@echo off
chcp 65001 >nul
REM Build script for Cuishu desktop
REM Usage:
REM   build.bat          - build exe only
REM   build.bat release  - build exe + NSIS installer

set ROOT=%~dp0
set PATH=C:\Program Files\Go\bin;C:\Users\Administrator\go\bin;C:\Program Files\nodejs;%PATH%

cd /d "%ROOT%"

echo [1/3] Regenerating Wails bindings ...
wails generate module
if errorlevel 1 ( echo BINDING FAILED & pause & exit /b 1 )

if "%1"=="release" (
  echo [2/3] Building exe + NSIS installer ...
  wails build -nsis
) else (
  echo [2/3] Building exe ...
  wails build
)
if errorlevel 1 ( echo BUILD FAILED & pause & exit /b 1 )

echo.
echo [3/3] Done!
echo exe: build\bin\萃书.exe
if "%1"=="release" echo installer: build\bin\萃书-amd64-installer.exe
pause
