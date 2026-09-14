# Gate dispute

Use this branch only when the protected verifier returned attributable `FAIL` and the implementation agent supplies a supported `GATE-DISPUTE`: real-boundary evidence shows the ticket claim succeeds while one gate assertion rejects it. A dispute does not grant `PASS`.

## Required dispute packet

Require the ticket claim and scope sources, Gate Session reference, protected verifier failure artifact, real public/durable route, authoritative final-state observation, failing assertion, why it is incidental, reuse/scope findings, proposed behavioral replacement, and the known-bad behavior it must still reject.

Read the sealed session and verifier evidence directly. A fake-based proof, self-authored receipt, or unsupported assertion that the product works returns `PRODUCT-GAP` and leaves the gate in force.

## Adjudicate

1. Freeze claim, exclusions, scale, existing production path, and promotion triggers.
2. Recompute the user-visible claim from authoritative final state through the declared composition. Substitute evidence is `PROOF-SUBSTITUTION`.
3. Compare the failing assertion with the frozen claim. Promised behavior is load-bearing; an internal call sequence, representation, component choice, formatting, or unpromised future guarantee is incidental.
4. Inspect the candidate for gate-shaped complexity. New infrastructure earns its place only when an existing owner cannot carry its responsibility or lifecycle.
5. Confirm the proposed behavioral replacement accepts the valid result and rejects the named known-bad result without modifying the gate.

Decide one primary outcome: `PRODUCT-GAP`, `PROOF-SUBSTITUTION`, `GATE-MISMATCH`, `SCOPE-DRIFT`, or `HARNESS-BLOCKED`.

`GATE-MISMATCH` proposes one observable amendment to the gate owner. The owner resumes the Gate Session, recalibrates red, and sends the changed gate through a fresh review. Only the later protected verifier `PASS` authorizes completion.
