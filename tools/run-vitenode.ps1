param(
    [Parameter(Mandatory = $true)]
    [string]$Entry
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Entry)) {
    throw "Arquivo de entrada não encontrado: $Entry"
}

$resolvedEntry = (Resolve-Path -LiteralPath $Entry).Path

# JavaScript não deve receber barras invertidas de caminhos Windows.
$entryForImport = $resolvedEntry.Replace("\", "/")

# Converte caminho absoluto do Windows em URL válida para import ESM.
if ($entryForImport -match "^[A-Za-z]:/") {
    $entryForImport = "file:///$entryForImport"
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$tmp = ".\_tmp_vitenode_$ts.mjs"

try {
    @"
import '$entryForImport';
console.log('OK: import via vite-node -> $entryForImport');
"@ | Set-Content `
        -LiteralPath $tmp `
        -Encoding UTF8

    npx vite-node $tmp

    if ($LASTEXITCODE -ne 0) {
        throw "vite-node retornou código de erro $LASTEXITCODE."
    }
}
finally {
    Remove-Item `
        -LiteralPath $tmp `
        -Force `
        -ErrorAction SilentlyContinue
}
