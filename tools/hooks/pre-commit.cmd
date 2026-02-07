@echo off
setlocal

REM Garante rodar a partir do ROOT do repo
cd /d "%~dp0\..\.."

REM Preferir PowerShell 7 (pwsh). Se nao tiver, cai no Windows PowerShell.
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0\..\..\tools\verify-pt_rio.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0\..\..\tools\verify-pt_rio.ps1"
)

if %errorlevel% neq 0 (
  echo.
  echo [pre-commit] verify-pt_rio falhou. Commit bloqueado.
  exit /b %errorlevel%
)

exit /b 0
