@echo off
setlocal
set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\glaub\palpitaco\_secrets\palpitaco\firebase-admin.json
set LOTTERY=PT_RIO
set CATCHUP_MAX_AFTER_END_MIN=240

cd /d C:\Users\glaub\palpitaco

REM log do agendador (stdout+stderr)
set LOG=C:\Users\glaub\palpitaco\backend\logs\task-pt_rio.log
echo ==== %DATE% %TIME% ==== >> "%LOG%"

where node >> "%LOG%" 2>&1
node -v >> "%LOG%" 2>&1

node backend\scripts\autoImportToday.js >> "%LOG%" 2>&1

echo EXITCODE=%ERRORLEVEL% >> "%LOG%"
endlocal
