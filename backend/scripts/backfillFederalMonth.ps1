& {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  chcp 65001 | Out-Null

  $ProjectRoot = "C:\Users\glaub\palpitaco"
  $ymd = (Get-Date -Format "yyyy-MM-dd")

  $startAt = Get-Date "$ymd 20:00"
  $stopAt  = Get-Date "$ymd 20:35"
  $intervalSec = 300 # 5 min

  $now = Get-Date
  if ($now -lt $startAt) {
    Write-Host "Ainda não são 20:00. Agora: $($now.ToString('HH:mm'))."
    return
  }
  if ($now -gt $stopAt) {
    Write-Host "Janela já passou (até 20:35). Agora: $($now.ToString('HH:mm')). Rode manual se necessário."
    return
  }

  $attempt = 0
  while ((Get-Date) -le $stopAt) {
    $attempt++
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Host "Tentativa $attempt @ $ts (ymd=$ymd)"

    $output = & node "$ProjectRoot\backend\scripts\importKingApostas.js" $ymd "FEDERAL" 2>&1
    $joined = $output -join "`n"

    # sucesso se houve upsert de draw (>=1)
    if ($joined -match "draws_upserted=([1-9]\d*)") {
      Write-Host "✅ Import realizado (draws_upserted=$($Matches[1]))."
      return
    }

    # sem dados ainda
    if ((Get-Date).AddSeconds($intervalSec) -gt $stopAt) { break }
    Write-Host "Ainda sem resultado. Aguardando 5 min... (para até 20:35)"
    Start-Sleep -Seconds $intervalSec
  }

  Write-Host "⚠️ Não capturou até 20:35. Pode ter atrasado, mudado horário ou não houve sorteio. Verifique manualmente."
}