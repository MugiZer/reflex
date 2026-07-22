# 06 — Continuous Z-Girt/Rail Family Adapter

**What to build:** Add the first architect-facing supported family: a generic continuous steel Z-girt or rail crossing a confirmed wall layer stack. Keep it a thin family module composed of an adapter, a versioned knowledge pack, and a versioned validation pack. It must generate the actual parameterized Z profile in a repeating two-dimensional cell and use the generic kernel, review, worker, trust, persistence, and report paths unchanged.

**Blocked by:** 03 — Versioned Knowledge, Validation, and Trust States; 04 — Generic Opportunity Detection and Compact Confirmation; 05 — Generic Open-Source 2-D Calculation Worker

**Status:** ready-for-agent

## Acceptance criteria

- [ ] The family captures confirmed ordered wall layers plus Z-profile depth, flange widths, steel gauge/thickness, repeat spacing, material conductivity, placement/orientation, and boundary conditions.
- [ ] The generated model contains an actual Z profile rather than a rectangular metal-strip approximation.
- [ ] An optional thermal break is absent unless explicitly confirmed and, when present, records its geometry and thermal properties.
- [ ] IFC labels such as Z fixation, Z bar, rail, or equivalent metal-path evidence can suggest this family without proving its missing geometry.
- [ ] The compact confirmation card asks only for unresolved high-impact inputs and clearly distinguishes IFC evidence, project-confirmed values, and unsafe estimates.
- [ ] The generic knowledge pack documents units, plausible inputs, estimate policy, and applicability limits without relying on manufacturer-specific data.
- [ ] The validation pack covers representative layer stacks and the supported ranges of profile, spacing, gauge, conductivity, and thermal-break parameters with documented tolerances.
- [ ] Inside-envelope cases with all critical inputs confirmed can produce Verified results; unresolved or out-of-envelope cases produce Preliminary Unsafe Estimate with reasons.
- [ ] The result shows effective wall U-value, the existing layer-only U-value, and the absolute or percentage performance loss caused by the repeating component.
- [ ] An optional user-supplied project target is evaluated only for Verified results; preliminary results never show pass/fail language.
- [ ] No production kernel, worker, generic Review, or generic Report code branches on the Z-girt family identity.

