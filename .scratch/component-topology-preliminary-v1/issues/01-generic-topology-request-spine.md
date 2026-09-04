# 01 — Generic topology request spine

**What to build:** An Assembly Group Revision can submit one optional, immutable Topology Analysis Request and receive a separately persisted Topology Result without changing its layer-only Calculation Snapshot. The request crosses the TypeScript/Python boundary through the versioned JSONL protocol, invokes the pinned worker, and preserves auditable request/result/error artifacts. This is a demoable safe topology job: a known complete Recipe returns a typed preliminary result; no Recipe, invalid request, timeout, cancellation, crash, or artifact failure leaves the existing product result untouched.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A user or application flow can create an idempotent Topology Analysis Request from an immutable source Revision and retrieve its independently classified outcome.
- [ ] The request, result, error, and cancel messages validate on both sides of the protocol; unknown major versions, identity mismatches, and incompatible bundle identities reject deterministically.
- [ ] The orchestrator invokes only a pinned worker/runtime and records request, correlation, idempotency, registry/module, pack, and runtime identities with immutable artifacts.
- [ ] Successful, blocked, rejected, failed, cancelled, and not-requested outcomes are distinguishable and cannot mutate IFC Evidence, historical Revisions, layer-only snapshots, or active-Revision selection.
- [ ] Duplicate equal idempotency keys reuse the immutable outcome; a duplicate key with different semantic payload is rejected.
- [ ] Deadline, cancellation, worker crash, malformed output, stale temporary artifacts, and atomic publication behaviour are exercised through the public request seam.
- [ ] Existing layer-only workflow, report, and regression behaviour remains green with topology disabled or unavailable.

