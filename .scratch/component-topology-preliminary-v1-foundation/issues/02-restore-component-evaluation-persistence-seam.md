# 02 — Restore the Component Evaluation persistence seam

**What to build:** The production topology-review flow must persist and retrieve Component Evaluation records through an explicit durable persistence seam. Job persistence remains responsible for jobs; Component Evaluation persistence is not an optional capability hidden inside it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Gate:** `FND-G2` in [foundation-gate-plan.md](../reports/foundation-gate-plan.md), covering `FND-P01`–`FND-P10`.

- [ ] **FND-P01** — The application composition supplies an explicit Component Evaluation repository to the durable evaluation workflow.
- [ ] **FND-P02** — The Job repository interface no longer exposes optional Component Evaluation operations or requires callers to branch on whether those operations exist.
- [ ] **FND-P03** — A real localhost evaluation persists match, Recipe, request, result, aggregate, unresolved, recoverable, and published outcomes through the explicit seam.
- [ ] **FND-P04** — A fresh process reads the same persisted graph and public report as the original process, including all durable identities and artifact references.
- [ ] **FND-P05** — Partial planning or partial scenario execution remains recoverable and cannot be published as a complete aggregate.
- [ ] **FND-P06** — Missing or invalid persisted Component Evaluation data fails closed with a stable diagnostic; the route cannot silently return an empty or fabricated evaluation.
- [ ] **FND-P07** — Concurrent equal submissions and replay converge on the immutable stored outcome without overwriting earlier history.
- [ ] **FND-P08** — Existing job creation, job retrieval, layer-only reporting, IFC evidence, and revision ownership behavior remain unchanged.
- [ ] **FND-P09** — Public-seam tests cover restart, corruption, concurrency, replay, and protected IFC/layer state; the Ticket 4 authoritative verifier remains `GO`.
- [ ] **FND-P10** — `npm test` and `npm run typecheck` pass.
