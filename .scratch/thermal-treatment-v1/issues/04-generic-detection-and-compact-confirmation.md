# 04 — Generic Opportunity Detection and Compact Confirmation

**What to build:** Connect registered Thermal Treatment families to existing IFC Evidence and Review. Broadly detect candidate repeating conductive components, rank family suggestions, and let an architect confirm the construction with one compact interaction. Group confirmations only when walls share an exact Thermal Construction Signature. Detection may suggest; it must never silently create a trusted calculation.

**Blocked by:** 02 — Prove the Family Seam with Two Reference Adapters; 03 — Versioned Knowledge, Validation, and Trust States

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Any registered family can evaluate existing IFC Evidence through a generic matching contract and return a suggestion with evidence and confidence/reason codes.
- [ ] Existing evidence for metal paths, material layers, names, thicknesses, and Assembly Groups is reused rather than re-extracted through a parallel IFC pipeline.
- [ ] A broad candidate match creates a review suggestion only; no family is confirmed and no Verified result is generated automatically.
- [ ] Thermal Construction Signature includes every property whose difference can change family applicability or the thermal result, including ordered layers, thicknesses, family parameters, boundary conditions, and assumptions.
- [ ] One confirmation can apply to all walls with the same exact signature, while any meaningful difference splits them into separate groups.
- [ ] Review presents one compact card with the suggested family, affected wall count/locations, critical inputs, trust consequence, and one primary confirm-and-calculate action.
- [ ] Advanced evidence and assumptions are collapsed by default, with a secondary action to change the family or parameters.
- [ ] Only directly supported IFC Evidence or previously confirmed project standards are prefilled as confirmed; estimates remain visibly unconfirmed.
- [ ] Missing critical inputs can still lead to an explicitly labelled Preliminary Unsafe Estimate, with the shortest action needed for verification shown.
- [ ] Tests cover false-positive suggestions, ambiguous matches, exact grouping/splitting, user correction, and an unsupported group retaining layer-only behavior.

