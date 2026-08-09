# Ticket 05 TDD proof plan

**Authority:** The Ticket 05 issue owns behavior. The gate plan owns GO/NO-GO.
This file owns test names, first-red expectations, and focused commands.

Tests are written and executed one tracer at a time. Do not create the whole
suite as `todo`, skipped, shape-only, or compile-only tests. A production edit
is legal only after the named assertion is discovered, executes, and fails for
the expected missing behavior.

## Preflight before the first red

Run these against the exact starting worktree and record normal exit or failure
classification:

```text
npm run verify:component-topology-foundation:completion
npm run verify:durable-component-scenarios
npm run verify:topology-request-contract
npm run verify:topology-worker-failure-regression
```

Any abnormal exit, undiscovered test, timeout, stale evidence, or missing pinned
runtime is `HARNESS-BLOCKED` or `NOT-PROVEN`, not a product red. Repair or
diagnose the preflight before Ticket 05 production changes.

## Shared proof map

**Public seam:** Real localhost upload/review, Job retrieval, report retrieval,
health retrieval, HTTP request abort, process shutdown, and fresh server/SQLite
construction.

**Independent oracle:** The frozen Ticket 4 IFC/oracle hashes and literal policy,
health, retry, retention, and disposition expectations from the gate plan.

**Failure probes:** Policy exclusion, stale/wrong Job state, partial write,
corruption, abort, deadline, transient and deterministic failure, unavailable
dependency, unsafe cleanup, incompatible bundle, and known-bad verifier mutation.

**Protected state:** Raw IFC/evidence hash, immutable Revisions, layer-only
Calculation Snapshot, Ticket 4 graph and artifacts, historical pilot records.

**Lifecycle:** Fresh readers/processes, atomic publication, retry, simultaneous
independent callers, shutdown, cleanup, and startup-config rollback.

**Evidence the test ran:** Verbose runner output contains the exact test name;
the evidence row contains its proof IDs, status, public outcome, durable IDs,
worker/process evidence where applicable, fresh-reload observation, and
protected-state hashes.

## Gate 1 — Production slice

### First tracer

**Test:** `localhost policy exclusions do not invoke topology work`

**File:** `tests/preliminaryTopologyPilotHttp.test.ts`

**Expected behavioral red:** The disabled-policy request reaches the existing
worker path or returns no durable `disabled` disposition. The HTTP assertion
must execute; a missing module or unsupported fixture is not the intended red.

**Focused command:**

```text
npm test -- tests/preliminaryTopologyPilotHttp.test.ts -t "localhost policy exclusions do not invoke topology work"
```

After this tracer is green, add the remaining Gate 1 tests in this order:

| File | Exact test name | Proof responsibility |
| --- | --- | --- |
| `tests/preliminaryTopologyPilotPolicy.test.ts` | `pilot policy produces deterministic typed decisions` | `PILOT-A02`, `PILOT-A03`, `PILOT-S01`, `PILOT-S04`, `PILOT-S05` |
| `tests/preliminaryTopologyPilotPolicy.test.ts` | `pilot records remain separate from component evaluation records` | protected state for `PILOT-A03` |
| `tests/preliminaryTopologyPilotSqlite.test.ts` | `pilot disposition survives a fresh SQLite reader` | `PILOT-A03`, `PILOT-A05` |
| `tests/preliminaryTopologyPilotSqlite.test.ts` | `interrupted pilot publication is not a trusted success` | `PILOT-A03`, `PILOT-A05` |
| `tests/preliminaryTopologyPilotSqlite.test.ts` | `pilot event history is append-only and idempotent` | `PILOT-A03` |
| `tests/preliminaryTopologyPilotHttp.test.ts` | `localhost eligible review uses the durable Ticket 4 evaluator` | `PILOT-A01`, `PILOT-A04` |
| `tests/preliminaryTopologyPilotHttp.test.ts` | `localhost policy exclusions do not invoke topology work` | `PILOT-A02`, `PILOT-S01`, `PILOT-S03` |
| `tests/preliminaryTopologyPilotHttp.test.ts` | `report reloads the persisted pilot result without fabrication` | `PILOT-A01`, `PILOT-A04` |
| `tests/preliminaryTopologyPilotHttp.test.ts` | `invalid or incomplete persisted success fails closed` | `PILOT-A05`, `PILOT-S02` |

**Focused Gate 1 command:**

```text
npm test -- tests/preliminaryTopologyPilotPolicy.test.ts tests/preliminaryTopologyPilotSqlite.test.ts tests/preliminaryTopologyPilotHttp.test.ts
```

Gate 1 is not green until the public cases use real temporary SQLite/artifact
roots, a fresh restart, and the pinned worker for successful numerical cases.

## Gate 2 — Lifecycle safety

Write these tests one at a time in the listed order:

| File | Exact test name | Expected first red | Proof responsibility |
| --- | --- | --- | --- |
| `tests/preliminaryTopologyPilotLifecycle.test.ts` | `aborted or deadline-exceeded work publishes no partial result` | abort/deadline has no durable pilot terminal record or termination evidence | `PILOT-A06` |
| `tests/preliminaryTopologyPilotLifecycle.test.ts` | `transient retry does not duplicate durable calculation` | no bounded retry/attempt record exists | `PILOT-A07`, `PILOT-A08` |
| `tests/preliminaryTopologyPilotLifecycle.test.ts` | `deterministic failure is not automatically retried` | retry policy is absent or retries a forbidden outcome | `PILOT-A07` |
| `tests/preliminaryTopologyPilotLifecycle.test.ts` | `simultaneous independent pilot submissions converge` | independent overlapping actors create missing/duplicate run state | `PILOT-A08`, `PILOT-S03` |

**Focused command:**

```text
npm test -- tests/preliminaryTopologyPilotLifecycle.test.ts
```

Use the real worker for the successful numerical path. A controlled worker
adapter may inject transient, crash, malformed, cancellation, and deadline
outcomes because the worker process is an external seam; it may not fabricate a
successful U-value. Concurrency must synchronize independent callers at the
contested seam; two sequential awaits are invalid proof.

## Gate 3 — Operational controls and reversibility

| File | Exact test name | Expected first red | Proof responsibility |
| --- | --- | --- | --- |
| `tests/preliminaryTopologyPilotOperational.test.ts` | `health reports actual dependency readiness` | `GET /api/health` is absent or reports configuration instead of exercised dependencies | `PILOT-A09` |
| `tests/preliminaryTopologyPilotOperational.test.ts` | `cleanup preserves published and referenced evidence` | no typed cleanup policy/use case exists | `PILOT-A10`, `PILOT-S02` |
| `tests/preliminaryTopologyPilotOperational.test.ts` | `restart kill and bundle rollback preserve history` | startup kill/compatible restart is not durable or rewrites history | `PILOT-A11`, `PILOT-S05` |

**Focused command:**

```text
npm test -- tests/preliminaryTopologyPilotOperational.test.ts
```

Rollback means graceful shutdown followed by restart with a compatible
server-selected bundle. Cleanup runs at startup and after terminal publication.
No public mutation endpoint is part of the proof.

## Gate 4 — Verifier and decision artifact

Create the verifier only after Gates 1–3 have behavioral proofs. Register:

```text
verify:preliminary-topology-pilot
verify:preliminary-topology-pilot-evidence
```

Then add:

| File | Exact test name | Required rejection | Proof responsibility |
| --- | --- | --- | --- |
| `tests/preliminaryTopologyPilotVerifier.test.ts` | `pilot verifier rejects missing skipped stale and mutated proof` | fabricated value, skipped worker/restart, sequential-only concurrency, forbidden number, or protected mutation cannot yield `GO` | `PILOT-A12`, `PILOT-S01`–`PILOT-S05` |
| `tests/preliminaryTopologyPilotEvidence.test.ts` | `pilot evidence manifest binds GO to the current revision and every proof ID` | stale tree, missing proof, abnormal exit, or unexecuted count cannot yield `GO` | `PILOT-A13` |

**Focused commands:**

```text
npm test -- tests/preliminaryTopologyPilotVerifier.test.ts tests/preliminaryTopologyPilotEvidence.test.ts
npm run verify:preliminary-topology-pilot -- --gate=all
npm run verify:preliminary-topology-pilot-evidence
```

The verifier must rerun public/product cases for sensitivity. Mutating only an
in-memory manifest and calling its validator is a supporting test, not the P6
sensitivity proof.

## Refactor and completion sequence

For each named test: focused behavioral red → smallest green → neighboring
tests → refactor while green. At each gate run `npm run typecheck`. After Gate 4
run the full Ticket 05 verifier, upstream verifiers, `npm test`, and
`npm run typecheck`. Missing, stale, skipped, timed-out, or unexecuted scope is
never green.
