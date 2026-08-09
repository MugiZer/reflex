# Component Topology Preliminary V1

**Triage:** ready-for-agent  
**Status:** approved product scope  
**Supersedes:** the Z-girt-first release direction in `thermal-treatment-v1.md`; that document remains useful historical context only.

## Problem Statement

Architects can already obtain a layer-only U-value from IFC Evidence, but that value can be physically optimistic when repeated conductive components pass through insulation. IFC commonly supplies ordered layers, thicknesses, material labels, element identity, and locations. It rarely supplies enough trustworthy fabrication detail to prove member profile, gauge, spacing, contact topology, or thermal breaks. A product that insists on complete modelling detail will block normal BIM workflows; one that silently invents it can create an unsafe precise-looking U-value.

Architects need early, useful decision support without rebuilding walls in CAD or completing a large form. When the IFC has enough evidence, the product must calculate a 2-D repeating component topology. When important detail is absent, it must use a bounded, transparent scenario sweep and only propose a conservative preliminary result when the credible uncertainty cannot lead to an unsafe decision. The existing layer-only Calculation Snapshot must remain available and unchanged in every case.

## Solution

Add optional Component Topology enrichment to the existing BIM-to-Physics Compiler. The first Topology Module is `repeating-parallel-profile-wall-2d`. It accepts an immutable Declarative Construction Recipe based on existing IFC Evidence and small, high-impact review confirmations. It compiles a Representative Cell and solves its steady-state 2-D thermal behaviour with the packaged open-source worker.

The module supports broad, composable wall situations rather than a named family adapter: ordered layer bands; rectangular/timber, C, Z, and hat Primitives; one or two parallel rows; aligned or staggered phase; spacing and offset; cavities; explicit Thermal Breaks; and named boundary conditions. The kernel stays independent of those shapes. Primitive Plugins own only local polygon vocabulary; the generic compiler owns placement, repetition, Boolean composition, Material Regions, interfaces, periodicity, and Topology Audit.

Topology is an optional enrichment. An Assembly Group retains its layer-only Calculation Snapshot. A Topology Result is separately classified and attached to the source Revision. V1 shows only `preliminary-unsafe` topology results; it makes no verified, compliance, construction, certification, or engineering sign-off claim.

If direct IFC Evidence or a user confirmation supplies every critical input, the system runs one deterministic Recipe. If a supported input is unknown, the Component Knowledge Base may propose only versioned, compatible parameter ranges. The system runs credible scenarios and reports their U-Value Range. It may propose a conservative screening value only when the worst credible case stays on the safe side of the user-selected project threshold and the range is within the pack's immateriality gate. Otherwise it shows the range, identifies the dominant uncertainty, and asks only for the value that changes the decision. It never turns a missing, conflicting, invalid, or unsupported topology into an estimate.

The normal UI remains compact: a Thermal Treatment Opportunity card appears only for an evidence-backed candidate, previews the shared detected construction, requests the minimum decisive confirmation, and provides one primary action. Advanced evidence, scenario details, assumptions, and solver artifacts are disclosed on demand.

## User Stories

1. As an architect, I want my layer-only U-value to remain visible, so that optional topology work never removes the result I already have.
2. As an architect, I want the product to identify an evidence-backed component opportunity, so that possible insulation bridges are not hidden in ordinary layers.
3. As an architect, I want a suggested construction to be confirmed before calculation, so that IFC labels never become unreviewed geometry.
4. As an architect, I want one compact confirmation card, so that review does not become a long technical form.
5. As an architect, I want the card to show affected elements and the shared construction signature, so that I know exactly what my confirmation applies to.
6. As an architect, I want assemblies split when calculation-relevant evidence differs, so that a confirmation never leaks across different walls.
7. As an architect, I want directly evidenced values prefilled with their source, so that I do not re-enter BIM information.
8. As an architect, I want to answer “I don’t know” for a missing dimension, so that incomplete design BIM can still support early decisions.
9. As an architect, I want the product to test credible compatible cases, so that an unknown gauge or spacing produces an honest range instead of a fabricated exact number.
10. As an architect, I want a conservative proposed result only when the worst credible case is still safe against my project threshold, so that an estimate cannot create a false pass.
11. As an architect, I want a material uncertainty to stay visible when it changes the decision, so that I know what detail to obtain.
12. As an architect, I want the result labelled “Preliminary — not verified”, so that it cannot be used as compliance or construction evidence.
13. As an architect, I want the U-Value Range, conservative screening value when applicable, assumptions, and dominant uncertainty, so that I can make an early design decision responsibly.
14. As an architect, I want a single clear next action when the range is material, so that I know which missing value to ask the supplier or architect for.
15. As an architect, I want no topology result when the construction is unsupported or contradictory, so that the product does not guess beyond its competence.
16. As an architect, I want the layer-only result preserved when topology is blocked, rejected, or failed, so that an optional feature cannot break my workflow.
17. As an architect, I want the report to separate preliminary topology analysis from the layer-only Calculation Snapshot, so that provenance and trust are clear to everyone reading it.
18. As a reviewer, I want every used value tagged as IFC-derived, user-confirmed, validated default, or preliminary estimate, so that I can audit why a result exists.
19. As a support engineer, I want a Correlation Identifier and immutable artifacts for each analysis, so that failures and unexpected values can be reproduced.
20. As a developer, I want the same workflow to work for timber, C, Z, hat, aligned, and staggered member configurations, so that V1 is not a disguised Z-girt implementation.
21. As a developer, I want new Primitive Plugins to add local shapes without changing kernel compilation code, so that common future components are inexpensive to add.
22. As a developer, I want a new Recipe composition to express a supported arrangement without a product release, so that the Component Knowledge Base can grow safely.
23. As a developer, I want crossed framing, point fixings, junctions, and arbitrary solids rejected at the module boundary, so that unsupported physics cannot appear as an estimate.
24. As a developer, I want TypeScript to own request lifecycle and Python to own geometry and numerical solve, so that cross-language responsibilities stay inspectable.
25. As a developer, I want both processes to validate a versioned protocol, so that language differences cannot silently corrupt a calculation.
26. As a release owner, I want a feature flag and kill switch, so that topology can be disabled without changing historical layer-only results.
27. As a verifier, I want reproducible numerical, geometry, and scenario-sweep evidence, so that the preliminary result has a defensible basis even though it is not verified.

## Implementation Decisions

- The product seam is one optional **Topology Analysis Request** created from an immutable Assembly Group Revision and returning one separately persisted Topology Result. This is the primary acceptance seam; no topology concern is added to the layer-only calculation seam.
- The existing IFC Evidence, Assembly Group, Review, User Input, Override, Revision, Report, viewer, job, and artifact workflow is extended rather than duplicated.
- A Thermal Treatment Opportunity is advisory only. It is created from IFC Evidence and may not author geometry, contacts, spacing, profile, or Thermal Break facts by implication.
- Recipe authoring combines IFC-derived values, user-confirmed values, validated defaults, and preliminary estimates. Each semantically used value carries Authority and source references.
- The first Topology Module is `repeating-parallel-profile-wall-2d`; its Recipe vocabulary covers layer bands, `rectangle`, `c`, `z`, and `hat` Primitives, one/two parallel rows, periodic spacing, offsets, aligned/staggered phase, cavities, explicit Thermal Breaks, and exterior/interior/periodic boundaries.
- The Primitive Registry is versioned. A Primitive Plugin validates local parameters and emits local tolerance-normalized polygons/capabilities only. The generic compiler performs all placement, repetition, composition, contacts, region partitioning, periodic pairing, and Topology Audit without primitive-name branches.
- Canonical Analysis Geometry is the only geometry accepted by a solver adapter. Raw IFC geometry is supporting evidence and may identify opportunities or disagreement; it is never automatically solver truth.
- The component knowledge base is a versioned pack of supported Recipe compositions, parameter bounds, material/boundary references, scenario definitions, immateriality gates, and provenance. It is not a manufacturer catalogue or a user-editable rule builder in V1.
- A range sweep may use only a supported, complete Recipe whose unknown values have pack-defined compatible ranges. It records every scenario, pack version, selected extrema, threshold, and why the bounds were credible.
- A conservative proposal is allowed only if the scenario sweep completed, the pack's immateriality rule passed, and the worst-case U-value does not cross the user-selected threshold. If no threshold exists, show the range only; do not assert safety.
- `preliminary-unsafe` requires successful compilation and numerical gates. `blocked` means critical information is missing/conflicting; `rejected` means invalid/unsupported semantics; `failed` means worker, artifact, timeout, or runtime failure. None may fabricate a topology value.
- V1 disables `verified` output. The Validation Envelope, external comparators, standards evidence, and specialist review remain retained architecture for a later release, not a V1 UI state.
- The TypeScript orchestrator persists immutable requests/results and owns protocol, idempotency, cancellation, feature flags, reporting, and business classification. The isolated, pinned Python worker resolves the registry bundle, compiles Canonical Analysis Geometry, meshes, solves, and produces numerical evidence. JSONL UTF-8 request/result/error/cancel messages are schema-validated on both sides.
- Worker artifacts are request-scoped and atomically published only after hash verification. Logs use stable error codes plus correlation, module, pack, registry, and runtime identities; raw IFC/user identifiers are redacted.
- UI presentation is compact by default. One opportunity card offers a primary review/calculate action; evidence, scenario details, and technical logs are progressive disclosure. It shows a separate preliminary result beside—not in place of—the layer-only result.
- Initial release runs behind a feature flag, supports an owner-selected pilot cohort, and has a kill switch that returns the product to unchanged layer-only behaviour.

## Testing Decisions

- Test externally observable behaviour at the Topology Analysis Request seam: authored/confirmed Recipe or scenario plan in, separately classified immutable Topology Result and artifacts out. Do not assert private compiler branches or meshing-library internals.
- Existing layer-only unit, integration, report, and end-to-end tests must prove behavioural preservation when no topology request is made and when topology is blocked, rejected, or failed.
- Contract tests validate JSONL schemas, major-version rejection, identity echoing, idempotency conflicts, cancellation, timeout, crash recovery, and no partial artifact publication.
- Compiler conformance tests cover rectangle/timber, single C, aligned C, staggered C, Z, hat, and a separately registered vendor block Primitive. They prove new local primitive registration does not require compiler changes.
- Deterministic rejection tests cover unknown primitives, missing critical values, invalid geometry, uncovered/overlapping/sliver regions, incompatible periodic faces, crossed framing, point fixings, and unsupported semantics.
- Worker integration tests use frozen analytical and heterogeneous fixtures, mesh refinement, hot/cold/periodic H(div) flux diagnostics, Dirichlet reactions, residual/convergence, one/two-cell stability, runtime lock identity, and reproducibility hashes.
- Scenario-sweep tests prove only pack-defined ranges are used; the returned U-Value Range contains the tested extrema; a conservative proposal appears only when threshold and immateriality gates pass; and a material range requests the dominant missing input.
- Review/UI tests prove compact presentation, exact Thermal Construction Signature scope, visible Authority/provenance, “I don’t know” range handling, preliminary styling, no target pass/fail for preliminary output, and layer-only preservation.
- Report tests prove preliminary topology content is separate, includes range/assumptions/pack and artifact identity, and never uses compliance or verified wording.
- End-to-end fixtures exercise IFC Evidence through opportunity, review, deterministic run or scenario sweep, persisted Topology Result, Report, feature-flag disablement, and support-log correlation.
- Type checking and the existing full test suite remain required. The worker’s independent verification harness and frozen conformance fixtures are release gates for any change to compiler, registry, pack, numerical runtime, or protocol.

## Out of Scope

- Verified, compliant, certified, or construction-approved topology results.
- Arbitrary 3-D IFC geometry, arbitrary solids, 3-D brackets, clips, screws, anchors, or point thermal bridges.
- Crossed framing, junctions, slab edges, corners, openings, balconies, parapets, or other non-periodic/interacting topologies.
- Automated profile/gauge/spacing/contact inference from IFC labels or display meshes.
- Manufacturer-specific packs, user-authored primitive code, or a user-facing knowledge-pack editor.
- Moisture, condensation, airflow, transient thermal physics, CFD, and whole-building heat-loss aggregation.
- Regulation/code lookup, target selection by jurisdiction, certification, or engineering sign-off.
- Cloud solver infrastructure, microservices, authentication, or a new frontend framework.

## Further Notes

V1 is deliberately broad in its kernel and narrow in its physics. The product does not need an adapter for every named component: compatible constructions are declarative compositions of reusable Primitives. A new Topology Module is required only when the representative volume, dimensionality, boundary vocabulary, interaction physics, or solver formulation changes.

The user-facing promise is early design support, not hidden automation. The system may make incomplete BIM useful through bounded preliminary analysis, but only when it can show the credible range and prevent a conservative estimate from being read as a verified U-value.
