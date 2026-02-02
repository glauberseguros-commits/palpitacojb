param(
  [string]$Lottery="PT_RIO",
  [string]$ApiBase="http://127.0.0.1:3333",
  [string]$Date=""
)

cd C:\Users\glaub\palpitaco

$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\glaub\palpitaco\backend\secrets\serviceAccount.json"
$env:LOTTERY=$Lottery
$env:PITACO_API_BASE=$ApiBase
$env:VERIFY_PERSISTED="1"
$env:FAIL_ON_CRITICAL="0"

if ($Date) { $env:DATE=$Date } else { Remove-Item Env:\DATE -ErrorAction SilentlyContinue }

node .\backend\scripts\autoImportToday.js
