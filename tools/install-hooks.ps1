$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$src = Join-Path $PSScriptRoot "hooks\pre-commit.cmd"
$dstDir = Join-Path $repoRoot ".git\hooks"
$dst = Join-Path $dstDir "pre-commit.cmd"

if (!(Test-Path $src)) { throw "Hook fonte não encontrado: $src" }
New-Item -ItemType Directory -Force $dstDir | Out-Null

Copy-Item -Force $src $dst
Write-Host "[OK] Hook instalado: $dst"
