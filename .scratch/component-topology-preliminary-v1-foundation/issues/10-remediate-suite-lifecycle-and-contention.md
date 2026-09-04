# 10 — Remediate suite lifecycle and contention failures

**What to build:** Restore a deterministic green repository test suite after the Component Evaluation repository split.

**Blocked by:** None.

## Scope

- Ensure every localhost composition closes both Job and Component Evaluation repositories through one root-owned lifecycle path.
- Remove remaining Windows SQLite `EBUSY` cleanup failures.
- Fix the stale completion-manifest assertion.
- Reproduce and resolve the pinned-worker failure seen only under full-suite load; do not hide it with a larger timeout.

## Acceptance proof

- `npm test` passes from a clean workspace with zero failed tests.
- `npm run typecheck` passes.
- The affected HTTP/e2e tests pass both alone and in the full suite.
- A controlled repeated or overlapping run demonstrates no shared-temp/resource contention.
- No IFC bytes, layer-only snapshots, or revision history are changed by cleanup or test isolation.

## Exclusions

No topology behavior, persistence schema, worker physics, or gate policy changes.
