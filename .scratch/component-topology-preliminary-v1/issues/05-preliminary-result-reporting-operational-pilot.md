# 05 - Ship the persisted preliminary topology pilot through the real product path

**What to build:** Given one real IFC upload containing a supported promoted
component pattern, an eligible localhost Job receives either a reloaded
`preliminary-unsafe` topology result/range or an honest non-success state. The
pilot decision, lifecycle, evidence, and result are durable; the report reads
only validated persisted records; cancellation, restart, retry, health, kill,
and rollback behavior are observable; and the ordinary layer-only workflow,
IFC evidence, and immutable revision history remain unchanged.

**Blocked by:** `09-durable-component-scenario-remediation.md` (Ticket 4's
durable component-scenario path), Ticket 02's pinned worker, Ticket 03's
localhost review route, Ticket 06's request-boundary hardening, and the
Component Topology Foundation gates `FND-G1` through `FND-G3`.

**Status:** ready for agent only after the blocked verifiers have normal exits
and `npm run verify:component-topology-foundation:completion` passes for the
current worktree.

## Why this ticket exists

The previous attempt implemented an in-memory pilot gate and fake-backed report
projection. It did not compose the policy into the localhost Job route, persist
the disposition or events, prove real dependency health, or exercise an
IFC-to-worker-to-report lifecycle. Ticket 4 now supplies the durable evaluation
foundation. This ticket must extend that foundation; it must not introduce a
second worker, result store, reporting pipeline, or in-memory source of truth.

## Progressive-disclosure reading order

Load only the material needed for the current gate:

1. **Always:** `AGENTS.md`, `context/domain.md`,
   `context/working-contract.md`, this ticket, the latest Ticket 4 completion
   artifact, and the current production composition trace.
2. **Before Changes 1-3:** the pilot policy boundary, Job/Revision repository
   ports, Ticket 4 component-evaluation records, and SQLite adapter.
3. **Before Changes 4-7:** the existing report projection, topology request
   service, artifact store, pinned worker lifecycle, and Ticket 02/03/06
   verifier evidence.
4. **Before Changes 8-9:** the verifier and completion-artifact contracts from
   Ticket 4, plus the exact prior failure report for this ticket.

Do not load historical topology material merely because it mentions a pilot.
Current code, active context, this contract, and Ticket 4's proven boundaries
take precedence.

## Gate authority

The authoritative gate contracts are in
`.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-plan.md`.
Use that plan for proof IDs, required depth, oracles, sensitivity checks,
execution tiers, evidence-manifest fields, and GO/NO-GO decisions. This ticket
indexes the gates; it does not duplicate their decision rules.

The authoritative test names, expected behavioral reds, focused commands, and
proof-map handoff to TDD are in
`.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-tdd-proof-plan.md`.

## Frozen production contract

- Use the existing `POST /api/jobs/:jobId/topology-reviews` route and its real
  application composition. Do not add a parallel pilot endpoint.
- Reuse Ticket 4's component-evaluation graph, SQLite repository, canonical
  identities, persisted-result validator, artifact store, topology request
  service, and pinned Python worker.
- Put policy decisions in the application layer and persistence mechanics in
  infrastructure. Domain records remain independent of HTTP, SQLite, files,
  processes, and `web-ifc`.
- Persist a small typed pilot disposition/run/event record only where the
  existing Job/evaluation records cannot express operational policy. Do not
  duplicate scenario/evidence/result records.
- Build reports from freshly loaded, canonically validated persisted records.
  A caller-constructed successful `TopologyResult` is never displayable proof.
- Topology remains preliminary-only. No `verified` claim is authorized.
- Preserve raw IFC evidence, prior Revisions, Ticket 4 evaluations, and the
  layer-only Calculation Snapshot byte-for-byte.
- Pilot policy, cohort, kill-switch, bundle, retry, retention, and resource
  limits are server-owned; the request body cannot override them.
- This localhost V1 has no authenticated owner identity. Cohort eligibility is
  server-owned and derived from the existing server-created Job ID; do not add
  user/account/authentication fields for this ticket.
- User cancellation is abort/disconnect of the in-flight
  `POST /api/jobs/:jobId/topology-reviews` request. Deadline cancellation uses
  the existing server-parsed deadline header. Do not add an asynchronous start
  endpoint or cancel-by-run endpoint in this ticket.
- `GET /api/health` exposes the typed topology/layer-only readiness contract;
  no public endpoint mutates kill-switch, bundle, retention, or cleanup policy.
- Artifact roots, request sizes, bounded scenario counts, worker output, retry
  count, and deadlines are enforced as resource/security limits.

## Ticket-level proof map

```text
Claim:
An eligible real IFC Job review reaches the existing durable component evaluator and
returns a restart-safe preliminary result; every policy and terminal outcome is
honest, durable, controllable, and safe for the layer-only workflow.

Public seam:
Real localhost IFC upload/review, GET job, GET report, `GET /api/health`, process
shutdown, fresh server/repository construction, and retry/concurrent HTTP calls.

Independent oracle:
Ticket 4's frozen IFC fixture, promoted pattern/version, Recipe identities,
worker result/artifact hashes, and expected values. Policy cases additionally
have literal expected dispositions, stable diagnostics, and zero-worker rules.

Failure probes:
Disabled/cohort-excluded/killed policy, blocked/rejected input, unavailable or
malformed worker, cancellation, deadline, transient failure, deterministic
failure, duplicate requests, dependency corruption, expired temporary artifacts,
and incompatible rollback configuration.

Protected state:
IFC bytes/evidence hash, evidence ledger, Revision history, layer-only snapshot,
Ticket 4 evaluation graph, published artifacts, and historical pilot records.

Durability/lifecycle:
Fresh SQLite reader, process restart, append-only event history, atomic
publication, worker termination, bounded retry, cleanup/retention, kill switch,
bundle rollback, and fail-closed report reload.

Acceptance evidence:
Named tests and verifier cases emit public outcome, disposition/event identities,
stable diagnostic, worker invocation/process evidence, artifact/result hashes,
fresh-reload equality, and protected-state hashes.
```

## Global false-green rules

The following may support development but cannot satisfy acceptance:

- the old in-memory `createTopologyOperationalPilot` state;
- a fake `requests.submit` or caller-supplied successful result;
- a direct unit call presented as localhost proof;
- reopening the same repository object presented as restart proof;
- sequential calls presented as concurrency proof;
- configured flags presented as health without exercising the dependency;
- asserting that a row/file exists without verifying identity, hash, provenance,
  relationship, and reload behavior;
- deriving expected numbers from the production aggregator or the result under
  test;
- showing a U-value for blocked, rejected, failed, cancelled, incomplete, or
  corrupted evidence;
- a skipped, timed-out, manually terminated, or undiscovered test presented as
  green.

Every focused red must show the named assertion executed and failed for the
intended missing behavior before production code changes.

## Outcome and failure matrix

| Case | Required product behavior | Public/durable evidence |
| --- | --- | --- |
| Eligible user, promoted match, successful solve | Reloaded `preliminary-unsafe` value/range | Real IFC -> HTTP -> Ticket 4 graph -> pinned worker -> report |
| Feature disabled | Layer-only path remains available | Persisted `disabled`; zero worker calls |
| User outside cohort | Layer-only path remains available | Persisted `cohort-excluded`; zero worker calls |
| Kill switch before submission | Layer-only path remains available | Persisted `killed`; zero worker calls |
| Kill/cancel during active work | `cancelled`; no partial result | Worker terminated/awaited; no U-value; restart agrees |
| Missing/unsupported input | `blocked` | Stable diagnostic and decisive next input; no U-value |
| Invalid/stale/conflicting input | `rejected` | Stable diagnostic; no derived success records |
| Worker unavailable/crash/malformed output | `failed` | Stable incident code and retryability; no U-value |
| Deadline exceeded | `failed` with `worker_deadline_exceeded` | No partial publication; timing evidence persisted |
| Transient infrastructure failure | Bounded retry or explicit manual retry | Same semantic identity; no duplicate result |
| Deterministic failure | No automatic retry | Stable disposition and unchanged invocation count |
| Sequential/restarted/retried/concurrent submission | One immutable disposition/result | Independent actors prove one calculation |
| Dependency unhealthy | Topology unavailable; layer-only healthy | Component-level health details |
| Restart after any terminal state | Same public view/report | Fresh process and repository equality |
| Retention cleanup | Only eligible temporary/expired material removed | Published/referenced artifacts remain readable |
| Bundle rollback | New work uses compatible selected bundle | Historical results retain original bundle |
| Corrupted persisted success | No displayed U-value | Fail-closed diagnostic; layer-only preserved |

## Change 1 - Freeze the operational policy and identities

Define typed, deterministic records for pilot policy snapshots, eligibility
decisions, pilot runs, lifecycle dispositions, and support-safe operational
events. Their identities must include the semantic job/revision/evaluation or
request inputs and the selected policy/bundle version, but must not expose raw
owner or IFC identifiers in support telemetry.

### Tangible tests

**`pilot policy produces deterministic typed decisions`**

- Enabled, disabled, selected-Job, excluded-Job, and killed inputs produce literal
  decisions and stable diagnostics.
- The same semantic inputs produce the same decision/run identity across
  process instances; changing policy or bundle version changes only the derived
  run identity.
- Events contain correlation/request/job/revision/group/pattern/Recipe/bundle
  references and no raw IFC content or arbitrary request body.

**`pilot records remain separate from component evaluation records`**

- Policy/disposition changes never mutate Ticket 4 evidence, match, Recipe,
  result, aggregate, or layer-only records.

## Change 2 - Compose policy into the real localhost Job path

Evaluate pilot policy after existing Job/Revision/opportunity/ownership checks
but before worker invocation. An eligible request delegates to the existing
Ticket 4 component-evaluation path. Disabled, excluded, or killed requests
persist their disposition, invoke no worker, and leave the ordinary Job flow
usable.

### Tangible public-seam tests

**`localhost eligible review uses the durable Ticket 4 evaluator`**

- Upload the frozen IFC through localhost HTTP, submit the real review, and
  assert the Ticket 4 graph/result/report identities are returned.
- Assert the same result after a fresh server/repository reload.

**`localhost policy exclusions do not invoke topology work`**

- Exercise disabled, outside-cohort, and kill-switch-before-submit through the
  same endpoint.
- Assert persisted disposition, zero worker invocations, unchanged layer-only
  output, and successful ordinary Job retrieval.

## Change 3 - Persist dispositions and events append-only

Add the smallest infrastructure repository needed for pilot dispositions and
support-safe events. Writes must be atomic, identity-addressed, reloadable by a
fresh reader, and unable to rewrite historical evidence/results. A partial run
must never appear as a trusted success.

### Tangible adapter tests

**`pilot disposition survives a fresh SQLite reader`**

- Persist successful, excluded, blocked, failed, and cancelled runs.
- Close the repository, construct a fresh reader, and assert identical records,
  event order, hashes, diagnostics, and Ticket 4 evaluation linkage.

**`interrupted pilot publication is not a trusted success`**

- Fault after disposition-before-evaluation, after evaluation-before-publication,
  and after an event append.
- Fresh reload exposes recoverable/non-success state, no U-value, and no partial
  published report.

**`pilot event history is append-only and idempotent`**

- Replaying the same event/run identity is harmless; a changed payload with the
  same identity is rejected.

## Change 4 - Project only validated persisted results

Extend the existing Job/report projection to show pilot disposition and the
separate preliminary topology section. A number/range is displayable only after
fresh canonical validation of Ticket 4 evidence, Recipe, result, artifact,
bundle, source Revision, and Assembly Group lineage.

### Tangible public/report tests

**`report reloads the persisted pilot result without fabrication`**

- Run the real IFC case, stop/restart the app, request the report, and assert the
  displayed value/range equals the independently frozen worker results.
- Assert provenance links and the unchanged layer-only section.

**`invalid or incomplete persisted success fails closed`**

- Tamper an event, evaluation link, result, artifact, or bundle identity in an
  isolated copy.
- Reload Job/report through HTTP and assert a safe diagnostic, no topology
  number, and unchanged layer-only output.

### Gate 1 - Production slice

See the gate plan's Gate 1 contract. Changes 1-4 must prove `PILOT-A01` through
`PILOT-A05` at P5 depth. Do not proceed when policy, persistence, report
lineage, protected state, or fresh reload is unproven.

## Change 5 - Prove cancellation, deadline, and worker lifecycle

Propagate HTTP/job/application cancellation and deadlines through the existing
request service to the pinned Python worker. Persist the terminal disposition
only after the worker is terminated/awaited and artifact publication is known to
be atomic.

### Tangible public/cross-process tests

**`aborted or deadline-exceeded work publishes no partial result`**

- Start a real request, abort the HTTP client or trigger the deadline at the
  public seam, and
  assert terminal disposition, no U-value/range, no published partial artifact,
  and zero surviving worker processes.
- Client cancellation must be `cancelled` with `worker_cancelled`; deadline
  expiry must be `failed` with `worker_deadline_exceeded`.
- Restart and assert the same disposition and protected-state hashes.

## Change 6 - Classify retry and preserve semantic idempotency

Use the existing stable worker diagnostics and retryability fields. Define the
pilot's bounded retry policy without retrying deterministic blocked/rejected
outcomes. Sequential, restarted, retried, and concurrent independent actors
must converge on one semantic disposition/evaluation/result.

### Tangible public/cross-process tests

**`transient retry does not duplicate durable calculation`**

- Inject one classified transient infrastructure failure followed by success.
- Assert bounded retry, one semantic run identity, one published result, and no
  duplicate scenario/artifact effects.

**`deterministic failure is not automatically retried`**

- Exercise blocked, rejected, and deterministic worker failure.
- Assert one invocation, stable terminal state, no U-value, and unchanged layer.

**`simultaneous independent pilot submissions converge`**

- Use two server/repository actors synchronized at the idempotency boundary.
- Assert one ownership decision, one Ticket 4 evaluation, one result set, and
  identical fresh-reload views.

### Gate 2 - Lifecycle safety

See the gate plan's Gate 2 contract. Changes 5-6 must prove `PILOT-A06` through
`PILOT-A08` at P5 depth, including worker termination, no partial publication,
retry classification, restart, and independent concurrency.

## Change 7 - Make health, retention, kill, and rollback operational

Expose component-level health based on actual SQLite, artifact storage,
configured pinned runtime, worker preflight, and compatible bundle readiness.
Define atomic cleanup/retention classes and exercise kill-switch and compatible
bundle rollback without mutating historical records or disabling layer-only work.

### Tangible operational tests

**`health reports actual dependency readiness`**

- Break each dependency in an isolated temporary root.
- Assert the topology component becomes unavailable with a stable diagnostic
  while ordinary layer-only retrieval remains available.

**`cleanup preserves published and referenced evidence`**

- Run success, failure, and cancellation; execute cleanup; assert only eligible
  temporary/expired material is removed and all published/referenced artifacts
  reload successfully.

**`restart kill and bundle rollback preserve history`**

- Start with the server-owned kill switch active, then restart re-enabled.
- Restart with a compatible server-selected bundle for new work; process
  shutdown cancels active work, and historical results retain the old
  bundle/runtime identities and remain readable.
### Gate 3 - Operational controls and reversibility

See the gate plan's Gate 3 contract. Change 7 must prove `PILOT-A09` through
`PILOT-A11` at P5 depth. Health must exercise dependencies; cleanup and
rollback must preserve published/reference history.

## Change 8 - Replace false greens with one authoritative verifier

Add `scripts/verify-preliminary-topology-pilot.ts` and a package script. It must
start the real localhost composition with temporary SQLite/artifact roots and
the pinned Python worker, use real HTTP requests, restart all readers/processes,
and emit a machine-readable evidence manifest plus a human-readable summary.

### Verifier cases

1. Eligible exact/known promoted match.
2. Eligible bounded Ticket 4 scenario range.
3. Disabled policy.
4. Cohort exclusion.
5. Kill switch before submission.
6. Blocked missing authority/input.
7. Rejected conflicting/out-of-range input.
8. Worker unavailable/crash/malformed output.
9. Cancellation and deadline.
10. Transient retry and deterministic no-retry.
11. Sequential, restarted, retried, and truly simultaneous duplicates.
12. Fresh restart/reload for success and every non-success state.
13. Health dependency failure with layer-only availability.
14. Retention cleanup and published-artifact preservation.
15. Kill-switch and compatible-bundle rollback.
16. Corrupted persisted success fails closed.

For every case capture public outcome, pilot disposition/event identities,
stable diagnostics, Ticket 4 record identities, worker invocation/process
evidence, artifact/result hashes, fresh-reload equality, and protected-state
hashes. The verifier must report selected/passed/failed/unexecuted counts and
exit normally.

### Verifier sensitivity checks

- Replace a real worker result with the old fabricated unit-test value: oracle
  verification must fail.
- Skip policy persistence, restart, or worker launch: classify the run as proof
  failure, never green.
- Change `promoted` to `candidate`: runtime-match assertions must fail.
- Return a range with one non-success scenario: forbidden-output assertions
  must fail.
- Mutate IFC evidence or layer-only output: protected-state assertions must fail.
- Sensitivity checks must rerun the public/product boundary; mutating an
  in-memory object and calling a local predicate is not sufficient proof.

## Change 9 - Produce the evidence-backed completion artifact

Write `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-readiness.md` from captured verifier evidence. It is a decision artifact, not a narrative claim.

### Tangible report validation

**`pilot readiness manifest covers every invariant and matrix row exactly once`**

- Validate that every invariant, verifier case, durable-state row, and
  protected-state assertion maps to a named executed test/run identifier.
- Include schema/migration version, policy/run/event identities, Ticket 4 graph
  linkage, outcome matrix, health output, worker/process evidence, retry and
  cancellation traces, retention/rollback results, protected-state hashes,
  exact commands, selected/passed/failed/unexecuted counts, exit statuses,
  durations, review findings, and GO/NO-GO.
- Reject references to fake-backed tests as acceptance evidence.


### Gate 4 - Independent release proof

See the gate plan's Gate 4 contract. Changes 8-9 must prove `PILOT-A01` through
`PILOT-A13` at P6 depth. The verifier and decision artifact, not the agent's
final message, authorize GO.

## Required TDD execution order

Before implementation, use `gate-design` to verify that the gate plan remains
falsifiable and proportionate. For each change:

1. Write the proof map and named test through the highest seam claimed by that
   change.
2. Run the focused command and prove the named assertion executed.
3. Record a behavioral red that distinguishes missing production behavior from
   fixture or harness failure.
4. Implement the smallest production change that satisfies the red without
   bypassing the frozen contract.
5. Run focused and neighboring tests, then refactor while green.
6. At Gates 2 and 4, run the public verifier and `audit-proof-gaps`.
7. If the red is unclear or the route is uncertain, stop and use
   `diagnosing-bugs`; do not guess or widen the implementation.

## Non-goals

- No new topology physics, pattern family, Recipe compiler, or worker.
- No cloud queue, analytics vendor, general observability platform, or
  production deployment system.
- No `verified` topology result or compliance claim.
- No replacement of the ordinary IFC/layer workflow.
- No frontend rewrite; only the smallest report/view changes needed to expose
  persisted, honest pilot state.

## Required completion artifact

Return the pilot-readiness report with the invariant-to-test map, complete
outcome matrix, schema/policy/run/event versions, Ticket 4 record relationships,
one real success trace, every non-success/control trace, health output,
cancellation/deadline/retry evidence, cleanup/retention/kill/rollback drills,
restart/concurrency evidence, worker invocation counts, protected-state hashes,
exact verification summaries, review findings, and final GO/NO-GO decision.
