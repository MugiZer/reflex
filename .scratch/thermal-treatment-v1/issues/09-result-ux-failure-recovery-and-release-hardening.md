# 09 — Result UX, Failure Recovery, and Release Hardening

**What to build:** Finish the live Thermal Treatment slice as a restrained, trustworthy architect experience. The compact card must transition cleanly between suggestion, calculating, Verified, Preliminary Unsafe Estimate, stale, and failed states; compare effective and layer-only performance without overstating certainty; and make the shortest safe next action obvious. Reports, refreshes, retries, responsive layouts, accessibility, real-IFC verification, and regressions must all tell the same trust story. This ticket hardens the completed workflow rather than adding more families, solver types, or a new frontend architecture.

**Blocked by:** 08 — Compact Thermal Treatment Workflow

**Status:** ready-for-agent

- [ ] The confirmation card has explicit suggestion, ready-to-calculate, calculating, Verified, Preliminary Unsafe Estimate, stale-evidence, recoverable-failure, and unavailable states driven by the server-provided presentation model.
- [ ] Calculation submission prevents accidental duplicate runs, communicates progress without hiding the selected Assembly Group, and restores a usable state after timeout, worker failure, validation failure, or network interruption.
- [ ] Refreshing or reopening an analysis restores the active saved treatment result, its affected elements, and its next action without relying on browser-only state.
- [ ] A Verified card prominently shows effective wall U-value, layer-only U-value, absolute or percentage performance loss, family label, and verified status without requiring the architect to open technical details.
- [ ] A Preliminary Unsafe Estimate card uses conspicuous non-compliance language, lists the unresolved critical inputs or unsafe assumptions, and offers one primary action that leads toward verification.
- [ ] Preliminary, stale, failed, unconverged, and otherwise unverified results never display target pass/fail, compliance, approval, or design-sign-off language.
- [ ] An optional project target is compared only with a Verified effective U-value, and the comparison remains clearly labelled as a user-supplied design benchmark rather than a regulatory verdict.
- [ ] Recalculation creates a new immutable child Revision and leaves prior treatment inputs, results, artifacts, and Reports reproducible.
- [ ] When the underlying evidence or Thermal Construction Signature changes, the old result remains historical but the live card becomes stale and requires a fresh confirmation before another trusted result can be produced.
- [ ] The UI clearly distinguishes IFC-proven values, architect-confirmed values, validated family constants, system estimates, missing values, and conflicting values without exposing a long technical form by default.
- [ ] Conditional thermal-break inputs appear only when the architect confirms that a thermal break is present; absence is explicit and never inferred from missing IFC data.
- [ ] Advanced details disclose the confirmed inputs, assumptions, missing inputs, trust reasons, validation envelope outcome, family/pack/worker versions, convergence evidence, and solver artifact references in readable architect-facing language.
- [ ] The generated Report presents Verified and Preliminary results consistently with the live workspace, keeps preliminary calculations in a separately labelled section, and preserves the effective-versus-layer-only comparison and full audit trail.
- [ ] The viewer continues to highlight the affected IFC elements in every card state while making clear that the detailed parametric calculation profile is supplied by the confirmed family rather than extracted from BIM fabrication geometry.
- [ ] The compact card remains usable within the existing scrolling action panel on laptop-width and narrow layouts, with advanced content collapsed, no clipped controls, no horizontal form scrolling, and no proliferation of buttons or widgets.
- [ ] All form controls have associated labels, keyboard-visible focus, semantic status text in addition to color, useful validation messages, and appropriate disabled/busy behavior.
- [ ] The Barclay IFC follows the complete live path from existing evidence to grouped Z-girt suggestion, architect confirmation, calculation, active Revision, viewer highlighting, and Report without claiming absent profile, gauge, spacing, or thermal-break details came from IFC.
- [ ] Controlled fixtures prove that identical Thermal Construction Signatures share one confirmation while changes to layer order/thickness, family geometry, spacing, material, boundary conditions, or assumptions split the scope.
- [ ] End-to-end tests cover Verified, preliminary, corrected-and-recalculated, stale, worker-failure-and-retry, refresh/reopen, Report serving, and target comparison behavior through the actual HTTP and browser contracts.
- [ ] The full existing upload, processing, material Review, layer-only calculation, Revision, Report, IFC viewer, and unsupported-special-physics regression suite remains green.
- [ ] Release documentation states the supported V1 family and validated envelope, the distinction between IFC evidence and supplied parameters, the meaning of Verified and Preliminary Unsafe Estimate, and the exclusions for compliance certification, arbitrary 3-D fixings, junctions, and manufacturer-specific systems.
