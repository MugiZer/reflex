# Wayfinder map: Reflex working-tool build spec

## Destination

A complete, build-ready spec to hand off for the full Reflex autonomous performance-investigator **working tool** — end-to-end on a real PC with a high-level GPU emulator and fake GPU evidence — covering the entire `reflex-project-notes.md` architecture (all 11 fault families, full diagnostic tournament, all escalation levels), optimized for shipping fast via libraries. The map is done when nothing is left to decide before someone builds.

## Notes

- Domain: robot/inference runtime latency regression diagnosis (OBSERVE → DIAGNOSE → TEST → ACT; OBSERVED → INFERRED → TESTED → VERIFIED). Source of truth: `reflex-project-notes.md` at repo root.
- Skills every session should consult: `grilling` + `domain-modeling` on grilling tickets; `research` skill inside research tickets; `prototype` skill inside the prototype ticket. Preserve the evidence hierarchy and abstention/stopping/verification separations from the doc.
- Standing preferences for this effort: (a) planning-only map, but shipping soon — decisions, not deliverables, except the prototype ticket's cheap artifact; (b) as efficient as possible — prefer mature libraries over hand-rolled code while still shipping the complete architecture; (c) completeness over cuts — all 11 fault families, full tournament, everything in the doc that is part of the architecture; (d) no GPU on the dev PC — real PC + high-level GPU emulator from GitHub (or equivalent) + fake GPU evidence with stable profiler interfaces; (e) working tool, not a demo project.
- Tracker: local markdown. Map: `.scratch/reflex-tool/map.md`. Tickets: `.scratch/reflex-tool/issues/NN-<slug>.md`. Blocking: `Blocked by:` line. Frontier: open + unblocked + unclaimed; first by number wins. Refer to tickets by name, never bare numbers.
- Build discipline (standing): ponytail full. No slop — never fake components or tests to please tests; tests assert real behavior, no mocks of the thing under test, no fabricated receipts. The ONLY fake object is FakeGPU fidelity (timing/stall values stand in for silicon until the real-GPU run immediately after this build). Everything else is built real-GPU-ready: CUPTI field names, nsys shapes, correlation IDs — no FakeGPU-mode architecture, no synthetic-only seams the swap would have to rip out.
- Build cycle (standing, driver-authorized): per frontier wave — (1) implement each ticket with subagents (ponytail style); (2) verify with 1 code-review subagent (both axes) + 1 audit-proof-gaps subagent; (3) fix findings immediately under driver autonomy, no waiting; (4) resolve and launch the next wave. Repeat until the chain is built.

## Decisions so far

- [Choose the GPU emulator and fake-evidence contract](issues/01-gpu-emulator-and-fake-evidence.md) — purpose-built stochastic FakeGPU (Kineto JSON + nsys-subset, InferSim timing core), Accel-Sim/CUDA-mocks rejected
- [Choose the library stack for a fast complete build](issues/02-library-stack.md) — Python 3.12, asyncio/statsmodels/sklearn/interpret-core/LightGBM/networkx/MAPIE/pydantic/fastembed+sqlite-vec, ~300 lines custom gaps
- [Project skeleton, canonical schema, and evidence ledger](tickets/01-schema-and-ledger.md) — `reflex/ledger.py` stdlib-only + 6 real-behavior tests, 15 passed, uncommitted
- [FakeGPU evidence generator with fault profiles](tickets/02-fakegpu-generator.md) — `reflex/fakegpu.py` stdlib-only, per-stream clocks with emergent overlap, 8 tests, 24 passed, uncommitted
- [Async runtime loop with telemetry, hindsight, and observer calibration](tickets/03-runtime-loop-and-calibration.md) — `reflex/runtime.py`, live-ring post window, drift-cancelling calibration, 41 passed ×3, uncommitted
- [Eleven-fault hidden-ground-truth corpus](tickets/04-fault-corpus.md) — `reflex/corpus.py`, audit GO, uncommitted
- [CPU↔GPU reconstruction, critical-path, and semantic adapters](tickets/08-reconstruction-and-attribution.md) — `reflex/reconstruct.py` stdlib, audit GO with note, uncommitted
- [Matched baselines, differential localization, and hypothesis registry](tickets/05-baselines-and-localization.md) — `reflex/diagnose.py`, audit GO, tie-break unified, uncommitted
- [Deep GPU escalation ladder on fake evidence](tickets/09-deep-gpu-ladder.md) — `reflex/deep.py`, audit GO, gates deduplicated, uncommitted
- [Controlled interventions, replay, and first divergence](tickets/11-interventions-and-replay.md) — `reflex/verify.py`, audit GO, honest divergence (clocks excluded), uncommitted
- [Full diagnostic tournament](tickets/06-diagnostic-tournament.md) — `reflex/tournament.py` on real sklearn/statsmodels/LightGBM/EBM, 3-triple benchmark 11/11, 81 passed, uncommitted
- [Incident memory, hybrid retrieval, and learning records](tickets/12-incident-memory-and-retrieval.md) — `reflex/memory.py`, audit GO, fix-leak closed, uncommitted
- [Calibration, plausible-cause sets, abstention, and stopping](tickets/07-confidence-and-stopping.md) — `reflex/confidence.py`, audit GO with capped-health repair, 91 passed ×2, uncommitted
- [Active measurement selection and investigation control](tickets/10-measurement-selection-and-control.md) — `reflex/select.py`, shared-signal redundancy + structured linkage, 101 passed, uncommitted
- [Gate prep: /show-me earning gate](tickets/13-showme-gate-prep.md) — plan + red + M1 executed in slice 14, resolved, uncommitted
- [/show-me CLI, eval harness, and acceptance demo](tickets/14-showme-cli-and-acceptance.md) — `__main__` + report + eval, full eval 10/11 Top-1 and 2/11 verified, 106 passed, uncommitted

## Not yet specified

<!-- in-scope fog: real but not yet sharply specifiable; graduates into tickets as the frontier advances -->

- Clockwork-style deadline-risk prediction and proactive scheduling thresholds once the core loop exists.
- Second framework/runtime portability validation beyond the first semantic adapter.
- Real-GPU profiler backend swap (post-emulator): which interfaces stay stable, what gets re-measured.
- Packaging and distribution of the working tool (CLI install, versioning, release channel).
- Promotion gates for deferred learned mechanisms (sequential diagnostic policy, meta-learning, HTE/causal forests) once verified-incident volume grows.
- Quantitative Pass-5 acceptance thresholds (sample complexity, calibration transfer, greedy-regret bounds) pending the eval-harness decision.

## Out of scope

<!-- ruled beyond this destination; never graduates unless the destination is redrawn -->

- Operating the tool on Reflex production robots or a production fleet — the destination ends at a working local tool + spec.
- Real-CUDA hardware performance claims or Reflex production-trace validation — acceptance is on the emulator with fake evidence.
- The Pass-2 paper-corpus programs (program-a / program-b triage infra) — a separate research effort, not this build.
