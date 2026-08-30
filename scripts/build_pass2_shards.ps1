param(
    [Parameter(Mandatory = $true)][string]$SourceCsv
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$inputDir = Join-Path $repo 'pass2/input'
$assignmentDir = Join-Path $repo 'pass2/assignments/program-a'
New-Item -ItemType Directory -Force -Path $inputDir, $assignmentDir | Out-Null

$rows = @(Import-Csv -LiteralPath $SourceCsv)
$canonical = @($rows | Where-Object {
    $_.triage_label.Trim().ToUpperInvariant() -in @('HIGH', 'MEDIUM')
})

if ($canonical.Count -eq 0) { throw 'Canonical population is empty.' }
if (@($canonical | Where-Object { [string]::IsNullOrWhiteSpace($_.id) }).Count -gt 0) {
    throw 'Canonical identifier id contains blanks.'
}
$duplicateIds = @($canonical | Group-Object id | Where-Object Count -gt 1)
if ($duplicateIds.Count -gt 0) {
    throw "Canonical identifier id is not unique: $($duplicateIds.Name -join ', ')"
}

$frozen = for ($i = 0; $i -lt $canonical.Count; $i++) {
    $row = $canonical[$i]
    $ordered = [ordered]@{
        pass2_index = $i
        canonical_paper_id = $row.id
        assigned_agent = (($i % 13) + 1)
        first_pass_classification = $row.triage_label.Trim().ToUpperInvariant()
        source_lane = $row.lanes
    }
    foreach ($prop in $row.PSObject.Properties) { $ordered[$prop.Name] = $prop.Value }
    [pscustomobject]$ordered
}

$canonicalPath = Join-Path $inputDir 'program-a-high-medium.csv'
$frozen | Export-Csv -NoTypeInformation -Encoding utf8 -LiteralPath $canonicalPath

foreach ($agent in 1..13) {
    $path = Join-Path $assignmentDir ('a-{0:D2}.csv' -f $agent)
    @($frozen | Where-Object { [int]$_.assigned_agent -eq $agent }) |
        Export-Csv -NoTypeInformation -Encoding utf8 -LiteralPath $path
}

$manifestPath = Join-Path $assignmentDir 'manifest.csv'
$frozen | Select-Object pass2_index, canonical_paper_id, assigned_agent,
    first_pass_classification, source_lane |
    Export-Csv -NoTypeInformation -Encoding utf8 -LiteralPath $manifestPath

# Mechanical validation from files on disk.
$reloadedCanonical = @(Import-Csv -LiteralPath $canonicalPath)
$allShardRows = @()
$counts = @()
foreach ($agent in 1..13) {
    $path = Join-Path $assignmentDir ('a-{0:D2}.csv' -f $agent)
    $shard = @(Import-Csv -LiteralPath $path)
    $counts += $shard.Count
    $allShardRows += $shard
    if (@($shard | Where-Object { [int]$_.assigned_agent -ne $agent }).Count -gt 0) {
        throw "Shard a-$('{0:D2}' -f $agent) contains incorrectly assigned rows."
    }
}
$canonicalIds = @($reloadedCanonical.canonical_paper_id | Sort-Object)
$shardIds = @($allShardRows.canonical_paper_id | Sort-Object)
if ($allShardRows.Count -ne $reloadedCanonical.Count) { throw 'Total shard count mismatch.' }
if (@($allShardRows | Group-Object canonical_paper_id | Where-Object Count -ne 1).Count -gt 0) {
    throw 'Shard union contains missing or duplicate canonical IDs.'
}
if ((Compare-Object $canonicalIds $shardIds).Count -ne 0) { throw 'Shard union differs from canonical population.' }
if (@(Import-Csv -LiteralPath $manifestPath).Count -ne $reloadedCanonical.Count) { throw 'Manifest count mismatch.' }

[pscustomobject]@{
    source_rows = $rows.Count
    canonical_rows = $reloadedCanonical.Count
    canonical_id = 'id'
    shard_counts = ($counts -join ',')
    validation = 'PASS'
} | ConvertTo-Json -Compress
