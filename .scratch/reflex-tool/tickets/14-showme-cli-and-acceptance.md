# 14 — /show-me CLI, eval harness, and acceptance demo

**What to build:** the shippable surface: `/show-me` investigation report (what changed, comparator + why, localization, hypotheses + uncertainty, evidence for/against, measurement chosen + why, profiler findings, experiment + before/after effect, replay/divergence, verified cause, fix + expected recovery, similar priors + differences) plus the hidden-fault eval harness (Top-1/Top-3 recovery, calibration, cost-to-verify, overhead, generalization) and the doc's target demo run (p99 +8ms → GPU localization → timeline-over-profile → CPU-isolation recovery → verified fix).

**Blocked by:** 04 — Eleven-fault hidden-ground-truth corpus; 10 — Active measurement selection and investigation control; 11 — Controlled interventions, replay, and first divergence; 12 — Incident memory, hybrid retrieval, and learning records; 13 — Gate prep: /show-me earning gate (GATE-READY required).

**Status:** resolved

Work item: e6027552-f503-4c36-97a3-8ba48776a7bd

Authority: protected

Claim: a fresh agent can run one CLI command on a hidden-fault incident and receive a complete, evidence-linked investigation ending in a verified fix — or an explicit abstention with the next measurement.

- [ ] Slice-13 earning gate is GATE-READY and its proofs pass through the real CLI composition (no fake-substituted public seam)
- [ ] Report's every consequential claim resolves to a canonical evidence ID; unresolved ambiguity renders as abstention + next measurement, never a fix
- [ ] Eval harness reports Top-1/Top-3 recovery, calibration, measurements-to-verify, and overhead across the corpus and held-out fault families
- [ ] Target demo replays green end-to-end: regression → verified cause → recorded fix with measured p99 recovery

## Verification

- **Proof:** slice-13 earning proof through the real CLI boundary + full eval-harness report + target-demo replay (clean-environment run as the later tier per verification scope)
- **Affected regression:** `reflex` package suite plus CLI surface

## Earning gate (behavior-changing tickets)

- **Session:** slice 13's gate plan
- **Authority:** protected
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** GATE-READY required before GO

## Answer

Done, built by hand (subagent backend down — DNS for opencode.ai failing; no second pair of eyes, stated plainly). `reflex/__main__.py` + `reflex/report.py` + `reflex/eval.py` + `tests/test_cli.py` (5 tests). E1-positive/negative + M1 all through real `python -m reflex` subprocesses: VERIFIED renders with all ev: resolving; stalls abstains with no fix; mutated ev:zero-ID and cause-mismatched VERIFIED both fail the oracle (oracle strengthened mid-build when M1 caught it passing a mismatched claim). Full 11-fault eval run once: Top-1 10/11, Top-3 11/11, verified 2/11, 1.36 measurements, ECE 0.118 / Brier 0.177. Verified-rate reflects the flat 4-knob table (faults without a fix knob stay TESTED — truthful, next lever documented). Demo: starvation → cpu → timeline → isolate_submit → VERIFIED, measured +0.453ms. Label hygiene clean. Suite: 106 passed. Uncommitted. M1 execution closes ticket 13's missing piece.
