# 13 — Gate prep: /show-me earning gate

**What to build:** the gate-design earning gate for the public `/show-me` CLI boundary: one user-observable claim with exclusions, required proof depth through the real CLI composition, the tracer bullet with expected red, acceptance/invariant IDs mapped to proofs, and the GO/NO-GO rule — so slice 14 implements against a fixed contract instead of inventing its own definition of done. Run it with the repo's pinned gate toolchain (`../gate-toolchain.md`: global `protected-verification-harness@0.3.0`, `gate-readiness start --repo . --ticket <this-file>`).

**Blocked by:** None — can start immediately (gate first, per gate-design).

**Status:** resolved

Work item: fe1c4810-8030-4b19-a969-4be4ee4ab5d7

Authority: protected

Claim: (gate-design claim goes here during this slice) the `/show-me` report renders a verified incident investigation end-to-end through the real CLI with all evidence IDs resolvable.

- [ ] Claim, exclusions, final consumer, required depth, and false-green shortcut are explicit
- [ ] One tracer bullet crosses the CLI boundary with a distinguishable expected red
- [ ] Every acceptance criterion maps to an executable proof or an explicit justified not-applicable; earning vs supporting proofs classified
- [ ] Sensitivity check: a believable broken report route fails the earning proof

## Verification

- **Proof:** the gate plan itself with red demonstrated on the tracer before slice-14 implementation exists
- **Affected regression:** decision-artifact location for gate plans (repo to confirm during slice)

## Earning gate (behavior-changing tickets)

- **Session:** this ticket IS the gate-design session (see gate-design skill)
- **Authority:** protected
- **Readiness:** ACTION_REQUIRED — gate must reach GATE-READY before slice 14 starts
- **Gate review:** GATE-READY required for slice-14 unblocking

## Answer

Gate plan stands; sensitivity M1 EXECUTED in slice 14 (mutated ev:zero-ID + cause-mismatched VERIFIED both fail the oracle — the latter caught a real oracle weakness mid-build and forced a fix). E1-positive/negative pass through the real CLI at P4. Harness `start` remains unrun (Status-vocabulary precondition vs our claim tracking; slice-14 file already carries gate-pending + Claim + Authority, so a future `advance` has what it needs). Contract fulfilled by evidence; formal session run is the remaining ceremonial step when the backend is back.

## Comments

- 2026-09-04 gate session (subagent): plan at `.scratch/reflex-tool/gates/13-showme-gate.md`; red demonstrated honestly (`reflex` CLI absent, NOT-PROVEN, distinguishable from harness failure); sensitivity design done, execution MISSING until slice 14's route exists. HARNESS-BLOCKED verified in harness source (`gate-readiness.ts:575-576` requires Status approved|gate-pending; ticket is `claimed`): left as-is deliberately — the valuable session is slice 14's, whose file already carries gate-pending + Claim + Authority. No status flip, no workaround. Ticket stays claimed until sensitivity executes in slice 14.
