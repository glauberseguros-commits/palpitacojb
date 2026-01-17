@echo off
setlocal

REM === Ir para a raiz do backend ATUAL ===
cd /d "C:\Users\glaub\palpitaco\backend"

REM === (Opcional) log do diretório atual para prova ===
echo [%date% %time%] CWD=%cd%>> "logs\autoImportToday.log"

REM === Executa o automático ===
"C:\Program Files\nodejs\node.exe" "scripts\autoImportToday.js" >> "logs\autoImportToday.log" 2>&1
