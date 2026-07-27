param(
  [string]$Lottery = "PT_RIO",   # PT_RIO | FEDERAL | ALL
  [string]$ApiBase = "http://127.0.0.1:3333",
  [string]$Date = ""
)

$ErrorActionPreference = "Stop"

# Vai para o root do projeto (2 níveis acima)
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

# Credencial Firestore
$DefaultCred = Join-Path $ProjectRoot "backend\secrets\serviceAccount.json"
if (Test-Path $DefaultCred) {
  $env:GOOGLE_APPLICATION_CREDENTIALS = $DefaultCred
}

# Flags padrão
$env:VERIFY_PERSISTED = "1"
$env:FAIL_ON_CRITICAL = "0"
$env:PITACO_API_BASE = ($ApiBase.TrimEnd("/"))

if ($Date) { 
  $env:DATE = $Date 
} else { 
  Remove-Item Env:\DATE -ErrorAction SilentlyContinue 
}

function Run-One([string]$Lk) {

  if ($Lk -ne "PT_RIO" -and $Lk -ne "FEDERAL") {
    throw "Lottery inválida: $Lk"
  }

  $env:LOTTERY = $Lk

  Write-Host ""
  Write-Host "[RUN] LOTTERY=$Lk"

  node ".\backend\scripts\autoImportToday.js"

  if ($LASTEXITCODE -ne 0) {
    throw "autoImportToday falhou (exit=$LASTEXITCODE) lottery=$Lk"
  }
}

$Lottery = $Lottery.Trim().ToUpper()

if ($Lottery -eq "ALL") {
  Run-One "PT_RIO"
  Run-One "FEDERAL"
}
else {
  Run-One $Lottery
}
