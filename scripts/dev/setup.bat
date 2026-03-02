@echo off
setlocal ENABLEDELAYEDEXPANSION

set MODE=%1
if "%MODE%"=="" set MODE=all

if /I "%MODE%"=="help" goto :usage
if /I "%MODE%"=="-h" goto :usage
if /I "%MODE%"=="--help" goto :usage

if /I "%MODE%"=="backend" goto :setup_backend
if /I "%MODE%"=="frontend" goto :setup_frontend
if /I "%MODE%"=="all" goto :setup_all

echo Unknown mode: %MODE%
goto :usage

:setup_all
call :setup_backend || exit /b 1
call :setup_frontend || exit /b 1
goto :done

:setup_backend
echo [setup] Backend dependencies
cd /d "%~dp0..\..\backend"
call npm install || exit /b 1
where docker >nul 2>nul
if %ERRORLEVEL%==0 (
  echo [setup] Starting backend infrastructure with docker compose
  docker compose -f "%~dp0..\..\docker-compose.yml" up -d mariadb-core mariadb-node redis minio || exit /b 1
) else (
  echo [warn] Docker not found, skipping infrastructure startup
)
exit /b 0

:setup_frontend
echo [setup] Frontend dependencies
cd /d "%~dp0..\..\frontend"
call npm install || exit /b 1
exit /b 0

:usage
echo Usage: scripts\dev\setup.bat [backend^|frontend^|all]
exit /b 1

:done
echo [setup] Completed
exit /b 0
