# 02 — Prove the Family Seam with Two Reference Adapters

**What to build:** Prove that the kernel is genuinely extensible by implementing two deliberately different development-only reference family adapters against the same contract. Each adapter must declare different matching evidence, required parameters, validation envelope, and generated analysis model. Adding the second adapter must require registration and adapter code only, with no edits to kernel orchestration or generic result handling.

**Blocked by:** 01 — Generic Thermal Treatment Spine

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Two reference adapters with meaningfully different inputs and model topology run through the same kernel path.
- [ ] Family discovery is registry-driven; no kernel switch statement, family-name check, or solver-specific branch is introduced.
- [ ] Each adapter owns translation from generic confirmed evidence and parameters into the family-neutral analysis model.
- [ ] The kernel owns orchestration, trust-state application, persistence, failure handling, and result comparison without knowing either adapter's construction details.
- [ ] Registering or removing a reference adapter changes available families without changing kernel code.
- [ ] Contract tests run unchanged against both adapters and identify invalid adapter behavior consistently.
- [ ] The reference adapters are clearly isolated as development/test fixtures and do not appear as architect-facing supported families.
- [ ] A short contributor note explains the minimum implementation surface for a future real family adapter.

