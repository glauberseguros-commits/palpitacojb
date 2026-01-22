@echo off
setlocal EnableExtensions

REM === Ir para a raiz do backend ATUAL ===
cd /d "C:\Users\glaub\palpitaco\backend" || (
  echo [ERRO] Nao foi possivel acessar C:\Users\glaub\palpitaco\backend
  exit /b 1
)

REM === Garante pasta de logs ===
if not exist "logs" mkdir "logs"

REM === Timestamp simples e estável ===
for /f "tokens=1-3 delims=/:. " %%a in ("%date% %time%") do set TS=%%a-%%b-%%c
echo [%date% %time%] CWD=%cd%>> "logs\autoImportToday.log"

REM === Executa o automático ===
"C:\Program Files\nodejs\node.exe" "scripts\autoImportToday.js" >> "logs\autoImportToday.log" 2>&1

REM === Propaga o status de saída para o Agendador ===
set EC=%errorlevel%
echo [%date% %time%] EXIT_CODE=%EC%>> "logs\autoImportToday.log"
exit /b %EC%
