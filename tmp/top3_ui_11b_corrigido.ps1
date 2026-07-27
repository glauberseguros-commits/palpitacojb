cd C:\Users\glaub\palpitaco

Write-Host "`n===== TOP3-UI-11B — SEPARAR ACERTO DO RESULTADO OFICIAL =====" -ForegroundColor Cyan

$target = ".\src\pages\Top3\Top3View.jsx"
$tmpDir = ".\tmp"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$tmpDir\Top3View_before_top3_ui_11b_$stamp.jsx"
$out = "$tmpDir\top3_ui_11b_resultado.txt"

New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue

if (!(Test-Path -LiteralPath $target)) {
    Write-Host "ERRO: arquivo não encontrado: $target" -ForegroundColor Red
    return
}

Copy-Item -LiteralPath $target -Destination $backup -Force

$content = Get-Content -LiteralPath $target -Raw -Encoding UTF8

function Replace-Once {
    param(
        [string]$Text,
        [string]$Old,
        [string]$New,
        [string]$Label
    )

    $count = (
        [regex]::Matches(
            $Text,
            [regex]::Escape($Old)
        )
    ).Count

    if ($count -ne 1) {
        throw "${Label}: esperado 1 bloco; encontrados $count."
    }

    return $Text.Replace($Old, $New)
}

try {
    # 1. Remove medalha da coluna ACERTO.
    $content = Replace-Once `
        -Text $content `
        -Label "Título da coluna ACERTO" `
        -Old @'
                              {medal} ACERTO
'@ `
        -New @'
                              ACERTO
'@

    # 2. Acrescenta o grupo acertado na coluna ACERTO.
    $content = Replace-Once `
        -Text $content `
        -Label "Linhas de detalhamento do acerto" `
        -Old @'
                              <span>Dezena</span>
                              <strong>
                                {hitDezena
                                  ? `${hitDezena} ✓`
                                  : "—"}
                              </strong>

                              <span>Centena</span>
'@ `
        -New @'
                              <span>Grupo</span>
                              <strong>
                                {isHit
                                  ? `G${formatGrupo(
                                      resultGrupo
                                    )} ✓`
                                  : "—"}
                              </strong>

                              <span>Dezena</span>
                              <strong>
                                {hitDezena
                                  ? `${hitDezena} ✓`
                                  : "—"}
                              </strong>

                              <span>Centena</span>
'@

    # 3. Torna o cartão do Resultado Oficial completamente neutro.
    $content = Replace-Once `
        -Text $content `
        -Label "Estilo do Resultado Oficial" `
        -Old @'
                          border: isHit
                            ? `4px solid ${prizeColor}`
                            : "1px solid rgba(255,255,255,0.14)",
                          background: isHit
                            ? `linear-gradient(180deg, ${prizeGlow}, rgba(0,0,0,0.22))`
                            : "rgba(255,255,255,0.02)",
                          boxShadow: isHit
                            ? `0 0 18px ${prizeGlow}`
                            : "none",
'@ `
        -New @'
                          border:
                            "1px solid rgba(255,255,255,0.14)",
                          background:
                            "rgba(255,255,255,0.02)",
                          boxShadow: "none",
'@

    # 4. A foto oficial fica maior apenas quando acertamos o 1º prêmio.
    $content = Replace-Once `
        -Text $content `
        -Label "Imagem do Resultado Oficial" `
        -Old @'
                                size={48}
                                style={{
                                  borderRadius: 10,
                                  border: isHit
                                    ? `4px solid ${prizeColor}`
                                    : "1px solid rgba(201,168,62,0.36)",
                                  boxShadow: isHit
                                    ? `0 0 16px ${prizeGlow}`
                                    : "none",
                                }}
'@ `
        -New @'
                                size={
                                  isHit &&
                                  resultPosition === 1
                                    ? 58
                                    : 48
                                }
                                style={{
                                  borderRadius: 10,
                                  border:
                                    "1px solid rgba(201,168,62,0.36)",
                                  boxShadow: "none",
                                }}
'@

    # 5. Remove a medalha sobre a foto do Resultado Oficial.
    $content = Replace-Once `
        -Text $content `
        -Label "Medalha do Resultado Oficial" `
        -Old @'

                              {isHit &&
                              medal ? (
                                <span
                                  aria-label="Resultado oficial premiado"
                                  style={{
                                    position:
                                      "absolute",
                                    top: -15,
                                    right: -18,
                                    zIndex: 3,
                                    fontSize: 27,
                                    lineHeight: 1,
                                    filter:
                                      "drop-shadow(0 2px 4px rgba(0,0,0,0.95))",
                                  }}
                                >
                                  {medal}
                                </span>
                              ) : null}
'@ `
        -New ""

    # 6. Remove a cor de premiação do nome do resultado oficial.
    $content = Replace-Once `
        -Text $content `
        -Label "Cor do animal oficial" `
        -Old @'
                                  color: isHit
                                    ? prizeColor
                                    : "inherit",
'@ `
        -New @'
                                  color: "inherit",
'@

    # 7. Remove a cor de premiação da milhar oficial.
    $content = Replace-Once `
        -Text $content `
        -Label "Cor da milhar oficial" `
        -Old @'
                                  color: isHit
                                    ? prizeColor
                                    : "inherit",
                                }}
                              >
                                {resultMilhar ||
'@ `
        -New @'
                                  color: "inherit",
                                }}
                              >
                                {resultMilhar ||
'@

    Set-Content `
        -LiteralPath $target `
        -Value $content `
        -Encoding UTF8
}
catch {
    Copy-Item `
        -LiteralPath $backup `
        -Destination $target `
        -Force

    Write-Host "`nERRO NA ALTERAÇÃO:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Arquivo restaurado: $backup" -ForegroundColor Yellow
    return
}

@"
====================================================================================================
TOP3-UI-11B — SEPARAR ACERTO DO RESULTADO OFICIAL
====================================================================================================
Gerado em: $(Get-Date -Format "dd/MM/yyyy HH:mm:ss")
Arquivo alterado: $target
Backup: $backup
====================================================================================================

IMPLEMENTAÇÃO:
- medalhas e bordas de premiação preservadas somente nos palpites
- medalha removida da coluna ACERTO
- grupo acertado incluído na coluna ACERTO
- resultado oficial transformado em cartão neutro
- borda ouro, prata e bronze removida do resultado oficial
- glow removido do resultado oficial
- medalha removida da foto oficial
- foto oficial permanece maior
- em acerto de 1º prêmio, foto oficial aumenta de 48px para 58px
- animal, grupo e milhar oficial permanecem visíveis

"@ | Set-Content -LiteralPath $out -Encoding UTF8

Write-Host "`n===== VALIDAÇÃO ESTRUTURAL =====" -ForegroundColor Cyan

$updated = Get-Content -LiteralPath $target -Raw -Encoding UTF8
$validationFailed = $false

$checks = @(
    @{
        Name = "Medalha permanece no palpite"
        Approved = $updated.Contains('aria-label="Palpite acertado"')
    },
    @{
        Name = "Medalha removida do resultado oficial"
        Approved = !$updated.Contains('aria-label="Resultado oficial premiado"')
    },
    @{
        Name = "Grupo incluído nos acertos"
        Approved = $updated.Contains("<span>Grupo</span>")
    },
    @{
        Name = "Foto oficial maior no acerto de primeiro"
        Approved = $updated.Contains("resultPosition === 1")
    },
    @{
        Name = "Resultado oficial permanece identificado"
        Approved = $updated.Contains("Milhar sorteada")
    }
)

foreach ($check in $checks) {
    if ($check.Approved) {
        Write-Host "OK -> $($check.Name)" -ForegroundColor Green
    }
    else {
        Write-Host "FALHOU -> $($check.Name)" -ForegroundColor Red
        $validationFailed = $true
    }
}

if ($validationFailed) {
    Copy-Item `
        -LiteralPath $backup `
        -Destination $target `
        -Force

    @"

VALIDAÇÃO ESTRUTURAL: REPROVADA
Arquivo restaurado automaticamente.
BUILD: NÃO EXECUTADO
COMMIT: NÃO EXECUTADO
PUSH: NÃO EXECUTADO
"@ | Add-Content -LiteralPath $out -Encoding UTF8

    Write-Host "`nVALIDAÇÃO REPROVADA. ARQUIVO RESTAURADO." -ForegroundColor Red
    Write-Host "BACKUP: $backup" -ForegroundColor Yellow
    return
}

Write-Host "`n===== DIFF =====" -ForegroundColor Yellow
git diff --stat -- $target
git diff -- $target

Write-Host "`n===== BUILD =====" -ForegroundColor Cyan

npm run build
$buildExit = $LASTEXITCODE

if ($buildExit -ne 0) {
    Copy-Item `
        -LiteralPath $backup `
        -Destination $target `
        -Force

    @"

VALIDAÇÃO ESTRUTURAL: APROVADA
BUILD: REPROVADO
Arquivo restaurado automaticamente.
COMMIT: NÃO EXECUTADO
PUSH: NÃO EXECUTADO
"@ | Add-Content -LiteralPath $out -Encoding UTF8

    Write-Host "`nBUILD REPROVADO. ARQUIVO RESTAURADO." -ForegroundColor Red
    Write-Host "BACKUP: $backup" -ForegroundColor Yellow
    return
}

@"

VALIDAÇÃO ESTRUTURAL: APROVADA
BUILD: APROVADO
"@ | Add-Content -LiteralPath $out -Encoding UTF8

Write-Host "`n===== COMMIT =====" -ForegroundColor Cyan

git add -- $target

if (!(git diff --cached --name-only -- $target)) {
    Write-Host "Nenhuma alteração preparada." -ForegroundColor Yellow
    return
}

git commit -m "TOP3: separa acerto do resultado oficial"
$commitExit = $LASTEXITCODE

if ($commitExit -ne 0) {
    Write-Host "Falha ao criar commit." -ForegroundColor Red
    return
}

$commitHash = git rev-parse HEAD

Write-Host "`n===== PUSH =====" -ForegroundColor Cyan

git push
$pushExit = $LASTEXITCODE

if ($pushExit -ne 0) {
    @"

COMMIT: $commitHash
PUSH: FALHOU
"@ | Add-Content -LiteralPath $out -Encoding UTF8

    Write-Host "Commit criado, mas o push falhou." -ForegroundColor Red
    return
}

@"

COMMIT: $commitHash
PUSH: CONCLUÍDO

STATUS FINAL:
- somente o palpite acertado recebe borda e medalha
- resultado oficial neutro
- foto oficial ampliada
- foto oficial ainda maior quando houver acerto em primeiro
- grupo, dezena, centena e milhar detalhados na coluna ACERTO
- build aprovado
- commit criado
- push concluído
- deploy automático acionado
====================================================================================================
"@ | Add-Content -LiteralPath $out -Encoding UTF8

Write-Host "`n===== TOP3-UI-11B — CONCLUÍDO =====" -ForegroundColor Green
Write-Host "BUILD: APROVADO" -ForegroundColor Green
Write-Host "COMMIT: $commitHash" -ForegroundColor Green
Write-Host "PUSH: CONCLUÍDO" -ForegroundColor Green
Write-Host "BACKUP: $backup" -ForegroundColor Yellow
Write-Host "RELATÓRIO: $out" -ForegroundColor Yellow

Get-Content -LiteralPath $out
