@echo off
setlocal

set TARGET=%1
if "%TARGET%"=="" set TARGET=all

if /I "%TARGET%"=="help" goto :usage
if /I "%TARGET%"=="-h" goto :usage
if /I "%TARGET%"=="--help" goto :usage

if /I "%TARGET%"=="core" (
  cd /d "%~dp0..\backend"
  call npm run dev:core
  exit /b %ERRORLEVEL%
)

if /I "%TARGET%"=="node" (
  cd /d "%~dp0..\backend"
  call npm run dev:node
  exit /b %ERRORLEVEL%
)

if /I "%TARGET%"=="frontend" (
  cd /d "%~dp0..\frontend"
  call npm run dev -- --host 0.0.0.0
  exit /b %ERRORLEVEL%
)

if /I "%TARGET%"=="backend" (
  start "opencom-core" cmd /k "cd /d %~dp0..\backend && npm run dev:core"
  start "opencom-node" cmd /k "cd /d %~dp0..\backend && npm run dev:node"
  exit /b 0
)

if /I "%TARGET%"=="all" (
  start "opencom-core" cmd /k "cd /d %~dp0..\backend && npm run dev:core"
  start "opencom-node" cmd /k "cd /d %~dp0..\backend && npm run dev:node"
  start "opencom-frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev -- --host 0.0.0.0"
  exit /b 0
)

echo Unknown target: %TARGET%
:usage
echo Usage: scripts\start.bat [core^|node^|frontend^|backend^|all]
exit /b 1
