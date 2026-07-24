# Component topology generality proof — 2026-07-23

## Decision

**Generality proven with named contract changes.** One registry-driven recipe
path compiles and solves timber framing, one C row, aligned and staggered C
rows, and the Z regression without primitive or construction-family names in
the shared compiler. All five cases pass topology conservation, four mesh
refinements, solver residual, conservative hot/cold balance, H(div) periodic
balance, and one/two-cell stability gates.

This is a software/numerical generality decision, not a production `Verified`
claim. Independent comparator, standards cases, validation-envelope approval,
and specialist review remain Ticket 05 inputs.

## Reproduction

Create the pinned environment and run the proof from the repository root:

```powershell
uv python install 3.12.10
uv venv --python 3.12.10 .scratch/component-topology-kernel/conformance-proof/.venv
.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe -m pip install -r .scratch/component-topology-kernel/worker-spike/requirements.txt
.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe .scratch/component-topology-kernel/conformance-proof/verify.py
```

The command exits non-zero on compilation, rejection-diagnostic, topology, mesh,
residual, heat-balance, periodic-balance, repeat-cell, hash, or source-neutrality
regression. Machine-readable artifacts are under
`.scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/`.
The default run compares against `expected-stable-results.json`; source,
primitive implementation/capability, material-pack, validation-pack, runtime,
accepted-result, and rejection-diagnostic drift cannot generate and approve its
own replacement hash.

## Interface proof

```text
Recipe
  -> Primitive Registry.resolve(kind, version)
  -> Primitive Plugin emits local polygon + contact boundary
  -> generic compiler places/repeats geometry
  -> Boolean cell composition and material partition
  -> Canonical Analysis Geometry
  -> Ticket 01 Netgen/NGSolve finite-element adapter
  -> numerical evidence and reproducibility artifacts
```

The shared compiler knows rows, placement, relative phase, representative-cell
selection, layers, materials, contacts, regions, periodicity, and supported 2-D
composition. Only the plugin module contains primitive identifiers or local
parameter names. A behavioral extension test registers `vendor.block` and
compiles it without changing the shared compiler; capability-mismatch tests
prove incompatible registrations reject.

## Feature ownership matrix

| Capability | Shared compiler | Primitive plugin | Solver adapter | Validation policy |
| --- | --- | --- | --- | --- |
| Local rectangle/C/Z/hat polygon | — | owns | — | version/envelope |
| Row placement, phase, repetition | owns | — | — | supported vocabulary |
| Periodic cell-origin selection | owns | exposes local bounds | consumes paired edges | repeat-cell gate |
| Boolean overlap/gap/sliver audit | owns | emits valid polygon | — | quantitative tolerances |
| Material regions and contacts | owns | contact boundary | material domains | conservation gate |
| Mesh and finite-element solve | — | — | owns | refinement/residual gates |
| H(div) boundary diagnostics | — | — | owns | periodic gate |
| U-value heat-flow basis | — | — | energy + reaction check | convergence/balance gates |
| Verified eligibility | — | — | emits evidence | owns |

## Results

Thresholds are: final mesh change `≤ 0.5%`, residual `≤ 1e-8`, conservative
hot/cold imbalance `≤ 0.5%`, H(div) periodic net `≤ 0.1%`, and one/two-cell U
difference `≤ 0.5%`. Timber used the required fourth level after its first
three refinements were non-monotone.

| Case | Final elements | U (W/m²K) | Mesh change | H(div) periodic | One/two cell |
| --- | ---: | ---: | ---: | ---: | ---: |
| Timber | 34,362 | 0.322451 | 0.0030% | 0.00010% | <0.00001% |
| Single C | 33,202 | 1.109605 | 0.0033% | <0.00001% | 0.0342% |
| Aligned C rows | 43,966 | 0.343681 | 0.1164% | <0.00001% | 0.0015% |
| Staggered C rows | 43,548 | 0.264934 | 0.0485% | 0.00425% | 0.0014% |
| Z regression | 109,768 | 0.239986 | 0.0354% | <0.00001% | 0.0017% |

Every final conservative hot/cold imbalance is below `1.4e-12`; every final
free-DOF residual is below `5e-12`. Every topology audit reports zero gap,
overlap, area residual, out-of-host area, and slivers.

Crossed framing, discrete point fixings, disconnected primitive geometry,
out-of-host components, and an unregistered primitive reject before meshing
with frozen diagnostics. Missing required primitive dimensions remain
`incomplete`/`blocked` in compiler tests.

## Named contract changes

1. **Primitive output contract:** `PrimitiveRegistration.compile` returns local
   polygonal regions and contact boundaries; it does not write solver geometry.
2. **Canonical Analysis Geometry:** add a versioned compiler result containing
   cell polygon, explicit material regions, interfaces, periodic metadata,
   topology audit, and the exact primitive-registry manifest.
3. **Representative-cell origin:** `offsetX` defines relative row phase. The
   compiler may choose and record a deterministic global cell-origin shift to
   avoid cutting a member; relative alignment must not change.
4. **Heat-flow basis:** the Ticket 01 interpolated H(div) face mean is retained
   as boundary evidence but is not sufficiently stable for primary U on thin,
   high-conductivity regions. Primary heat flow is volume energy, checked
   independently against equal-and-opposite Dirichlet reactions. H(div) remains
   the periodic-flux diagnostic.
5. **Refinement rule:** run at least three levels; add a fourth whenever the
   first sequence is non-monotone, as the validation strategy requires.
6. **Reproducibility manifest:** pin and hash primitive implementations and
   capabilities, compiler/solver sources, recipe schema, material values/units,
   validation thresholds/boundaries, requirements, and runtime versions. Compare
   results to a separately reviewed frozen manifest on every verification run.

## Remaining limits and Ticket 05 inputs

- The Z case proves the generic numerical path but does not yet retire legacy Z
  behavior as validated truth; an independent comparator/reference value is
  still required.
- Hat, cavities, thermal breaks, symmetry boundaries, and imperfect/contact
  resistance need their own interaction fixtures before entering an approved
  Validation Envelope.
- The proof uses exact reviewed recipe parameters. IFC labels alone still do not
  establish geometry, placement, gauge, material, or contact authority.
- Crossed rows, discrete fasteners, brackets, junctions, disconnected members,
  and other 3-D effects require a different Topology Module.

Ticket 05 may now treat recipe/compiler generality as closed, subject to the six
contract amendments above. Production `Verified` rollout remains blocked on the
external validation and owner approvals already named in the validation strategy.
