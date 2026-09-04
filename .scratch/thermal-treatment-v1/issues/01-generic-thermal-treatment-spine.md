# 01 — Generic Thermal Treatment Spine

**What to build:** Introduce the smallest end-to-end, family-neutral Thermal Treatment domain slice inside the existing BIM-to-Physics workflow. A synthetic development family and fake calculation worker must carry one eligible Assembly Group through selection, calculation, revision persistence, and report rendering. The production kernel must speak only in generic concepts such as treatment family, confirmed inputs, analysis model, calculation result, trust state, and provenance; it must not contain Z-girt-specific fields or branching.

**Blocked by:** None

**Status:** ready-for-agent

## Acceptance criteria

- [ ] An Assembly Group can hold an optional Thermal Treatment selection without changing the existing layer-only calculation for groups that have no selection.
- [ ] A registered family can declare its identity, required inputs, input validation, and analysis-model construction through one family-facing contract.
- [ ] A calculation worker can accept a family-neutral analysis model and return a family-neutral result through one worker-facing contract.
- [ ] The application/domain path does not import solver-specific types or contain conditionals for a named construction family.
- [ ] A synthetic family and fake worker prove the full path from an Assembly Group to a persisted calculation result in a Revision and a visible Report result.
- [ ] Results retain the selected family identity/version, confirmed inputs, assumptions, worker identity/version, and calculation timestamp.
- [ ] Unsupported groups continue through the existing layer-only workflow with no regression.
- [ ] Automated tests cover the synthetic happy path, invalid inputs, worker failure, persistence, and unchanged layer-only behavior.

