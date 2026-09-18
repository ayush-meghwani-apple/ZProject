$ErrorActionPreference = 'Stop'

$endpoint = 'https://www.niftyindices.com/BackPage/getTotalReturnIndexString'
$sourceUrl = 'https://www.niftyindices.com/reports/historical-data'
$start = [datetime]::ParseExact('2000-01-01', 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$end = [datetime]::UtcNow.Date
$values = @{}
$requestNumbers = [Collections.Generic.HashSet[string]]::new()

for ($cursor = $start; $cursor -le $end; $cursor = $cursor.AddDays(365)) {
    $chunkEnd = $cursor.AddDays(364)
    if ($chunkEnd -gt $end) { $chunkEnd = $end }
    $startText = $cursor.ToString('dd-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
    $endText = $chunkEnd.ToString('dd-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
    $cinfo = "{'name':'NIFTY 500','startDate':'$startText','endDate':'$endText','indexName':'Nifty 500'}"
    $body = @{ cinfo = $cinfo } | ConvertTo-Json -Compress
    $rows = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json; charset=utf-8' -Headers @{
        Origin = 'https://www.niftyindices.com'
        Referer = $sourceUrl
    } -Body $body
    foreach ($row in $rows) {
        $date = [datetime]::ParseExact($row.Date, 'dd MMM yyyy', [Globalization.CultureInfo]::InvariantCulture)
        $value = [double]$row.TotalReturnsIndex
        if ($value -gt 0) { $values[$date.ToString('yyyy-MM-dd')] = $value }
        if ($row.RequestNumber) { [void]$requestNumbers.Add([string]$row.RequestNumber) }
    }
}

$snapshot = [ordered]@{
    indexName = 'Nifty 500 TRI'
    source = 'NSE Indices Limited'
    sourceUrl = $sourceUrl
    retrievedAt = [datetime]::UtcNow.ToString('o')
    requestNumbers = @($requestNumbers)
    rows = @($values.Keys | Sort-Object | ForEach-Object { [ordered]@{ date = $_; value = $values[$_] } })
}
$outDir = Join-Path $PSScriptRoot '..\public\benchmarks'
[IO.Directory]::CreateDirectory($outDir) | Out-Null
$outFile = Join-Path $outDir 'nifty-500-tri.json'
[IO.File]::WriteAllText($outFile, (($snapshot | ConvertTo-Json -Depth 5 -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
Write-Host "Wrote $($snapshot.rows.Count) NIFTY 500 TRI rows to $outFile"
Write-Host "Range: $($snapshot.rows[0].date) to $($snapshot.rows[-1].date)"