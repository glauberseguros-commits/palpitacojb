param(
  [Parameter(Mandatory=$true)][string]$Entry
)

$ErrorActionPreference="Stop"

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$tmp = ".\_tmp_vitenode_$ts.mjs"

@"
import '$Entry';
console.log('OK: import via vite-node -> $Entry');
"@ | Set-Content -Encoding UTF8 $tmp

npx vite-node $tmp
Remove-Item $tmp -Force
