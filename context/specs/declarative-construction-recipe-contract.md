# Declarative Construction Recipe and Primitive Registry Contract

## Status and purpose

This is the version `1.0.0-draft` contract for optional component-topology
enrichment.  It turns already-preserved IFC layer evidence and/or reviewed
inputs into an immutable **Declarative Construction Recipe** (Recipe).  The
first **Topology Module**, `repeating-parallel-profile-wall-2d`, can compile a
Recipe into a two-dimensional, one-period thermal model.

The Recipe is optional.  Absence, incompleteness, conflict, or unsupported
semantics never changes the existing layer-only calculation or makes a result
Verified.  A module may return a **Preliminary Unsafe Estimate** only when it
understands all Recipe semantics and geometry compiles, but the Recipe is
outside its versioned Validation Envelope.  That result must name the missing
validation coverage, assumptions, warnings, and provenance.  Unsupported
semantics are rejected or blocked, never approximated silently.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Recipe** | Versioned, immutable declarative description of an analysis-ready component, not an IFC extract or arbitrary CAD model. |
| **Topology Module** | Dimension- and physics-specific compiler/solver boundary.  It declares its supported Recipe semantics. |
| **Primitive** | Registered parametric cross-section generator such as `rectangle`, `c`, `z`, or `hat`; it owns only its local shape vocabulary. |
| **Primitive Registry** | Versioned lookup from primitive kind/version to parameter schema, capability declaration, and compiler implementation. |
| **Row** | One periodic sequence of identical member instances along the horizontal `x` axis.  The first module supports one or two parallel rows. |
| **Representative Cell** | One closed periodic domain of width `periodicity.period`, from `x=0` inclusive to `x=period` exclusive. |
| **Material Region** | A non-overlapping, positive-area domain assigned exactly one material reference. |
| **Cavity** | A named material region deliberately introduced between/around members; it is not an implicit uncovered gap. |
| **Thermal Break** | An explicit low-conductivity Material Region intersecting/replacing a member region according to the registered primitive capability. |
| **Validation Envelope** | Versioned combination of module, primitive versions, parameter ranges, material assumptions, boundaries, and reference evidence eligible for Verified. |
| **Authority** | Provenance/trust state attached to every Recipe datum, independent of its value. |

The canonical glossary is `UBIQUITOUS_LANGUAGE.md`; this contract's terms are added there alongside this specification.

## Stable kernel boundaries

```text
IFC evidence / reviewed inputs -> Recipe authoring -> Recipe validation
                                        |                  |
                                     authority          registry resolution
                                        |                  v
layer-only calculator <---- optional Topology Module -> geometry/solver worker
                                        |                       |
                                  validation policy          infrastructure
                                        v
                              result classification -> presentation/report
```

| Concern | Owns | Must not own |
| --- | --- | --- |
| IFC evidence | raw IFC facts and paths | Recipe inference or mutation by user input |
| Recipe authoring | mapping evidence/review values to authority-tagged Recipe fields | geometry or validation decisions |
| Kernel | version negotiation, registry lookup, structured diagnostics, routing | primitive/family conditional geometry |
| Primitive registration | local parameter validation, shape construction, declared capabilities | policy, solver, presentation |
| Recipe compiler/Topology Module | representative-cell composition, contacts, region partition, supported semantic checks | IFC parsing or family names |
| Domain calculation | physical result from a compiled model | validation eligibility |
| Validation policy | envelope membership and Verified eligibility | making unsupported geometry work |
| Geometry/solver infrastructure | meshing, numerical solve, timeout/process failure | business trust state |
| Presentation | warnings/provenance/result labels | reinterpreting domain data |

The kernel asks only `registry.resolve(kind, version)` and delegates to the
resolved Primitive.  It contains no `if kind == "z"`-style branch.

## Recipe semantics and invariants

All lengths are SI metres, areas are square metres, conductivities are
`W/(m·K)`, and angles (if a future primitive needs one) are radians.  Values
are decimal JSON numbers, finite, and positive where stated.  No implicit
unit conversion is permitted; raw IFC values stay in IFC Evidence.

Coordinates are right handed: `x` is horizontal and periodic, increasing from
the cell's left edge; `y` is through-component depth, increasing exterior to
interior.  The outer component domain is `[0, period] × [0, totalDepth]`.
Layer bands are ordered exterior-to-interior, contiguous in `y`, and collectively
span `totalDepth`.  Each row has `offsetX` (the member reference point in the cell, reduced modulo `periodicity.value`) and `originY` (the reference depth). Aligned rows share `offsetX`; staggered rows have a non-zero delta modulo periodicity. `hostLayerIds` identifies the layer bands a member spans.

`projectedArea` is the unbroken representative-cell face area `period × 1 m`
for the unit out-of-plane length.  It is never a profile surface area.  The
first module models members continuous in the out-of-plane direction; crossed,
isolated, or point attachments are unsupported semantics.

Contacts are named interfaces between two Material Regions and must be exact
after tolerance-normalized compilation.  Cavities, layer materials, member
materials, and break materials all become explicit Material Regions.  Region
boundaries are the exterior (`y=0`), interior (`y=totalDepth`), periodic
(`x=0`, `x=period`), or declared symmetry edges.  Exterior/interior boundaries
require a named boundary condition; periodic edges must appear as a matched
pair.  A thermal break is absent unless explicitly declared; it cannot be
inferred from a material name, gap, or default.

The compiler must reject zero/sliver regions below its published tolerance,
overlap, uncovered domain, out-of-domain profile, mismatched periodic faces,
unresolved contacts, and material regions without a material reference.

## Authority and result safety

Every semantically used value is `{ value, authority }`. `authority.state` is
one of:

| State | Meaning | Verified eligibility |
| --- | --- | --- |
| `ifc-derived` | Traceable direct or derived IFC evidence, with evidence paths. | Possible |
| `user-confirmed` | User explicitly confirmed/supplied it, with revision reference. | Possible |
| `validated-default` | Versioned policy/pack default within its stated applicability. | Possible |
| `preliminary-estimate` | Bounded estimate used only for preliminary output. | Never |
| `conflicting` | Credible sources disagree. | Never; request resolution |
| `missing` | No usable value. | Never; request resolution |

`authority.sourceRefs` is mandatory for the first three states and contains IFC
evidence paths, review/revision IDs, or pack/version IDs.  `conflicting` and
`missing` carry a diagnostic/reason.  A value that does not meet a primitive
or module precondition yields `incomplete` or `conflicting`, not a fabricated
default.  Solver controls are separately versioned Worker Configuration and
are never Recipe input or business evidence.

Final classifications are: `verified` only with complete supported semantics,
successful compilation/solve, and envelope membership; `preliminary-unsafe`
only with complete supported semantics and a successful solve outside the
envelope; `blocked` for incomplete/conflicting input; `rejected` for unsupported
or invalid semantics; and `failed` for infrastructure failure.

## Interfaces

The draft machine-readable shape is
`.scratch/component-topology-kernel/recipe-contract/recipe.schema.json`.
These language-neutral interfaces define the stable seam:

```ts
type AuthorityState = "ifc-derived" | "user-confirmed" | "validated-default"
  | "preliminary-estimate" | "conflicting" | "missing";
type Authored<T> = { value: T | null; authority: { state: AuthorityState;
  sourceRefs: string[]; reason?: string } };

interface PrimitiveRegistration {
  kind: string;                         // namespaced, e.g. "standard.c"
  primitiveVersion: string;             // semver
  parameterSchema: JsonSchema;
  capabilities: { dimension: "2d-cross-section"; supportsThermalBreak: boolean;
    supportsPeriodicTranslation: boolean; referencePoint: string };
  compile(parameters: unknown, context: PrimitiveCompileContext): PrimitiveGeometry;
}
interface PrimitiveRegistry {
  resolve(kind: string, primitiveVersion: string): PrimitiveRegistration | RegistryError;
}
interface TopologyModule {
  moduleId: string; moduleVersion: string;
  supportedRecipeSchemas: string[];
  compile(recipe: Recipe, registry: PrimitiveRegistry): CompileResult;
}
```

`PrimitiveGeometry` contains only tolerance-normalized local polygonal Material
Regions and declared contact boundaries in the primitive reference frame. It
contains no row placement, repetition, host-layer Boolean result, mesh, or
solver object. The Topology Module transforms that output into versioned
`CanonicalAnalysisGeometry`: cell polygon, placed non-overlapping Material
Regions, exact interfaces/contacts, matched periodic edges, Topology Audit, and
the primitive-registry manifest. Solver adapters consume only this canonical
form. Its serialized coordinate system is the Recipe coordinate system without
transposition: `x` is periodic left-to-right and `y` is exterior-to-interior
depth; exterior/interior are horizontal edges and the periodic pair is vertical.

`offsetX` fixes relative phase between rows, not an immutable global cut through
the periodic construction. The compiler may select a deterministic cell-origin
shift when necessary to keep all continuous members away from the paired cell
edges. It must record the shift, preserve every relative phase modulo the period,
and reject compositions for which no conforming cut exists.

The numerical result carries H(div) fluxes for exterior, interior, and both
periodic boundaries. Primary effective heat flow is the volume-energy integral,
checked against equal-and-opposite Dirichlet reactions; the interpolated H(div)
face mean remains an inspectable diagnostic rather than the U-value authority.

Primitive-specific parameters live only under `member.primitive.parameters`; each is an authority-tagged numeric value and is validated by the resolved registration's schema.  The common Recipe knows
the placement, material, row, and authority vocabulary, not flange/lip names.
The standard bundle registers `standard.rectangle`, `standard.c`, `standard.z`,
and `standard.hat`, proving family-neutral registration.

## Compatibility and extension rules

Recipe `schemaVersion`, module version, every primitive version, registry
snapshot ID, validation-pack ID/version, and worker runtime version are pinned
in the request/result manifest.  A consumer may accept only a listed Recipe
schema major version; unknown major versions reject as `unsupported`.  A minor
schema addition is compatible only when optional and ignored by an older
consumer; a semantic reinterpretation requires a major version.  A primitive
registration is compatible only when its exact major version and declared
capabilities are supported by the module.  A missing registration, unknown
parameter, or capability mismatch is predictably `unsupported`, never ignored.

The reproducibility manifest also hashes each primitive implementation and
capability declaration, compiler and solver source, Recipe schema, material pack
(values, units, provenance, and version), boundary/validation pack, dependency
lock, and runtime identity. Verification compares canonical result hashes and
rejection diagnostics to a separately reviewed frozen manifest; a run may not
regenerate and bless its own expected hashes.

* Register a **new primitive** when the same 2-D periodic cell semantics,
  placement, contacts, and physics apply and only the local member cross-section
  and parameters are new.
* Create a **new Recipe composition/pack** when existing primitives and
  semantics can express the construction; no kernel or module change follows.
* Create a **new Topology Module** when dimensionality, representative volume,
  boundary vocabulary, interaction physics, or solver formulation changes
  (e.g. crossed framing, point fasteners, junctions, transient/moisture physics).

## Diagnostics

| Category | Meaning | Safe outcome |
| --- | --- | --- |
| `invalid` | Violates structural/schema/geometric invariant. | rejected |
| `incomplete` | Required value is missing or preliminary where confirmation is required. | blocked |
| `unsupported` | Known field/kind/capability is outside the module contract. | rejected |
| `conflicting` | Authorities disagree without a governing resolution. | blocked |
| `outside-validation-envelope` | Compilable/solvable semantics lack applicable validation evidence. | preliminary-unsafe |
| `infrastructure-failure` | Worker/dependency/mesh/solver/timeout/crash failure. | failed; layer-only remains available |

## Explicitly rejected alternatives

**Arbitrary geometry in Recipes** is rejected: it makes validation envelopes,
deterministic topology, contacts, and safety review unbounded; arbitrary IFC
solids belong behind a different, explicitly validated module.

**Family-specific schemas and kernel branches** are rejected: every new named
construction would require a release and could bypass shared validation.  Local
primitive parameter schemas plus declarative packs retain extensibility.

**Implicit fallback/default topology** is rejected: it would turn missing,
ambiguous, or unsupported BIM inputs into apparently verified results.

## Canonical glossary additions and decision record

Add the terms in the Ubiquitous Language table above—especially Recipe,
Topology Module, Primitive, Primitive Registry, Representative Cell, Material
Region, Thermal Break, Validation Envelope, and Authority—to
`UBIQUITOUS_LANGUAGE.md`.  Record this architecture decision in a new dated
ADR under `context/decisions/`; existing V1 decisions are not the right place
to append a materially new topology contract.  This investigation does not
modify those canonical artifacts, in accordance with its no-production-code
scope.
