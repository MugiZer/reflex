# IFC-to-3-D Thermal Model: Reusable Toolchain

Date: 2026-07-21

## Conclusion

Most of the numerical/CAD plumbing for a constrained 3-D thermal-bridge service already exists. A realistic open-source path is:

```text
IFC + current Conformity evidence
  -> pattern recognition / local-cell selection (our code)
  -> IfcOpenShell geometry + Open CASCADE cleanup
  -> conforming labelled volume mesh (Netgen or licensed Gmsh)
  -> DOLFINx steady conduction solve
  -> XDMF/VTK + PyVista/ParaView results and audit artefacts
```

That does **not** make arbitrary IFC analysis a solved integration. The unique product work remains: recognizing supported connection patterns, deciding the representative 3-D extent and repeat/symmetry assumptions, mapping IFC products to governed conductivity/contact/cavity models, applying the correct boundary faces, and validating each pattern against ISO 10211-style reference cases. But we do not need to invent an IFC reader, CAD kernel, tetrahedral mesher, linear-system solver, or 3-D result viewer.

## Building blocks

| Stage | Reusable project | What it supplies | License / product implication |
|---|---|---|---|
| IFC read, schema relationships, shape extraction | [IfcOpenShell](https://docs.ifcopenshell.org/ifcopenshell.html) | IFC read/write, geometry for IFC2x3/IFC4; `create_shape()` can return vertices/faces or an Open CASCADE BRep, and the geometry iterator processes model elements efficiently ([geometry docs](https://docs.ifcopenshell.org/ifcopenshell-python/geometry_processing.html)). | LGPL-3.0-or-later. Strong Python service-side choice; retain IFC GUIDs and property paths as provenance. |
| Browser-side current IFC evidence/viewer | [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | Existing Conformity-compatible WASM IFC parsing/viewing route. It is useful for evidence and user selection, but is not the preferred authoritative CAD/meshing backend. | MIT ([license](https://github.com/ThatOpen/engine_web-ifc/blob/main/LICENSE)). |
| Solid geometry, booleans, healing/simplification | [Open CASCADE Technology (OCCT)](https://dev.opencascade.org/doc/overview/html/index.html) | Industrial CAD topology/geometry kernel: create/crop local cell, Boolean common/cut/fuse, remove irrelevant detail and check/repair solids. IfcOpenShell can expose OCCT BReps directly. | LGPL-2.1 with OCCT exception; the project states commercial proprietary use is permitted subject to its terms ([FAQ](https://dev.opencascade.org/resources/faq)). |
| Primary open mesh option | [Netgen/NGSolve](https://github.com/NGSolve/ngsolve) | A high-performance FEM project with Netgen meshing and a Python interface; candidate for conforming tetrahedral meshes when proprietary distribution is desired. | LGPL-2.1. Prove IFC/OCCT handoff, boundary tags, thin-steel sizing and mesh-refinement behavior in a spike. |
| Mature meshing alternative | [Gmsh](https://gmsh.info/) | 3-D FEM mesh generator with Open CASCADE geometry API and pre/post-processing; DOLFINx documents Gmsh mesh import/generation ([example](https://docs.fenicsproject.org/dolfinx/main/python/demos/demo_gmsh.html)). | GPL-2.0-or-later; its project says a closed-source version requires a different license ([license statement](https://gmsh.info/doc/texinfo/gmsh.pdf)). Excellent technical option, but obtain commercial terms before bundling/embedding. |
| FEM heat-conduction worker | [FEniCSx / DOLFINx](https://github.com/FEniCS/dolfinx) | Python/C++ finite-element platform over PETSc. Steady conduction is a scalar Poisson problem with piecewise conductivity, surface/Dirichlet/Neumann conditions and 3-D tetrahedra. Official demos show mesh construction, boundary tagging, solve, XDMF output and PyVista display ([Poisson demo](https://docs.fenicsproject.org/dolfinx/main/python/demos/demo_poisson.html)). | LGPL-3.0-or-later for DOLFINx; pin a release and review all bundled dependencies before distribution. Best build-your-own worker candidate. |
| Alternative solver worker | [Elmer FEM](https://github.com/ElmerCSC/elmerfem) | Mature general heat-transfer/multiphysics FEM and parallel execution. | GPL-2.0-or-later ([license](https://raw.githubusercontent.com/ElmerCSC/elmerfem/devel/LICENSE.md)); appropriate for an open standalone worker/research, not a casually embedded proprietary component. |
| Result QA and visualisation | [PyVista](https://docs.pyvista.org/) / [ParaView](https://www.paraview.org/about/) | Mesh and field visualisation, slices/isotherms/heat-flux inspection, image/export generation. DOLFINx explicitly demonstrates PyVista and XDMF output. | PyVista MIT; ParaView BSD-3-Clause ([license](https://www.paraview.org/license/)). Good for internal QA and report asset generation. |

## What the 3-D compiler would actually do

1. **Select, not blindly import.** Use existing IFC evidence plus spatial queries to find a candidate bracket/fastener/rail and its host layers. Restrict V1 of this capability to named patterns (for example, a stand-off façade bracket), with a confidence/applicability gate.
2. **Build a local calculation cell.** Crop a prescribed neighbourhood and infer periodic/symmetry faces from placement/spacing. Keep the original IFC elements separate from the generated analysis geometry.
3. **Create an analysis solid model.** Convert selected IFC geometry through IfcOpenShell/OCCT; remove thread/chamfer/detail below a documented tolerance, replace it with thermal-equivalent primitives where necessary, Boolean/crop regions, and preserve material-region IDs and source GUIDs.
4. **Resolve physics.** Map each region to a governed material record; classify interfaces/cavities; tag inside, outside and symmetry faces. These choices must be user-reviewable and versioned.
5. **Generate and qualify mesh.** Set size fields around thin steel, anchors and contacts; require watertight labelled volumes, no tiny/sliver cells beyond policy, and mesh-refinement convergence.
6. **Solve and derive the metric.** Run a DOLFINx steady-conduction case, store mesh/solver/version/raw fields, then compare with the matching clear-wall reference model to derive point transmittance `chi` (and its contribution by fixture count).
7. **Show the proof.** Render source-vs-analysis geometry, mesh QA, temperature/flux fields and the complete assumptions/provenance record.

## Recommended technology decision

Use a **service-side Python proof of concept**, separate from the TypeScript product kernel:

```text
Conformity request/evidence artifact
  -> Python 3-D model-builder worker (IfcOpenShell + OCCT)
  -> Netgen first; optionally commercially licensed Gmsh
  -> DOLFINx/PETSc solver worker
  -> XDMF/VTK + result JSON + preview images
  -> existing Conformity provenance/report pipeline
```

Start with one deliberately bounded fixation pattern and a hand-reviewed IFC fixture. Success is not merely a temperature field: it is a repeatable `chi` result that passes mesh convergence, matches a trusted reference calculation, and names every modelling assumption. Only then broaden the pattern library. This preserves the V1 parameterized 2-D studs/girts path while making a credible, incremental route to automated 3-D.

## Explicit non-solutions supplied by the libraries

- IFC geometry is optional and can be represented in several ways; even IfcOpenShell notes it as optional ([geometry creation documentation](https://docs.ifcopenshell.org/ifcopenshell-python/geometry_creation.html)). A successful BRep conversion is not evidence that the selected cell or thermal model is physically valid.
- IFC material styles/associations are not governed thermal conductivity/contact/cavity inputs. The material mapping and missing-data policy stays in Conformity.
- No listed general FEM stack supplies ISO 10211 modelling conventions, reference dimensions, building-cavity policy, model applicability limits, or a validation corpus. Those are the defensibility layer we must build.
- Licensing is an architecture constraint, not a footnote: involve counsel before shipping a worker with GPL components or distributing LGPL dependencies.

## First spike, with pass/fail evidence

Use an IFC containing a known façade bracket or similar discrete fixture. Produce a script that creates the same local geometry from fixed parameters and from the IFC selection. Pass only if both paths generate the same labelled cell; the mesh converges under refinement; and the derived `chi` agrees with a reviewed 3-D reference within a predeclared tolerance. Archive IFC GUID selection, model-builder version, material snapshot, geometric simplifications, mesh statistics, solver settings and raw fields with the result.
