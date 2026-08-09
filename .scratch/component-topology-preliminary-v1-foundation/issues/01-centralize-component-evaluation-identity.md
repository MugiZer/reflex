# 01 — Centralize durable Component Evaluation identity

**What to build:** Repeated submission of the same semantic Component Evaluation request must address the same immutable durable records across sequential retry, concurrent duplicate submission, process restart, and replay. A semantic change must create a new identity without overwriting the previous evaluation.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Gate:** `FND-G1` in [foundation-gate-plan.md](../reports/foundation-gate-plan.md), covering `FND-I01`–`FND-I09`.

- [ ] **FND-I01** — One authoritative deterministic identity contract covers the evidence snapshot, annotation, promoted pattern version, pattern match, exact Recipe, scenario request, scenario result artifact, and evaluation run.
- [ ] **FND-I02** — The public localhost submission and replay flows derive these identities through that contract; no production caller maintains an alternate hash formula.
- [ ] **FND-I03** — Equal semantic inputs produce byte-for-byte equal identities across sequential retry, concurrent duplicate submission, process restart, and replay.
- [ ] **FND-I04** — Changing the relevant source revision, evidence, pattern version, Recipe, worker bundle identity, or request purpose produces a distinct identity and preserves the prior record.
- [ ] **FND-I05** — Duplicate equal requests do not create a second published evaluation or a second successful scenario result.
- [ ] **FND-I06** — Existing persisted Component Evaluation records remain readable without changing immutable IFC evidence, revision history, or the layer-only Calculation Snapshot.
- [ ] **FND-I07** — Negative tests prove malformed or semantically incomplete identity inputs cannot authorize a durable success.
- [ ] **FND-I08** — The identity contract has focused red-green tests plus the existing public durable scenario verifier; fabricated worker values and in-memory fakes cannot authorize completion.
- [ ] **FND-I09** — `npm test` and `npm run typecheck` pass, and the Ticket 4 authoritative proof remains `GO`.
