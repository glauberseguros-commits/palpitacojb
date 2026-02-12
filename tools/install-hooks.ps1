$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$hooksSrcDir = Join-Path $PSScriptRoot "hooks"
$gitHooksDir = Join-Path $repoRoot ".git\hooks"

$cmdSrc = Join-Path $hooksSrcDir "pre-commit.cmd"
$shSrc  = Join-Path $hooksSrcDir "pre-commit"

$cmdDst = Join-Path $gitHooksDir "pre-commit.cmd"
$shDst  = Join-Path $gitHooksDir "pre-commit"

if (!(Test-Path $cmdSrc)) { throw "Hook fonte não encontrado: $cmdSrc" }
if (!(Test-Path $shSrc))  { throw "Hook fonte não encontrado: $shSrc" }

New-Item -ItemType Directory -Force $gitHooksDir | Out-Null

Copy-Item -Force $cmdSrc $cmdDst
Copy-Item -Force $shSrc  $shDst

Write-Host "[OK] Hooks instalados:"
Write-Host " - $cmdDst"
Write-Host " - $shDst"
