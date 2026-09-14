# Trace inventory (real SmolVLA T4 runs)

Location convention: `<Reflex-traces>/<run>-<tier>[-seedN]/` holds the four
artifacts + freeze per run. Big files live OUTSIDE git (OneDrive-synced);
only this index is committed.

## Collected

- `smoke-20260911-seed11/` (T4, 2026-09-11, commit 8e27bb0, workload
  smolvla-smoke-v1, seed 11): trace.json (235MB, 671,624 events),
  metrics.json, fingerprints.json. Verdict: converts in ~14s, null-pair
  z=0.0 everywhere, full diagnose() ranking sane. Manifest provenance:
  commit recorded as 8e27bb0 (pre rename-fix code ran it; decode path
  identical — pyav, explicit rename).
- Seeds 17/23 smoke sets: LOST (VM preempted before download; no backup ran).

## Collected

- `main-20260911-seed11/` + `main-20260911-seed17/` (T4, main tier,
  1,000 frames each, workload smolvla-replay-v1): trace.json (~945MB each),
  metrics.json, fingerprints.json. Healthy variance seed11-vs-seed17:
  outputs bit-identical (1000/1000 same sha, MAD=max=0); timing medians
  within ~1% (4.14 vs 4.11ms device), p95 within ~5%, p99 ~850ms both
  (init-dominated, ~2% apart); warmup passes stable (~100ms both).
  Threshold basis: outputs ~exact-hash, timing median +/-5%, p95 +/-10%,
  p99 informational.
- Seed 23 main: running at last check.

## Collected (candidates, T4)

- `fp16-smoke-20260912-seed11/` + in-dir `fp32-control-*` (T4, 2026-09-12,
  seed 11, smoke-250, autocast fp16 vs fp32 control): outputs DIVERGED 0/250
  sha vs control (max mean-diff 0.0024); kernel count +55% (120540 vs 77490);
  timing medians +2.9% (inside healthy band). diagnose() vs baseline 2026-09-13
  (CPU): control-vs-baseline sanity all |z|<=0.12 (no false positives);
  fp16 max z=1.25 transport, all stages <2.0 (no latency trip). Verdict: CATCH
  on the output-hash criterion (threshold basis above), missed by latency
  ranking — numerics moved, timing didn't.
- `compile-smoke-20260913-seed11/` (T4, 2026-09-12, seed 11, torch.compile):
  outputs IDENTICAL 250/250 sha vs baseline; timing median +2%, p95 +4%
  (inside thresholds). Verdict: clean, not a regression.
- `max-risky-colab-20260914-seed11/` (T4, 2026-09-13, seed 11, smoke-250,
  fp16 + compile + cudnn-bench + 2 burners, run_id 20260913T224150Z-d783b2c1,
  status passed, gaps empty): outputs DIVERGED 0/250 sha (max mean-diff
  0.0020); device median 9.94 vs 3.94ms (+152%), p95 23.3 vs 7.07ms (+230%)
  — far outside the threshold basis. diagnose() vs baseline 2026-09-13
  (CPU): pooled ranking max z=1.34 transport (missed); per-kernel-name
  matched gpu z=+4.11 (TRIP, shipped as the z-scale fix — pooling
  heterogeneous kernels let cross-kernel spread drown the coherent shift;
  control-vs-baseline sanity stays quiet at gpu z=0.39). Verdict: CATCH on
  outputs + raw-timing thresholds + gpu ranking. The fix also healed
  synthetic GATE2 (cos 0.78 -> 0.996): matched gpu restored the
  gpu-dominated centroid. Detector blind spot, closed.

## Collected (semantic faults, T4)

- `blank-smoke-seed11/` (T4, 2026-09-14, commit fc91157, seed 11, smoke-250,
  float32 clean baseline + `--frame-fault blank`, run_id 20260914T175748Z-c3edc084,
  status passed, gaps empty): 250 frames, 250 unique sha (no collapse —
  proprioception still varies); timing median 3.93ms ~= healthy 3.94ms
  (latency blind, as predicted). Output-divergence verdict PENDING healthy
  control on same commit (fingerprints + metrics retrieved; trace.json
  still on VM).

## Discipline (learned 2026-09-11)

1. Download each tier's artifacts to durable storage the moment its DONE
   lands — never wait for the full run. VM preemption is routine.
2. Drive backup (`colab drivemount` + copy) after every tier on CLI-driven
   runs; run_pipeline backup on notebook runs.
3. run_result.json + corpus SHAs recorded per attempt, including failures.
4. This file updated with every collection (one line per set + verdict).
