param(
  [Parameter(Mandatory=$true)][string]$Month,   # YYYY-MM
  [string]$ProjectRoot = "C:\Users\glaub\palpitaco"
)

$ErrorActionPreference = "Stop"

if ($Month -notmatch "^\d{4}-\d{2}$") { throw "Month inválido. Use YYYY-MM" }

$env:GOOGLE_APPLICATION_CREDENTIALS = "$ProjectRoot\_secrets\palpitaco\firebase-admin.json"

$logDir = Join-Path $ProjectRoot "backend\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("backfill-FEDERAL-{0}.log" -f $Month)

function LogLine($s){
  $line = ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $s)
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

# range do mês
$start = [datetime]::ParseExact("$Month-01","yyyy-MM-dd",$null)
$end = $start.AddMonths(1).AddDays(-1)

LogLine "BEGIN month=$Month start=$($start.ToString('yyyy-MM-dd')) end=$($end.ToString('yyyy-MM-dd'))"

for($d=$start; $d -le $end; $d=$d.AddDays(1)){
  # dow em UTC (0=dom ... 6=sab)
  $utc = [datetime]::SpecifyKind($d, [DateTimeKind]::Utc)
  $dow = [int]$utc.DayOfWeek

  if($dow -ne 3 -and $dow -ne 6){ continue } # só qua/sab

  $ymd = $d.ToString("yyyy-MM-dd")
  LogLine "IMPORT $ymd FEDERAL"

  & node "$ProjectRoot\backend\scripts\importKingApostas.js" $ymd "FEDERAL" 2>&1 | Tee-Object -FilePath $log -Append

  if($LASTEXITCODE -ne 0){
    LogLine "ERROR ymd=$ymd exit=$LASTEXITCODE (parando)"
    exit $LASTEXITCODE
  }
}

LogLine "END month=$Month OK"
