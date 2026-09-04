# Declarative Construction Recipe Contract

## Decision

Optional topology enrichment uses the versioned Declarative Construction Recipe and Primitive Registry contract in `context/specs/declarative-construction-recipe-contract.md`. The kernel resolves primitives through registration and has no family branches.

A geometry-compilable Recipe whose semantics are understood but fall outside the current Validation Envelope may return only a Preliminary Unsafe Estimate, with warnings, assumptions, provenance, and the non-Verified reason. Missing, conflicting, invalid, or unsupported semantics block or reject topology output; the existing layer-only workflow remains available.

## Consequence

The initial Verified envelope can be deliberately narrow or empty and grows only from approved reference and validation evidence. New cross-sections use primitive registration; new constructions use Recipe packs; different dimensionality or physics requires a new Topology Module.
