@echo off

REM === Garante diretório correto ===
cd /d "C:\Users\glaub\palpitaco\archive_backend\backend"

REM === Executa o automático ===
"C:\Program Files\nodejs\node.exe" "scripts\autoImportToday.js" >> "logs\autoImportToday.log" 2>&1
