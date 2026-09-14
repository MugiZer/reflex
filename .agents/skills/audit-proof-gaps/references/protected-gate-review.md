# Protected gate review

Use this branch as the second, read-only subagent after a protected gate owner has authored a gate in the Gate Session worktree and `continue <session-path>` has sealed its red evidence. Decide whether the gate can reject bad candidates without constraining valid implementations. This review authorizes gate readiness only; it cannot grant product `GO`.

Read [gate-review-receipt.md](gate-review-receipt.md) completely before emitting the review artifact. It owns the receipt schema, sealed work-item identity derivation, reproducible validation, freshness rules, and exceptional validation guidance.

## Inputs and permissions

Require the authoritative ticket/spec and operating-stage contract, compact claim brief, Gate Session reference, and named known-bad or controlled mutation. Read the session, sealed work-item record, sealed gate, red report, and calibration evidence directly. Do not reconstruct their paths, revisions, hashes, or commands from prose.

If the session is not sealed or the gate package remains writable by the auditor or implementation role, classify the review `UNTRUSTED`. A second agent sharing a writable checkout is independent reasoning, not protected authority.

## Review the gate

1. Freeze the current claim, exclusions, required depth, public seam, production composition, final consumer, and likely false-green shortcut.
2. Trace each required case from the runner through the public route to its protected oracle. Terminal truth must be recomputed from authoritative final state; receipts, flags, hashes, callbacks, candidate-owned tests, and self-reported success remain supporting evidence.
3. Read the sealed behavioral red and run the smallest realistic fault and fabricated-evidence probes. A planted candidate success remains rejected when authoritative state contradicts it.
4. Check sensitivity and flexibility together: reject demonstrated bad behavior while accepting reasonable implementation variation. An assertion about an incidental internal shape is `GATE-NOT-READY` unless the ticket promises it.
5. Validate protected completion tier, oracle declarations, session integrity, fresh evidence, and the intended read-only CI mounting model.

Use one tracer, one fault probe, and one fabricated-evidence probe unless another independent promised invariant requires another case.

## Decision

- `GATE-READY`: required depth and independent terminal truth are present; red and probes reject bad candidates; reasonable implementation variation is allowed; sealed inputs can be isolated from the implementer.
- `GATE-NOT-READY`: the gate is weak, implementation-specific, incorrectly scoped, or accepts a known-bad candidate. Return the smallest reproducible cause to the gate owner.
- `HARNESS-BLOCKED`: preserve the session reference and exact failure class.
- `UNTRUSTED`: session, gate, red evidence, permissions, or write isolation cannot be established.

Return the scope, session reference, actual versus required depth, public-route trace, red/fault/fabricated-evidence results, flexibility finding, integrity evidence, decision, and next action as readable findings. For `GATE-READY` or `GATE-NOT-READY`, emit the matching artifact-bound receipt beside those findings and run its mechanical validator. A repaired gate is materially changed: Gate Design resumes its session, seals fresh red, and requests a new review; the earlier receipt is stale and cannot be reused.
