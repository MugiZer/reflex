# Gate 13 — /show-me earning gate (tracer contract for slice 14)

Ticket: `.scratch/reflex-tool/tickets/13-showme-gate-prep.md` (work item `fe1c4810-8030-4b19-a969-4be4ee4ab5d7`, Authority: protected).
Slice-14 claim source: `.scratch/reflex-tool/tickets/14-showme-cli-and-acceptance.md`.
Toolchain: `../gate-toolchain.md` — global `protected-verification-harness@0.3.0`.

## 1. Framed claim

**Claim:** A fresh agent running one `/show-me` CLI command on a hidden-fault incident receives a complete evidence-linked investigation ending in a verified fix — or an explicit abstention with the next measurement.
**Exclusions:** eval-corpus aggregates (Top-1/Top-3, calibration, cost, overhead, held-out generalization), packaging/install, real-GPU backend numbers, report styling. Those are slice-14 full-gate rows, not this tracer.
**Final consumer:** fresh agent / on-call investigator at the terminal.
**Required depth:** P4 — real public CLI entry through production composition (parse → load incident → render report → resolve evidence IDs → stdout). No shallower evidence may authorize GO.
**False-green shortcut this gate must catch:** hardcoded markdown fixture / snapshot, direct Python-import bypass of the CLI, or candidate-owned test exit-code self-certification while emitting unresolvable evidence IDs or an unverified fix.

## 2. Tracer bullet (ONE, crosses the real CLI boundary)

```text
Claim: above, minimal slice: verified-fix incident renders through the real CLI with all evidence IDs resolvable.
Public seam: `python -m reflex show-me --incident <incident-id>` (installed `reflex show-me` equivalent in slice 14).
Production composition: CLI parse → incident store (hidden ground truth, slice 04) → investigation control (slice 10) + intervention/replay record (slice 11) + memory/diff card (slice 12) → report renderer → evidence-ID resolver → stdout report.
Oracle/source of truth: independent check (not the renderer): every consequential claim's `ev:*` ID resolves in the canonical evidence ledger (slice 01); VERIFIED present only with a controlled-experiment + measured before/after record; else abstention + next measurement.
Failure probe: run tracer command pre-implementation; expect red: non-zero exit / module-or-command-missing, no report. Distinguishable from harness failure: stderr names the missing CLI module/command, not a fixture or verifier crash.
Protected state: hidden-fault ground truth (slice 04 corpus); oracle never trusts renderer's receipt/flag.
Applicable lifecycle dimensions and reasons: none at P4 for the tracer (single-shot render).
Deferred dimensions and promotion triggers: P5 replay/restart/concurrency/corruption + full eval + target-demo replay promote in slice-14 full gate once tracer is green.
Evidence the proof ran: exact command + cwd + exit status + stdout/stderr (recorded below).
Earning proof: E1 (P4, through the real CLI; covers AC-14.1, AC-14.2a, AC-14.2b-negative).
Supporting proofs: S1 unit/smoke elsewhere (cannot authorize GO).
```

## 3. Gate contract

```text
Gate: 13-showme-gate (protected; GATE-READY required before slice 14).
Claim: §1.
Required depth: P4.
Acceptance/invariant IDs:
  AC-14.1 real-CLI composition, no fake-substituted seam — earning (E1).
  AC-14.2a every consequential claim resolves to canonical ev:* ID — earning (E1-positive).
  AC-14.2b ambiguity renders abstention + next measurement, never a fix — earning (E1-negative, same seam).
  AC-14.3 eval harness aggregates (Top-1/Top-3, calibration, cost, overhead, held-out) — DEFERRED to slice-14 full gate (supporting here).
  AC-14.4 target demo replay (p99 +8ms → GPU localize → timeline-over-profile → CPU-isolation recovery → verified fix) — DEFERRED to slice-14 full gate (supporting here).
Public seam: §2 tracer command.
Independent oracle: §2 oracle (ledger resolution + VERIFIED-gating rule).
Positive cases: verified-fix incident → exit 0 + report contains VERIFIED cause + fix + every ev:* resolves.
Applicable negative/recovery cases: ambiguous incident → exit 0 + ABSTAIN + next measurement, zero fix claims (same CLI seam).
Protected state: hidden ground truth stays hidden from investigator path (slice 04 invariant).
Applicable durability/lifecycle cases and reasons: none for tracer (see deferred).
Deferred dimensions and promotion triggers: AC-14.3/AC-14.4 + P5 replay/restart/corruption promote when slice-14 corpus + control + replay + memory land.
Sensitivity or mutation checks: M1 believable broken route (hardcoded fix + ev:fake-001 unresolvable, or CLI bypass via direct import) MUST fail E1 oracle. Pre-implementation M1 is vacuous (no route to mutate) — recorded NOT-PROVEN, never green.
Proof commands and covered IDs:
  E1: `python -m reflex show-me --incident <id>` + oracle resolve check → AC-14.1, AC-14.2a, AC-14.2b. Status: NOT-PROVEN (CLI missing, red below).
  M1: mutate renderer to emit ev:fake-001 / skip experiment gate → E1 oracle must FAIL → sensitivity. Status: NOT-PROVEN (no implementation to mutate).
  S1: package unit tests (`reflex` suite + CLI surface per ticket 14) → supporting only.
Evidence manifest: this file + §4 red transcript + §5 gate-readiness output. Tested revision recorded with red evidence.
Execution tier: local for this red demo; slice-14 earning + sensitivity rerun at CI/completion (clean env, protected verifier per gate-toolchain.md).
No-go conditions / GO rule: GO iff E1-positive + E1-negative pass through the real CLI at P4 AND M1 fails the broken route AND no unexecuted earning case. Anything missing/stale/harness-ambiguous = NOT-PROVEN/NO-GO, never green.
```

## 4. Red evidence (pre-implementation, slice 14 unstarted)

Command: `python -m reflex show-me --incident demo-p99-8ms` (cwd: repo root, tested revision `bc24176`).
Result: exit 1, `C:\Users\moham\AppData\Local\Programs\Python\Python312\python.exe: No module named reflex` — no report emitted. `Get-Command reflex` empty; `Test-Path reflex`/`src/reflex` False. Honest red: CLI boundary absent. Recorded NOT-PROVEN, not green.
Full transcript captured in session return; rerun reproduces identically (no `reflex` package in repo).

## 5. gate-readiness start output

Command: `gate-readiness start --repo . --ticket .scratch/reflex-tool/tickets/13-showme-gate-prep.md --json`.
Result: FAILED preflight, exit 2 — `ticket must be approved or gate-pending and declare Authority and Claim` (ticket Status is `claimed`, harness requires `approved|gate-pending`). No session created, no dispatch. Recorded HARNESS-BLOCKED (ticket-precondition), not a product verdict. Exact output in session return.
Implementation dispatch (`gate-readiness advance`) NOT run per ticket-13 scope.
