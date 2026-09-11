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

## Discipline (learned 2026-09-11)

1. Download each tier's artifacts to durable storage the moment its DONE
   lands — never wait for the full run. VM preemption is routine.
2. Drive backup (`colab drivemount` + copy) after every tier on CLI-driven
   runs; run_pipeline backup on notebook runs.
3. run_result.json + corpus SHAs recorded per attempt, including failures.
4. This file updated with every collection (one line per set + verdict).
