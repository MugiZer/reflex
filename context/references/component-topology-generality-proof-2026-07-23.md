# Component topology generality proof — 2026-07-23

## Decision

**Not proven.** The isolated conformance compiler demonstrates schema and
topology-audit generality, but not the required physical/numerical conformance
claim. The Ticket 01 worker remains C-profile-only and does not emit the L2
geometry, convergence, heat-balance, repeat-cell, and reproducibility evidence
required by the validation strategy for every registered primitive.

## Reproducible evidence

Run:

```powershell
python .scratch/component-topology-kernel/conformance-proof/verify.py
```

The script compiles these recipes using one row/primitive loop with registry
dispatch—no construction-family branches:

| Recipe | Kernel composition | Primitive registration | Outcome |
| --- | --- | --- | --- |
| Timber framing | one row, periodic cell | `standard.rectangle` | accepted |
| C-stud | one row, periodic cell | `standard.c` | accepted |
| Double C-stud | two aligned rows | `standard.c` | accepted |
| Double C-stud | two staggered rows | `standard.c` | accepted |
| Z regression | one row, periodic cell | `standard.z` | accepted |

The same run rejects crossed framing, missing member depth, and an unregistered
primitive with stable `unsupported`/`incomplete` diagnostics. The generated
machine-readable report includes cell/member/filler area, conservation
residual, interface count, periodic-pair count, U-value proxy, and runtime.

## What the prototype proves

- The draft recipe can express one/two row alignment and phase entirely as
  `originY`/`offsetX` recipe data.
- The compiler’s shared path requires no timber, stud, or Z-girt name.
- Conservative host bounds, same-phase overlap, cavity conservation, crossed
  framing, missing dimensions, and unknown primitive checks can live at the
  generic compiler/validation seam.

## What it does not prove

The U-value is a clearly labelled deterministic parallel-path proxy, not a
solver output. Therefore mesh convergence and heat balance are intentionally
reported as not proven, not fabricated. The existing Z fixture also differs
from the validation-strategy dimensions, so it is only a recipe regression.

## Required contract and worker changes

1. Freeze Ticket 02’s draft contract as an immutable versioned specification;
   it is currently only a fixture bundle.
2. Expand the worker request from C-only geometry to primitive-registry output
   (canonical polygons/regions/interfaces), not a family switch.
3. Require every accepted result to carry topology audit, three or more mesh
   refinements, solver residual, boundary/periodic heat balance, one/two-cell
   stability, and pinned artifact hashes.
4. Define two-row contact/separation semantics and validate real primitive
   polygon intersections rather than this prototype’s same-phase guard.
5. Rebuild the Z regression recipe against the exact declared legacy geometry
   and an independent comparator before treating it as a numerical regression.

## Ticket 05 blockers

Ticket 05 remains blocked: the numerical worker contract, validation-envelope
owner decisions, comparator choice, and a passing physical conformance matrix
for all five cases are still missing.
