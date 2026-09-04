# 03 — Versioned Knowledge, Validation, and Trust States

**What to build:** Add generic, versioned knowledge-pack and validation-pack handling to the Thermal Treatment kernel. Packs must describe family parameters, defaults or estimates, units, applicability limits, and validation cases without embedding those facts in orchestration code. The kernel must derive either Verified or Preliminary Unsafe Estimate from evidence quality, critical-input confirmation, validation-envelope membership, and worker validity.

**Blocked by:** 02 — Prove the Family Seam with Two Reference Adapters

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Every registered family references an explicit code-adapter version, knowledge-pack version, and validation-pack version.
- [ ] Knowledge packs express parameter definitions, units, allowed values/ranges, evidence requirements, and clearly identified fallback estimates in a family-owned format.
- [ ] Validation packs express the supported parameter envelope, reference cases, expected tolerances, and model/worker compatibility requirements.
- [ ] The generic kernel, not the UI or individual report renderer, assigns the result trust state.
- [ ] Verified is possible only when all critical inputs are confirmed, the case is inside the validation envelope, and calculation validity checks pass.
- [ ] Missing, estimated, conflicting, or out-of-envelope critical inputs downgrade the result to Preliminary Unsafe Estimate and record machine-readable reasons.
- [ ] Preliminary results retain every estimate, assumption, missing input, and action required to reach Verified; they never expose pass/fail status.
- [ ] Pack schema validation fails safely with actionable diagnostics and cannot silently fall back to trusted results.
- [ ] Persisted results retain pack versions so a historical calculation remains reproducible after packs change.
- [ ] Contract tests apply the same trust rules to both reference adapters, including envelope boundaries and pack-version changes.

