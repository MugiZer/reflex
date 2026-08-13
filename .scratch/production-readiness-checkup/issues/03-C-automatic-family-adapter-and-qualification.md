# C — Automatic Family Adapter and Qualification

**What to build:** A founder can select a stored, versioned dataset, generate a Thermal Treatment family adapter, qualify it against independent numerical evidence, and use the qualified adapter in one real IFC workflow. Generated adapters remain disabled or preliminary until qualification passes, and unsupported inputs can never appear verified.

**Blocked by:** A — Verification Foundation

**Status:** ready-for-agent

- [ ] Every source dataset has an immutable identity, version, content hash, source citation, acquisition date, and declared licensing/usage status.
- [ ] Generation records the dataset identity/hash, generator identity/version, generated family identity/version, knowledge-pack version, validation-pack version, and code-adapter version.
- [ ] The generated artifact is deterministic for the same canonical dataset and generator version, or records the additional inputs required to explain a different result.
- [ ] A generated family is disabled by default and cannot produce a `verified` result until its qualification decision is GO.
- [ ] Every candidate family declares its critical inputs and supported parameter envelope; missing, estimated, conflicting, or out-of-envelope inputs produce a visible preliminary/unsupported outcome.
- [ ] Qualification uses a small independent reference pack with declared tolerances whose expected results are not authored by the generated adapter or the same calculation path under test.
- [ ] Worker incompatibility, invalid output, non-convergence, timeout, or failed reference tolerance prevents qualification and leaves the previously enabled family/version unchanged.
- [ ] A qualified calculation records dataset, generator, family, adapter, validation-pack, worker, input, output, convergence, assumptions, warning, and artifact provenance in the immutable Revision and Report.
- [ ] One earning tracer crosses stored dataset ingestion, generation, registry loading, the real calculation worker, immutable Revision publication, and HTTP Report retrieval for a real IFC case.
- [ ] A sensitivity probe corrupts or changes a reference expectation, skips qualification, or moves an input outside the envelope and proves the gate becomes NO-GO or the result becomes unsupported.
- [ ] The founder can disable a faulty generated family/version without deleting historical Revisions or changing their recorded provenance.
- [ ] The qualification artifact states exactly what family, dataset version, envelope, adapter version, worker version, reference cases, and tolerances are supported.

**Earning proof:** Use a stored dataset and independent numerical oracle to generate and qualify one narrow family, then execute the production IFC-to-calculation-to-Revision-to-Report composition. Unit tests with a fake worker may support schema and state logic but cannot authorize qualification or verified status.

**Out of scope:** arbitrary family support, automatic self-approval, exhaustive validation over every input combination, a user-facing family marketplace/editor, fleet-wide deployment, a universal solver abstraction, or shared multi-tenant dataset permissions.
