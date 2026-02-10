@echo off
setlocal

echo [env-init] Generating backend/.env and frontend/.env with secure defaults.
echo [env-init] Example overrides:
echo   scripts\init-env.bat --frontend-url=https://opencom.donskyblock.xyz --core-url=https://openapi.donskyblock.xyz

cd /d "%~dp0.."
node scripts\generate-env.mjs %*
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

echo [env-init] Done
exit /b 0
