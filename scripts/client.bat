@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0.."
set "BUILD=0"

if "%~1"=="" goto args_done

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--build" (
  set "BUILD=1"
  shift
  goto parse_args
)
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--help" goto usage
echo Unknown argument: %~1
goto usage_error

:args_done
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found in PATH.
  exit /b 1
)

pushd "%ROOT%"

if not exist "frontend\node_modules" (
  echo [client] Installing frontend dependencies...
  call npm --prefix frontend install
  if errorlevel 1 goto fail
)

if not exist "client\node_modules" (
  echo [client] Installing client dependencies...
  call npm --prefix client install
  if errorlevel 1 goto fail
)

if "%BUILD%"=="1" (
  echo [client] Building Windows artifacts...
  call npm --prefix client run build:win
  if errorlevel 1 goto fail
) else (
  echo [client] Building frontend for desktop shell...
  call npm --prefix frontend run build
  if errorlevel 1 goto fail
)

echo [client] Starting desktop client...
call npm --prefix client run start
if errorlevel 1 goto fail

popd
exit /b 0

:fail
set "ERR=%ERRORLEVEL%"
popd
exit /b %ERR%

:usage
echo Usage: scripts\client.bat [--build]
echo.
echo Default:
echo   Runs the desktop client on Windows.
echo.
echo Options:
echo   --build      Build Windows client artifacts, then run the client.
echo   -h, --help   Show this help text.
exit /b 0

:usage_error
echo.
echo Use --help for usage.
exit /b 1
