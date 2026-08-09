# 02 — Define the recipe and primitive-registry contract

**What to build:** Define the family-neutral contract that lets existing IFC layer evidence work alone, while optionally enriching it with composable component topology. The contract must support new primitives through registration rather than kernel edits and must prevent unsupported or uncertain inputs from becoming verified results.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Execution mode:** HITL architecture investigation. Ask only questions that materially change ownership, extensibility, safety, or user-visible behavior; ask them one at a time. Do not modify production code.

**Parent investigation:** `context/issues/component-topology-kernel/002-define-recipe-and-primitive-registry.md`

## Required return artifacts

1. Contract specification: `context/specs/declarative-construction-recipe-contract.md`.
2. Schema and conformance fixtures: `.scratch/component-topology-kernel/recipe-contract/`.
3. Updates to the canonical domain glossary/decision record if the repository already maintains them; otherwise identify exactly where those updates should land.

The fixture bundle must include a draft machine-readable schema, valid examples for timber framing, a single C-profile row, two aligned or staggered C-profile rows, and a Z-profile regression case, plus at least four invalid or unsupported cases.

## Acceptance criteria

- [ ] The specification defines the ubiquitous language and the smallest stable kernel/module/primitive interfaces with explicit invariants.
- [ ] Units, axes, orientation, host-layer coordinates, projected area, periodicity, spacing, offsets, contacts, cavities, material regions, boundaries, and thermal breaks have unambiguous semantics.
- [ ] Every field is assigned an authority/provenance state such as IFC-derived, user-confirmed, validated default, preliminary estimate, conflicting, or missing.
- [ ] The contract clearly separates business policy, domain calculation, recipe compilation, primitive registration, geometry/solver infrastructure, and presentation concerns.
- [ ] A common primitive registration interface covers rectangular, C, Z, and hat members without family-name conditionals in the kernel.
- [ ] Schema versioning and compatibility rules allow a new primitive to be added without changing the kernel while rejecting unsupported semantics predictably.
- [ ] Error categories distinguish invalid, incomplete, unsupported, conflicting, outside-validation-envelope, and infrastructure failure.
- [ ] The contract explains when an extension is a new primitive, a new recipe composition, or a genuinely different topology/physics module.
- [ ] Rejected alternatives and their trade-offs are recorded, including arbitrary geometry in the recipe language and family-specific schemas.

## Closure response

Return the artifact paths, the approved interface boundaries, examples that prove family neutrality, decisions still awaiting the user, and any blockers imposed on Tickets 04 or 05.
