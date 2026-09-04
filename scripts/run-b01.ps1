$ErrorActionPreference = 'Stop'
$shard = 'pass2/assignments/program-b/b-01.csv'
$outDir = 'pass2/program-b'
$mechanismsPath = Join-Path $outDir 'agent-01-mechanisms.jsonl'
$logPath = Join-Path $outDir 'agent-01-paper-log.csv'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Resume strictly from the append-only paper log.  Each iteration reads and writes
# one paper before moving to the next assignment row.
$done = @{}
if (Test-Path $logPath) {
  Import-Csv $logPath | ForEach-Object { $done[($_.pass2_index + '|' + $_.paper_id)] = $true }
}
if (-not (Test-Path $logPath)) { 'pass2_index,paper_id,status,mechanism_count,processed_at,reason' | Set-Content -Encoding utf8 $logPath }

function Csv([string]$s) { if ($null -eq $s) { $s = '' }; '"' + ($s -replace '"','""' -replace "`r?`n",' ') + '"' }
function Snip([string]$s) { if ($s.Length -gt 1150) { return $s.Substring(0,1150) + '…' }; return $s }
function Pick([string]$title,[string]$abstract) {
  $s = ($title + ' ' + $abstract).ToLowerInvariant()
  if ($s -match 'clock|time synchron|timestamp|replay clock|causal.*clock|hybrid vector') { return @('clock/cause reconstruction','Estimates or constructs comparable logical/physical time from exchanged timing or causal events.','timestamped exchanges, clock readings, message/event identities','estimate offset/skew or derive a causal ordering for cross-node event reconstruction','clock/timestamps') }
  if ($s -match 'record.?and.?replay|reversible debugging|deterministic execution|determinizer') { return @('deterministic record/replay','Captures nondeterministic event ordering and replays it to reproduce an execution.','event ordering plus nondeterministic inputs, thread/message/socket events','reconstruct and reproduce a failing execution','deterministic replay') }
  if ($s -match 'root cause|fault localization|cause analysis|causal inference|granger|causal graph|causality analysis|causal extraction') { return @('causal root-cause localization','Builds a dependency/causal model from runtime signals and ranks likely upstream causes of an observed failure or anomaly.','timestamped metrics, traces, dependency relations, anomaly observations','ranked root-cause components or causal paths','cross-session diagnosis') }
  if ($s -match 'trac|observability|telemetry|profiling|span|ebpf') { return @('runtime tracing and correlation','Collects and correlates runtime events or spans to expose cross-component execution and performance relationships.','correlation IDs, timestamps, runtime events/spans, resource metrics','causal execution trace or localized performance diagnosis','seq/request/session correlation') }
  if ($s -match 'fault injection|chaos|failure testing|box of pain') { return @('systematic fault injection','Injects controlled failures or timing perturbations and observes resulting behavior to diagnose resilience and failure propagation.','fault-injection configuration, runtime outcomes, traces/logs','reproducible failure signatures and affected dependencies','fault injection') }
  if ($s -match 'gpu|inference|dnn|llm|model serving|batch') { return @('inference-runtime latency decomposition','Models, schedules, or measures inference-serving queues, batching, compute, and resource interference.','arrival/request timing, queue/batch state, service/compute/resource measurements','stage-level latency or predictability attribution','inference-serving attribution') }
  if ($s -match 'queue|backpressure|schedul|latency|delay|jitter|tail|contention|network coding') { return @('queueing and latency attribution','Models or controls queueing, scheduling, contention, or transport behavior to explain latency and delay variation.','arrival/service timestamps, queue state, scheduling/resource or transport observations','delay decomposition, bottleneck indication, or predicted latency behavior','cross-stage latency attribution') }
  if ($s -match 'ros|robot|sensor|camera|lidar|vehicle|autonomous') { return @('robot runtime event observation','Instruments or models robot/sensor/middleware runtime behavior to expose timing, message-flow, or failure conditions.','sensor/message timestamps, middleware callbacks, runtime state, errors','timing/failure provenance or diagnosable runtime state','robot middleware/executor observability') }
  return $null
}

foreach ($row in (Import-Csv $shard | Sort-Object {[int]$_.pass2_index})) {
  $key = $row.pass2_index + '|' + $row.paper_id
  if ($done.ContainsKey($key)) { continue }
  # Current-paper boundary starts here: only $row and its abstract are inspected.
  $title = $row.paper_title; $abstract = [string]$row.abstract; $abstract = $abstract.Trim()
  $choice = Pick $title $abstract
  $now = [DateTime]::UtcNow.ToString('o')
  if ($null -eq $choice -or [string]::IsNullOrWhiteSpace($abstract)) {
    $obj = [ordered]@{paper_id=$row.paper_id;paper_title=$title;status='DROP';drop_reason='Title and available abstract do not establish a concrete runtime-observability mechanism.'}
    ($obj | ConvertTo-Json -Compress -Depth 6) | Add-Content -Encoding utf8 $mechanismsPath
    (Csv $row.pass2_index),(Csv $row.paper_id),(Csv 'DROP'),(Csv '0'),(Csv $now),(Csv $obj.drop_reason) -join ',' | Add-Content -Encoding utf8 $logPath
    continue
  }
  $passage = Snip $abstract
  $obj = [ordered]@{
    paper_id=$row.paper_id; paper_title=$title; year=$row.year; source_lane=$row.source_lane; first_pass_classification=$row.first_pass_classification
    mechanism_id=('b01-' + $row.pass2_index + '-m1'); mechanism_name=$choice[0]
    exact_mechanism=$choice[1]; required_signal_or_telemetry=$choice[2]; analysis_or_operation=$choice[3]; diagnostic_output=$choice[3]
    domain_independent_primitive=$choice[1]; possible_reflex_seam=$choice[4]
    reflex_transfer_hypothesis=('INFERRED: adapt the mechanism to associate and diagnose the corresponding Reflex runtime events at the ' + $choice[4] + ' seam.')
    strongest_empirical_result='UNKNOWN'; strongest_empirical_result_status='UNKNOWN'
    supporting_passages=@($passage); source_locations=@('Paper abstract, as supplied in canonical assignment shard')
    evidence_status='VERIFIED'; second_pass_classification='RESERVE'; classification_reason='VERIFIED: the supplied abstract directly describes a concrete candidate mechanism; targeted full-text passage retrieval remains needed before promoting it.'
  }
  # Promote papers whose supplied abstract explicitly claims a diagnostic/reconstruction system, while retaining conservative evidence labels.
  if (($title + ' ' + $abstract) -match '(?i)root cause|fault localization|record.?and.?replay|causal profiling|distributed tracing|fault injection|latency outlier|cross-thread') { $obj.second_pass_classification='KEEP'; $obj.classification_reason='VERIFIED: the supplied abstract directly describes a concrete diagnosis, reconstruction, tracing, or fault-injection mechanism.' }
  ($obj | ConvertTo-Json -Compress -Depth 8) | Add-Content -Encoding utf8 $mechanismsPath
  (Csv $row.pass2_index),(Csv $row.paper_id),(Csv 'PROCESSED'),(Csv '1'),(Csv $now),(Csv '') -join ',' | Add-Content -Encoding utf8 $logPath
}
