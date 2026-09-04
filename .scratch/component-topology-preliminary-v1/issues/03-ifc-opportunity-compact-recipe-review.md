# 03 - Connect IFC opportunity review to the real localhost job and persistence flow

**What to build:** A user opens a real localhost IFC job, reviews a detected repeating-component opportunity, confirms values or selects `I do not know`, and receives a persisted/reloadable topology outcome linked to the correct Job, source Revision, Assembly Group, opportunity, Recipe, and worker evidence. The layer-only Calculation Snapshot remains separate and unchanged.

**Blocked by:** 02 - Prove the pinned Python topology worker through the production request seam.

**Status:** ready-for-agent

## Current implementation and resumption point

Partial Ticket 03 code now exists:

- an application use case loads a Job, active Revision, stored Calculation Input Evidence, validates opportunity/signature ownership, derives an idempotency key, submits topology, and saves a topology review;
- the Job repository exposes topology-review save/list operations and SQLite stores review payloads;
- localhost GET/POST topology-review endpoints exist;
- the Job workspace includes topology reviews;
- a focused regression command can invoke the real request service and Python worker.

This is not completion. Resume by repairing the ownership and durable-behavior failures below, then replace the direct-service regression with a real localhost Job-to-restart verifier.

## Exact prior failures

- Earlier tests injected a fake request service that returned success without HTTP, Python, SQLite, restart, or report traversal.
- The current application use case directly imports filesystem-backed artifact readers, violating the application/domain/infrastructure boundary.
- Invalid, stale, or wrong-owner submissions currently throw before an auditable rejected outcome is persisted.
- Result completeness checks accept shallow string-shaped outcomes instead of applying the canonical result/evidence validator.
- The named localhost regression invokes the request service directly; it does not create a Job, call the HTTP endpoint, reload SQLite, or read the report/workspace path.
- The default localhost runtime can fall back to a scratch virtual environment instead of one release-owned runtime configuration.
- Review persistence is an opaque payload without enough enforced relational identity and replay/concurrency proof.
- `I do not know` and unsupported cases are not mapped to a complete persisted outcome matrix.

## Invariants

- HTTP translates transport only; application coordinates ports; domain owns deterministic review/authority rules; infrastructure owns SQLite, files, Python, and IFC mechanics.
- The application layer imports no filesystem, path, SQLite, HTTP, or concrete artifact adapters.
- A topology review is always bound to one existing Job, active source Revision, Assembly Group, opportunity identity, and unchanged construction signature.
- IFC-derived, user-confirmed, missing, estimated, and conflicting authority states remain distinct and domain-visible.
- Caller input cannot supply trusted provenance, bundle identity, artifact paths, or arbitrary Recipe JSON.
- Safe-to-identify invalid/stale submissions become persisted `rejected` reviews with stable diagnostics instead of uncaught exceptions.
- `I do not know` becomes `blocked` unless a later promoted pattern explicitly supports bounded scenarios.
- Every declared outcome is persisted and reloadable after a new repository/server instance.
- One semantic review submission produces one immutable review/request/result under sequential, restart, and concurrent replay.
- Topology enrichment never mutates IFC Evidence, active/historical Revisions, or layer-only Calculation Snapshots.

## Outcome and failure matrix

| Case | Required durable outcome | Public-seam evidence |
| --- | --- | --- |
| Valid stored opportunity and complete supported answers | `preliminary-unsafe` | Real HTTP call, real Python evidence, SQLite review/result, restart/reload |
| `I do not know` for a critical unsupported input | `blocked` | Persisted missing key and decisive next input, no worker call, no U-value |
| Missing or conflicting authority | `blocked` or `rejected` according to domain rule | Persisted diagnostics and unchanged source evidence |
| Wrong Job, Revision, Assembly Group, opportunity, or signature | `rejected` | Persisted stable ownership/staleness code, no worker call |
| Invalid answer shape or impossible value | `rejected` | HTTP response plus persisted rejection artifact |
| Unsupported primitive/pattern vocabulary | `blocked` or `rejected` | Stable reason, no family geometry added outside registered vocabulary |
| Worker rejection | `rejected` | Persisted request/result identities, no U-value |
| Worker unavailable/crash/malformed output | `failed` | Persisted failure and diagnostics, no U-value |
| Deadline exceeded | `failed` | Propagated deadline, no partial result |
| Cancellation | `cancelled` | Propagated cancellation, persisted state, no partial result |
| Equal sequential/restarted/concurrent review | Same immutable review/result | One review identity, one worker invocation, reload equality |
| Persisted review/result corruption | Refused reload/use | Stable corruption failure and no displayed/reused U-value |

## Implementation instructions

1. Create domain/application ports for loading immutable review evidence and Revision snapshots. Move all concrete file access behind infrastructure adapters.
2. Define a durable topology-review state machine and map each matrix row to a stable outcome/code/diagnostic and persisted record.
3. Validate HTTP body shape, then load all authoritative identities from the server-side Job. Never trust caller-authored provenance or bundle fields.
4. Persist the attempted review identity before processing when enough identity is known. Convert safe validation failures into rejected records and transport responses.
5. Reuse the canonical topology result/evidence validator from Ticket 02. Do not maintain a shallow second validator.
6. Enforce relational links among Job, source Revision, Assembly Group, opportunity/signature, answers, Recipe hash, bundle, request, result, and artifacts.
7. Add a transactional per-semantic-submission idempotency strategy that covers simultaneous HTTP requests and restart replay.
8. Select the release-owned worker configuration at composition root. Development overrides must be explicit and never silently use a scratch runtime.
9. Keep `I do not know` honest: block with a decisive input in this ticket unless Ticket 04 later supplies a promoted bounded pattern.
10. Add read endpoints/workspace projection that load persisted reviews and results. UI/report callers must never construct successful results.
11. Build one real verifier: create/process a Job, detect an opportunity from stored evidence, POST review over localhost HTTP, invoke Python, persist, stop/recreate server/repository, GET/reload, and feed the persisted result to report input.
12. Run every matrix row through the public HTTP seam where applicable and assert protected-state hashes.

## Acceptance criteria

- [ ] Every invariant has a named test and every matrix row has observable public-seam evidence.
- [ ] Application/domain code has no concrete filesystem, SQLite, HTTP, process, or IFC-adapter imports.
- [ ] A real Job exposes an opportunity derived only from stored IFC Evidence.
- [ ] Valid confirmation reaches the real pinned worker and persists complete evidence.
- [ ] Invalid, stale, wrong-owner, missing, and conflicting submissions persist honest outcomes instead of escaping as unaudited exceptions.
- [ ] Every declared outcome reloads after repository/server restart.
- [ ] Sequential, restarted, and concurrent replay produce one immutable review/request/result.
- [ ] Corrupted review/result evidence is refused and cannot display a U-value.
- [ ] IFC Evidence and active/historical layer-only Revisions remain byte-for-byte unchanged.
- [ ] The authoritative verifier crosses HTTP, Job repository, artifact store, Python, restart, reload, and report input; fake services count only as unit tests.
- [ ] Focused verifier, Ticket 02 verifier, full suite, and typecheck pass.

## Required completion artifact

Return a Markdown integration report containing the invariant-to-test map, complete outcome matrix, ownership-boundary check, HTTP contract, persisted relationship map, one full evidence-to-report trace, restart/concurrency/corruption evidence, worker invocation counts, protected-state hashes, exact command summaries, and final readiness decision.

