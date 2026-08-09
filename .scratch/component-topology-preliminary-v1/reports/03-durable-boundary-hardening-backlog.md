# Durable boundary hardening backlog

Date: 2026-07-27

Status: **follow-up backlog; no changes in this report are implemented yet**

## Purpose

Ticket 02 now has the strongest durable-boundary behavior in the repository. This
report records the known weaknesses found in the rest of the application so they
can be treated as later hardening work rather than being forgotten.

The comparison standard is the Ticket 02 boundary:

- one logical request is executed once, even across retries or processes;
- durable records are published atomically, never half-published;
- artifacts have identity, hashes, and integrity checks;
- cancellation, timeout, crash, and malformed output are explicit outcomes;
- failed work cannot look like a successful calculation;
- old IFC evidence, layer-only snapshots, active Revisions, and historical
  Revisions are preserved;
- public-seam tests prove the behavior against independent failure cases.

This backlog follows the active working contract in
`context/working-contract.md`: immutable IFC evidence comes before review state,
calculation snapshots, and reports; optional topology remains an enrichment and
never replaces the layer-only snapshot.

## Executive assessment

The repository is uneven rather than uniformly unsafe:

| Boundary | Assessment | Why |
| --- | --- | --- |
| Topology request and Python worker | Strong | Atomic claims, durable replay, hashes, runtime preflight, bounded protocol output, cancellation, and strict no-value-on-failure behavior are implemented. |
| IFC evidence artifacts | Medium | Evidence has good provenance and completeness labels, but publication is direct and the manifest has no per-file integrity hashes. |
| Revision files and active index | Medium-low | Revision identity and parent links exist, but revision and index writes are not atomic and index corruption is hidden. |
| Job creation and processing | Medium-low | SQLite persistence exists, but scheduling, claiming, retries, and multi-step publication are not durable. |
| Thermal-treatment result path | Medium | Pack validation and trust reasons are good, but invalid worker output can still carry a numeric U-value and the reference worker is not a production-grade process boundary. |
| HTTP/upload boundary | Low | Request bodies are unbounded, JSON errors are not classified as client errors, and file/path checks are weaker than the topology artifact checks. |
| Viewer cache and generated reports | Acceptable for derived data, not for source of truth | They can be rebuilt, but writes are not atomic and failures are often hidden or leave orphaned artifacts. |

## Findings

### DB-01 — IFC evidence is not atomically published

**Priority:** P0 for production evidence; P1 for the current local prototype

**Evidence:** [writeIfcEvidenceArtifacts.ts](C:/dev/conformity/src/infrastructure/storage/local-files/writeIfcEvidenceArtifacts.ts:60)

The writer creates the final evidence directory and writes the manifest, file,
element, type, candidate, diagnostic, and missing-datapoint files one at a time.
If the process stops after some writes, the final directory can contain a partial
set. A later reader has no committed marker that says the complete set is ready.

The manifest records schema and rule versions, but does not record a byte size or
SHA-256 for every file. A changed artifact can therefore be read as if it were
the original evidence.

**Required hardening:** write to a job/file-hash temporary directory; write a
manifest containing every file path, size, and hash; fsync/close where the target
storage requires it; publish with an atomic rename; reject incomplete or changed
sets on read.

**Required tests:** interrupted write, missing file, changed file, wrong path,
symlink/outside-root path, and two concurrent writers for the same file hash.

### DB-02 — Revision publication and the active index are not one atomic operation

**Priority:** P0

**Evidence:** [writeRevisionArtifacts.ts](C:/dev/conformity/src/infrastructure/storage/local-files/writeRevisionArtifacts.ts:12)

The revision JSON is written first and the active index is written afterwards.
There is no temporary directory, commit marker, atomic rename, or recovery record.
The database can point to a revision/report while the file operation is still
incomplete, or a process can leave an unindexed revision behind.

**Required hardening:** publish a revision bundle containing the revision file,
index entry, and report metadata together. Update the database pointer only after
the bundle is committed and verified. Keep old revision files untouched.

**Required tests:** stop between each write, report-write failure, database-update
failure, concurrent revisions, and restart recovery.

### DB-03 — Corrupt revision indexes are silently replaced

**Priority:** P0

**Evidence:** [writeRevisionArtifacts.ts](C:/dev/conformity/src/infrastructure/storage/local-files/writeRevisionArtifacts.ts:51)

`readExistingIndex()` catches every error and returns an empty index. A missing
index and a malformed/corrupt index are treated as the same thing. Writing the
next revision can therefore erase the discoverable list of historical revisions.

**Required hardening:** distinguish `ENOENT` from parse, schema, permission, and
integrity errors. Missing may be initialized; corruption must fail closed and
produce a recovery diagnostic. Never replace a corrupt index automatically.

**Required tests:** malformed JSON, valid JSON with the wrong shape, missing
revision file referenced by the index, and duplicate/unknown revision IDs.

### DB-04 — Job creation can orphan an upload

**Priority:** P1

**Evidence:** [createJob.ts](C:/dev/conformity/src/application/jobs/createJob.ts:6)

The upload is written before the SQLite Job row is created. If the database
insert fails, the upload remains without a Job record. There is no durable
cleanup or reconciliation record for that orphan.

**Required hardening:** use a staging upload plus a durable creation transaction,
or add a reconciliation process that identifies and safely cleans abandoned
uploads. Do not delete anything that could still belong to a live Job.

**Required tests:** database failure after upload, process crash between upload
and row creation, duplicate create attempts, and restart cleanup.

### DB-05 — Job processing has no durable execution claim

**Priority:** P0 when more than one process or instance can run

**Evidence:** [createJob.ts](C:/dev/conformity/src/application/jobs/createJob.ts:31),
[processIfcJob.ts](C:/dev/conformity/src/application/jobs/processIfcJob.ts:30)

Processing is scheduled with `setTimeout`. There is no queue record, lease,
worker ID, compare-and-set status transition, attempt number, or recovery of a
Job left in `processing`. A retry or a second process can run the same Job at the
same time.

**Required hardening:** add a durable claim with owner, lease expiry, attempt,
and heartbeat/recovery rules. Make transitions conditional on the claimed owner.
Make repeated submission return the existing result instead of starting another
calculation.

**Required tests:** two workers claiming one Job, worker crash while processing,
expired lease recovery, retry after failure, and duplicate HTTP submission.

### DB-06 — Job artifacts and database state can disagree

**Priority:** P0 for completed reports; P1 for the prototype

**Evidence:** [processIfcJob.ts](C:/dev/conformity/src/application/jobs/processIfcJob.ts:93),
[generateHtmlReport.ts](C:/dev/conformity/src/application/reports/generateHtmlReport.ts:10)

The workflow writes evidence, requested-input JSON, revision JSON, report HTML,
and SQLite fields in separate steps. A failure can leave an unreferenced revision,
an orphan report, or a database row that says `completed` while an artifact is
missing. The rollback in `completeJobWithReviewInputs()` restores some database
fields, but does not remove or quarantine every artifact written before the
failure.

**Required hardening:** use a staged Job artifact bundle with a manifest and a
single publication step; update the Job row only after verification; retain
failed attempts in an explicit failed-attempt directory instead of mixing them
with the active publication.

**Required tests:** revision succeeds/report fails, report succeeds/database
update fails, missing active revision on restart, and recovery from a staged
bundle.

### DB-07 — SQLite repository has no state-transition or operation idempotency guard

**Priority:** P1

**Evidence:** [SqliteJobRepository.ts](C:/dev/conformity/src/infrastructure/persistence/sqlite/SqliteJobRepository.ts:24)

The repository stores Jobs and review/topology payloads, but updates are generic
field updates. There is no allowed-transition table, revision/version column,
operation identity, or transaction covering related Job and review changes.
`saveReviewState()` is an upsert, while topology reviews are inserted with a new
random ID, so repeated submissions can create duplicate durable reviews.

**Required hardening:** add explicit transition commands, optimistic version or
lease checks, operation/idempotency keys, and transactions for related updates.
Define whether review state is mutable projection data or an immutable event.

**Required tests:** illegal transitions, stale writers, repeated review submission,
duplicate topology submission, and rollback of multi-table operations.

### DB-08 — Invalid thermal-worker results can still contain a numeric U-value

**Priority:** P0

**Evidence:** [OpenSource2dCalculationWorker.ts](C:/dev/conformity/src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.ts:27),
[runThermalTreatment.ts](C:/dev/conformity/src/domain/thermal-treatment/runThermalTreatment.ts:20)

The worker returns `1e-12` from its invalid path. The generic runner only checks
that the value is finite and positive, so an invalid geometry or timeout can still
be carried into a Calculation Snapshot as a number. Trust metadata says the
worker was invalid, but the number can still be mistaken for a result by a caller
or report.

**Required hardening:** make the worker result a tagged union. A failed/invalid
solve must have `effectiveUValueWPerM2K: null`; the runner must reject any result
whose validity is false or whose numerical proof is incomplete. Do not use a
sentinel number for failure.

**Required tests:** invalid geometry, timeout, non-convergence, missing artifacts,
and malformed numerical evidence must all publish no numeric U-value.

### DB-09 — Thermal-treatment worker lifecycle is weaker than the topology worker

**Priority:** P1

**Evidence:** [OpenSource2dCalculationWorker.ts](C:/dev/conformity/src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.ts:10),
[httpServer.ts](C:/dev/conformity/src/app/http/httpServer.ts:54)

The reference worker runs in-process TypeScript, writes artifacts directly into
timestamped directories, and has no external cancellation signal or process
boundary. The working contract says these reference adapters are development/test
seams; the localhost application currently wires one into the application path.

This is acceptable as a clearly labelled prototype, but it is not equivalent to
the pinned, independently verified Python boundary used by Ticket 02.

**Required hardening:** keep the adapter explicitly non-production, or promote a
release-owned worker with identity pinning, bounded lifecycle, artifact hashes,
and independent verification. Add cancellation and restart behavior before using
it for unattended production work.

### DB-10 — Upload and JSON request bodies are unbounded

**Priority:** P1

**Evidence:** [multipartUpload.ts](C:/dev/conformity/src/app/http/multipartUpload.ts:4),
[httpServer.ts](C:/dev/conformity/src/app/http/httpServer.ts:285)

`readBuffer()` collects the entire request in memory. Multipart parsing and JSON
parsing do not enforce a maximum body size, field count, or parsing time. A large
or repeated request can exhaust memory before the application reaches a domain
validation step.

**Required hardening:** enforce byte limits while streaming, reject oversized
requests with a stable 413 response, cap JSON size, and set request timeouts.

**Required tests:** body exactly at the limit, one byte over, many multipart
parts, slow/incomplete bodies, and malformed JSON.

### DB-11 — Upload path containment and source integrity are weaker than artifact checks

**Priority:** P1

**Evidence:** [jobFileStorage.ts](C:/dev/conformity/src/infrastructure/storage/local-files/jobFileStorage.ts:25)

The upload filename is sanitized, which is good, but `readUpload()` checks that
the path merely includes the Job ID. It does not resolve the path and verify that
it remains below the configured storage root and the specific Job upload folder.
The stored `fileHash` is not rechecked when the file is later read.

**Required hardening:** resolve and contain paths, reject symlinks/outside-root
files, and verify the stored SHA-256 before extraction, download, or geometry
generation. Treat a mismatch as an integrity failure, not as a missing file.

**Required tests:** `..` paths, sibling Job paths containing the same ID text,
symlinks, replaced upload bytes, and missing upload files.

### DB-12 — Reports are directly overwritten and are not integrity-addressed

**Priority:** P1 for audit-grade reports; P2 for disposable UI output

**Evidence:** [generateHtmlReport.ts](C:/dev/conformity/src/application/reports/generateHtmlReport.ts:20)

Reports are derived from a Revision, but they are written directly to their final
path. There is no report manifest, content hash, or atomic publication marker.
The database stores a path, not the report identity and hash. A changed report
can therefore be served for the same Revision without detection.

**Required hardening:** write report HTML to a temporary path, publish atomically,
record its hash and source Revision ID, and verify the hash before serving.

### DB-13 — Viewer cache failures are silently hidden

**Priority:** P2 because this is derived/cache data

**Evidence:** [viewerGeometryCache.ts](C:/dev/conformity/src/infrastructure/storage/local-files/viewerGeometryCache.ts:22)

Cache reads catch every error and return `null`, making corruption, permission
errors, and an absent cache look identical. Cache writes are direct and do not
use a temporary file or hash.

**Required hardening:** keep cache misses recoverable, but classify corruption
separately, write atomically, and log a diagnostic that includes the Job and file
hash. Never let a cache failure change calculation truth.

### DB-14 — Review-state persistence is mutable without provenance or versioning

**Priority:** P1

**Evidence:** [jobRepository.ts](C:/dev/conformity/src/domain/jobs/jobRepository.ts:11),
[reconcileJobReviewPlan.ts](C:/dev/conformity/src/application/jobs/reconcileJobReviewPlan.ts:30)

Review state is updated in place when the plan or material library changes. That
can be correct for a working projection, but the stored record does not include
the source evidence hash, plan input hash, author/operation identity, or previous
state. A later reader cannot prove which evidence and rules produced the current
requested inputs.

**Required hardening:** record source evidence hash, plan version, material library
version, created/updated operation IDs, and either immutable state events or a
versioned projection with an audit trail.

### DB-15 — Some public tests trust fakes instead of proving the durable contract

**Priority:** P1 for verification quality

**Evidence:** [topologyScenarioEstimates.test.ts](C:/dev/conformity/tests/topologyScenarioEstimates.test.ts:16),
[sqliteJobRepository.test.ts](C:/dev/conformity/tests/sqliteJobRepository.test.ts:8),
[ifcEvidenceArtifacts.test.ts](C:/dev/conformity/tests/ifcEvidenceArtifacts.test.ts:9)

The topology scenario tests use a fake request seam and return `evidence: null`
for a successful result. SQLite tests cover CRUD behavior but not concurrent
claims, transactions, corruption, or restart recovery. IFC artifact tests check
file presence and JSON contents but not interrupted publication or hashes.

**Required hardening:** keep unit tests, but add public-seam tests that use real
artifact stores and failure injection. Add independent fixtures for evidence,
revision, Job, and thermal-worker paths. A fake should be allowed to stand in for
the worker only when the contract validator still proves the complete result.

### DB-16 — HTTP errors are not classified at the delivery boundary

**Priority:** P2

**Evidence:** [httpServer.ts](C:/dev/conformity/src/app/http/httpServer.ts:59)

The server catches all thrown errors and returns status 500. Invalid input,
missing Jobs, stale revisions, oversized bodies, and server/storage failures are
not separated into stable 4xx/5xx categories. The response also exposes raw error
messages, which makes the delivery contract depend on implementation text.

**Required hardening:** define an application error envelope with stable codes,
map validation/stale/not-found/conflict/size errors to 4xx, keep internal details
in diagnostics, and test the HTTP contract.

## Recommended implementation order

1. **Protect source of truth:** DB-01, DB-02, DB-03, DB-06, and DB-08.
2. **Make Job execution durable:** DB-04, DB-05, and DB-07.
3. **Close input and file-integrity gaps:** DB-10 and DB-11.
4. **Harden derived publication:** DB-09 and DB-12.
5. **Improve observability and verification:** DB-13, DB-14, DB-15, and DB-16.

## Suggested later tickets

- **Ticket A:** Atomic evidence and revision publication with manifests and
  recovery.
- **Ticket B:** Durable Job claims, retries, and state transitions.
- **Ticket C:** Thermal-treatment worker failure contract and release boundary.
- **Ticket D:** HTTP body limits, typed errors, and upload integrity checks.
- **Ticket E:** Report/cache integrity and review-state provenance.
- **Ticket F:** Failure-injection and restart verification matrix for all durable
  boundaries.

## Non-goals

- Do not weaken or replace the Ticket 02 topology worker hardening.
- Do not move geometry or numerical physics into TypeScript.
- Do not delete existing evidence or historical Revisions while repairing their
  publication mechanics.
- Do not treat a green happy-path test as proof of crash/retry safety.

## Reference implementation already meeting the stronger standard

See the [Ticket 02 hardening decision report](C:/dev/conformity/.scratch/component-topology-preliminary-v1/reports/02-composable-2d-topology-worker-hardening-report.md)
for the current example of atomic claims, replay verification, runtime pinning,
cancellation, failure classification, and preservation checks.
