# Component topology validation and verification strategy

Date: 2026-07-24  
Parent issue: `03 — Establish the validation and verification strategy`  
Scope: `repeating-parallel-profile-wall-2d` and its first timber, C-profile, two-row C-profile, and Z-profile validation envelopes.

## Executive decision

`Verified` must be an interaction-level claim. It applies to one complete, versioned calculation composition:

```text
recipe
+ primitive-registry snapshot
+ material/property pack
+ boundary-condition profile
+ topology compiler
+ worker and runtime
+ validation pack
+ input provenance
```

It does not approve a reusable C primitive, Z primitive, timber member, material alias, or solver in isolation. A primitive can be reused only inside compositions whose geometry, row arrangement, contacts, periodic cell, materials, boundaries, and evidence remain inside an approved validation envelope. Composition changes are new validation subjects even when every individual primitive was previously tested.

The recommended release vocabulary is:

| State | Meaning | Permitted use |
|---|---|---|
| **Verified** | All critical inputs are authoritative or explicitly confirmed, the interaction matches an approved envelope, numerical gates pass, the validation pack is approved, and the required independent review is recorded. | May be presented as a verified topology result for the supported design-decision use. It is not a blanket code-compliance certificate. |
| **Preliminary unsafe estimate** | A valid model produced a numerically useful result, but evidence, envelope coverage, external validation, or release approval is incomplete. | Design exploration only. The report must show the assumptions, missing evidence, uncertainty, and the exact action needed before verification. |
| **Reject** | The model cannot be safely interpreted or the numerical result is not trustworthy: unsupported topology, conflicting critical input, invalid geometry, uncovered domain, failed convergence/heat balance, incompatible worker, or missing reproducibility evidence. | No topology result. An independent layer-only calculation may proceed only if that separate path is itself ready; it must not inherit the rejected topology result. |

The evidence ladder is therefore cumulative. A calculation cannot become Verified by passing a later benchmark while failing an earlier geometry or provenance gate.

## Research findings

### Standards and method boundaries

ISO 10211:2017 is the governing standards family for the proposed numerical thermal-bridge method. ISO describes it as specifying 2-D and 3-D geometrical models, heat-flow and surface-temperature calculations, geometrical boundaries and subdivisions, thermal boundary conditions, and thermal values/relationships. It assumes temperature-independent physical properties and no heat sources within the building element, and can be used to derive linear and point thermal transmittances. The ISO page says the 2017 edition is current after confirmation in 2022. [ISO 10211:2017](https://www.iso.org/standard/65710.html)

ISO 10211 is a method/model specification, not a topology compiler, IFC interpretation rule, material-evidence library, or approval of Conformity's representative-cell assumptions. The full standard and its exact reference-case data must be obtained and treated as normative inputs; public summaries are not sufficient to claim standards conformance.

ISO 6946:2017 is useful for clear-wall and serial-layer sanity checks. Its published scope covers homogeneous layers and an approximate method for some inhomogeneous layers, but explicitly places cases where insulation is bridged by metal outside its scope. It must not be used as the authority for a C/Z profile result. [ISO 6946:2017](https://www.iso.org/standard/65708.html)

ISO 14683:2017 is a simplified-method/default-value standard for linear thermal transmittance. It is useful context for distinguishing detailed numerical calculations from simplified catalogue/manual methods, but it is not a substitute for the detailed 2-D cell validation required here. [ISO 14683:2017](https://www.iso.org/standard/65706.html)

ASME V&V 20 is a useful verification-and-validation framework for computational fluid dynamics and heat transfer. ASME describes it as quantifying accuracy for a specified variable at a specified validation point while considering solution and data uncertainties. It does not prescribe one universal tolerance for this product; the product must define a risk-appropriate V&V plan and metrics. [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer)

### Source matrix

The matrix records what each source can prove and what it cannot. “Primary” means the source owns the standard, software, source code, test case, or experiment. Thresholds labelled **policy inference** below are Conformity recommendations, not claims that the source mandates them.

| ID | Source and evidence | What it supports | Limitation / use boundary |
|---|---|---|---|
| S1 | [ISO 10211:2017](https://www.iso.org/standard/65710.html) | Applicable 2-D/3-D thermal-bridge model scope, boundary/model concepts, heat flow and surface temperature objectives. | The public page is an abstract; exact Annex A reference values and tolerances require the purchased standard. Does not validate our compiler or IFC interpretation. |
| S2 | [ISO 6946:2017](https://www.iso.org/standard/65708.html) | Clear-wall serial-layer calculation and a bounded comparison for homogeneous/limited inhomogeneous components. | Metal-bridged insulation cases are outside the stated scope. Use only as an analytical sanity check, not as C/Z validation. |
| S3 | [ISO 14683:2017](https://www.iso.org/standard/65706.html) | Context for simplified linear-bridge methods and catalogue/default values. | Not a detailed numerical solver validation source and not authority for the representative-cell abstraction. |
| S4 | [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer) | Separation of solution accuracy, validation data, uncertainty, and specified quantities of interest. | General V&V framework; it does not supply building-envelope cases or Conformity thresholds. |
| S5 | [Feel++ heat toolbox ISO 10211 case](https://feelpp.github.io/toolbox/toolboxes/latest/heat/ISO_10211_2007/index.html) | An independently maintained, scriptable finite-element comparator with a documented 2-D/3-D ISO 10211:2007 case, mesh configuration, materials, steady heat equation, convective boundaries, post-processing and command line. | It is an implementation of an older standard edition, not proof of our envelope. Its geometry, mesh, material values, and result extraction must be frozen and compared independently. It also uses a different toolchain from the proposed Netgen/NGSolve worker, which is useful but not sufficient by itself. |
| S6 | [Conducteö source repository](https://github.com/c-marcel/conducteo) | A credible open-source comparator whose README states that it computes linear thermal bridges according to EN 10211; source and a `validations` directory are available; Windows, macOS, and Debian installers are documented. | GPLv3; do not embed or distribute it in the product without a licensing decision. The project claim is not independent certification. Its GUI/import/export and validation fixtures must be audited before it is used as a numerical oracle; headless automation is not established by the README. |
| S7 | [Netgen/NGSolve 2-D geometry documentation](https://ngsolve.org/ngsolve/docs/i-tutorials/unit-4.1.1-geom2d/geom2d.html) and [subdomain/material documentation](https://docu.ngsolve.org/latest/i-tutorials/unit-1.5-subdomains/subdomains.html) | Feasibility of named material domains, boundary regions, local mesh sizes, conforming 2-D geometry, and periodic copied boundaries; coefficient functions can be assigned by subdomain. | Capability evidence only. The documentation does not validate the topology compiler, boundary convention, heat-flux integration, or chosen envelope. |
| S8 | [LBNL THERM error-energy-norm guidance](https://windows.lbl.gov/error-energy-norm-and-isoen-standards) | An independently maintained specialist tool's documented relationship between adaptive refinement and an overall accuracy target below 1% associated with ISO 10211; useful cross-check context. | THERM is not the proposed open-source runtime and the page is not proof that our generated geometry, boundary conditions, or result derivation are correct. The page explicitly distinguishes its local EEN threshold from overall result accuracy. |
| S9 | [Desjarlais and McGowan, ORNL / ASTM guarded-hot-box comparison](https://impact.ornl.gov/en/publications/comparison-of-experimental-and-analytical-methods-to-evaluate-the/) | Published application evidence for steel-framed wall thermal bridges: twelve ASTM C236 guarded-hot-box tests compared with 2-D finite-difference modelling; the abstract reports average simulated/test R-value variation of 3.3%, range −3.4% to +7.4%. | The cases, specimen construction, contacts, measurements, and uncertainty are not the same as the proposed representative cells. Use as external application-validation evidence and a source to acquire, not as an acceptance tolerance for every topology. |
| S10 | [ISO 8302:1991](https://www.iso.org/standard/15422.html) | A current-confirmed guarded-hot-plate measurement method for steady-state heat transfer through flat slab specimens; relevant to experimental specialist review and material/component test planning. | It is an experimental method, not a 2-D numerical bridge standard. It cannot validate profile geometry or periodic-cell assumptions by itself. |

## Verification and validation are separate claims

The report and release system must use the following meanings:

- **Software verification:** Did the implementation satisfy its contract? This includes schema validation, unit conversion, primitive construction, topology conservation, explicit boundary assignment, error categories, deterministic serialization, and regression tests.
- **Numerical verification:** Did the discretized worker solve the specified mathematical model accurately enough? This includes analytical solutions, refinement studies, solver residuals, heat balance, periodic-boundary checks, and repeat-cell stability.
- **Validation:** Does the mathematical/representative-cell model represent the intended physical construction closely enough for the stated use? This requires standards cases, independent solvers, published or experimental cases, and review of modelling assumptions. A converged wrong topology is still invalid.

The existing TypeScript seam already records `validity`, `convergence`, worker identity, pack versions, assumptions, provenance, and artifact references. It does not yet expose all gates required here. In particular, the current `numericalResult` shape has no explicit heat-balance result, repeat-cell comparison, geometry/material fidelity result, solver-agreement result, canonical input hash, or environment manifest. Those fields are prerequisites for a trustworthy production worker result.

## Recommended evidence ladder

| Level | Evidence | Required result/artifact | Release effect |
|---|---|---|---|
| L0 | Contract and schema verification | Versioned recipe schema, primitive registry snapshot, unit/axis rules, deterministic canonical JSON, invalid/unsupported fixtures, and schema diagnostics. | Without L0: Reject. |
| L1 | Software verification | Unit/property tests for every primitive, topology compiler, material assignment, boundary tagging, periodic mapping, heat-flux integration, and trust-state decision. CI must run the full fixture matrix. | Without L1: Reject. |
| L2 | Numerical method verification | Analytical homogeneous/serial-layer cases, at least three refinement levels for each solver family, solver residuals, heat balance, and repeat-cell stability. | A numerically passing but not externally validated result may be Preliminary unsafe estimate only. |
| L3 | Standards-based verification | Reproduce the applicable 2-D ISO 10211 reference cases from the licensed standard and record all required point temperatures/heat flows. Do not claim 3-D conformance from a 2-D worker. | Without L3: no Verified label. |
| L4 | Independent solver comparison | Compare like-for-like generated models against Feel++ and/or Conducteö/THERM. The comparator input must be geometry/material/boundary equivalent, not a hand-tuned result. | At least one independent comparator is required before a first Verified envelope. |
| L5 | Application validation | Validate representative timber, single C, two aligned C, two staggered C, and Z regression cases against published, measured, or specialist-reviewed references. Record model-form assumptions and uncertainty. | Required for each interaction-level validation pack. |
| L6 | Independent specialist review and release approval | A thermal-bridge specialist reviews geometry abstraction, boundary conditions, material/contact assumptions, evidence sufficiency, thresholds, results, and rejected cases. Sign the exact pack and hashes. | Mandatory recommendation for first approval and every material change to topology, solver, BCs, material/cavity model, or validation envelope. |

### Minimum evidence before production use

Production use may begin only as **Preliminary unsafe estimate** after L0–L2 are complete for the exact worker path, and after:

1. all topology and material regions are valid, complete, non-overlapping, and covered;
2. every critical input has a provenance state and no unresolved critical conflict;
3. the numerical result passes convergence, solver residual, heat balance, and repeat-cell gates;
4. the immutable input, result, diagnostics, versions, and runtime manifest are retained;
5. the report labels the result “Preliminary Unsafe Estimate — Not verified” and prevents compliance wording;
6. any missing L3–L6 evidence is shown as a concrete verification action.

This allows controlled design exploration while avoiding a false Verified claim. It is not permission to use an unsafe estimate as a regulatory submission or construction approval.

### Minimum evidence before any Verified label

L0–L6 are required for the exact interaction-level pack, including:

- all critical geometry, material, contact, periodicity, alignment, orientation, and boundary inputs authoritative or explicitly confirmed;
- an approved, versioned validation envelope;
- all numerical thresholds below passed;
- the 2-D ISO 10211 cases applicable to the claimed method passed;
- at least one independent solver/comparator agreement;
- the complete initial application matrix passed or has an explicitly bounded, reviewed exception;
- no unresolved rejection diagnostic;
- an independent specialist review and owner release approval.

The independent specialist review is a **mandatory product recommendation** for the first Verified pack and for any material change. Whether the owner wants that requirement to remain mandatory for maintenance-only changes is an owner decision; the default policy should be to retain it unless a documented change-impact assessment proves that the validated mathematical model and envelope are unchanged.

## Proposed quantitative gates

These are deliberately conservative **policy inferences** from the standard/comparator evidence, the product's safety boundary, and the current solver seam. They should be recorded in the validation pack rather than hard-coded as universal constants.

| Metric | Proposed production gate | Verified gate and interpretation |
|---|---:|---|
| Geometry validity | Zero uncovered area, zero positive-area overlaps, zero invalid rings, all exterior boundaries assigned exactly once, and all periodic counterpart boundaries conforming. Scale-aware geometry tolerance `g_tol = max(1e-9 m, 1e-8 × minimum declared feature size)`. | Same hard gate. A tolerance repair that changes a critical feature must be reported and cannot be silent. |
| Region/material conservation | Sum of generated region areas equals the declared cell area within `max(1e-10 m², 1e-8 × cell area)`; every region has one material ID and source/provenance. | Same hard gate, plus 100% coverage of critical material and geometry provenance. |
| Critical input fidelity | No critical value is `missing`, `estimated`, or `conflicting`. IFC evidence alone may suggest a family but cannot prove profile, gauge, spacing, row count, phase, contact, or orientation. | Every critical field is directly sourced or explicitly confirmed against a fabrication/detail/material source, or is a fixed validated default whose applicability is documented in the pack. |
| Linear-solver convergence | Solver reports convergence before iteration/time limits and exposes a residual or equivalent stopping metric. Target relative residual `≤ 1e-8`; if the solver uses another metric, the pack must map it to an equivalent bound. | Same hard gate; a result with no inspectable solver-convergence evidence is not Verified. |
| Mesh convergence | At least three geometrically refined meshes, normally with refinement ratio near 2, and final two effective-U values differ by `≤ 0.5%`. Non-monotone refinement requires one extra level and a documented asymptotic/GCI-style interpretation. | Same gate. A 1% standards comparison tolerance is not a substitute for internal convergence. |
| Heat balance | Hot-side and cold-side integrated heat flow agree within `≤ 0.5%` of the larger absolute through-flow; target is `≤ 0.1%`. Net periodic-side heat flow is `≤ 0.1%` of through-flow. | `≤ 0.1%` target; `> 0.5%` is Reject, not Preliminary. |
| Repeat-cell stability | Compare one declared repeat cell with a two-cell or equivalent expanded-period model using the same phase and boundaries. Effective U difference `≤ 0.5%`. | Same gate for every new row count/alignment/phase composition. A cell that is not the true periodic unit is Reject. |
| Analytical benchmarks | Homogeneous and serial-layer solutions agree within `0.1%` in U; point temperatures, where applicable, within `0.01 K`. | Same gate, with input and expected-value fixtures frozen and rerun in CI. |
| ISO 10211 reference cases | Reproduce all applicable 2-D cases and record the exact standard reference outputs. Working target: heat-flow difference `≤ 1%`; point-temperature difference `≤ 0.1 K` unless the purchased current standard specifies a tighter case-specific criterion. | Must pass every applicable case. Do not report “ISO 10211 validated” until the licensed edition, case set, values, and method claim are reviewed. |
| Cross-solver agreement | For at least one independent comparator, like-for-like effective U agrees within `≤ 1%`; reported point temperatures within `≤ 0.1 K` where the comparator exposes equivalent points. | Required per topology family and after solver/compiler changes. Comparator need not be production-deployed, but its inputs and version must be archived. |
| Geometry/material sensitivity | Perturb only non-critical numerical tolerances and confirm the result remains within `0.5%`; separately document the effect of every physical assumption such as contact resistance, cavity treatment, and thermal break. | No unquantified physical assumption may be hidden under a numerical tolerance. Sensitivity that moves U beyond the envelope tolerance requires a new pack or Preliminary status. |
| Reproducibility | Canonical request, recipe, registry, material pack, validation pack, worker/runtime manifest, and result artifacts are hashed. Same pinned environment reruns to identical canonical artifacts and U within `1e-6` relative. | Missing hash, mutable input, unpinned dependency, or unexplained rerun difference is Reject. Cross-platform differences must be separately measured and either bounded or unsupported. |

The `1%` ISO-style comparison target is deliberately not reused as the internal convergence target. Internal numerical error, model-form uncertainty, geometry/evidence uncertainty, and comparator uncertainty are different quantities and should not be silently added together.

## Initial validation envelope

The following is the proposed **pilot envelope**, not yet an approved production envelope. It is intentionally narrower than “any repeating profile wall.” Any value outside these bounds is either Preliminary unsafe estimate or Reject according to the decision table below.

| Case | Representative pilot geometry | Required evaluation |
|---|---|---|
| Timber framing | One rectangular timber row, 600 mm repeat, 45 mm member width, 140 mm depth, wood `λ = 0.12 W/mK`, mineral wool cavity `λ = 0.04 W/mK`, no hidden contact or fastener model. | Compare clear-wall serial/parallel analytical limits; sweep repeat 300/600/900 mm and depth 90/140/200 mm; prove the same rectangular primitive works without a timber-family branch. |
| One C-profile row | One parallel C section at 600 mm repeat, 150 mm depth, 50 mm flange, 20 mm lip, 1.5 mm gauge, steel `λ = 50 W/mK`, insulation `λ = 0.04 W/mK`. Pilot ranges: repeat 300–900 mm, depth 75–300 mm, flange 35–75 mm, lip 0–25 mm, gauge 0.5–3 mm. | Vary gauge and spacing; measure thin-feature mesh convergence; compare exact profile geometry against a second solver. Do not infer gauge or lip from an IFC label. |
| Two aligned C-profile rows | Two parallel C rows with the same 600 mm repeat and phase 0, separated by a declared through-wall gap/host-layer distance; each row uses the one-row pilot geometry. | Prove the combined cell is the true period, contacts/interfaces are not double-counted, and one-cell/two-cell results agree. Compare with a 3-D or specialist reference if the arrangement is physically coupled beyond a 2-D cut. |
| Two staggered C-profile rows | Same as aligned case, with the second row phase offset by half the 600 mm pitch (300 mm) and the offset explicitly encoded in the recipe. | Run aligned and staggered as separate interactions. Do not treat staggered as a property of the C primitive. Verify the periodic unit and phase-sensitive repeat-cell stability. |
| Z-profile regression | Existing `continuous-z-girt` fixture: ordered layers gypsum 13 mm / mineral wool 140 mm / sheathing 12 mm; Z depth 140 mm; inside/outside flanges 50/50 mm; gauge 1.5 mm; repeat 600 mm; steel `λ = 50 W/mK`; inside/outside air 20/0 °C; `Rsi = 0.13`, `Rse = 0.04 m²K/W`; inside-to-outside; no thermal break. | Recompile through the family-neutral recipe and the new geometry-conforming worker; compare with the existing worker only as a regression signal, not as truth; compare with an independent solver; replace the current broad expected-U tolerance with a measured/reference value and a defensible tolerance. |

The existing Z-girt validation pack is not sufficient evidence for a Verified release under this strategy. It currently marks itself approved and uses an expected U-value tolerance of `0.2 W/m²K`, which is too broad to function as a numerical acceptance gate for an expected result around `0.55 W/m²K`. That pack should be treated as a legacy regression fixture and demoted until the Z case passes the ladder above. This is a policy finding; changing the production pack is a follow-up implementation/owner action.

The pilot envelope deliberately excludes orthogonally crossed framing, arbitrary IFC solids, isolated screws/brackets, point bridges, discontinuous members, unproven contacts, and any 3-D effect represented by an unvalidated 2-D equivalent. Those cases must be rejected or routed to a different topology/physics module.

## Validation-envelope decision table

| Input provenance | Supported vocabulary/topology | Envelope match | Numerical evidence | External/pack evidence | Result |
|---|---|---|---|---|---|
| All critical inputs direct or confirmed; no conflict | Registered primitive composition and supported boundary/periodic model | Inside approved envelope | L0–L2 pass; convergence, residual, heat balance, repeat cell and reproducibility pass | Approved L3–L6 pack, including review | **Verified** |
| Critical values confirmed and model is valid | Supported composition | Inside envelope | L0–L2 pass | Pack not approved, ISO/comparator/review evidence incomplete, or worker not yet released | **Preliminary unsafe estimate** |
| Critical values confirmed | Supported composition | Outside approved envelope but still geometrically and numerically calculable | L0–L2 pass | No envelope evidence for this interaction | **Preliminary unsafe estimate**; request pack expansion or specialist review |
| One or more critical values estimated from a label/default, or evidence status is unresolved | Otherwise supported composition | Inside or outside | Numerical result may converge | Evidence is not sufficient for physical fidelity | **Preliminary unsafe estimate**; never Verified |
| Non-critical uncertainty only, with a pack-approved bounded default and sensitivity evidence | Supported composition | Inside envelope | All numerical gates pass | Pack explicitly permits the default | May be **Verified** only if owner-approved pack rules classify that default as authoritative for the interaction; otherwise Preliminary |
| Critical geometry/material/contact conflict, missing units, impossible dimension, or ambiguous row/phase | Unsupported or indeterminate | Not meaningful | May or may not converge | No safe physical interpretation | **Reject** until resolved |
| Unregistered primitive, crossed rows, discontinuous/point bridge, arbitrary IFC solid, unsupported cavity/contact/3-D effect | Unsupported topology | Not meaningful | Solver result is not admissible | No applicable validation pack | **Reject**; route to a new module |
| Overlap, gap, invalid ring, uncovered region, bad periodic pairing, boundary not assigned exactly once | Any | Invalid | No admissible solve | None | **Reject** |
| Solver fails, mesh does not converge, heat balance fails, repeat-cell stability fails, or residual/timeout limit is exceeded | Any | Any | Numerical evidence fails | None | **Reject**, not Preliminary |
| Worker/adapter/pack incompatible, missing artifact/hash/version, or rerun is not reproducible | Any | Any | Cannot audit result | Release evidence invalid | **Reject** |

An ordinary IFC label such as “C stud” or “Z rail” is family-suggestion evidence, not Verified geometry evidence. It can produce an opportunity and a Preliminary unsafe estimate only after a valid model is built from explicit assumptions; it cannot silently fill profile shape, gauge, spacing, alignment, or row count.

## Required validation artifact

Every validation run and every production calculation that can be shown to a user should retain a manifest containing:

```text
caseId and validation-pack version
canonical recipe JSON and SHA-256
primitive registry names, versions, and snapshot hash
source evidence references and provenance state per critical input
material/property identifiers, values, units, and source/version
boundary profile, temperatures, surface resistances, and orientation
topology audit: area, overlaps, gaps, slivers, interfaces, periodic pairs
mesh levels, element/cell counts, local size controls, and mesh quality
solver identity/version, runtime/dependency manifest, residuals, iterations, timeout
heat flow on every relevant boundary and heat-balance residual
one-cell/two-cell comparison and phase/repeat metadata
effective U, temperatures, fluxes, warnings, and all rejected checks
independent comparator identity/input hash/result/difference
reference values, tolerances, and pass/fail outcome
reviewer identity, review date, decision, and signed pack hash
```

The artifact is part of the result, not an optional debug file. If it cannot be retained, the calculation cannot be labelled Verified.

## Gap-closing work plan

| Gap | Exact work needed | Owner/closure evidence |
|---|---|---|
| G1: normative reference values | Purchase the current ISO 10211 edition, extract the applicable 2-D reference geometries, materials, boundary conditions, point temperatures, heat flows, and case-specific tolerances into a versioned internal fixture with copyright-safe metadata. | Standards owner signs the fixture source and edition; automated L3 report passes. |
| G2: analytical suite | Implement homogeneous slab, serial-layer, uniform-material, and simple parallel-path cases with independently calculated expected results. Include temperature and flux checks, not only U. | CI fixture report with ≤0.1% U error and stated temperature tolerance. |
| G3: geometry compiler audit | Build conservation/overlap/gap/sliver/periodic-boundary checks and invalid fixtures for timber, C, two-row aligned/staggered, and Z. | Deterministic topology-audit artifacts; all invalid fixtures reject before the solver. |
| G4: worker numerical evidence | Replace the current two-level/basic result with multi-level refinement, solver residual, hot/cold/periodic flux accounting, repeat-cell comparison, and complete environment/hash manifest. | Worker proof from Ticket 01 plus L2 report. |
| G5: Feel++ comparator | Recreate the published Feel++ ISO case and at least one pilot recipe with equivalent geometry/material/boundary inputs. Freeze the comparator version and input/output hashes. | Cross-solver report with ≤1% U difference and point-temperature comparison where available. |
| G6: Conducteö audit | Inspect the repository's `validations` fixtures, build/run it in an isolated process if practical, determine whether it can accept equivalent geometry and export auditable results, and obtain a GPLv3 distribution decision. | Comparator audit. If not automatable, retain it as a specialist/reference review tool rather than a production dependency. |
| G7: published/application cases | Obtain the ORNL/ASTM C236 steel-framed wall data or another peer-reviewed case with complete geometry, materials, boundary conditions, and uncertainty. Add at least one timber or wood-framed case if timber remains in the initial envelope. | L5 validation report that separates experimental uncertainty from numerical/model discrepancy. |
| G8: initial envelope matrix | Run the five pilot cases and parameter sweeps, including one/two-cell stability and aligned/staggered phase. Record pass/fail per metric rather than only a final U value. | Candidate validation pack with explicit parameter bounds and exclusions. |
| G9: independent specialist review | Engage a thermal-bridge specialist to review the model abstractions, standards mapping, comparator equivalence, thresholds, pilot results, and rejected cases. | Signed review and review scope attached to the pack. |
| G10: trust-gate implementation | Extend the validation pack/result schema and trust evaluator so missing heat balance, repeat-cell, solver agreement, provenance, or artifact gates cannot still produce `verified`. | Tests that each failed gate downgrades or rejects according to the decision table. |

## Findings, proposed policy, and owner decisions

### Research findings

- ISO 10211 is the appropriate detailed thermal-bridge method family for the 2-D numerical claim; ISO 6946 is a clear-wall/serial sanity check and explicitly does not cover insulation bridged by metal in the general case.
- Feel++ provides a credible independent, documented ISO-style heat-toolbox case; Conducteö provides a credible open-source comparator candidate, but its GPLv3 license, GUI-oriented public documentation, and unverified validation fixtures limit its immediate role.
- Netgen/NGSolve has the required geometry/material/periodicity capabilities, but capability documentation is not validation evidence.
- Published steel-frame hot-box comparisons show why application validation matters: numerical agreement with a measured wall can be several percent even after a model is tuned. That discrepancy must not be hidden behind a solver convergence number.
- The current Conformity trust seam is directionally correct, but the existing numerical result contract is not yet rich enough to enforce this strategy.

### Proposed product policy

- Use the three states exactly as defined above.
- Treat Verified as a versioned interaction-level claim, never as approval of a primitive or family name.
- Require L0–L2 for any production Preliminary unsafe estimate.
- Require L0–L6 for Verified, with independent specialist review mandatory for first approval and material changes.
- Use the proposed thresholds as the initial working gates, with threshold values stored in each validation pack and reported with the result.
- Demote the current Z-girt pack's `approvedForVerification` status until the regression case is rebuilt and independently checked.
- Reject unsupported topology and numerical failure; do not convert failed results into wide “estimate ranges” without an explicit uncertainty model and owner-approved policy.
- Keep Conducteö out of the shipped runtime unless licensing, automation, and comparator audit are separately closed.

### Decisions requiring owner approval

1. Approve the initial pilot parameter bounds, especially timber material values, two-row separation/contact semantics, C-profile gauge/lip ranges, and whether surface-resistance profiles are fixed by pack or user-confirmed.
2. Approve the proposed quantitative gates, or authorize a named thermal specialist to set them within the documented risk framework.
3. Confirm that external specialist review is mandatory for every new Verified pack and material envelope expansion, or define a narrower change-impact exception.
4. Approve the standards-access/licensing budget for ISO 10211 and the legal treatment of GPLv3 Conducteö.
5. Decide whether a Preliminary unsafe estimate may be used in any production workflow beyond design exploration; the recommendation is no compliance/construction approval use.

## Immediate adoption and downstream blockers

### Can adopt immediately

- The interaction-level definition of Verified.
- The distinction between software verification, numerical verification, and physical/application validation.
- The three-state decision table and rejection rules.
- The requirement for complete provenance, worker/version identity, canonical hashes, and retained numerical artifacts.
- The L0–L2 minimum bar for Preliminary unsafe estimates.
- The rule that IFC labels suggest a family but do not prove topology inputs.
- The demotion of the current Z-girt pack as a Verified authority until its regression evidence is rebuilt.

### Exact blockers for Ticket 04 — prove generality with conformance recipes

Ticket 04 remains blocked by Tickets 01 and 02 as stated in its brief. It additionally needs:

- the immutable recipe/primitive contract and valid/invalid fixture bundle from Ticket 02;
- a worker that can emit the geometry audit, convergence, heat-balance, repeat-cell, and reproducibility artifacts required by L2;
- owner agreement on the pilot envelope and the aligned/staggered row semantics;
- a decision on which independent comparator is available for the conformance bundle.

Until those are available, Ticket 04 can demonstrate schema generality but cannot close the required conformance claim.

### Exact blockers for Ticket 05 — lock production architecture and rollout

Ticket 05 remains blocked by Tickets 01, 02, and 04 as stated in its brief. This report adds the following release decisions that must be resolved before architecture lock:

- owner approval of the three-state trust policy and proposed thresholds;
- confirmation of mandatory specialist review and the change-impact exception, if any;
- closure of ISO 10211 reference data/access;
- closure of Feel++/Conducteö comparator roles and GPLv3 treatment;
- a passing initial validation matrix for timber, one C row, two aligned/staggered C rows, and the Z regression case;
- implementation of the richer worker/result artifact contract and trust gates;
- explicit decision to keep current Z-girt Verified approval disabled until revalidation.

Ticket 05 should not publish production implementation tickets from the current Z-girt pack or from a worker result that lacks heat-balance, repeat-cell, solver-agreement, and hash evidence.

