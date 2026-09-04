# Final verification context: Tickets 02-05

This file is a handoff for one final, evidence-backed verification pass for the
whole component-topology feature slice: Tickets 02, 03, 04, and 05. Ticket 09
is the remediation/completion pass for Ticket 04; it is not a separate product
feature. This is not a completion decision. Previous reports contain GO
decisions, but this pass must re-run the public and durable boundaries on the
current tree and reject fake success, stale evidence, skipped tests, and
fabricated numerical results.

## Objective

Verify that one real supported IFC upload containing the promoted repeating
C-profile component can cross:

```text
localhost HTTP
  -> durable Job/Revision and Component Evaluation records in SQLite
  -> real Ticket 4 scenario/evaluation path
  -> pinned Python topology worker
  -> validated immutable artifacts
  -> fresh SQLite/server restart and reload
  -> report built only from validated persisted records
```

The result must be either an honest `preliminary-unsafe` value/range or a
durable non-success disposition. No path may display a U-value for blocked,
rejected, failed, cancelled, incomplete, corrupted, or mixed-terminal work.

The following must remain byte/identity unchanged:

- raw IFC bytes and immutable IFC evidence;
- immutable Revision history;
- Ticket 4 evidence, match, Recipe, scenario, result, and aggregate history;
- the ordinary layer-only Calculation Snapshot;
- previously published artifacts and historical pilot records.

Do not add a second worker, result store, report pipeline, asynchronous pilot
endpoint, cancel-by-run endpoint, authentication, or dynamic public operator
controls. Do not spawn or delegate to subagents.

## Whole-feature ticket map

| Ticket | Feature responsibility | What final verification must prove |
| --- | --- | --- |
| 02 | Pinned Python topology worker and generic 2-D compiler | Real Netgen/NGSolve execution, protocol symmetry, lifecycle, numerical evidence, artifact integrity, and no fabricated success |
| 03 | IFC evidence to opportunity/review to topology request | Real localhost Job route, ownership/revision checks, durable request/result linkage, and fresh reload |
| 04 | Component knowledge base, declarative pattern packs, and bounded scenarios | Durable SQLite evidence/match/Recipe/scenario graph, real worker per scenario, independent oracle, honest aggregate/range, and fail-closed mixed terminals |
| 05 | Operational pilot policy, reporting, lifecycle, health, retry, cleanup, and rollback | Server-owned durable policy/history, validated persisted report, cancellation/deadline, concurrency/idempotency, dependency health, and protected state |

The final proof is a vertical composition of all four tickets. A passing Ticket
05 unit or pilot test cannot authorize completion if Ticket 02's worker is
fake, Ticket 03 uses an injected request service, or Ticket 04 uses fabricated
scenario values.

## Authority order

1. Ticket behavior and scope:
   `.scratch/component-topology-preliminary-v1/issues/02-composable-2d-topology-worker-integration.md`
   `.scratch/component-topology-preliminary-v1/issues/03-ifc-opportunity-compact-recipe-review.md`
   `.scratch/component-topology-preliminary-v1/issues/04-component-knowledge-base-safe-scenario-estimates.md`
   `.scratch/component-topology-preliminary-v1/issues/05-preliminary-result-reporting-operational-pilot.md`
2. Ticket 05 proof IDs, gates, evidence fields, and GO/NO-GO:
   `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-plan.md`
3. Ticket 05 exact test names, expected reds, focused commands, and proof map:
   `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-tdd-proof-plan.md`
4. Durable component-scenario remediation contract for Ticket 04:
   `.scratch/component-topology-preliminary-v1/issues/09-durable-component-scenario-remediation.md`
5. Ticket 09 completion and gate evidence:
   `.scratch/component-topology-preliminary-v1/reports/09-durable-component-scenario-completion.md`
   `.scratch/component-topology-preliminary-v1/reports/09-gate-5-proof-audit.md`
   `.scratch/component-topology-preliminary-v1/reports/09-gate-9-proof-audit.md`
6. Request-boundary evidence:
   `.scratch/component-topology-preliminary-v1/reports/06-topology-request-contract-hardening-report.md`
7. Product context and failure lessons:
   `context/working-contract.md`, `context/error_logs.md`, `context/domain.md`
8. This file is a navigation/handoff document only; it cannot override the
   files above.

## Starting-tree preflight snapshot

Captured before this handoff file was added:

- repository: `C:\dev\conformity`
- HEAD revision: `411b956e96599e5957308136db9e4c8ce68613f1`
- current tracked-diff hash: `acebb2ad33e216d967bf9c1836a47df36d165ca1`
- Ticket 05 evidence tested revision:
  `411b956e96599e5957308136db9e4c8ce68613f1`
- Ticket 05 evidence tested tree SHA-256:
  `e542651f3158642476f0c36a5d1d9100e69c5e4870afbcb325002448be555420`

The tree was not clean. Preserve all pre-existing work. Before any production
edit, recompute `git status --short`, HEAD, and a worktree/diff hash; classify
every file as pre-existing, ticket-owned, generated, or intentionally changed.
Only intentional Ticket 05/Ticket 09 remediation files may be committed.

### Tracked files already modified at preflight

```text
.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/aligned-c/result.json
.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/single-c/result.json
.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/staggered-c/result.json
.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/timber/result.json
.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/z-regression/result.json
.scratch/component-topology-preliminary-v1/reports/09-authoritative-verifier-evidence.json
CONTEXT.md
UBIQUITOUS_LANGUAGE.md
context/decisions/2026-07-25-component-topology-production-architecture.md
context/domain.md
context/error_logs.md
context/specs/component-topology-production-architecture.md
scripts/verify-milestone-4.ts
scripts/verify-preliminary-topology-pilot-evidence.ts
scripts/verify-preliminary-topology-pilot.ts
skills-lock.json
src/app/http/httpServer.ts
src/application/topology/replayJobComponentEvaluation.ts
src/application/topology/submitJobTopologyReview.ts
src/domain/jobs/jobTypes.ts
src/domain/topology/componentEvaluationRecords.ts
src/domain/topology/topologyPilotPolicy.ts
src/infrastructure/persistence/sqlite/SqliteJobRepository.ts
src/verifier/e2eVerifier.ts
src/verifier/foundationGateVerifier.ts
src/verifier/preliminaryTopologyPilotEvidence.ts
tests/jobArtifactStore.test.ts
tests/milestone4JobApi.test.ts
tests/preliminaryTopologyPilotEvidence.test.ts
tests/preliminaryTopologyPilotHttp.test.ts
tests/preliminaryTopologyPilotOperational.test.ts
tests/preliminaryTopologyPilotPolicy.test.ts
tests/preliminaryTopologyPilotVerifier.test.ts
tests/reconcileJobReviewPlan.test.ts
tests/reviewWorkflowRegression.test.ts
tests/submitJobTopologyReview.test.ts
tests/topologyReviewHttpContract.test.ts
tests/topologyReviewJobE2e.test.ts
```

### Important untracked/pre-existing areas

These existed at preflight and must not be absorbed automatically:

```text
.codex/
.entroly/
.graph-engineering/
.scratch/component-topology-kernel/
.scratch/component-topology-preliminary-v1-foundation/
.scratch/component-topology-preliminary-v1/evidence-adapter-dataset-architecture.md
.scratch/component-topology-preliminary-v1/issues/
.scratch/component-topology-preliminary-v1/layer-vs-topology-functions-and-architecture.md
.scratch/component-topology-preliminary-v1/reports/
.scratch/thermal-treatment-v1/
.tmp-review-diff.txt
AGENTS.md
context/issues/component-topology-kernel/
context/prds/component-topology-preliminary-v1.md
context/references/
context/working-contract.md
graphify-out/
learning/
scripts/verify-topology-request-spine-regression.ts
scripts/verify-topology-worker-failure-regression.ts
tests/helpers/
tests/preliminaryTopologyPilotSensitivity.test.ts
```

The complete live manifest is always the current `git status --short`, not this
abbreviated grouping. This snapshot is here to prevent accidental cleanups or
commits.

## Production route confirmed by graphify

The graph query connected the current production composition as follows:

```text
createLocalhostApp (src/app/http/httpServer.ts)
  -> POST /api/jobs/:jobId/topology-reviews
  -> submitJobTopologyReview
  -> existing Job/Revision/opportunity checks
  -> SqliteComponentEvaluationRepository / SqliteJobRepository
  -> Ticket 4 component-evaluation/scenario path
  -> createTopologyAnalysisRequestService
  -> createProvenPythonTopologyWorker
  -> LocalTopologyArtifactStore
  -> persisted result/evaluation linkage
  -> refreshJobTopologyReport / sendReport
```

The same composition exposes `GET /api/jobs/:jobId`, report retrieval, and
`GET /api/health`. Fresh server/repository construction is required for
restart evidence; reopening the same object is not restart proof.

Relevant implementation locations to inspect:

```text
src/app/http/httpServer.ts
src/application/topology/submitJobTopologyReview.ts
src/application/topology/refreshJobTopologyReport.ts
src/application/topology/replayJobComponentEvaluation.ts
src/application/topology/createTopologyAnalysisRequestService.ts
src/domain/topology/componentEvaluationRecords.ts
src/domain/topology/componentPatternInterpreter.ts
src/domain/topology/topologyPilotPolicy.ts
src/infrastructure/persistence/sqlite/SqliteComponentEvaluationRepository.ts
src/infrastructure/persistence/sqlite/SqliteJobRepository.ts
src/infrastructure/topology/createProvenPythonTopologyWorker.ts
src/infrastructure/topology/localTopologyArtifactStore.ts
src/application/reports/generateHtmlReport.ts
scripts/verify-preliminary-topology-pilot.ts
scripts/verify-preliminary-topology-pilot-evidence.ts
tests/preliminaryTopologyPilot*.test.ts
tests/componentScenarioHttpE2e.test.ts
tests/componentEvaluationSqlite.test.ts
```

## Why the earlier implementation was not trustworthy

### Ticket 05 first attempt

The first attempt added an in-memory `createTopologyOperationalPilot` and an
optional report projection. It passed focused unit tests but did not compose
with the localhost Job route, persist policy/disposition/events, validate
freshly reloaded results, prove health, implement lifecycle/retry/cleanup/
rollback, or complete the IFC-to-worker-to-report verifier. The full suite was
manually terminated without a result. That is an unknown result, not green.

Recorded report:
`.scratch/component-topology-preliminary-v1/reports/05-preliminary-result-reporting-operational-pilot-failure-report.md`

### Ticket 09 first attempt

The earlier scenario work used fabricated U-values, an in-memory pattern pack,
`applyParameters()` assumptions, fake solver responses, and no durable SQLite
scenario/result/reload path. It could pass arithmetic tests without proving a
real IFC-to-worker calculation. Ticket 09 was rewritten to require generic
declarative packs, durable records, real pinned-worker scenarios, an
independent frozen oracle, mixed-terminal fail-closed behavior, restart,
concurrency, corruption, and protected-state hashes.

## Recorded evidence to revalidate, not blindly trust

### Ticket 09 recorded completion

- Decision: `GO` in the completion report.
- Frozen promoted pattern: `repeating-metal-c-profile@1.0.0`.
- Frozen dataset SHA-256:
  `3088a9bc7bbb4263c78c9570d0e6f367098c0a009f87f4818afb5cfdc48ab7e1`.
- Frozen independent oracle SHA-256:
  `fca3dda946e42ae54a23f16b050518eec54f98edcd6ec5f9638b6523576f4036`.
- IFC fixture SHA-256:
  `68a4762fadc42730a4638a77de7794075cfd388bbb004b3563e8fab1008ed6f7`.
- Bounded depths: `0.041`, `0.075`, `0.100 m`.
- Recorded U-values:
  `0.8424804269783203`, `0.9136190712232274`,
  `0.9955419279501067 W/m2K`.
- Authoritative verifier: `13/13 passed`, `0 failed`, `0 unexecuted`, exit 0.
- Recorded final suite: `197 tests` across `54 files`, exit 0; typecheck exit 0.

Gate 5 and Gate 9 reports explicitly state that no fake worker, in-memory
repository, caller-authored U-value, or structural-only report validator can
authorize GO. Re-run these claims on the current revision and inspect the
actual public verifier/evidence, not just the JSON decision field.

### Ticket 05 recorded completion

The current Ticket 05 evidence file records:

```text
schema: preliminary-topology-pilot-gate-evidence/v1
ticket: 05-preliminary-result-reporting-operational-pilot.md
tested revision: 411b956e96599e5957308136db9e4c8ce68613f1
decision: GO
selected/passed/failed/unexecuted: 18/18/0/0
```

It lists all `PILOT-A01` through `PILOT-A13` and `PILOT-S01` through `PILOT-S05`
as passed, including public eligible review, policy exclusion, fresh SQLite
reload, report fail-closed behavior, cancellation/deadline, retry,
independent concurrency, health, cleanup, rollback, sensitivity, and
current-revision evidence. Confirm every proof actually ran and that the
manifest's hashes and selected test names match the current files.

### Ticket 02 recorded state

Report:
`.scratch/component-topology-preliminary-v1/reports/02-composable-2d-topology-worker-hardening-report.md`

The recorded implementation keeps the Python compiler/registry/solver as the
only topology engine and adds atomic claims, immutable replay-verifiable
publication, release preflight, path/hash checks, bounded JSONL handling,
cancellation/process-tree cleanup, and failure classification. Its independent
Python verifier passed timber, single/aligned/staggered C, and Z, while invalid
geometry, unknown primitives, point fixings, out-of-host geometry, disconnected
members, and missing critical inputs were rejected or blocked. Revalidate the
worker on the current tree; do not accept TypeScript geometry or a fake worker
as a substitute.

### Ticket 03 recorded state

Reports:
`.scratch/component-topology-preliminary-v1/reports/03-ifc-opportunity-compact-recipe-integration-report.md`
`.scratch/component-topology-preliminary-v1/reports/03-ticket3-consolidation-handoff.md`

The final integration report claims the real Job creation, stored IFC evidence,
server-derived opportunity, localhost review, pinned worker, SQLite persistence,
restart/reload, and regenerated report path. The earlier consolidation handoff
records the exact false-green gap: the first verifier bypassed the product path,
used a shallow fake result, did not expose authoritative opportunities, copied
raw IFC material labels into the worker contract, and did not feed persisted
results into reports. Verify supported answers, `I do not know`, wrong ownership,
malformed answers, unsupported vocabulary, worker failures, restart/concurrency,
and artifact corruption through actual HTTP.

### Ticket 04 recorded state

Ticket 04 is the durable component knowledge/scenario layer. Its current proof
is the Ticket 09 remediation and completion evidence listed above. The final
path must use declarative pattern packs, canonical dimension-independent pattern
identity, exact Recipe hashes, append-only SQLite records, real pinned-worker
execution for every scenario, an independent frozen oracle, bounded unknowns,
honest ranges/conservative screening, mixed-terminal fail-closed behavior, and
fresh-reader replay. In-memory packs, fabricated U-values, first-row parameter
application, or fake request services are not evidence.

## Non-negotiable false-green checks

The final verifier must reject all of these when deliberately introduced:

- fabricated or caller-supplied numerical values;
- fake numerical success services in the authorizing path;
- omitted worker launch or skipped restart/reload;
- sequential-only duplicate testing presented as concurrency;
- candidate/unpromoted pattern presented as eligible;
- one failed scenario hidden inside a successful aggregate/range;
- missing, stale, mutated, or unexecuted proof IDs;
- altered IFC evidence, Revision history, Ticket 4 records, layer-only
  snapshot, or published artifacts;
- corrupted persisted success or mismatched artifact/result/request hashes;
- worker processes surviving cancellation/deadline;
- health flags that do not exercise SQLite, artifact storage, and the pinned
  runtime;
- report rendering from an in-memory object rather than fresh validated rows.

Controlled worker adapters are allowed only to inject failure/lifecycle cases;
they can never fabricate an acceptance success. The numerical success path
must use the pinned Python executable and the frozen Ticket 4 oracle.

## Required verification sequence

Use the named tracer tests and reds from the authoritative TDD plan. Do not
replace them with easier unit tests.

1. Recompute current revision, worktree hash, and full changed-file manifest.
2. Run the four upstream preflight verifiers required by Ticket 05 and classify
   missing/stale/timed-out/abnormal/undiscovered results as blocked or not
   proven.
3. Run Ticket 09's authoritative public/durable scenario verifier and inspect
   its evidence manifest, including fresh readers, independent oracle,
   real-worker identity, and protected-state hashes.
4. Run Ticket 05's public pilot verifier and evidence validator at `--gate=all`.
5. Run all sensitivity cases through the public boundary.
6. Run `npm test`, `npm run typecheck`, `graphify update .`, and the required
   two-axis `code-review`.
7. Recheck every ticket checkbox, every proof ID, selected/passed/failed/
   unexecuted counts, command exit status, current revision, and artifact
   hashes. Only the evidence artifact may authorize GO.

## Spin-off prompts and second-pass changes

The user will provide the spin-off prompts and the resulting implementation
reports/commits after this file is created. Append each one here using this
record, without replacing earlier evidence:

```text
### Spin-off N — <short title>
Prompt source: <path or pasted prompt>
Claimed change: <what it was meant to fix>
Files changed: <exact paths>
Commit(s): <hashes, if any>
Tests/commands: <exact commands and exit status>
Evidence artifact: <path, schema, revision, hashes>
Independent verification still required: <what remains>
Reviewer notes: <false-green or scope concerns>
```

Do not convert a prompt, unit-test result, commit message, or final prose into
proof without an executed public/durable assertion and current-revision
evidence.

## Final handoff rule

After the spin-off prompts are appended, use this file only as navigation. Read
the authoritative ticket and gate/TDD documents at the relevant gate, inspect
the actual code and tests, prove each named red before any production fix, and
keep working until the evidence-backed completion state is genuinely proved.

## Git implementation history: Tickets 02-05

History was traced from the topology proof/architecture commits through HEAD
`411b956`. The commit titles are not acceptance evidence; they are the map for
checking which implementation and remediation rounds touched each boundary.

### Foundation and kernel before the product tickets

| Commit | Date | Round | Main result |
| --- | --- | --- | --- |
| `7a12ba7` | 2026-07-24 | kernel proof prototype | Initial topology conformance verifier, artifacts, and generality report |
| `5f74640` | 2026-07-24 | kernel proof rewrite | Generic compiler, primitive plugins, numerical solver, physical-conformance fixtures, and invalid-case fixtures |
| `10180ec` | 2026-07-24 | recipe contract | Declarative recipe schema, primitive registry, valid/invalid recipe fixtures |
| `36fb221` | 2026-07-25 | architecture lock | Production topology architecture and ubiquitous-language updates |
| `7fca842` | 2026-07-25 | Ticket 01 spine | Initial request service, topology types, and request-service tests |

### Ticket 02: worker implementation and remediation rounds

| Commit | Date | Round and intent |
| --- | --- | --- |
| `59efcee` | 2026-07-25 | Attempted a TypeScript composable worker seam and tests |
| `614a1c5` | 2026-07-25 | Reverted that attempt; it did not provide a trustworthy real compiler/solver path |
| `be21cf2` | 2026-07-25 | Replaced it with the pinned Python compiler, primitive registry, Netgen/NGSolve solver, runtime bundle, and real integration matrix |
| `1b5cef4` | 2026-07-26 | Hardened request/result/error protocol, durable artifacts, cancellation/error records, and report/test seams |
| `ef2c54f` | 2026-07-27 | Isolated artifact and runtime adapters from the application composition |
| `8e981cb` | 2026-07-27 | Added release preflight, atomic claims/publication, replay/hash/path checks, bounded JSONL, process-tree cancellation, and lifecycle/failure tests |

The important lesson is that `59efcee` is not part of the final worker design;
`614a1c5` explicitly removed it. The authorizing path must follow `be21cf2`
and its hardening commits, not the old composable TypeScript seam.

### Ticket 03: IFC opportunity/review to real Job flow

| Commit | Date | Round and intent |
| --- | --- | --- |
| `807ac0e` | 2026-07-25 | Initial IFC topology opportunity and compact confirmation domain seam |
| `c82849c` | 2026-08-01 | Connected topology review to Job/Revision persistence, workspace/API projection, and SQLite review storage |
| `2167c62` | 2026-08-01 | Hardened the HTTP/workspace persistence boundary and added contract tests |
| `49e8dc5` | 2026-08-01 | Persisted missing-revision topology rejection instead of losing the audit outcome |
| `697ca24` | 2026-08-01 | Completed the real localhost E2E path, report regeneration, opportunity projection, and restart/concurrency/corruption tests |
| `fc91464` | 2026-08-01 | Added canonical topology-result validation and hardened SQLite/review persistence identities |
| `e42488a` | 2026-08-01 | Preserved explicit uncertainty decisions and their persisted identity |
| `2cc70a2` | 2026-08-01 | Added regression coverage for persisted decision identity |
| `772e00b` | 2026-08-01 | Fixed preservation of topology authority states |

The original Ticket 03 verifier bypassed this path and used a fake/shallow
result. The relevant public proof is the later `697ca24` E2E plus the
validation/persistence fixes after it.

### Ticket 04: component knowledge and durable scenario remediation

| Commit | Date | Round and intent |
| --- | --- | --- |
| `e69dcc0` | 2026-07-25 | First bounded scenario-estimate implementation and in-memory knowledge base |
| `3fc7f45` | 2026-08-01 | Replaced hard-coded first-row/special-key parameter application with declarative scenario bindings |
| `fb67e5d` | 2026-08-02 | Recorded the Ticket 04 proof-gap incident in `context/error_logs.md` |
| `efb2008` | 2026-08-02 | Built the durable evaluation graph, SQLite repositories, promoted C-profile pattern, real scenario HTTP E2E, and independent oracle fixtures |
| `5218ae9` | 2026-08-02 | Completed the durable scenario path: aggregate, replay, promotion, report linkage, authoritative verifier, and evidence manifest |
| `3fd039f` | 2026-08-03 | Centralized component-evaluation identity derivation and added identity tests |
| `ce7e4c1` | 2026-08-03 | Hardened identity boundaries, public seam, SQLite validation, and recorded the durable-boundary lessons |
| `1cd8c39` | 2026-08-03 | Closed legacy reload and identity-validation gaps with corruption/reload tests |
| `39c720b` | 2026-08-03 | Fixed localhost lifecycle contention and added fresh lifecycle proof |

Ticket 09 is the remediation wrapper around this sequence. The first `e69dcc0`
scenario arithmetic is not sufficient by itself; the durable path begins at
`efb2008` and is completed/hardened by `5218ae9`, `3fd039f`, `ce7e4c1`,
`1cd8c39`, and `39c720b`.

### Ticket 05: operational pilot and reporting

| Commit | Date | Round and intent |
| --- | --- | --- |
| `9768df5` | 2026-08-03 | Added the component-topology foundation gate/verifier |
| `f206532` | 2026-08-03 | Corrected flat protected-state observations in the foundation verifier |
| `a062e93` | 2026-08-03 | Closed component-topology proof gaps and strengthened public E2E/foundation references |
| `62d4acf` | 2026-08-03 | Refreshed identity-remediation evidence |
| `411b956` | 2026-08-04 | Connected server-owned pilot policy, durable pilot records/events, validated report projection, lifecycle/retry/health/cleanup/rollback behavior, public verifier, evidence validator, and Ticket 05 proof tests |

The standalone in-memory pilot from the earlier failed attempt is not the
authorizing implementation. The final pilot path is the `411b956` composition
over the durable Ticket 04 and Ticket 02/03 boundaries.

## Repeated-file remediation chains

These are the files that received multiple implementation/fix rounds and must
be reviewed as histories rather than as isolated final snapshots.

### Request and worker boundary

```text
src/application/topology/createTopologyAnalysisRequestService.ts
  7fca842 -> 59efcee -> 614a1c5 -> be21cf2 -> 1b5cef4
  -> ef2c54f -> 8e981cb -> c82849c -> 697ca24 -> fc91464
  -> efb2008 -> 411b956

src/domain/topology/topologyTypes.ts
  7fca842 -> 59efcee -> 614a1c5 -> be21cf2 -> 1b5cef4
  -> 8e981cb -> fc91464 -> 411b956

src/infrastructure/topology/createProvenPythonTopologyWorker.ts
  be21cf2 -> 8e981cb -> efb2008

src/infrastructure/topology/python/topology_worker.py
  be21cf2 -> 1b5cef4 -> 8e981cb
```

### HTTP, Job, and review persistence boundary

```text
src/app/http/httpServer.ts
  1b5cef4 -> ef2c54f -> c82849c -> 2167c62 -> 697ca24
  -> fc91464 -> efb2008 -> 5218ae9 -> 39c720b -> a062e93 -> 411b956

src/application/topology/submitJobTopologyReview.ts
  c82849c -> 49e8dc5 -> 697ca24 -> fc91464 -> e42488a
  -> efb2008 -> 5218ae9 -> 411b956

src/infrastructure/persistence/sqlite/SqliteJobRepository.ts
  c82849c -> 2167c62 -> fc91464 -> e42488a -> efb2008
  -> 39c720b -> 411b956

src/infrastructure/persistence/sqlite/SqliteComponentEvaluationRepository.ts
  efb2008 -> ce7e4c1 -> 1cd8c39
```

### Knowledge, identity, aggregate, and report boundary

```text
src/domain/topology/componentKnowledgeBase.ts
  e69dcc0 -> 3fc7f45 -> efb2008

src/domain/topology/componentEvaluationRecords.ts
  efb2008 -> 3fd039f -> ce7e4c1 -> 1cd8c39

src/domain/topology/componentPatternInterpreter.ts
  efb2008 -> 5218ae9

src/application/topology/replayJobComponentEvaluation.ts
  5218ae9

src/application/reports/generateHtmlReport.ts
  1b5cef4 (topology projection seam; later reports consume validated persisted
  results through the Job path)

scripts/verify-preliminary-topology-pilot.ts
  411b956

scripts/verify-preliminary-topology-pilot-evidence.ts
  411b956
```

## How to use this history in final review

For each repeated-file chain, inspect the first implementation, the named
failure-fix commits, and the current version. Specifically check that:

1. the reverted TypeScript worker cannot be reached by production composition;
2. every successful numerical result still originates in the pinned Python
   worker and frozen oracle;
3. every Ticket 03/04/05 result is linked to immutable Job, Revision, evidence,
   Recipe, request, result, artifact, and report identities;
4. the later identity/lifecycle fixes are present in the current public path,
   not merely in isolated tests;
5. the current proof artifacts were generated after the last implementation
   commit and match the current revision;
6. unrelated pre-existing files are not included in any remediation commit.

Useful commands for the reviewing agent:

```text
git show --stat <commit>
git show <commit> -- <file>
git log --follow --date-order --format='%h %ad %s' --date=short -- <file>
git diff <first-ticket-commit>..HEAD -- <file>
```
