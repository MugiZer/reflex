## Problem Statement

Architects importing an IFC must currently answer manual lambda questions for material names that the BIM-to-Physics Compiler already has enough information to recognize, including `LMA_Montant bois porteuse`, `Plaque de mur de gypse`, `Béton, coulé sur place`, `Isolant rigide`, and `Contreplaqué traité`. This makes the Review workflow recreate the manual layer-entry work the product is intended to remove.

The supplied project evidence also shows a distinct class of cases that are not missing a simple material conductivity: unnamed layers, curtain walls without an ordered opaque layer stack, slabs with unknown role/boundary condition, air cavities, and metal framing/cladding/fixings. Treating those cases as ordinary serial layers and inventing a lambda would produce an unjustifiably precise result.

## Solution

Resolve material names from IFC layer evidence against a versioned bilingual Material Library before Requested Inputs are planned. A single unambiguous match automatically supplies the library lambda and allows a calculation to proceed. The Calculation Snapshot and Report retain the raw IFC name, matched library entry, normalization/match basis, lambda source, and an explicit `library-assisted / assumed` evidence state. Manual material selection becomes an optional override for an auto-resolved layer and the concise recovery route for ambiguity.

The resolver must be robust to French and English aliases, accents, punctuation, IFC/project prefixes, dimensions, casing, and common UTF-8-as-Windows-1252 display corruption. It may only auto-resolve a unique eligible material family. Ambiguous or physics-sensitive patterns must be classified and routed to the appropriate evidence/modeling action, never silently assigned a serial-layer lambda.

### Resolution policy

| IFC layer pattern | Initial behaviour |
| --- | --- |
| Gypsum, softwood/plywood, ordinary concrete, concrete block, masonry brick, rigid or semi-rigid insulation | Automatically resolve when the normalized name identifies one library family. |
| Raw name with `LMA`, CSI-style number, dimension, or harmless qualifier | Strip/normalize naming noise and resolve only if one eligible family remains. |
| Explicit product/model/standard information | Prefer extracted IFC lambda, then user override, then library-assisted value. |
| Membrane, lightweight concrete panel, or any family with materially variable product performance | Do not claim a deterministic product value without an unambiguous approved library mapping or product evidence. |
| Air cavity, metal stud/furring/Z-bar, metal cladding/fixing | Do not model as a normal serial lambda layer; surface/cavity/parallel-path treatment is required. |
| Curtain wall, unnamed material, or non-layered assembly | Keep blocked/needs-review with a specific evidence request; no generic material picker. |
| Slab with uncertain role | Require or derive slab classification before final U-value treatment. |

## User Stories

1. As an architect, I want recognizable IFC material names to calculate immediately, so that I do not re-enter common construction materials.
2. As an architect, I want French and English names to resolve to the same material family, so that language does not create Review work.
3. As an architect, I want project prefixes, dimensions, punctuation, and accents ignored when they do not change material meaning, so that normal BIM naming conventions work.
4. As an architect, I want an auto-resolved value visibly labelled as assumed from the Material Library, so that I know its evidence level.
5. As an architect, I want to replace an assumed library value with a chosen product value, so that I can produce a more specific calculation without redoing the assembly.
6. As an architect, I want an ambiguous material to ask one concise material question, so that I resolve only the uncertainty that matters.
7. As an architect, I want metal framing and air cavities identified as construction-modeling issues, so that the app does not give me a false U-value.
8. As an architect, I want curtain-wall and unclassified-slab blockers to explain the missing assembly evidence, so that I know what IFC or consultant information is required.
9. As an architect, I want the Report to show the original layer name, matched library material, source, and confidence, so that the calculation is auditable.
10. As an architect, I want a full IFC review to prioritize true evidence gaps after library matching, so that manual Review stays short.
11. As a reviewer, I want a product-backed override to supersede a library assumption while preserving extracted IFC evidence, so that revisions remain traceable.
12. As a maintainer, I want conservative deterministic matching, so that a new alias cannot silently map to the wrong material family.
13. As a maintainer, I want fixtures based on the supplied project naming patterns, so that regression tests reflect real IFC input.
14. As a building-performance consultant, I want uncertain boundary conditions and thermal bridges kept distinct from material lookup, so that preliminary calculations are not presented as verification.

## Implementation Decisions

- Material Resolution is the sole seam between Layer Evidence and Review planning. Requested Inputs are planned only for layers still unresolved after precedence has been applied.
- Precedence is: extracted IFC fixed lambda, applicable User Input, unambiguous Material Library match, unresolved.
- Material Library entries gain aliases and match metadata sufficient to distinguish auto-eligible generic families from product-sensitive or special-physics families.
- Normalization is Unicode-aware and deterministic. It preserves the raw name for provenance while generating comparison candidates that handle case, diacritics, punctuation, project prefixes, dimensions, French/English vocabulary, and a bounded mojibake repair candidate.
- A match must have exactly one eligible library candidate. Multi-match, excluded, and low-confidence token matches are unresolved/suggested; they are never auto-applied.
- Library-assisted results are calculated but represented as assumptions, not as product-verified evidence. UI, Architect Action View, revisions, and Report must expose that state consistently.
- The manual material selector remains an override/confirmation control; it must not be mandatory where resolution is automatic.
- Special-physics classifiers are separate from Material Resolution. Metal paths, cavities, curtain-wall systems, non-layered evidence, and uncertain slab roles receive category-specific actions rather than an ordinary lambda field.
- This scope does not add a complete parallel-path, cavity, curtain-wall, or ground-slab calculation engine. It establishes honest routing and preserves the seam for later calculation modules.

## Testing Decisions

- Test externally observable resolution outcomes and Requested Input behaviour, not private normalization steps.
- Use fixtures covering the project patterns: French/English gypsum, softwood, plywood, cast-in-place concrete, concrete block, rigid/semi-rigid insulation, accented/prefixed/dimensioned names, and the text-encoding variant.
- Prove a known material receives a calculation without a `layer_lambda` Requested Input, retains library provenance, and can be overridden by a chosen product.
- Prove multiple plausible materials never auto-resolve.
- Prove air cavities, metal framing/fixings, curtain walls, unnamed layers, and uncertain slabs do not get a fabricated serial lambda result and receive the correct next action.
- Extend existing domain resolver, Review planning, Architect Action View, report, job API, and end-to-end verifier coverage rather than creating a parallel test harness.

## Out of Scope

- Manufacturer product data ingestion, external material-database synchronization, or claiming a certification/compliance verdict.
- Complete thermal-bridge/parallel-path, ventilated-cavity, curtain-wall, or ground-contact slab calculation methods.
- Changing extracted IFC Evidence or overwriting raw material names.
- Broad language localization of the entire UI.

## Further Notes

The supplied input list demonstrates why a single generic “provide thermal conductivity” form is the wrong abstraction. Many prompts are resolvable library assistance; the rest need a different evidence or physics workflow. The product should reduce manual work by resolving the former and make the latter explicit, not hide them behind the same picker.
