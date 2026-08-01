# Ticket 03 integration report

## Readiness decision

**Not ready for release.** The repository now has an application-owned immutable-evidence port and durable relational review identity/idempotency fields, but the ticket's required real localhost Job-to-restart verifier and its full HTTP outcome matrix have not yet been added. This report records the verified boundary hardening without representing it as ticket completion.

## Invariant-to-test map

| Invariant | Evidence |
| --- | --- |
| Canonical worker evidence is required for a successful result | `tests/topologyAnalysisRequest.test.ts` |
| Failed/blocked/rejected/cancelled results have no U-value | `tests/topologyAnalysisRequest.test.ts` |
| Request artifacts are replayable and corruption is refused | `tests/topologyHardening.test.ts` |
| Equal worker requests share one artifact outcome | `tests/topologyAnalysisRequest.test.ts`, `tests/topologyHardening.test.ts` |
| SQLite Job storage survives normal repository use | `tests/sqliteJobRepository.test.ts` |
| Compact unknown answers block rather than invoke the worker | `tests/ifcTopologyOpportunity.test.ts` |

## Ownership boundary check

`submitJobTopologyReview` now depends on `TopologyReviewEvidenceLoader`, an application port. `createLocalTopologyReviewEvidenceLoader` is the local-files adapter composed at the HTTP root. The application module no longer imports local paths, filesystem APIs, or a concrete artifact store.

## Persisted relationship map

`job_topology_reviews` records `job_id`, `source_revision_id`, `source_assembly_group_id`, `opportunity_id`, `construction_signature`, and a per-Job semantic `idempotency_key`, in addition to the immutable review payload. SQLite enforces unique non-empty `(job_id, idempotency_key)` keys (preserving legacy rows migrated with an empty key) and repository replay returns the existing review after a concurrent insert winner.

## HTTP contract

`GET /api/jobs/:jobId/topology-reviews` returns stored reviews. `POST /api/jobs/:jobId/topology-reviews` derives the opportunity, active revision, assembly group, recipe, and idempotency identity from server-held Job evidence; the caller supplies only the compact answer values and candidate identity.

## Outcome matrix status

Worker-level success, blocked, rejected, failed, cancelled, deadline, replay, and artifact-corruption behavior are covered by the existing request-service test suite. Stale source revisions now persist and replay a rejected review before evidence is loaded. The remaining Job HTTP matrix (including malformed-body persistence) and real localhost restart verifier remain the release blockers.

## Commands

- `npm run typecheck` — passed.
- `npx vitest run tests/topologyAnalysisRequest.test.ts tests/topologyHardening.test.ts tests/sqliteJobRepository.test.ts tests/ifcTopologyOpportunity.test.ts` — 21 passed.
- `npm test` — 44 files / 161 tests passed in 92.07 seconds.
- `graphify update .` — completed; no code-graph topology changes detected.

## Protected state and worker evidence

The existing request tests assert immutable layer-only snapshot preservation and no U-value/evidence for non-success results. No new protected-state hash or real-localhost worker invocation count was produced in this slice; those are required from the missing end-to-end verifier before readiness can change.
