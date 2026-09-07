<# Autonomous T4 loop: colab run -> traces -> debug -> merge -> next run.
Stops on: reviewer BLOCKED, persistent GPU-quota refusal, MaxRuns reached.
Exit 0 = clean finish (a full green run, or MaxRuns green merges).
Exit 1 = blocked, needs a human (reviewer findings printed).
Exit 2 = infrastructure stuck (GPU quota / CLI errors).

Security: codex runs with --dangerously-bypass-approvals-and-sandbox on THIS
machine only. Never point this at a shared/production host.
#>
param([int]$MaxRuns = 3, [string]$Ref = "main")

$env:PYTHONPATH = "$HOME/.colab-win-shim"
$Repo = "C:\Users\moham\OneDrive\Documents\ChatGPT\Reflex"
Set-Location $Repo
$RunsDir = "$Repo\.loop-runs"
New-Item -ItemType Directory -Force -Path $RunsDir | Out-Null

function Sig([string]$outcome, [string]$reason, [string]$source) {
    $norm = ($reason.Trim() -replace "\s+", " ")
    $bytes = [Text.Encoding]::UTF8.GetBytes("$outcome`0$norm`0$source")
    $h = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ([BitConverter]::ToString($h).Replace("-", "").ToLower())[0..15] -join ""
}

function New-GpuSession([string]$name) {
    for ($i = 1; $i -le 6; $i++) {
        $out = colab new -s $name --gpu T4 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { return $true }
        if ($out -notmatch "TooManyAssignments|Precondition Failed") { throw "GPU session failed: $out" }
        Start-Sleep -Seconds (60 * $i)
    }
    return $false
}

for ($run = 1; $run -le $MaxRuns; $run++) {
    $sess = "t4-loop-r$run"
    Write-Output "=== run $run/$MaxRuns session $sess ==="
    if (-not (New-GpuSession $sess)) { Write-Output "GPU quota stuck after retries."; exit 2 }

    colab exec -s $sess --timeout 1500 -f scripts/colab_collect.py 2>&1 | Select-Object -Last 5
    $local = "$RunsDir\$sess-run_result.json"
    colab download -s $sess /content/reflex-loop/runs/run_result.json $local
    colab stop -s $sess | Out-Null
    $r = Get-Content $local -Raw | ConvertFrom-Json
    Write-Output "RUN_ID=$($r.run_id) STATUS=$($r.status)"
    if ($r.status -eq "passed") { Write-Output "GREEN — tool run clean."; exit 0 }

    # Collect failure signatures: pytest FAILED lines + collection failures.
    $sigs = @{}
    $pytestOut = $r.pytest.output
    if ($pytestOut) {
        foreach ($m in [regex]::Matches($pytestOut, "FAILED (\S+) - (\S+)")) {
            $sigs[(Sig "failure" $m.Groups[2].Value $m.Groups[1].Value)] =
                @{ source = $m.Groups[1].Value; reason = $m.Groups[2].Value; outcome = "failure" }
        }
    }
    foreach ($kv in (($r.collection.pipeline.collected.failed).PSObject.Properties)) {
        $sigs[(Sig "failure" $kv.Value $kv.Name)] =
            @{ source = "collect:$($kv.Name)"; reason = [string]$kv.Value; outcome = "failure" }
    }
    if ($sigs.Count -eq 0) { Write-Output "Incomplete run, no signatures. Stopping."; exit 1 }

    foreach ($hash in $sigs.Keys) {
        $s = $sigs[$hash]
        $hit = gh issue list --search "sig:$hash in:body" --json number --jq ".[0].number"
        if ($hit) { gh issue comment $hit --body "Re-observed on run $($r.run_id) commit $($r.commit)."; continue }

        $body = "sig:$hash marker below`n<!-- sig:$hash -->`n## Auto-trace failure`n- run: $($r.run_id)`n- commit: $($r.commit)`n- source: $($s.source)`n- reason: $($s.reason)`n- result: $local"
        $issue = gh issue create --title "Auto-trace $($hash): $($s.reason)" --label "auto-trace" --body $body --jq ".number"
        $fixPrompt = Get-Content "$Repo\.opencode\prompts\trace-fixer.md" -Raw -ErrorAction SilentlyContinue
        if (-not $fixPrompt) { $fixPrompt = "Fix exactly one failure signature. Open a PR; never push to main." }
        codex exec -s workspace-write --dangerously-bypass-approvals-and-sandbox `
            "$fixPrompt`nIssue: #$issue. Signature $hash. Trace result file: $local (repo-relative: .loop-runs\$sess-run_result.json). Repo: $Repo" `
            2>&1 | Select-Object -Last 5
        $pr = gh pr list --search "in:body $hash" --json number --jq ".[0].number"
        if (-not $pr) { Write-Output "Fixer produced no PR for $hash. Stopping."; exit 1 }

        codex exec -s workspace-write --dangerously-bypass-approvals-and-sandbox `
            "$(Get-Content "$Repo\.opencode\prompts\trace-review.md" -Raw)`nPR: #$pr. Signature $hash." `
            2>&1 | Select-Object -Last 8 | Tee-Object -Variable verdict
        if (($verdict | Out-String) -match "TRACE-REVIEW: CLEAN") {
            gh pr merge $pr --merge; Write-Output "Merged #$pr. Next run picks up the fix."
        } else {
            Write-Output "Reviewer BLOCKED #$pr. Stopping for human."; exit 1
        }
    }
}
Write-Output "MaxRuns reached."
