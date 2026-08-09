# Repeating-Profile Wall Topology: Open-Source Reuse

Date: 2026-07-23

## Decision

Building a reusable 2-D topology for C studs, Z-girts, hat channels, rectangular members and multiple **parallel** framing rows is **medium-to-high engineering effort, but not a solver-from-scratch project**. Existing open-source software can provide robust planar geometry operations, conforming mesh generation, finite-element assembly/solution, boundary tagging and result export. Conformity still must own the BIM-evidence interpretation, recipe schema, representative-cell rules, validation envelopes and trust decisions.

For this product and its current Windows/local-development workflow, the best first production stack is:

1. Keep the existing TypeScript Thermal Treatment kernel, family registry, evidence provenance, trust states and reporting.
2. Add a family-neutral declarative `repeating-profile-wall-2d` recipe.
3. Run a local Python worker using **Shapely** for planar partition/validation and **Netgen/NGSolve** for 2-D conforming meshing and steady heat conduction.
4. Use the published Feel++ ISO 10211 cases and other independently sourced reference cases as validation inputs, not as the product runtime.

This avoids Gmsh's GPL integration issue for a closed-source product and avoids the MPI/PETSc deployment weight of DOLFINx for a small 2-D representative cell. DOLFINx remains a credible later worker for larger or 3-D analysis.

## The current head start—and its limit

The codebase already has the correct product seams: a family-neutral `ThermalTreatmentAnalysisModel`, a `ThermalTreatmentCalculationWorker`, versioned knowledge/validation packs, convergence fields, provenance and Verified versus Preliminary Unsafe Estimate states. The current worker, however, is a custom finite-difference implementation over axis-aligned rectangular regions, and its Z-girt adapter decomposes the profile into rectangles ([thermalTreatmentTypes.ts](../../src/domain/thermal-treatment/thermalTreatmentTypes.ts), [OpenSource2dCalculationWorker.ts](../../src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.ts), [continuousZGirtFamily.ts](../../src/domain/thermal-treatment/families/continuousZGirtFamily.ts)).

That is a useful tracer bullet, but it is not a good general topology engine. Thin 0.5–3 mm steel embedded in a 100–300 mm wall, high steel/insulation conductivity contrast, lips and corners require a geometry-conforming mesh and refinement near the profile. Increasing a uniform Cartesian grid until it resolves the gauge would waste cells across the entire wall.

## What can be reused

| Concern | Reuse | Assessment |
|---|---|---|
| Planar polygon construction, union, difference, intersection and validity | **Shapely / GEOS** | Shapely is a BSD-3 Python API over LGPL-2.1 GEOS for manipulating planar geometry. It is well suited to carving profile polygons from layer bands and detecting overlaps, gaps and invalid rings ([official repository](https://github.com/shapely/shapely)). |
| Conforming 2-D mesh, named material regions, named boundaries, local mesh sizes and periodic edges | **Netgen** | Netgen's `SplineGeometry` supports line/spline geometry, numbered domains, named materials, per-domain mesh sizing and periodic copied boundaries—all directly relevant to one repeating wall cell ([2-D geometry tutorial](https://ngsolve.org/ngsolve/docs/i-tutorials/unit-4.1.1-geom2d/geom2d.html)). |
| Steady multi-material heat-conduction FEM, coefficient by material, flux integration and refinement | **NGSolve** | NGSolve exposes geometry, equation setup and solution through Python; its official tutorials cover Poisson-type problems, material coefficient functions, subdomains and adaptive refinement ([documentation](https://docu.ngsolve.org/latest/), [subdomain/material tutorial](https://ngsolve.org/ngsolve/docs/i-tutorials/unit-1.5-subdomains/subdomains.html)). The steady conduction equation is a variable-coefficient Poisson problem. |
| Installation for local Windows development | **NGSolve wheel** | The project recommends `pip install --upgrade ngsolve` on all platforms and documents Windows support ([installation](https://ngsolve.org/installation.html)). |
| IFC semantics and optional exact profiles | **Current `web-ifc`; optionally IfcOpenShell later** | IfcOpenShell is an LGPL IFC parser and geometry engine with Python/C++ APIs ([official repository](https://github.com/ifcopenshell/ifcopenshell)). It could later extract `IfcMaterialProfileSet` or explicit profile geometry when present. It cannot infer missing gauge, spacing, alignment or fabrication intent, so it is not the topology engine. |
| ISO-style heat-toolbox examples | **Feel++** | Feel++ provides a generic steady/unsteady heat toolbox configured by meshes and JSON materials/boundaries, plus published ISO 10211:2007 2-D/3-D cases ([heat toolbox](https://docs.feelpp.org/toolboxes/latest/heat/toolbox.html), [ISO 10211 cases](https://feelpp.github.io/toolbox/toolboxes/latest/heat/ISO_10211_2007/index.html)). This is valuable validation and a possible independent checker, but it still needs generated geometry/mesh and is heavier than an embedded NGSolve worker. |

## Candidate comparison

| Stack | License / local suitability | Strength | Why not first choice |
|---|---|---|---|
| **Shapely + Netgen/NGSolve** | BSD-3 + LGPL-2.1; official pip/Windows route | One worker can partition, mesh, solve, refine and export; named/periodic regions already exist | We still implement the small thermal formulation and result extraction, then validate it |
| **Gmsh/OpenCASCADE + DOLFINx/PETSc** | DOLFINx is LGPL-3; Gmsh is GPL-2-or-later and says closed-source integration requires a commercial license | Excellent CAD booleans, physical groups, tagged mesh import and scalable FEM. DOLFINx officially demonstrates importing Gmsh cell/facet tags and solving Poisson problems ([Gmsh geometry/API](https://gmsh.info/doc/texinfo/), [DOLFINx Gmsh demo](https://docs.fenicsproject.org/dolfinx/v0.10.0.post3/python/demos/demo_gmsh.html), [DOLFINx Poisson demo](https://docs.fenicsproject.org/dolfinx/main/python/demos/demo_poisson.html)) | More deployment surface than this 2-D problem needs; Gmsh's official licensing page explicitly warns against integration into distributed closed-source software without another license ([Gmsh licensing](https://gmsh.info/)) |
| **Netgen mesh + scikit-fem** | LGPL-2.1 + BSD-3; easy Python | scikit-fem is pure Python, minimally dependent, accepts external meshes and provides Poisson assembly ([official repository](https://github.com/kinnala/scikit-fem)) | Splits mesh and solve across two libraries without a product advantage over NGSolve; still reasonable as a transparent test/reference implementation |
| **Feel++ Heat Toolbox** | Repository identifies LGPL-3 components; packaged via Docker/Debian/Ubuntu | Ready command-line heat toolbox with JSON materials, boundaries and post-processing; ISO examples already exist ([CLI documentation](https://docs.feelpp.org/user/latest/using/toolboxes/heat.html)) | Heavier operationally on the current Windows/Node application, and it does not supply the repeating-profile recipe compiler |
| **EnergyPlus/Kiva and Ladybug/Honeybee** | EnergyPlus uses a BSD-3-like license | Mature whole-building and foundation heat-transfer infrastructure | Not a wall-profile solver. Kiva is a specialized 2-D foundation/ground model ([EnergyPlus engineering reference](https://bigladdersoftware.com/epx/docs/22-2/engineering-reference/ground-heat-transfer-calculations-using-kiva.html)); Honeybee's opaque construction is an ordered serial layer list with a construction U-factor ([Honeybee opaque construction](https://www.ladybug.tools/honeybee-energy/docs/honeybee_energy.construction.opaque.html)). Neither generates a conforming stud/girt cross-section. |

## What Conformity must still build

The reusable libraries stop below the product's safety boundary. We still need:

1. **A stable recipe contract.** It should describe ordered layer bands, one repeat width, profile primitives (`rectangle`, `c`, `z`, `hat`), material assignment, row depth, row offset/alignment, optional lips/breaks, exterior/interior surfaces and periodic edges. It should not contain family names or IFC parsing rules.
2. **A topology compiler.** Convert the recipe into a complete, non-overlapping planar subdivision. The compiler must detect impossible dimensions, profiles outside the wall, overlaps, uncovered regions, zero-width slivers and tolerance-sensitive geometry before invoking the solver.
3. **Representative-cell rules.** A 600 mm spacing normally becomes one periodic 600 mm cell. Two parallel rows may be aligned or offset within the same cell. Members running in different directions are not safely represented by this one 2-D section; crossed framing needs a validated equivalent method, multiple directional cuts or a 3-D topology.
4. **Thermal boundary/result logic.** Apply interior/exterior surface resistances, periodic/symmetry conditions, integrate boundary heat flux and derive effective U per projected wall area. Preserve temperatures, fluxes, mesh statistics and worker/library versions as artifacts.
5. **Convergence controls.** Refine around thin, high-conductivity profiles and compare successive heat-flow results. Failure to reach the supported tolerance must prevent Verified status.
6. **Evidence and confirmation.** IFC labels such as `Montant métallique 41mm` suggest a family and a candidate dimension; they do not prove profile shape, gauge, spacing, orientation or whether duplicate layers are two physical rows. Conflicts such as a `152mm` name paired with a 100 mm IFC layer must remain explicit.
7. **Validation packs.** Libraries solve the supplied PDE; they do not prove that the construction abstraction is correct. Each topology/envelope needs independent reference cases and tolerances before it can return Verified.

## Realistic effort

Assuming one engineer familiar with the existing kernel:

| Deliverable | Effort | Exit condition |
|---|---:|---|
| Technical spike | **3–5 engineering days** | One parameterized C or Z profile, one filled cavity, periodic cell, NGSolve result and two-level convergence artifact |
| Recipe schema + topology compiler | **1–2 weeks** | Rectangular/C/Z/hat primitives; layers; one or two parallel aligned/offset rows; deterministic overlap/gap rejection |
| Production worker integration | **1–2 weeks** | Local worker lifecycle, timeouts, mesh/refinement controls, flux/U extraction, artifacts, stable error mapping, CI/local install documentation |
| Detection/confirmation and pack conversion | **1–2 weeks** | Existing Z-girt becomes data through the topology recipe; generic steel-stud packs use the same compiler; ambiguous screenshots request only missing critical inputs |
| Validation and release hardening | **2–4 weeks** | Independent benchmarks, envelope-specific tolerances, regression tests, failure cases and no unsafe Verified path |

The total is roughly **5–8 engineer-weeks for a trustworthy first reusable topology**, or about **3–5 calendar weeks with carefully parallelized product/worker work**. A demo is much faster; validation and edge-case geometry—not FEM coding—set the release timeline.

## Recommended scope boundary

Call the first generic topology `repeating-parallel-profile-wall-2d`. It should deliberately cover:

- filled or explicitly modeled cavities with rectangular, C, Z and hat profiles;
- one or two **parallel** rows;
- aligned or staggered offsets;
- steel, timber and low-conductivity break regions;
- periodic repeat spacing and through-wall heat flow.

Do not claim it covers orthogonally crossed framing, isolated clips/screws, brackets, anchors, junctions or arbitrary IFC solids. Those change the dimensionality or representative-volume physics and deserve different topology modules.

The durable rule is: **new physics/topology creates code; a new named construction inside a supported topology creates a declarative pack.**
