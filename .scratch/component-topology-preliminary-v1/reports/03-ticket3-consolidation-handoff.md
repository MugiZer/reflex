# Ticket 3 consolidation handoff

Use this handoff together with:

- Issue: `.scratch/component-topology-preliminary-v1/issues/03-ifc-opportunity-compact-recipe-review.md`
- Current implementation commit: `c82849c`
- Integration report: `.scratch/component-topology-preliminary-v1/reports/03-ifc-opportunity-compact-recipe-integration-report.md`

## Current state

Ticket 3 has a committed partial implementation. It adds the Job topology-review use case, an application-owned immutable-evidence port, local infrastructure adapter, SQLite review persistence, relational identity columns, idempotency lookup, workspace/API projection, and stale-revision rejection persistence.

Verified at commit time:

- `npm test`: 44 files / 161 tests passed
- `npm run typecheck`: passed
- `graphify update .`: completed

## Required consolidation before Ticket 4

1. Build the real public-seam verifier: create/process a Job, derive an opportunity from stored evidence, POST over localhost HTTP, invoke the pinned Python worker, persist in SQLite, stop/recreate the repository/server, GET the review, and feed the persisted result into report input.
2. Complete the HTTP outcome matrix: valid success, `I do not know` blocked, missing/conflicting authority, wrong Job/Revision/Assembly Group/opportunity/signature, malformed answers, unsupported vocabulary, worker rejection, worker failure, deadline, cancellation, restart replay, concurrent replay, and corruption refusal.
3. Persist the attempted review identity before worker processing so a crash cannot erase the audit record.
4. Make idempotency atomic across concurrent HTTP requests and independent service instances; prove one review/request/result and one worker invocation.
5. Preserve canonical worker rejection/failed result identities and diagnostics instead of collapsing them into a local rejection with `topologyResult: null`.
6. Replace shallow SQLite payload checks with canonical topology-result/evidence validation; reject unknown outcomes, inconsistent identities, corrupted payloads, and any result that could expose a U-value.
7. Enforce relational identity consistency (Job, source Revision, Assembly Group, opportunity/signature, Recipe, request/result/artifacts) and enable SQLite foreign keys.
8. Remove remaining concrete filesystem/artifact imports from application code, especially `src/application/jobs/getJobWorkspace.ts`.
9. Validate answer vocabulary and types strictly; unknown keys and invalid boundary/member values must become durable stable rejections.
10. Preserve explicit authority states. Missing/conflicting layer authority must not silently disappear during opportunity detection, and generated geometry/provenance must be verified against the real worker.

## Review findings to keep visible

- HTTP currently maps thrown validation errors through a blanket 500 path.
- Persisted review validation is shallow and can drift from relational columns.
- The current commit is not release-ready despite its focused tests passing.

Do not start the next ticket until the acceptance checklist in the issue and the items above have public-seam evidence.
