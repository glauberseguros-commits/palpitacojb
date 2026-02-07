$ErrorActionPreference = "Stop"

$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\glaub\palpitaco\_secrets\palpitaco\firebase-admin.json"

node .\backend\scripts\auditDrawSlotsRange.js PT_RIO 2022-06-07 2026-02-07 .\backend\logs\auditSlots-PT_RIO-2022-06-07_to_2026-02-07.json
if ($LASTEXITCODE -ne 0) { throw "auditDrawSlotsRange falhou ($LASTEXITCODE)" }

node .\backend\scripts\lintSourceGaps.js PT_RIO 2022-06-07 2026-02-07
if ($LASTEXITCODE -ne 0) { throw "lintSourceGaps falhou ($LASTEXITCODE)" }

Write-Host "OK ✅ audit + lint passaram"
