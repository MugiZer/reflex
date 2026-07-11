# Refactor Plan: Review Granularity for Material Decisions and Assembly Groups

## Problem Statement

The Review workflow currently exposes exact missing layer datapoints directly as user questions. After the layer identity refactor, this is truthful but unusable: one IFC can produce more than a thousand `layer_lambda` occurrence prompts. The deeper issue is that **Missing Datapoint** and **Requested Input** are doing two different jobs:

- Missing Datapoint records the exact absent calculation fact.
- Requested Input should be the review decision the user can reasonably make.

The product needs exact per-layer truth internally, but user review should happen at higher-level decision granularity.

## Solution

Introduce review grouping as a small domain module:

- Level 1 remains layer occurrence truth.
- Level 2 groups missing `layer_lambda` by normalized material name into a **material decision**.
- Level 3 groups identical explicit layer stacks into deterministic **assembly groups**.

Material decisions ask for one lambda value per unresolved material and carry the affected layer occurrences. Assembly groups give repeated wall/slab/roof stacks one stable review group id and one display context.

## Commits

1. Add review grouping identity helpers for normalized material keys, material decision ids, assembly stack signatures, and deterministic group ids.
2. Extend Requested Input scope types with material decision scope and affected layer occurrences.
3. Change requested input planning so known-material missing `layer_lambda` prompts are grouped by material decision.
4. Keep unknown-material and non-lambda missing inputs as precise occurrence or assembly prompts.
5. Update review context building so material decisions show material labels, affected element counts, affected layer counts, and display target elements.
6. Update review input validation and override creation to accept material decision scope.
7. Update physics assembly building so one material decision user input resolves all matching layer occurrences.
8. Add deterministic assembly stack grouping for explicit layered evidence.
9. Use assembly stack group ids in requested input planning and physics assembly output when a trustworthy explicit stack is available.
10. Add regression tests for material decision grouping, multi-layer application, and assembly stack grouping.
11. Run full tests, typecheck, e2e verifier, milestone verifier, and real IFC count check.

## Decision Document

- Layer occurrence remains the source of calculation truth.
- Material decision grouping is only automatic when a layer has a known material name.
- Material decision grouping uses exact normalized material labels only; no fuzzy matching.
- User answers to material decisions apply only to affected layer occurrences in the current review state.
- Assembly group ids are derived from explicit element class, ordered material names, and normalized layer thicknesses.
- If a stack lacks explicit layer metadata, the system falls back to the existing single-element group id.
- IFC evidence is not mutated by user input.

## Testing Decisions

- Test requested-input planning through its public interface.
- Test review context through the View Model public interface.
- Test calculation behavior through `buildPhysicsAssemblies` and the core review/report workflow.
- Real IFC verification should prove that per-layer missing datapoints collapse to material-decision prompts without losing affected layer references.

## Out of Scope

- Fuzzy material matching.
- Expanding the material library.
- Inferring lambda from `ThermalTransmittance`.
- Full UI redesign.
- Persisting a separate material-decision table.
- Cloud or multi-user workflows.
