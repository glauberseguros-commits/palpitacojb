$ErrorActionPreference = "Stop"

$p = ".\backend\scripts\importKingApostas.js"
if (!(Test-Path $p)) { throw "Arquivo não encontrado: $p" }

# BACKUP
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $p "$p.bak_$ts" -Force | Out-Null
Write-Host "Backup criado: $p.bak_$ts"

$s = Get-Content $p -Raw

# PATCH 1: require do calendário (depois do require firebaseAdmin)
if ($s -notmatch "getPtRioSlotsByDate") {
  $s = $s -replace "(const\s+\{\s*admin\s*,\s*db\s*\}\s*=\s*require\([^)]+\);\s*)", "`$1`r`nconst { getPtRioSlotsByDate } = require('./ptRioCalendar');`r`n"
  Write-Host "✔ PATCH 1 aplicado: require('./ptRioCalendar')"
} else {
  Write-Host "ℹ PATCH 1 já existia"
}

# PATCH 2: gate por calendário após startedAt
$calendarGate = @(
"  // ✅ GATE POR CALENDÁRIO (PT_RIO)",
"  // Bloqueia slot NÃO esperado antes de chamar a API",
"  if (normalizedClose && lk === 'PT_RIO') {",
"    const cal = getPtRioSlotsByDate(date);",
"    const expected = new Set((cal.core || []).concat(cal.opcional || []));",
"    if (!expected.has(normalizedClose)) {",
"      const ms0 = Date.now() - startedAt;",
"      return {",
"        ok: true,",
"        lotteryKey: lk,",
"        date,",
"        closeHour: normalizedClose,",
"        blocked: true,",
"        blockedReason: 'no_draw_for_slot_calendar',",
"        todayBR,",
"        captured: false,",
"        apiHasPrizes: false,",
"        alreadyCompleteAny: false,",
"        alreadyCompleteAll: false,",
"        expectedTargets: 0,",
"        alreadyCompleteCount: 0,",
"        slotDocsFound: 0,",
"        apiReturnedTargetDraws: 0,",
"        savedCount: 0,",
"        writeCount: 0,",
"        targetDrawIds: [],",
"        tookMs: ms0,",
"        totalDrawsFromApi: 0,",
"        totalDrawsMatchedClose: 0,",
"        totalDrawsValid: 0,",
"        totalDrawsSaved: 0,",
"        totalDrawsUpserted: 0,",
"        totalPrizesSaved: 0,",
"        totalPrizesUpserted: 0,",
"        skippedEmpty: 0,",
"        skippedInvalid: 0,",
"        skippedCloseHour: 0,",
"        skippedAlreadyComplete: 0,",
"        proof: {",
"          filterClose: normalizedClose,",
"          apiHasPrizes: false,",
"          apiReturnedTargetDraws: 0,",
"          targetDrawIds: [],",
"          inferredDate: null,",
"          expectedTargets: 0,",
"          slotDocsFound: 0,",
"          alreadyCompleteCount: 0,",
"          alreadyCompleteAny: false,",
"          alreadyCompleteAll: false,",
"          targetWriteCount: 0,",
"          targetSavedCount: 0",
"        }",
"      };",
"    }",
"  }",
""
) -join "`r`n"

if ($s -notmatch "no_draw_for_slot_calendar") {
  $s = $s -replace "(const\s+startedAt\s*=\s*Date\.now\(\);\s*)", "`$1`r`n$calendarGate`r`n"
  Write-Host "✔ PATCH 2 aplicado: gate por calendário"
} else {
  Write-Host "ℹ PATCH 2 já existia"
}

Set-Content -Encoding UTF8 $p $s
Write-Host "✅ Patch aplicado com sucesso em $p"
