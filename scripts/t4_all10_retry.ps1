<# Sustained retry for the single all-10-knob SmolVLA T4 run.
Launched detached; logs to .loop-runs/smolvla-all10-retry.log.
Exactly one GPU request at a time (stop before each attempt).
Exit 0 = run passed + artifacts downloaded; 1 = non-retryable; 2 = exhausted.
#>
param([int]$MaxAttempts = 200, [int]$SleepSeconds = 60)
$env:PYTHONPATH = "$HOME/.colab-win-shim"
$Repo = "C:\Users\moham\OneDrive\Documents\ChatGPT\Reflex"
Set-Location $Repo
$Log = "$Repo\.loop-runs\smolvla-all10-retry.log"
function Log([string]$m) { "$(Get-Date -Format o) $m" | Tee-Object -FilePath $Log -Append }
for ($i = 1; $i -le $MaxAttempts; $i++) {
  Log "attempt $i/$MaxAttempts"
  colab stop -s smolvla-all10 2>&1 | Out-Null
  $out = colab run --gpu T4 --keep -s smolvla-all10 --timeout 5400 scripts/colab_collect.py --ref main --workload smolvla --seeds 11 --tiers smoke --dtype float16 --fault candidate --compile 1 --cudnn-bench 1 --contention 2 --compile-mode max-autotune --tf32 0 --shards 4 --streams 2 --threads 1 --frame-fault corrupt --instruction-fault hostile --exp all10 2>&1 | Out-String
  $out | Add-Content $Log
  if ($LASTEXITCODE -eq 0) {
    Log "RUN SUCCEEDED"
    colab download -s smolvla-all10 /content/reflex-loop/runs/run_result.json "$Repo\.loop-runs\smolvla-all10-run_result.json" 2>&1 | Add-Content $Log
    colab stop -s smolvla-all10 2>&1 | Add-Content $Log
    exit 0
  }
  if ($out -notmatch "Service Unavailable|TooManyAssignments|Precondition Failed") { Log "NON-RETRYABLE FAILURE"; exit 1 }
  Log "retryable, sleeping $SleepSeconds s"
  Start-Sleep -Seconds $SleepSeconds
}
Log "ATTEMPTS EXHAUSTED"; exit 2
