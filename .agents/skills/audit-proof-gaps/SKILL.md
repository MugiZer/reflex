---
name: audit-proof-gaps
description: Audit proof gaps behind false greens or adjudicate a supported gate dispute. Use when a ticket or release claim may bypass its real public or durable boundary, self-certify evidence, regress despite green checks, or needs a bounded GO/NO-GO decision and root-cause backlog.
---

# Audit Proof Gaps

Find the smallest end-to-end **tracer claim** that can falsify the delivery gate. Evaluate product code, protected tracers, and their oracles read-only; write only audit, evidence, and backlog artifacts.

When Gate Readiness supplies an `AUDIT_GATE` work order, read its authoritative `ticketRef`, inspect the actual production composition at `sourceRevision`, and review its sealed Gate Session. Write the artifact-bound receipt and adjacent findings at the requested path, then return control to the invoking workflow. It calls `advance` again; Gate Readiness validates freshness and retains lifecycle ownership.

## Choose the branch

- **Gate audit (default):** test the highest-risk claim for one ticket, incident, or release gate. A decisive false green ends the gate audit; root-cause it and queue the remaining claims.
- **Protected gate review:** enter after a new or materially changed protected gate has been red-calibrated, before product implementation begins. Read [protected-gate-review.md](references/protected-gate-review.md) completely. Return its artifact-bound receipt with readable findings. This is gate readiness, not product `GO`.
- **Gate dispute:** enter only after a protected verifier returns `FAIL` and the implementation agent submits a supported `GATE-DISPUTE`. Read [gate-dispute.md](references/gate-dispute.md) completely. A failed gate without that evidence stays on the implementation path.
- **Coverage audit:** classify every gate claim only when explicitly requested or after a tracer passes and `GO` is required.
- **Repository audit:** enter only when explicitly requested. Read [repository-audit.md](references/repository-audit.md) completely and freeze one boundary before source inspection.

Use `code-review` separately for diff quality and specification conformance. This skill asks whether evidence reaches the claimed behavior.

## Gate Session input

When the ticket names a **Gate Session**, read its session artifact and the referenced verifier evidence before reconstructing any route. The session is the source of truth for the clean candidate, sealed work-item identity, sealed gate, red evidence, compatibility identity, and terminal local verification. Pass the session reference to the audit artifact; do not copy its paths, hashes, revisions, or recovery commands into prompts or tickets.

If a session is not `READY_FOR_IMPLEMENTATION`, use its semantic action and owner. If it reports `SESSION_MIGRATION_REQUIRED`, `UNTRUSTED`, or `HARNESS-BLOCKED`, classify that result directly; do not repair it by substituting an unsealed path-based run. Read the Gate Session diagnostic reference only for that exceptional branch.

## Scope discipline

Audit the strongest current claim, not the deepest behavior the system could eventually support. Derive current scope from the authoritative ticket and any active operating-stage contract. Treat accepted operational inconvenience and promotion-triggered guarantees as exclusions rather than proof gaps.

When the ticket promises a guarantee excluded by the active operating contract, record `SCOPE-CONFLICT`, decide `NO-GO` for the current wording, and recommend either narrowing the claim or deliberately promoting the guarantee. Do not turn that mismatch into an implementation requirement.

Use a proof budget: one tracer per distinct production route and one red-capable probe per independent failure claim. Let one proof cover multiple criteria or durable rows when it observes them through the same route.

## Proof depth

| Level | Deepest exercised behavior |
| --- | --- |
| P0 | Static shape, typecheck, lint, or schema presence |
| P1 | Isolated domain/unit behavior |
| P2 | One real adapter or protocol contract |
| P3 | Composed application use case |
| P4 | Real public entry and production composition root |
| P5 | Claimed durable-lifecycle dimensions |
| P6 | Independent truth from an oracle not authored by the implementation under test |

Match depth to the claim. A fake is useful below the claimed boundary and becomes a false green only when presented as deeper proof.

## 1. Select the tracer

Read only the authoritative ticket/spec, fixed point or current change, declared proof, relevant session/evidence, and prior incident or backlog records. Record the claim, required depth, observable seam, final consumer or protected state, scope exclusions, and likely false-green shortcut.

Choose the highest-impact current claim. If ticket and operating contract conflict, record the source-backed `SCOPE-CONFLICT` and stop.

**Complete when:** either the scope conflict is source-backed, or one tracer names its observable claim, required depth, seam, purported proof, and any final consumer or protected state.

## 2. Run the tracer proof

Trace only the route required by the claim: observable seam and composition, plus selected durable transitions or independent truth when required. Run the narrow declared proof where safe. Choose the cheapest red-capable probe against the likely false green.

When a gate uses protected inputs, validate the sealed session or CI input identities before accepting output. A final verifier may write fresh evidence but cannot modify product or gate inputs. Missing isolation, modified protected inputs, or an implementer-authored terminal approval is `UNTRUSTED`.

Classify the tracer as `VERIFIED`, `PARTIAL`, `UNPROVEN`, `CONTRADICTED`, `HARNESS-BLOCKED`, or `UNTRUSTED`. Read [proof-gap-patterns.md](references/proof-gap-patterns.md) when evidence is shallow or history reports a false green. Read [durable-proof-matrix.md](references/durable-proof-matrix.md) when the claim crosses persistence, asynchronous execution, processes, or languages.

**Complete when:** the tracer has one status, a source-backed composition trace, red-capability evidence or a precise missing probe, and every fake on its route is supporting proof only.

## 3. Stop or expand

- On `PARTIAL`, `UNPROVEN`, `CONTRADICTED`, or `UNTRUSTED`: decide `NO-GO` and investigate only until one reproducible root cause is known.
- On `HARNESS-BLOCKED`: preserve the session reference or exact command and failure class, decide `HARNESS-BLOCKED`, and name the semantic recovery action.
- On `VERIFIED`: enter coverage only when a `GO` decision requires it.
- On `SCOPE-CONFLICT`: decide `NO-GO` for the wording and require a scope choice.

Prefer a focused missing probe over expanding the audit into an implementation project. `NO-GO` is a gate decision, not automatic proof of a product defect.

**Complete when:** every investigated claim has one evidence-backed status and `GO` has authoritative proof at its required depth.

## 4. Emit the decision artifact

Return scope and sources; the Gate Session reference when applicable; tracer composition and required/actual depth; statuses with evidence; selected durable/protected-state observations; one root cause per finding; decision; and next owner.

For multi-session work, persist this artifact and let later tickets point to it rather than restating the investigation.

## 5. Build the backlog when requested

For tickets or a backlog, read the installed [`to-tickets` skill](../to-tickets/SKILL.md). Turn each current root cause into one narrow tracer-bullet ticket with observable completion evidence. Keep exclusions as promotion triggers and extend existing root-cause items rather than duplicating them.

**Completion criterion:** every open root cause maps once to a ticket or explicit decision artifact.
