$regions = @(
    $regions + $runRegions |
    ForEach-Object {
        $_.ToString().Trim()
    } |
    Where-Object {
        $_ -ne ""
    } |
    Sort-Object -Unique
)
