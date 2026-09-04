# Ticket 05 - Preliminary topology pilot gate plan

**Schema:** `preliminary-topology-pilot-gates/v1`

**Authoritative ticket:** `.scratch/component-topology-preliminary-v1/issues/05-preliminary-result-reporting-operational-pilot.md`

**Decision artifact:** `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-evidence.json`

This plan owns gate decisions. The Ticket 05 issue owns product scope and
acceptance language. `$tdd` owns test construction. `$audit-proof-gaps` owns
read-only proof-gap review. The implementation prompt routes the agent and must
not duplicate this plan.

## Global claim

Given one real IFC upload containing a supported promoted component pattern, an
eligible localhost Job receives either a reloaded `preliminary-unsafe`
topology result/range or an honest non-success state. Policy, lifecycle,
evidence, and results are durable; the result crosses the real pinned Python
worker; the report reads validated persisted records; and IFC evidence, Revision
history, and the layer-only result remain unchanged.

### Exclusions

- No new topology physics, Recipe compiler, worker, cloud queue, or `verified`
  result.
- No replacement of the ordinary IFC/layer-only workflow.
- No acceptance from an in-memory pilot, fake worker, caller-constructed result,
  or unit-only report test.

### Final consumer and required depth

The final consumer is the localhost Job/report response consumed by an architect
reviewing a preliminary result. The complete claim requires **P6** evidence:
public production composition, durable lifecycle, and an independent oracle.
Gates 1-3 earn P5 slices; Gate 4 may authorize the P6 decision.

## Tracer bullet `PILOT-T01`

**Claim:** An eligible localhost Job submitting the frozen known promoted IFC review
receives the same `preliminary-unsafe` result and report after a fresh server and
SQLite reload, while a disabled policy produces a durable layer-only disposition
with zero worker calls.

**Public seam:** Real IFC upload, `POST /api/jobs/:jobId/topology-reviews`,
`GET /api/jobs/:jobId`, `GET /api/jobs/:jobId/report`, and fresh process/repository
construction.

**Production composition:** HTTP -> policy -> existing Job/Revision/evidence
validation -> Ticket 4 component evaluation -> SQLite -> pinned Python worker ->
artifact validation -> SQLite reload -> report.

**Independent oracle:** The pinned Ticket 4 fixture/oracle and hashes listed
below; expected disabled disposition and zero-worker invocation are literal
policy assertions.

**Failure probe:** Before implementation, the test must fail if policy is not
composed, persistence is skipped, the worker is not launched, the report uses a
caller result, or restart changes the result.

**Protected state:** IFC/evidence hash, Revision history, layer-only snapshot,
and Ticket 4 graph identities.

**Durability/lifecycle:** Fresh SQLite reader and fresh localhost server; no
partial publication.

**Evidence:** A named focused test and the Gate 1 evidence-manifest row. A
missing or abnormal test run is `NOT-PROVEN`, never green.

## Shared proof vocabulary

| ID | Invariant or acceptance responsibility |
| --- | --- |
| `PILOT-A01` | Eligible promoted review reaches the real Ticket 4 evaluator and report. |
| `PILOT-A02` | Disabled, excluded, and killed policy states invoke no worker and preserve layer-only work. |
| `PILOT-A03` | Pilot dispositions/events persist, reload, and remain append-only. |
| `PILOT-A04` | Displayed numbers have validated Ticket 4 evidence, Recipe, result, artifact, bundle, Revision, and Assembly Group lineage. |
| `PILOT-A05` | Blocked, rejected, failed, cancelled, incomplete, or corrupt states expose no U-value/range. |
| `PILOT-A06` | Cancellation/deadline terminates the worker and publishes no partial success. |
| `PILOT-A07` | Retry classification prevents deterministic retries and duplicate durable calculation. |
| `PILOT-A08` | Sequential, restarted, retried, and concurrent submissions converge on one semantic result. |
| `PILOT-A09` | Health reports actual dependency readiness while layer-only retrieval remains available. |
| `PILOT-A10` | Cleanup/retention preserves published and referenced evidence. |
| `PILOT-A11` | Kill-switch and compatible bundle rollback preserve historical results and layer-only work. |
| `PILOT-A12` | The verifier rejects fabricated values, skipped workers/restarts, forbidden output, and protected-state mutation. |
| `PILOT-A13` | The completion artifact is reproducible, revision-bound, and has a truthful GO/NO-GO decision. |

### Change-to-proof index

| Ticket changes | Proof IDs |
| --- | --- |
| Changes 1-3: policy, composition, durable disposition/events | `PILOT-A01`-`PILOT-A03`, `PILOT-A05` |
| Change 4: persisted report projection | `PILOT-A04`-`PILOT-A05` |
| Change 5: cancellation, deadline, worker lifecycle | `PILOT-A06` |
| Change 6: retry, idempotency, concurrency | `PILOT-A07`-`PILOT-A08` |
| Change 7: health, retention, kill, rollback | `PILOT-A09`-`PILOT-A11` |
| Changes 8-9: verifier and completion artifact | `PILOT-A01`-`PILOT-A13` |

### Shared public seam

- Real IFC upload and `POST /api/jobs/:jobId/topology-reviews`.
- `GET /api/jobs/:jobId`, `GET /api/jobs/:jobId/report`, and `GET /api/health`.
- Fresh localhost server/repository instances and independent concurrent actors.

### Shared independent oracle

Ticket 4's frozen IFC/evidence fixture, promoted pattern/version, Recipe
identities, worker result/artifact hashes, and separately reviewed expected
values. Policy outcomes use literal expected dispositions and stable diagnostics.
The verifier must not derive its expected values from the implementation under
test.

The current pinned oracle is:

- IFC fixture: `tests/fixtures/ifc/repeating-c-profile.ifc`, SHA-256
  `68a4762fadc42730a4638a77de7794075cfd388bbb004b3563e8fab1008ed6f7`.
- Mixed-terminal fixture: `tests/fixtures/ifc/repeating-c-profile-bounded-failure.ifc`,
  SHA-256 `fb4ae09147264cc01f60156a4386cad0f5470cf33bceeb9cbcfdaf4d85f7a196`.
- Oracle: `tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json`,
  SHA-256 `fca3dda946e42ae54a23f16b050518eec54f98edcd6ec5f9638b6523576f4036`.
- Pinned worker: `.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe`,
  SHA-256 `0b471133e110cfb53a061cad528ce8e517d7b9ac41a0a396c39ad795a487fc14`.
- Bounded values: `0.041`, `0.075`, `0.100` metres.
- Expected U-values: `0.8424804269783203`, `0.9136190712232274`,
  `0.9955419279501067 W/m2K`, absolute tolerance `1e-8`.

### Shared protected state

Raw IFC bytes/evidence hash, evidence ledger, Revision history, layer-only
Calculation Snapshot, Ticket 4 evaluation graph, published artifacts, and
historical pilot records.

### Shared evidence manifest

Every run writes `05-preliminary-topology-pilot-gate-evidence.json` containing:

- schema, gate/proof IDs, ticket path, tested revision/tree hash;
- changed-file manifest, exact command/arguments, working directory, runtime;
- selected/passed/failed/unexecuted counts and exit status/duration;
- fixture/oracle/dataset identities and hashes;
- worker/process/artifact identities;
- protected-state observations and sensitivity results;
- `GO`, `NO-GO`, `NOT-PROVEN`, or `HARNESS-BLOCKED` decision.

The manifest is validated as `preliminary-topology-pilot-gate-evidence/v1`.
Its `testedTreeSha256`, ticket hash, fixture/oracle hashes, and command identity
must match the candidate being evaluated. A validator must reject missing proof
IDs, stale revision bindings, omitted unexecuted counts, altered protected
hashes, or a `GO` decision with any unexecuted case.

## Operational contracts

These values are server-owned policy, not request-body input.

### Pilot policy

```text
schema: topology-pilot-policy/v1
policyVersion: immutable identifier
enabled: boolean
cohort: all | job-id-allow-list selected by the server-created Job ID
killSwitch: { active: boolean, reasonCode: stable code | null, version: string }
bundle: { moduleId, moduleVersion, registryHash, packHash, runtimeHash }
retry: { maxAttempts: 2, retryableCodes: stable allow-list, backoffMs: 250 }
limits: { maxScenarioCount: Ticket 4 cap, deadlineMs: configured bound }
retention: { temporary: terminal cleanup, failedDays: 7, unreferencedPublishedDays: 30 }
```

Persist the policy version/hash and the resulting cohort decision in the pilot
run. Never accept cohort, bundle, runtime, artifact path, or kill-switch values
from the HTTP request body. This localhost V1 does not introduce user/account
ownership or authentication.

### Cancellation and health

- Cancellation is abort/disconnect of the in-flight
  `POST /api/jobs/:jobId/topology-reviews` request. The server persists
  `cancellation-requested`, propagates the existing abort signal to the worker,
  awaits termination, and then persists the terminal disposition. Deadline
  cancellation uses the existing server-parsed deadline header. No asynchronous
  start or cancel-by-run endpoint is added in this ticket.
- Define `GET /api/health` as `topology-pilot-health/v1` with `overallStatus`,
  `layerOnly.available`, `topology.available`, and checks for SQLite, artifact
  storage, pinned runtime, worker preflight, and selected bundle.
- Return `200` for core process/SQLite availability, including `degraded` when
  topology is unavailable but layer-only remains available; return `503` when
  the core process/SQLite cannot serve the health contract. Topology submission
  is unavailable while `topology.available` is false.

### Retry, retention, and rollback

- Allow at most one retry after the initial attempt (`maxAttempts: 2`) and only
  when the terminal diagnostic is explicitly retryable and in the policy
  allow-list. Back off 250 ms without exceeding the request deadline.
- Never automatically retry blocked, rejected, malformed-output, integrity,
  cancellation, or deadline outcomes. Persist attempt count and invocation
  identities; a transient retry may produce two worker invocations but one
  semantic run/evaluation/result.
- Run cleanup at server startup and after terminal publication. Remove temporary
  directories after atomic terminal publication. Retain
  failed/cancelled diagnostic artifacts for seven days, published artifacts while
  referenced, and unreferenced published artifacts for thirty days. Evidence,
  Revisions, and referenced history are never removed by pilot cleanup.
- A rollback is a server restart with a different server-selected bundle for new
  work only. Compatibility
  requires the versioned protocol, module identity, registry/pack/runtime hashes,
  and worker preflight to be in the server-owned compatibility allow-list.
  Graceful process shutdown cancels in-flight work; historical results keep
  their original bundle identity and remain readable.

## Security and abuse contract

| ID | Required security proof |
| --- | --- |
| `PILOT-S01` | Job identity, active Revision, Assembly Group, pattern, bundle, runtime, policy, and artifact destination are server-derived and cannot be overridden by HTTP input. |
| `PILOT-S02` | Artifact paths remain inside the configured root; traversal, absolute paths, unsafe segments, and tampered manifests fail closed. |
| `PILOT-S03` | Request size, bounded scenario count, worker output size, deadline, retry count, and concurrent pilot work are capped; oversized/adversarial bounds cannot cause unbounded work. |
| `PILOT-S04` | Events/logs contain stable correlation/record IDs, codes, hashes, and timings but no raw IFC, owner identity, raw evidence, or arbitrary request body. |
| `PILOT-S05` | Kill-switch, bundle selection, retention, and cleanup are server-owned/operator-controlled; no unauthenticated public mutation endpoint exists. |

`PILOT-S01`-`PILOT-S03` are Gate 1/2 proofs; `PILOT-S04`-`PILOT-S05` are Gate
3 proofs; all five are rechecked by Gate 4 sensitivity cases.

## Preflight and target proof commands

This is a plan-time preflight, not a fifth product gate. Before implementation,
the agent must verify that the following target commands are either existing
upstream commands or explicitly created as the first red change:

```text
npm test -- tests/preliminaryTopologyPilotPolicy.test.ts tests/preliminaryTopologyPilotSqlite.test.ts
npm test -- tests/preliminaryTopologyPilotHttp.test.ts
npm test -- tests/preliminaryTopologyPilotLifecycle.test.ts
npm test -- tests/preliminaryTopologyPilotOperational.test.ts
npm test -- tests/preliminaryTopologyPilotVerifier.test.ts tests/preliminaryTopologyPilotEvidence.test.ts
npm run verify:preliminary-topology-pilot -- --gate=all
npm run verify:preliminary-topology-pilot-evidence
```

The verifier must support `--gate=1|2|3|all`, emit the shared manifest, and
return a non-zero exit for missing, skipped, stale, or mutated proof. The
evidence validator must be a separate command from the implementation tests.

## Gate 1 - Production slice

**Claim:** Policy, real localhost composition, durable disposition, Ticket 4
evaluation, and validated report form one honest production path.

**Required depth:** P5, with Ticket 4's P6 numerical oracle reused for the
successful result.

**Proof IDs:** tracer `PILOT-T01`; `PILOT-A01` through `PILOT-A05`,
`PILOT-S01` through `PILOT-S03`.

**Positive cases:** eligible exact/known match; eligible bounded range;
disabled; cohort-excluded; killed before submission.

**Negative/recovery cases:** blocked, rejected, incomplete publication,
corrupted linkage, and caller-constructed/fabricated success probe.

**Durability:** fresh SQLite reader, fresh server/report reload, append-only
disposition/event history, atomic no-partial publication.

**Sensitivity:** removing persistence, skipping fresh reload, injecting the old
fabricated U-value, or changing `promoted` to `candidate` must fail the gate.

**Proof commands:**

- Focused policy/adapter tests named by Changes 1-3.
- `npm test -- tests/preliminaryTopologyPilotHttp.test.ts`.

**Execution tier:** focused checks local; public/restart/corruption proof CI or
completion.

**NO-GO:** any displayed number lacks complete persisted lineage; any policy
exclusion invokes a worker; any protected state changes; any proof is unit-only.

## Gate 2 - Lifecycle safety

**Claim:** Cancellation, deadlines, retries, idempotency, and concurrency are
safe at the public boundary.

**Required depth:** P5.

**Proof IDs:** `PILOT-A06` through `PILOT-A08`, `PILOT-S03`.

**Positive cases:** transient failure followed by bounded retry; successful
restart/replay; simultaneous independent submissions converging on one result.

**Negative/recovery cases:** client cancellation, deadline, worker crash,
malformed output, deterministic blocked/rejected outcome, and retry conflict.

**Durability:** worker termination/await, no partial artifact publication,
fresh reload after every terminal state, one semantic run/evaluation/result.

**Sensitivity:** skip worker launch/termination, use sequential-only callers,
retry a deterministic outcome, or allow a range with one failed scenario; the
verifier must return `NO-GO` or `NOT-PROVEN`.

**Proof commands:**

- Focused lifecycle/worker tests named by Changes 5-6.
- `npm run verify:preliminary-topology-pilot -- --gate=2`.

**Execution tier:** CI or completion; local tests are supporting evidence only.

**NO-GO:** surviving worker process, duplicate durable calculation, partial
success, retry of deterministic failure, or ambiguous cancellation/deadline
classification.

## Gate 3 - Operational controls and reversibility

**Claim:** Operators can observe readiness, clean up safely, stop work, and
rollback compatible bundles without destroying layer-only availability or
historical evidence.

**Required depth:** P5.

**Proof IDs:** `PILOT-A09` through `PILOT-A11`, `PILOT-S02`, `PILOT-S04`, `PILOT-S05`.

**Positive cases:** all dependency health checks ready; cleanup after success,
failure, and cancellation; kill/re-enable; compatible bundle rollback.

**Negative/recovery cases:** each dependency unavailable; expired temporary
artifact; attempted deletion of referenced evidence; incompatible bundle.

**Durability:** health after fresh process; published/reference artifacts remain
readable; historical bundle/runtime identities remain unchanged.

**Sensitivity:** configured-but-unexercised health, cleanup that removes a
published artifact, or rollback that rewrites history must fail the gate.

**Proof commands:**

- Focused operational tests named by Change 7.
- `npm run verify:preliminary-topology-pilot -- --gate=3`.

**Execution tier:** CI or completion.

**NO-GO:** health reports configuration rather than dependency readiness; any
published/reference evidence is removed; kill or rollback disables layer-only
work or rewrites historical results.

## Gate 4 - Independent release proof

**Claim:** Ticket 05 is genuinely green, not merely implemented.

**Required depth:** P6.

**Proof IDs:** `PILOT-A01` through `PILOT-A13`, `PILOT-S01` through `PILOT-S05`.

**Tracer bullet:** One real IFC upload, eligible policy, Ticket 4 evaluation,
real pinned worker result, SQLite reload, report, and protected-state hashes.
The intended red is a missing policy/persistence/worker/report boundary, not a
fixture or harness error.

**Positive cases:** the complete verifier matrix from Change 8.

**Negative/recovery cases:** fabricated value, skipped worker, skipped restart,
sequential-only concurrency, forbidden U-value, protected-state mutation,
corrupted lineage, unexecuted case, stale evidence, and abnormal exit.

**Sensitivity:** the verifier must rerun the public/product boundary; mutating
an in-memory object or calling a local predicate is insufficient.

**Proof commands:**

- `npm run verify:preliminary-topology-pilot`.
- Ticket 02/03/06 and Ticket 4 verifiers.
- `npm test` and `npm run typecheck`.
- `graphify update .`.
- `$audit-proof-gaps` and `$code-review`.

**Execution tier:** completion/release only.

**NO-GO:** any unexecuted or harness-blocked case; stale evidence; missing
independent oracle; unresolved P0/P1 review issue; or any claim based only on
the implementer's final message.

## Decision rule

`GO` requires every applicable `PILOT-A*` and `PILOT-S*` proof ID to have executed evidence at its required
depth, no unexecuted case, no unresolved harness ambiguity, current revision
binding, and a reproducible manifest. Otherwise use the most specific status:
`NO-GO`, `NOT-PROVEN`, or `HARNESS-BLOCKED`.
