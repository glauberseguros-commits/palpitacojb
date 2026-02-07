@echo off
setlocal

REM Rodar verify somente se houver mudanca relevante (opcional - remove este bloco se quiser sempre rodar)
git diff --cached --name-only | findstr /i /r "^backend/data/ ^backend/scripts/ ^tools/verify-" >nul
if %errorlevel% neq 0 (
  echo [pre-commit] Nenhuma mudanca relevante. Pulando verify.
  exit /b 0
)

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
