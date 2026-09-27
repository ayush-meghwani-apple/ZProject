param(
    [string[]]$BenchmarkId = @(
        'nifty-500',
        'nifty-midcap-150',
        'nifty-500-multicap-50-25-25',
        'nifty-smallcap-250',
        'nifty-50-equal-weight',
        'nifty-50'
    )
)

$ErrorActionPreference = 'Stop'

$endpoint = 'https://www.niftyindices.com/BackPage/getTotalReturnIndexString'
$sourceUrl = 'https://www.niftyindices.com/reports/historical-data'
$historyStart = [datetime]::ParseExact('2000-01-01', 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$end = [datetime]::UtcNow.Date
$benchmarks = @(
    [pscustomobject]@{ Id = 'nifty-500'; QueryName = 'NIFTY 500'; IndexName = 'Nifty 500 TRI'; FileName = 'nifty-500-tri.json' }
    [pscustomobject]@{ Id = 'nifty-midcap-150'; QueryName = 'NIFTY MIDCAP 150'; IndexName = 'Nifty Midcap 150 TRI'; FileName = 'nifty-midcap-150-tri.json' }
    [pscustomobject]@{ Id = 'nifty-500-multicap-50-25-25'; QueryName = 'NIFTY500 MULTICAP 50:25:25'; IndexName = 'Nifty500 Multicap 50:25:25 TRI'; FileName = 'nifty-500-multicap-50-25-25-tri.json' }
    [pscustomobject]@{ Id = 'nifty-smallcap-250'; QueryName = 'NIFTY SMALLCAP 250'; IndexName = 'Nifty Smallcap 250 TRI'; FileName = 'nifty-smallcap-250-tri.json' }
    [pscustomobject]@{ Id = 'nifty-50-equal-weight'; QueryName = 'NIFTY50 EQUAL WEIGHT'; IndexName = 'Nifty50 Equal Weight TRI'; FileName = 'nifty-50-equal-weight-tri.json' }
    [pscustomobject]@{ Id = 'nifty-50'; QueryName = 'NIFTY 50'; IndexName = 'Nifty 50 TRI'; FileName = 'nifty-50-tri.json' }
)
$selected = @($benchmarks | Where-Object { $BenchmarkId -contains $_.Id })
if ($selected.Count -ne $BenchmarkId.Count) {
    throw "Unknown benchmark id. Valid ids: $($benchmarks.Id -join ', ')"
}

$outDir = Join-Path $PSScriptRoot '..\public\benchmarks'
[IO.Directory]::CreateDirectory($outDir) | Out-Null

foreach ($benchmark in $selected) {
    $values = @{}
    $requestNumbers = [Collections.Generic.HashSet[string]]::new()
    $outFile = Join-Path $outDir $benchmark.FileName
    $fetchStart = $historyStart

    if (Test-Path $outFile) {
        $existing = Get-Content $outFile -Raw | ConvertFrom-Json
        if ($existing.indexName -ne $benchmark.IndexName -or $existing.source -ne 'NSE Indices Limited') {
            throw "Existing snapshot identity is invalid for $($benchmark.IndexName)."
        }
        foreach ($row in $existing.rows) {
            $value = [double]$row.value
            if ($value -gt 0) { $values[[string]$row.date] = $value }
        }
        foreach ($requestNumber in $existing.requestNumbers) {
            if ($requestNumber) { [void]$requestNumbers.Add([string]$requestNumber) }
        }
        if ($values.Count -gt 0) {
            $latestDate = [datetime]::ParseExact(
                ($values.Keys | Sort-Object | Select-Object -Last 1),
                'yyyy-MM-dd',
                [Globalization.CultureInfo]::InvariantCulture
            )
            $fetchStart = $latestDate.AddDays(1)
        }
    }

    if ($fetchStart -gt $end) {
        Write-Host "$($benchmark.IndexName) is already current through $($fetchStart.AddDays(-1).ToString('yyyy-MM-dd'))."
        continue
    }

    $newValueCount = 0
    for ($cursor = $fetchStart; $cursor -le $end; $cursor = $cursor.AddDays(365)) {
        $chunkEnd = $cursor.AddDays(364)
        if ($chunkEnd -gt $end) { $chunkEnd = $end }
        $startText = $cursor.ToString('dd-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
        $endText = $chunkEnd.ToString('dd-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
        $cinfo = "{'name':'$($benchmark.QueryName)','startDate':'$startText','endDate':'$endText','indexName':'$($benchmark.QueryName)'}"
        $body = @{ cinfo = $cinfo } | ConvertTo-Json -Compress
        $rows = $null
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $rows = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json; charset=utf-8' -Headers @{
                    Origin = 'https://www.niftyindices.com'
                    Referer = $sourceUrl
                    'User-Agent' = 'Kaizen benchmark updater'
                } -Body $body
                break
            } catch {
                if ($attempt -eq 3) { throw }
                Start-Sleep -Seconds (5 * $attempt)
            }
        }
        foreach ($row in $rows) {
            $date = [datetime]::ParseExact($row.Date, 'dd MMM yyyy', [Globalization.CultureInfo]::InvariantCulture)
            $value = [double]$row.TotalReturnsIndex
            if ($value -gt 0) {
                $dateKey = $date.ToString('yyyy-MM-dd')
                if (-not $values.ContainsKey($dateKey)) { $newValueCount++ }
                $values[$dateKey] = $value
            }
            if ($row.RequestNumber) { [void]$requestNumbers.Add([string]$row.RequestNumber) }
        }
    }

    if ($newValueCount -eq 0) {
        Write-Host "No new $($benchmark.IndexName) values were published after $($fetchStart.AddDays(-1).ToString('yyyy-MM-dd'))."
        continue
    }

    $snapshot = [ordered]@{
        indexName = $benchmark.IndexName
        source = 'NSE Indices Limited'
        sourceUrl = $sourceUrl
        retrievedAt = [datetime]::UtcNow.ToString('o')
        requestNumbers = @($requestNumbers)
        rows = @($values.Keys | Sort-Object | ForEach-Object { [ordered]@{ date = $_; value = $values[$_] } })
    }
    if ($snapshot.rows.Count -eq 0) { throw "No rows returned for $($benchmark.IndexName)." }
    [IO.File]::WriteAllText($outFile, (($snapshot | ConvertTo-Json -Depth 5 -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
    Write-Host "Wrote $($snapshot.rows.Count) $($benchmark.IndexName) rows to $outFile"
    Write-Host "Range: $($snapshot.rows[0].date) to $($snapshot.rows[-1].date)"
}