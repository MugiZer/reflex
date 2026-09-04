# BIM-to-Physics compiler domain

**Status:** active

## Purpose

Turn IFC construction evidence into reviewable thermal calculations and HTML
reports without asking architects to rebuild every assembly manually.

## Lifecycle

1. Extract **IFC Evidence** with paths checked, provenance, and diagnostics.
2. Derive conservatively grouped **Assembly Groups** from that evidence.
3. Resolve known material properties and expose **Missing Datapoints** for the
   rest.
4. Apply confirmed **User Input** as a scoped override and create a new
   immutable **Revision**.
5. Produce a **Calculation Snapshot** and a report that exposes its basis,
   assumptions, warnings, readiness, and confidence.

## Truth and uncertainty

- IFC Evidence is never changed by review input.
- A precise single U-value requires fixed layer thickness, lambda, units, and
  a surface-resistance profile. Incomplete evidence produces review work or a
  clearly labelled estimate/range.
- Group only high-confidence matches; uncertain elements remain separate or
  need review.
- A fuzzy material match is a suggestion, never a silent final value.
- `IfcSlab` classification is uncertain until its role is supported by evidence
  or user confirmation.

## Calculation

For a layered assembly:

```text
R_layer = thickness_m / lambda
R_total = Rsi + sum(R_layer) + Rse
U = 1 / R_total
```

Use metres, `W/mK`, `m2K/W`, and `W/m2K` respectively. Preserve the source of
every input: IFC, material library, system estimate, or user input.

## Scope

The product covers walls, slabs, and roofs; evidence extraction; review;
thermal calculation/estimation; immutable revisions; and HTML reporting. It
is not a whole-building energy model, native BIM plugin, condensation solver,
window/door analysis, billing system, or cloud platform.

For exact names and aliases, use `UBIQUITOUS_LANGUAGE.md`. For implementation
constraints, use `context/working-contract.md`.
