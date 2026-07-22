# 07 — Real-IFC Product Verification and Release Slice

**What to build:** Verify the complete architect-facing slice against the Barclay IFC and controlled fixtures, then close the release gaps across upload, IFC Evidence, Review, Revisions, artifacts, and Reports. The real file must demonstrate that existing wall-layer evidence can suggest the continuous Z-girt family while missing fabrication parameters remain explicit. Unsupported constructions must continue to receive the current layer-only calculation.

**Blocked by:** 06 — Continuous Z-Girt/Rail Family Adapter

**Status:** ready-for-agent

## Acceptance criteria

- [ ] The Barclay construction containing aluminium, Z fixation/Z bars, insulation, and plywood is discovered through the existing IFC evidence path and offered as a Z-girt opportunity.
- [ ] The product does not claim that the IFC proves profile geometry, gauge, spacing, thermal-break details, or other absent fabrication data.
- [ ] An architect can confirm or correct the suggestion, supply the minimum critical values, run the local calculation, and review the result without leaving the existing workflow.
- [ ] Equal constructions are confirmed once through an exact Thermal Construction Signature; intentionally altered fixtures prove that materially different walls split correctly.
- [ ] A completed confirmed case produces a reproducible Verified result with family/pack/worker versions, convergence evidence, inputs, and artifacts.
- [ ] A case with unresolved critical parameters produces a conspicuous Preliminary Unsafe Estimate, lists assumptions and missing inputs, and contains no compliance or pass/fail claim.
- [ ] Reports place preliminary calculations in a separate clearly labelled section and compare effective U-value with layer-only U-value without overstating certainty.
- [ ] Existing layer-only walls, unsupported thermal bridges, and unrelated IFC analyses retain their current behavior.
- [ ] The two development reference adapters still pass the shared kernel contract suite, demonstrating that release work did not specialize the platform around Z-girts.
- [ ] End-to-end, regression, failure-recovery, and representative performance tests pass in a local free/open-source development environment.
- [ ] Release notes state that V1 supports validated repeating within-wall Z-girt/rail constructions for design decision support, not compliance certification, arbitrary 3-D fixings, junctions, or manufacturer-specific systems.
