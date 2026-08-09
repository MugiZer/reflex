# 11 — Register the foundation gate verifier and proof preflight

**What to build:** Make FND-G1/FND-G2/FND-G3 executable and prevent a gate from appearing green when its verifier is missing or its evidence was not produced.

**Blocked by:** None for verifier registration; depends on the existing public durable tests and gate plan.

## Scope

- Implement or wire `npm run verify:component-topology-foundation -- --gate=<n>`.
- Select the gate’s declared public restart, replay, concurrency, corruption, partial-execution, and protected-state probes.
- Emit `foundation-gate-evidence.json` with tested revision/tree identity, exact command, selected/passed/failed/unexecuted counts, runtime/artifact identities, mutation results, and decision.
- Add a known-red/preflight mode that fails when the command is unregistered, no proofs are selected, or the evidence artifact is missing/stale.
- Integrate the verifier into the repository’s completion/CI command path.

## Acceptance proof

- Each gate command is discoverable from `package.json` and exits non-zero for a deliberate known-bad mutation.
- Gate 2 reaches P5 through the localhost composition and records restart, corruption, concurrent duplicate, replay, recoverable/published, and protected-state evidence.
- Missing, stale, or unexecuted evidence yields `NOT-PROVEN`, `HARNESS-BLOCKED`, or `NO-GO`; it cannot yield `GO`.
- A clean valid run produces a reproducible decision artifact tied to the tested revision.

## Exclusions

No relaxation of P5 requirements and no implementation changes to Component Evaluation domain behavior beyond verifier wiring.
