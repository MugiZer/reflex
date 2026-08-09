# 03 — Deepen the durable Component Evaluation workflow and retire the in-memory pilot

**What to build:** One production application workflow must carry a real IFC Component Evaluation from authorized review through Recipe binding, pinned-worker execution, durable checkpoints, reload, aggregation, and reporting. The existing in-memory pilot must not remain a second production lifecycle authority.

**Blocked by:** 01 — Centralize durable Component Evaluation identity; 02 — Restore the Component Evaluation persistence seam.

**Status:** ready-for-agent

**Gate:** `FND-G3` in [foundation-gate-plan.md](../reports/foundation-gate-plan.md), covering `FND-W01`–`FND-W10`.

- [ ] **FND-W01** — A real localhost request crosses the single durable evaluation workflow from authorized IFC evidence through the pinned Python worker, explicit persistence seam, fresh reload, aggregate derivation, and public report.
- [ ] **FND-W02** — The workflow owns and enforces ordering for authorization, evidence interpretation, promoted-pattern matching, bounded Recipe generation, scenario execution, persistence checkpoints, reload, and publication; callers do not reproduce those invariants.
- [ ] **FND-W03** — Matched, ambiguous, unmatched, blocked, rejected, cancelled, deadline-exceeded, worker-failure, incomplete, and corrupted outcomes remain publicly diagnosable and durably classified.
- [ ] **FND-W04** — A non-success or missing scenario result cannot produce a successful numerical aggregate.
- [ ] **FND-W05** — Sequential retry, concurrent duplicate submission, process restart, and explicit replay preserve identity, immutability, and historical lineage.
- [ ] **FND-W06** — Original IFC evidence, uncertainty, revision history, and the layer-only Calculation Snapshot remain byte-for-byte unchanged by Component Evaluation.
- [ ] **FND-W07** — The in-memory pilot is not imported or composed by production code and cannot control enablement, cohort selection, kill state, counters, events, or reported outcomes.
- [ ] **FND-W08** — Pilot behavior tests are either moved behind a test-only reference seam or replaced by public durable workflow proofs; no second production lifecycle authority remains.
- [ ] **FND-W09** — The authoritative Ticket 4 durable scenario verifier, the Ticket 3 localhost proofs, focused failure probes, `npm test`, and `npm run typecheck` all pass.
- [ ] **FND-W10** — Completion includes a verifier manifest recording selected/passed/failed/unexecuted proofs, worker identity, fixture/oracle identity, protected-state observations, and the tested revision.
