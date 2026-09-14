---
name: implement
description: "Implement work from a spec or ticket and verify its acceptance criteria. Use repository-mandated gate workflows when applicable."
---

# Implement

Deliver the requested ticket on the current branch. Treat the ticket as authoritative only after reconciling it with newer project constraints.

## 1. Establish readiness

Read the complete ticket or spec, repository instructions, current diff, and the context router plus any directly applicable operating-stage contract. Record the current claim, exclusions, acceptance criteria, affected production route, and required checks.

When the change adds or alters production behavior, find the nearest working production path for similar behavior. Reuse its composition, policies, persistence, and proof seams where responsibilities match. Record the existing path and owners, the genuinely new responsibility, and why an existing owner cannot absorb any proposed new production component.

When the repository or ticket explicitly uses Gate Readiness, follow the [Gate Readiness workflow](../gate-readiness/reference.md). Resolve the ticket’s work item, advance internally owned actions, and edit only the managed candidate returned by `IMPLEMENTATION_READY`. Treat its sealed gate inputs as frozen.

Stop with `SCOPE-CONFLICT` when the ticket contradicts current authoritative scope. Stop for a focused product decision when scope, domain ownership, or the intended public behavior is unresolved.

When the claim crosses a public entry, persistence, asynchronous or cross-process execution, an external provider, numerical or semantic truth, protected state, or a release gate, read [`../gate-design/SKILL.md`](../gate-design/SKILL.md) completely before changing production code. Reuse a current gate when one exists; otherwise define the smallest earning proof. Continue its Gate Session to establish a trustworthy red or record `HARNESS-BLOCKED`. Classify fake-based tests below the claimed boundary as supporting proof.

Preserve genuine external blockers from Gate Readiness. Internally owned Gate Design and Audit Proof Gaps work orders are dispatched and resumed by the workflow driver.

**Complete when:** every acceptance criterion is in current scope and maps to an owner plus observable proof; every triggered boundary has an executable earning seam or a recorded blocker; every proposed new production component either extends an identified owner or has a concrete responsibility or lifecycle that owner cannot satisfy.

## 2. Focused and affected tests

Use [`../tdd/SKILL.md`](../tdd/SKILL.md) at the agreed seams. For a boundary-sensitive ticket, run its earning tracer without modifying it and use focused inner tests to localize behavior. Implement one narrow red-green slice at a time; run its focused checks throughout.

Run the focused tests and the affected regression scope before review. Supporting tests localize behavior; the earning tracer reaches the claimed production route and remains the completion proof.

**Complete when:** every acceptance criterion has implementation evidence, the earning tracer reaches the claimed production route, and no supporting proof is presented as completion evidence.

## 3. Code review

Run [`../code-review/SKILL.md`](../code-review/SKILL.md) to check the diff against repository standards and the ticket. Fix findings and rerun the focused and affected checks. Do not perform Gate Session verification or proof audit before this review is complete.

**Complete when:** code review has no blocking finding and the focused and affected checks still pass on the reviewed candidate.

## 4. Commit candidate

Commit the reviewed work to the current branch with only the intended changes. Record the candidate revision for the subsequent Gate Session verification.

**Complete when:** the candidate commit is attributable to the reviewed diff and no uncommitted change is being presented as verified work.

## 5. Gate Session verification

After the candidate commit, run the Gate Readiness implementation route in the [shared workflow reference](../gate-readiness/reference.md). It owns candidate attribution, local verification, advisory persistence, invalidation, and sealed CI handoff. Run repository-wide or environment-sensitive suites only when the ticket, repository policy, or assigned execution tier requires them.

Treat protected `FAIL` as a product failure by default. Submit `GATE-DISPUTE` only when real-boundary, final-state evidence demonstrates the ticket claim and identifies one failing assertion as incidental to it. Include the scope sources, existing path reused, any new-component justification, the smallest behavioral replacement, and a known-bad result it must still reject. Continue changing product code only for product gaps; do not add complexity solely to satisfy the disputed assertion.

**Complete when:** every required check has a terminal result attributed to the tested revision, every earning gate reports `PASS` at its assigned advisory or authoritative tier, or the work is explicitly blocked with the exact command and failure class.

## 6. Proof audit

For any boundary-sensitive trigger from Step 1, run a bounded gate audit with [`../audit-proof-gaps/SKILL.md`](../audit-proof-gaps/SKILL.md) after Gate Session verification. Fix a proof gap and rerun the affected proof; stop for `SCOPE-CONFLICT` or `HARNESS-BLOCKED` instead of weakening the claim.

When Step 5 produced a supported `GATE-DISPUTE`, invoke the Gate dispute branch of `audit-proof-gaps`. Follow its classification. `GATE-MISMATCH` hands the proposed amendment to the gate owner and pauses implementation; it does not authorize completion.

**Complete when:** when triggered, the proof audit returns `GO` for the ticket's current claims; otherwise the review and Gate Session result remain the recorded completion evidence.

## 7. Report

Report the candidate commit, exact focused and affected test commands/results, code-review result, Gate Session verification result, proof-audit result when triggered, acceptance status, and any remaining blocker. Never claim unexecuted evidence.

**Complete when:** the handoff identifies the verified revision, every required result, acceptance status, and any blocker without claiming unexecuted evidence.
