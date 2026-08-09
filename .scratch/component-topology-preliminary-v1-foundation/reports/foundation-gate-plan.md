# Component Topology Foundation Gate Plan

**Schema:** `component-topology-foundation-gates/v1`

**Authoritative tickets:**

- `01 — Centralize durable Component Evaluation identity`
- `02 — Restore the Component Evaluation persistence seam`
- `03 — Deepen the durable Component Evaluation workflow and retire the in-memory pilot`

**Decision artifact:** `.scratch/component-topology-preliminary-v1-foundation/reports/foundation-gate-evidence.json`

This plan owns gate decisions. The tickets own product scope and acceptance
language. TDD owns test construction. Proof-gap audit owns independent review.
There are three gates: one per ticket. Supporting proofs do not become extra
gates.

## Global claim

After the foundation refactor, the existing real localhost Component Evaluation
path still crosses the pinned Python worker and durable SQLite reload path, but
identity, persistence, and lifecycle authority each have one production owner.
The layer-only Calculation Snapshot, immutable IFC evidence, revision history,
and existing Ticket 4 result remain unchanged.

### Exclusions

- No Ticket 5 operational policy, health endpoint, retention, rollback, or new cancellation contract.
- No SQLite representation redesign.
- No new topology physics, Recipe compiler, worker runtime, or numerical claim.
- No `verified` product claim.

**Final consumer:** Ticket 5’s implementation and the public localhost report.

**Required depth:** P5 — public entry, durable persistence, restart/reload,
replay, concurrency, corruption, and protected state. Identity vectors are a
fixed oracle; they are not recomputed by the implementation under test.

## Tracer bullet `FND-T01`

**Claim:** One real bounded-unknown localhost evaluation produces the same
identity and public durable graph after equal duplicate submission and restart,
while a semantic mutation produces a distinct evaluation.

**Public seam:** localhost HTTP submission and job retrieval/report.

**Production composition:** HTTP → application workflow → explicit Component
Evaluation repository → SQLite → pinned Python request service.

**Independent oracle:** frozen Ticket 4 IFC/oracle fixture plus literal identity
vectors reviewed separately from the identity implementation.

**Failure probe:** omit a semantic identity field, alter a persisted hash, skip
restart, or replace the worker with a fabricated result.

**Protected state:** IFC content hash, evidence snapshot, revision history,
layer-only Calculation Snapshot, and prior evaluation records.

**Durability/lifecycle:** sequential retry, simultaneous duplicate submission,
restart/reload, replay, partial execution, and corruption.

**Evidence:** the verifier records command, revision, fixture/oracle hashes,
worker identity, record IDs, protected hashes, mutation results, and counts.

## Gate `FND-G1` — Identity contract

**Required depth:** P5

**IDs:** FND-I01–FND-I09

**Positive proofs:** fixed identity vectors; equal-input retry/replay/restart;
public duplicate convergence; existing-record readability.

**Negative/recovery proofs:** semantic mutation creates a new identity;
malformed/incomplete identity input cannot authorize durable success.

**Sensitivity:** mutate one identity vector, remove one semantic input, and
classify a sequential-only duplicate run as incomplete.

**Proof command:** `npm run verify:component-topology-foundation -- --gate=1`

**Execution tier:** focused local tests; durable verifier in CI/completion.

**NO-GO:** any alternate production formula, duplicate published evaluation,
missing vector, skipped restart/concurrency, or protected-state change.

## Gate `FND-G2` — Explicit persistence seam

**Required depth:** P5

**IDs:** FND-P01–FND-P10

**Positive proofs:** real evaluation persistence; fresh-process graph/report
equality; recoverable and published states; explicit repository composition.

**Negative/recovery proofs:** partial execution is not publishable; corruption,
missing adapter, invalid owner/revision, and duplicate concurrent writes fail
closed or converge without history loss.

**Sensitivity:** remove the repository composition, corrupt a persisted node or
relation, and replace the public read with an empty fallback.

**Proof command:** `npm run verify:component-topology-foundation -- --gate=2`

**Execution tier:** focused adapter tests locally; public durable verifier in
CI/completion.

**NO-GO:** optional capability branching remains, invalid data becomes an empty
success, restart differs, or IFC/layer protected hashes change.

## Gate `FND-G3` — One durable workflow authority

**Required depth:** P5

**IDs:** FND-W01–FND-W10

**Positive proofs:** one localhost workflow crosses authorization, interpretation,
Recipe binding, worker execution, checkpoints, reload, aggregate, and report;
all declared non-success outcomes remain public and durable.

**Negative/recovery proofs:** non-success cannot produce a numerical aggregate;
retry, restart, replay, concurrency, corruption, and worker failure remain
honest; the in-memory pilot is not production-composed.

**Sensitivity:** skip the worker, inject a fabricated numerical result, import or
re-enable the in-memory pilot, mutate the layer-only result, or omit a lifecycle
case.

**Proof command:** `npm run verify:component-topology-foundation -- --gate=3`

**Execution tier:** focused public tests locally; full verifier plus Ticket 3
and Ticket 4 upstream proofs in CI/completion.

**NO-GO:** more than one production lifecycle authority exists, any outcome is
unclassified, a fake worker can make the proof pass, or the report reads
unvalidated/in-memory data.

## Shared evidence manifest

The verifier must write `foundation-gate-evidence.json` containing:

- schema, gate IDs, ticket source, tested revision/tree hash, and changed-file manifest;
- exact command, arguments, working directory, runtime identity, exit status, and duration;
- selected/passed/failed/unexecuted counts;
- fixture/oracle hashes, worker/process/artifact identities, and durable record IDs;
- protected-state observations and sensitivity/mutation results;
- decision `GO`, `NO-GO`, `NOT-PROVEN`, or `HARNESS-BLOCKED`.

## Decision rule

Each gate is `GO` only when every applicable ID has executed proof at P5,
selected and unexecuted counts are consistent, sensitivity checks reject the
known-bad mutations, and the tested revision matches the evidence artifact.
Otherwise report the most specific non-green status. Do not convert missing,
stale, skipped, or harness-blocked evidence into green.
