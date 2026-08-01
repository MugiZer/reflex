# Ticket 03 integration report

## Readiness decision

**Ready to proceed to Ticket 04.** The real Ticket 03 product path now crosses Job creation, stored IFC-derived calculation evidence, server-derived opportunity projection, localhost HTTP review, the pinned Python topology worker, SQLite persistence, repository/server restart, workspace reload, and regenerated report input. The regression also closes the false-green gap left by the former direct request-service verifier.

## Root cause

The earlier verifier bypassed the product path and accepted a shallow fake result. That hid three connected defects:

1. the Job workspace did not expose authoritative topology opportunities;
2. compact confirmation copied raw IFC material labels into a worker contract that accepts only pinned material-pack identifiers, causing the real request to reach its 120-second deadline;
3. saved topology results were never supplied to report regeneration.

The fix projects opportunities from stored evidence, maps only registered material vocabulary while rejecting unsupported values, rebuilds the active report from persisted review results, and verifies immutable worker artifacts before workspace display.

## Invariant-to-test map

| Invariant | Public evidence |
| --- | --- |
| Opportunity comes only from stored IFC evidence | `tests/topologyReviewJobE2e.test.ts` creates/processes a Job and reads `topologyOpportunities` from `GET /api/jobs/:id` |
| Caller cannot author Recipe/bundle/provenance | HTTP body contains only candidate identities and compact answers; the server creates the Recipe and uses `PROVEN_TOPOLOGY_BUNDLE` |
| Valid review reaches the pinned worker | The test uses `createProvenPythonTopologyWorker` and requires complete canonical geometry/numerical evidence |
| Unknown critical input remains honest | HTTP `i-dont-know` persists `blocked`, lists `memberWidthM`, and invokes no worker |
| Wrong ownership is rejected | Wrong Assembly Group persists `rejected/wrong_assembly_group` and invokes no worker |
| Malformed answers are auditable | Safely identified nested answer input persists `rejected/invalid_answer_shape` |
| Layer-only state is unchanged | Workspace assembly projection is byte-equal before review and after restart |
| Equal replay is immutable | Sequential restart plus two concurrent independent localhost apps return one review identity |
| One semantic review invokes one worker | Invocation count remains exactly `1` after restart and concurrent replay |
| Corruption cannot expose a U-value | Removing a worker artifact makes workspace GET fail closed; response contains no topology U-value |
| Report uses persisted topology result | Restarted `GET /report` contains the preliminary result and persisted request identity |

## HTTP contract

- `GET /api/jobs/:jobId` includes server-derived `topologyOpportunities`, durable `topologyReviews`, and the unchanged layer-only workspace.
- `POST /api/jobs/:jobId/topology-reviews` accepts candidate identity plus compact answers only.
- `GET /api/jobs/:jobId/topology-reviews` reloads terminal durable outcomes.
- Missing Jobs return `404`; safely identifiable invalid answers return a durable rejected review; internal/integrity failures remain `500` and expose no result value.

## Persisted relationship and evidence trace

`Job -> active Revision -> Calculation Input Evidence -> Assembly Group -> IFC opportunity/signature -> compact answers -> canonical Recipe hash -> pinned bundle -> request/result artifact manifest -> Job topology review -> regenerated report`.

SQLite relational identity is checked against the immutable payload. Workspace reads then re-open the topology manifest, verify its hash and file index, compare the artifact result with the Job review, and re-run worker-artifact verification before returning the review.

## Outcome matrix evidence

| Case | Durable/public result |
| --- | --- |
| Complete supported answers | `preliminary-unsafe`, complete evidence, report projection |
| `I do not know` | `blocked`, decisive missing key, no worker call |
| Wrong Assembly Group | `rejected/wrong_assembly_group`, no worker call |
| Malformed answer value | `rejected/invalid_answer_shape`, reloadable |
| Unsupported/unknown material vocabulary | `rejected/unsupported_material_vocabulary`, no worker request |
| Worker rejection/failure/deadline/cancellation | Canonical request-service matrix remains covered by `topologyAnalysisRequest.test.ts`, `topologyHardening.test.ts`, and `provenPythonTopologyWorker.integration.test.ts`; HTTP persists the returned canonical result without collapsing its identity |
| Restart/concurrent replay | Same review/request/result; one worker invocation |
| Corrupt worker artifact | Workspace reload refused; no displayed/reused U-value |

## Protected-state hashes and counts

- Uploaded IFC fixture SHA-256: `a26725e6a1bf1cea2f772397046a551e9a19da70935733ae84e87bff3171f309`.
- Layer-only workspace projection: asserted byte-equal before review and after repository/server restart.
- Worker invocation count: exactly `1` across initial submission, restart, and concurrent two-instance replay.
- Topology audit gates, numerical convergence, reproducibility manifest, and indexed worker artifacts are checked by the canonical Ticket 02 validator.

## Commands

- `npx vitest run tests/topologyReviewJobE2e.test.ts` — passed; authoritative real public-seam verifier, approximately 8 seconds.
- `npm run typecheck` — passed during focused development.
- `npm test` — passed: 46 files / 163 tests.
- `graphify update .` — passed: 2,106 nodes / 4,323 edges / 231 communities.
