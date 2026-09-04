# Thermal Treatment V1 — Repeating Wall Components

**Triage:** ready-for-agent

## Problem Statement

The BIM-to-Physics Compiler currently calculates layer-only thermal performance. That treatment becomes physically misleading when a wall contains a repeating conductive component—such as a continuous Z-girt, rail, or steel stud—that interrupts or bypasses insulation. The existing product can detect material names such as Z bars and metal fixings and warn that special physics is required, but it cannot yet turn that evidence into an effective wall U-value.

Architectural IFC files usually preserve the wall layer stack, material labels, thicknesses, element identity, and useful classification evidence. They usually do not preserve fabrication-quality profiles, metal gauge, spacing, thermal-break geometry, or trustworthy solver-ready cross-sections. Requiring detailed IFC geometry would therefore block ordinary projects and could produce precise calculations of simplified BIM geometry that does not represent the real construction.

Architects need the existing analysis workflow to identify likely repeating metal paths, suggest a supported thermal family, request only the few high-impact parameters that cannot be proved, and calculate the effective wall U-value. The result must clearly distinguish a validated calculation from a preliminary unsafe estimate, preserve every input and assumption, and avoid implying regulatory compliance or engineering sign-off.

## Solution

Extend the existing upload, IFC Evidence, Review, Revision, and Report workflow with a family-neutral Thermal Treatment kernel.

For an eligible Assembly Group, the product will broadly detect evidence of a repeating component between or across wall layers. It will suggest a matching Thermal Family and present one compact confirmation card. The card will prefill values only when they come from direct IFC Evidence, an exact Thermal Family match, or a previously confirmed project standard. Missing high-impact inputs remain explicit and editable without exposing a large technical form by default.

The first supported Thermal Family will be a generic, parameterized continuous Z-girt/rail wall. Its family adapter will build a clean repeating two-dimensional model from the confirmed layer stack and family parameters. It will model the actual Z profile through depth, flange widths, gauge, spacing, material, and an explicitly confirmed optional thermal break. It will not slice an arbitrary cross-section from IFC geometry.

A local, fully open-source calculation worker will mesh and solve the generated model and return an auditable effective U-value. The product will compare this value with the existing layer-only U-value, show the performance loss caused by the repeating component, and optionally compare the verified result with one simple user-supplied project target.

Every Thermal Family consists of a code adapter, a versioned knowledge pack, and a versioned validation pack. Only a validated family whose confirmed inputs fall inside its approved parameter envelope may produce a Verified result. When critical values remain unresolved, the product may calculate a Preliminary Unsafe Estimate, but it must clearly label the result as unverified, disclose every assumption and missing input, avoid pass/fail language, and keep the action required to obtain a Verified result prominent.

The current layer-only calculation remains available for unsupported walls. The new capability upgrades eligible walls; it does not replace the existing product or create a separate workflow.

## User Stories

1. As an architect, I want the existing IFC analysis to identify wall layers containing likely metal framing or fixings, so that hidden thermal paths are not treated as ordinary serial layers.
2. As an architect, I want likely Thermal Families suggested automatically, so that I do not need to understand solver terminology.
3. As an architect, I want broad detection of possible thermal paths, so that the product does not miss useful calculation opportunities merely because IFC naming is imperfect.
4. As an architect, I want the product to require confirmation before applying a Thermal Family, so that an uncertain match does not silently become a trusted calculation.
5. As an architect, I want one compact confirmation card, so that Review does not become a long wall of buttons, widgets, and explanatory text.
6. As an architect, I want advanced evidence and assumptions collapsed by default, so that the normal path stays easy to scan.
7. As an architect, I want a single primary “confirm and calculate” action, so that the next step is obvious.
8. As an architect, I want a secondary way to change the suggested family or parameters, so that incorrect suggestions are easy to correct.
9. As an architect, I want the card to show the affected wall count and locations, so that I understand the scope of my confirmation.
10. As an architect, I want one confirmation to apply to walls with the same Thermal Construction Signature, so that I do not repeat identical work.
11. As an architect, I want walls split into separate groups whenever layer order, thickness, profile, spacing, material, boundary conditions, or assumptions differ, so that one confirmation is not applied too broadly.
12. As an architect, I want the product to prefill proven family parameters, so that Review remains fast.
13. As an architect, I want unproven high-impact values to remain explicit, so that generic defaults do not become hidden assumptions.
14. As an architect, I want only the few missing inputs that materially affect the calculation, so that I am not asked to complete a full engineering form.
15. As an architect, I want Z-profile depth, flange widths, gauge, spacing, and material represented explicitly, so that the generated model reflects the confirmed construction.
16. As an architect, I want an optional thermal-break pad represented explicitly, so that its benefit is included only when confirmed.
17. As an architect, I want IFC Evidence and a generic validated family to work together, so that a detailed fabrication model is not required.
18. As an architect, I want the product to use IFC geometry as supporting evidence rather than blindly treating it as construction truth, so that simplified BIM geometry does not reduce calculation quality.
19. As an architect, I want the effective wall U-value including the repeating component, so that I can evaluate actual wall performance.
20. As an architect, I want the effective U-value displayed beside the layer-only U-value, so that I can see the component’s impact.
21. As an architect, I want the percentage or absolute performance loss shown plainly, so that I can explain the design consequence.
22. As an architect, I want to set one optional project target U-value, so that verified walls can be compared with the project’s design intent.
23. As an architect, I want only Verified results to receive target pass/fail language, so that unsafe estimates do not look compliant.
24. As an architect, I want a Preliminary Unsafe Estimate when useful uncertainty can be bounded, so that incomplete BIM still supports early design decisions.
25. As an architect, I want every unsafe estimate visibly labelled “Not verified,” so that it cannot be mistaken for a final result.
26. As an architect, I want an unsafe estimate to list missing inputs and assumptions, so that I know exactly what to resolve.
27. As an architect, I want an unsafe estimate expressed as a range when the uncertainty can be bounded, so that the interface does not imply false precision.
28. As an architect, I want unsafe estimates included in the exported Report under a separate preliminary section, so that early decisions remain traceable.
29. As an architect, I want Verified and preliminary results visually and semantically distinct throughout Review and Report, so that trust status is never ambiguous.
30. As an architect, I want unsupported walls to continue through the existing layer-only workflow, so that adding Thermal Families does not remove current capability.
31. As an architect, I want a possible thermal bridge shown even when no supported family matches, so that the problem remains visible for later review.
32. As an architect, I want the product to remain decision-support software, so that it does not falsely claim certification or replace engineering judgment.
33. As a developer, I want the Thermal Treatment kernel to contain no Z-girt-specific logic, so that later families do not require changes throughout the product.
34. As a developer, I want each Thermal Family implemented behind one small family-adapter interface, so that recognition, required inputs, model building, and family validation stay local.
35. As a developer, I want family parameters and validation cases in versioned knowledge and validation packs, so that engineering data can evolve independently from the kernel.
36. As a developer, I want the calculation worker behind one small worker interface, so that meshing and solver libraries do not leak into domain or application modules.
37. As a developer, I want the existing Node application to remain the control plane, so that the product does not become a distributed system.
38. As a developer, I want the open-source worker to run locally, so that development and deployment require no paid solver or cloud service.
39. As a developer, I want the current IFC Evidence, Review, Revision, artifact, and Report modules reused, so that this work deepens the existing product rather than recreating it.
40. As a developer, I want family matching and calculation trust to use separate thresholds, so that detection can be helpful without weakening Verified results.
41. As a developer, I want a Thermal Construction Signature to control group-wide confirmation, so that repeated walls are grouped only when all calculation-relevant facts match.
42. As a developer, I want solver inputs and outputs stored as immutable artifacts, so that every result can be reproduced and audited.
43. As a developer, I want each Solver Run to record worker version, family version, knowledge-pack version, validation-pack version, mesh settings, convergence evidence, and input provenance, so that results remain explainable after the code changes.
44. As a developer, I want a family to produce a Verified result only inside its validated parameter envelope, so that extrapolation cannot silently inherit verification.
45. As a developer, I want a generic development pack available before verification is complete, so that the complete product path can be built without mislabelling prototype output.
46. As a future maintainer, I want a steel-stud family to be addable as another adapter and knowledge pack, so that the first Z-girt implementation proves the intended extension path.
47. As a future maintainer, I want junction and three-dimensional families to remain possible without appearing in the V1 kernel interface prematurely, so that future capability does not distort the current design.
48. As a verifier, I want an end-to-end fixture that proves upload, suggestion, confirmation, calculation, revision, and Report behavior, so that the real product slice has one reliable acceptance gate.

## Implementation Decisions

- This capability extends the existing BIM-to-Physics Compiler. It does not create a new product, upload workflow, Review workflow, or Report system.
- The current layer-only calculation remains the baseline treatment and continues to serve unsupported walls.
- A Thermal Treatment upgrades an eligible Assembly Group when a supported Thermal Family is matched and confirmed.
- V1 supports repeating components within wall layers only.
- The first supported family is a generic continuous Z-girt/rail wall.
- Steel-stud walls are the next intended family adapter, but are not a V1 release requirement.
- Family detection favors useful recall: weak but plausible evidence may produce a suggestion.
- Verified calculation eligibility favors precision: family confirmation, critical inputs, parameter-envelope checks, and validation status must all pass.
- A family suggestion must not mutate IFC Evidence or become a calculation input until confirmed.
- A Thermal Construction Signature includes every fact that can change the selected family or calculated result, including layer sequence, normalized thicknesses, family identity, profile parameters, spacing, material assignments, boundary conditions, assumption set, and knowledge-pack version.
- One confirmation may apply to an Assembly Group only when its Thermal Construction Signature matches exactly under the family’s grouping policy.
- The normal Review experience is a compact family-confirmation card with one primary confirmation action and one secondary change action.
- Evidence, assumptions, and advanced parameters remain collapsed until requested.
- Defaults may become calculation inputs only when sourced from direct IFC Evidence, an exact family/type match, an already confirmed project standard, or explicit user confirmation.
- The first family generates its own clean parameterized two-dimensional geometry. It does not depend on an arbitrary cross-section cut from IFC geometry.
- IFC geometry may support selection, highlighting, approximate dimensions, and disagreement diagnostics, but it is not automatically treated as solver truth.
- The Z-girt adapter models the actual parametric Z section, including depth, flange widths, gauge, spacing, and material.
- An optional thermal break is an explicit family parameter. It is absent unless supported by evidence or user confirmation.
- The family adapter owns family recognition, required-input planning, parameter-envelope validation, model construction rules, and family-specific diagnostics.
- The family adapter does not own job persistence, revision creation, report rendering, solver execution, or project-target comparison.
- The Thermal Treatment kernel owns generic result states, provenance requirements, validation gating, safe-versus-unsafe semantics, target comparison eligibility, and coordination with the existing calculation lifecycle.
- The local calculation worker owns model meshing, steady-state two-dimensional heat solution, convergence checks, and raw numerical artifacts.
- The calculation worker uses a fully open-source runtime. THERM is not required.
- The intended worker stack is Netgen for two-dimensional meshing and DOLFINx/PETSc for the heat solve, with supporting open-source geometry and result-inspection libraries as needed.
- The worker runs as a local child process or equivalent in-process worker controlled by the existing Node application. V1 does not introduce a cloud service or networked microservice.
- The family-adapter seam and calculation-worker seam are the two intentional new seams. Avoid a generic plugin framework or additional pass-through interfaces.
- The domain remains independent of raw IFC parser calls, filesystem paths, process management, Netgen, DOLFINx, PETSc, HTML, HTTP, and SQLite.
- Infrastructure adapters translate IFC and worker details into domain-facing requests, results, diagnostics, and artifacts.
- A Thermal Family is a code adapter plus a versioned knowledge pack plus a versioned validation pack.
- V1 knowledge and validation packs are maintained as versioned project files. There is no user-facing family-pack editor.
- No manufacturer-specific pack is required. A generic parameterized family may be verified for an explicit bounded envelope.
- “Verified” means the family method passed its validation pack and the confirmed project inputs fall within its approved envelope. It does not mean manufacturer certification, regulatory approval, or engineering sign-off.
- A generic development pack may exercise the product before validation is complete, but its results remain preliminary.
- A Preliminary Unsafe Estimate is permitted when unresolved inputs can be represented transparently.
- A Preliminary Unsafe Estimate must disclose assumptions, unresolved inputs, evidence sources, parameter ranges, and the user action required for verification.
- A Preliminary Unsafe Estimate must not receive compliance-style or target pass/fail language.
- Unsafe estimates may appear in exported reports only in a clearly separate preliminary section.
- The primary Thermal Result is effective U-value including the repeating component.
- The product also retains and displays the layer-only U-value and derives the component-related performance difference.
- The optional project target is one simple user-supplied U-value. V1 does not add jurisdiction, code-edition, or regulatory rule lookup.
- Existing Job, IFC Evidence, Assembly Group, Review, User Input, Override, Revision, Report, viewer, storage, and verifier behavior should be extended rather than duplicated.
- Solver input, generated model, mesh, convergence data, raw result, derived result, versions, assumptions, warnings, and provenance are immutable calculation artifacts associated with the relevant Revision.
- Existing documents that state all thermal bridges are out of scope are superseded by this spec only for supported repeating within-wall Thermal Families. All other thermal-bridge categories remain out of scope.

## Testing Decisions

- Tests should exercise external behavior through the highest stable seam available. Do not test meshing-library implementation details or family-adapter private helpers directly.
- The primary product acceptance seam is the existing end-to-end analysis flow: upload IFC, produce a family suggestion, confirm or complete inputs, run the worker, create a Revision, and render the Report.
- The family-adapter interface is a focused test seam because family recognition and model construction genuinely vary between Z-girt and future steel-stud adapters.
- The calculation-worker interface is a focused test seam because the local numerical implementation must be replaceable by a deterministic fake in application tests and exercised directly by numerical validation tests.
- Existing IFC extraction tests remain the source of truth for IFC Evidence provenance and must not be rewritten as solver tests.
- Existing Review tests should prove compact family confirmation, group scope, missing critical inputs, user correction, and no mutation of IFC Evidence.
- Existing Revision tests should prove family confirmation and calculation create immutable new revisions without overwriting prior layer-only results.
- Existing Report tests should prove Verified and Preliminary Unsafe Estimate presentation, baseline-versus-effective comparison, assumptions, provenance, and target eligibility.
- Existing viewer tests should prove affected source elements remain selectable/highlightable without coupling the viewer payload to solver geometry.
- Unit-level domain tests should prove validation gating, parameter-envelope behavior, trust-state transitions, target pass/fail eligibility, and exact Thermal Construction Signature grouping.
- Family contract tests should prove the Z-girt adapter reports its match evidence, required inputs, defaults with sources, permitted ranges, generated model metadata, and diagnostics through the same interface future adapters will use.
- Application tests should use a deterministic fake calculation worker to prove workflow behavior quickly and without requiring numerical libraries.
- Worker integration tests should use small fixed geometries and assert heat-flow and effective-U outputs against analytical or published reference values.
- The validation pack must include simple homogeneous and layered cases with known solutions before the Z-girt cases.
- The validation pack must include mesh-refinement tests. A result cannot pass validation unless refinement changes the reported result by less than the approved tolerance.
- The validation pack must include parameter-envelope edge cases and must reject or downgrade inputs outside the validated range.
- The validation pack must include at least one repeating Z-girt reference geometry and expected result derived from an independent benchmark source or reviewed reference calculation.
- Validation tests must record solver and dependency versions so that numerical changes are visible rather than silently accepted.
- The first end-to-end fixture should include real IFC wall evidence matching the existing Z-fixing/Z-bar naming path plus explicit confirmed profile parameters.
- The end-to-end fixture may use the real architectural IFC for evidence extraction while using the generic knowledge pack for missing fabrication parameters.
- Tests must prove that an unsupported metal-path wall remains visible, retains its layer-only result, and does not receive a fabricated effective U-value.
- Tests must prove that broad detection may suggest a family while strict verification still refuses unresolved or out-of-envelope inputs.
- Tests must prove that Preliminary Unsafe Estimates never receive Verified styling or project-target pass/fail language.
- Tests must prove that verified grouped walls share one confirmation only when their complete Thermal Construction Signatures match.
- Tests must prove that adding a second fake family adapter does not require changing kernel behavior, establishing that the family seam is real rather than Z-girt-specific.
- Typecheck, existing unit/regression tests, and the existing end-to-end verifier remain required gates throughout implementation.

## Out of Scope

- Regulatory compliance determination, certification, code-edition lookup, or engineering sign-off.
- Manufacturer certification or manufacturer-specific knowledge-pack coverage.
- User-created or user-edited Thermal Family, knowledge-pack, or validation-pack definitions.
- Automatic extraction of arbitrary solver cross-sections from IFC geometry.
- Arbitrary three-dimensional IFC analysis.
- Discrete bracket, clip, screw, anchor, and point-thermal-bridge calculation.
- Slab-edge, parapet, corner, window, door, balcony, and other junction families.
- Steel-stud support as a V1 release requirement.
- Whole-building heat-loss aggregation beyond the existing product scope.
- Airflow, moisture transport, condensation certification, transient heat transfer, or conjugate CFD.
- A jurisdictional target or building-code rules engine.
- Cloud-hosted solver execution, queues, containers, orchestration, or microservices.
- A new frontend framework, large form builder, or family-authoring interface.
- Treating simplified IFC display meshes as trusted numerical geometry.

## Further Notes

The central product distinction is between broad detection and strict trust. The product should find and surface possible repeating thermal paths generously. It should grant Verified status narrowly, only after confirmation, parameter-envelope checks, and family validation.

The central architecture distinction is between the generic Thermal Treatment kernel and family-specific behavior. The kernel must not contain Z-girt names, dimensions, matching rules, geometry rules, or validation cases. If adding a steel-stud family requires edits throughout the kernel, the first implementation has failed its architectural objective.

The real architectural IFC already demonstrates the product need: it contains semantic layers named for Z fixings and Z bars, while omitting the fabrication geometry needed for direct numerical extraction. The intended workflow therefore combines IFC Evidence with confirmed family parameters rather than choosing between BIM evidence and a separate manual calculator.

The smallest meaningful product release is one supported Z-girt family that completes the existing user journey and produces either a transparently preliminary estimate or a traceable Verified effective U-value. Breadth comes from later adapters, not from widening the first family’s implementation.
