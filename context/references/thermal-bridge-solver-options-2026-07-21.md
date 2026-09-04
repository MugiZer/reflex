# Thermal-Bridge Solver Options

Date: 2026-07-21

## Decision

Do **not** build a general finite-element solver as the first step of the component-knowledge system. 2-D/3-D numerical heat transfer is an established capability, but a reliable IFC-to-result product still needs geometry selection, material/evidence resolution, model simplification, boundary-condition selection, meshing, convergence checks, result interpretation and reproducible provenance. The PDE solve is only one part of that work.

Build a solver-adapter boundary now. Use simple, traceable in-process treatments for serial layers and air cavities; use an external **2-D worker** for a deliberately small family of repeated assemblies once it has passed a feasibility/validation spike; treat arbitrary discrete 3-D fixings as an escalation to specialist evidence or a later 3-D worker.

ISO 10211 defines the 2-D and 3-D geometry, boundary conditions and calculation relationships for numerical thermal bridges, including deriving linear and point transmittances. It does not supply a reusable software library or turn an IFC model into a valid calculation model ([ISO 10211:2017](https://www.iso.org/standard/65710.html)).

## What "using an existing solver" does and does not buy

An existing solver buys mesh generation and the numerical solution of steady heat conduction. A solver adapter still must create a **thermal model**:

```text
IFC evidence + component knowledge
  -> select a repeat/junction and a 2-D or 3-D extent
  -> resolve material conductivities and cavities
  -> generate clean labelled regions / mesh
  -> apply the applicable surface and symmetry boundary conditions
  -> execute, check mesh/convergence and derive U, psi or chi
  -> retain input artifact, solver/version, settings, result and assumptions
```

This conversion cannot be inferred safely from an `IfcMaterialLayerSet` alone. IFC does represent material layers, profiles/constituents, geometry and material thermal properties, but a thermal bridge model needs a selected cross-section (or 3-D representative volume), continuity/repetition assumptions and boundaries. Preserve the IFC GUID/property path and every generated-model decision as provenance ([IFC Material Resource](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/ifcmaterialresource/content.html), [Pset_MaterialThermal](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_MaterialThermal.htm)).

## Practical options

| Option | 2-D / 3-D | Automation and exchange evidenced publicly | Standards evidence | Fit for Conformity |
|---|---|---|---|---|
| **LBNL THERM** | 2-D | Windows desktop, command-line mode, THMX XML import/export, DXF underlay/import, detailed result file | LBNL documents an error setting intended to meet ISO/EN numerical accuracy; no official claim found that THERM itself is ISO 10211 validated | **Best first external-worker spike** for repeated steel-stud/girt cross-sections; not discrete 3-D fixings |
| **flixo pro** | 2-D plus equivalent objects for periodic 3-D effects | Desktop CAD workflow; DXF/SVG and THERM import, batch processing; no public headless API/CLI found | Vendor publishes validation samples for EN ISO 10211:2017 and EN ISO 10077-2:2017 | Strong human-in-the-loop authoring/verification tool; do not design a backend dependency without vendor automation confirmation |
| **AnTherm** | 2-D and 3-D | Vendor documents DXF/3-D DXF/IFC import; no public API/CLI found | Vendor claims EN ISO 10211:2007 Class-A 2-D/3-D validation | Best off-the-shelf candidate for exceptional 3-D work, subject to commercial/API evaluation |
| **Elmer FEM / FEniCSx** | General 2-D/3-D FEM | Scriptable open-source FEM stacks; model/mesh/physics must be authored by us | Neither is a ready building-envelope/ISO-10211 product | Long-term service implementation option, not V1 |
| **OpenFOAM** | General 3-D finite-volume CFD/heat transfer | Scriptable cases and solid/conjugate-heat-transfer solvers; model/mesh/physics must be authored by us | Not a ready building-envelope/ISO-10211 product | Poor V1 fit: CFD breadth adds complexity and GPLv3 needs architecture/legal care |

## 1. LBNL THERM — recommended 2-D experiment

Berkeley Lab describes THERM as a two-dimensional finite-element tool for conduction/radiation heat transfer in building components. Its current download page lists THERM 7.8.80 (May 2025) and a Windows installer; the 8.1 release is beta and explicitly not recommended for conventional thermal modelling ([THERM downloads](https://windows.lbl.gov/index.php/therm-software-downloads)).

It is automatable enough to test as a worker:

- LBNL documents a command-line mode callable from other software, though access requires registration and LBNL describes support for it as limited ([command-line mode](https://windows.lbl.gov/using-therm-command-line-mode)).
- The `.thmx` XML contains the cross-section, polygons, materials, boundary conditions and U-value results, and is expressly an import/export format; this is a more practical contract than GUI driving ([command-line/THMX documentation](https://windows.lbl.gov/sites/default/files/therm-command-line-mode.pdf)).
- THERM accepts DXF geometry, but LBNL's guidance requires closed polylines and explicit checking for overlaps; the release notes also retain known DXF/autoconvert limitations ([DXF guidance](https://windows.lbl.gov/sites/default/files/software/THERM/Therm7-05-14-DrawingTips.pdf)).
- It can emit an `.o` results file with nodes, elements, temperatures and boundary conditions for audit extraction ([detailed output](https://windows.lbl.gov/detailed-output-therm)).

THERM is a **desktop product**, not an embeddable open-source library, and a 2-D calculation cannot calculate a standalone screw or bracket as an arbitrary 3-D bridge. Its documentation includes a steel-stud-wall tutorial, which makes a repeatable steel-stud cross-section a particularly good proof-of-concept ([THERM documentation](https://windows.lbl.gov/documentation-therm)).

Do not claim ISO 10211 conformance merely because THERM is used. LBNL says THERM's default error-energy-norm yields overall computational accuracy below ISO 10211's 1% requirement, but Conformity must validate the generated template, boundaries, mesh and result derivation for its own supported pattern ([LBNL EEN note](https://windows.lbl.gov/error-energy-norm-and-isoen-standards)).

## 2. flixo — mature 2-D specialist tool, but publicly GUI-oriented

flixo provides a CAD-style thermal-bridge modeler with DXF import, a material/boundary-condition database, extendable components and an air-cavity wizard. It states that its 3-D-equivalent objects cover periodically appearing effects such as screws, rafters and mullions—not that it is a general 3-D solver ([flixo input](https://www.flixo.com/thermal-bridge/input/)). Its published feature matrix lists THERM import, DXF import/export, batch processing and an equivalent screw object; it does not expose a documented command-line or web API ([flixo versions](https://www.flixo.com/products/versions/)).

The vendor's validation report says flixo 8 satisfies the Annex A EN ISO 10211:2017 validation samples for **2-D** thermal-bridge software and reports EN ISO 10077-2 validation results ([flixo validation report](https://www.flixo.com/media/1432/flixo8_validation_en.pdf)). That is useful evidence for a commercial verification workflow, but not a reason to assume a stable machine integration. Confirm license, batch/headless rights and API availability directly with Infomind before making it a service dependency.

## 3. AnTherm — strongest off-the-shelf 3-D candidate

AnTherm's published documentation describes steady 2-D/3-D heat-flow modelling, and its help index documents 3-D DXF and IFC import ([AnTherm overview](https://www.antherm.eu/antherm/PL/index.htm), [AnTherm help index](https://help.antherm.eu/Inhalt.htm)). The vendor's handbook says it meets EN ISO 10211:2007 requirements for a two- and three-dimensional steady-state Class-A method and identifies validation cases including a 3-D bridge penetrating insulation ([AnTherm handbook](https://help.antherm.eu/AnTherm_EN.pdf)).

This makes it the credible buy-before-build option for an isolated `Fixation en Z` or other geometry where 3-D heat spreading matters. Its public materials did not reveal a supported headless API, command-line runner or commercial terms suitable for unattended SaaS use. Treat IFC import as a specialist authoring/import feature until a vendor proof-of-integration confirms what IFC entities/properties, model preparation, batch execution and result export are actually supported.

## 4. General numerical solvers — capable, but they move the work into our code

**Elmer FEM** is an official open-source multiphysics FEM suite with heat-transfer models, GUI/tools and builds ranging from PCs to parallel HPC platforms ([official Elmer repository](https://github.com/ElmerCSC/elmerfem)). **FEniCSx** is the current FEniCS generation, exposing Python/C++ finite-element APIs, mesh/refinement, I/O, visualisation and iterative solvers ([FEniCSx documentation](https://docs.fenicsproject.org/), [download/install options](https://fenicsproject.org/download/)). Both can solve a stationary conduction formulation once supplied with a labelled mesh, conductivity field and boundary conditions.

They do not include IFC semantic interpretation, an ISO 10211 model builder, construction cavity physics, a building-material evidence database, or certified reference templates. Selecting either means Conformity owns the computational-model/compiler and the validation corpus. FEniCSx's Python-first interface is the more natural future microservice choice; Elmer is also viable where a packaged desktop/HPC solver and its GUI are useful. Confirm the exact release licenses and third-party dependencies with counsel before redistribution or bundling.

**OpenFOAM** supports thermal transport in solids and conjugate heat transfer, but it is primarily a CFD platform. The Foundation distributes it under GPLv3, and notes that inclusion/distribution implications differ from internal use ([OpenFOAM overview](https://openfoam.org/), [GPL explanation](https://openfoam.org/licence/)). It is powerful for airflow/cavity-CFD research, but unnecessary for steady conductive thermal bridges and creates extra deployment/operations complexity.

## Recommended architecture and next actions

Define the following narrow boundary in the stable kernel:

```ts
interface ThermalBridgeSolver {
  readonly id: string;
  readonly supportedPatterns: readonly ThermalPattern[];
  buildModel(request: ThermalBridgeRequest): SolverModelArtifact;
  solve(model: SolverModelArtifact): SolverResult;
}
```

`ThermalBridgeRequest` must already contain resolved conductivities, geometry, selected pattern, boundary-condition profile, assumptions and knowledge-pack snapshot. `SolverResult` must retain the input artifact hash, solver executable/version, mesh/convergence settings, raw result location, derived `U`/`psi`/`chi`, units and warnings.

Sequence the work:

1. Deliver serial layers and air cavities in the normal calculation kernel.
2. Create a **THERM 2-D adapter spike** for one repeated steel-stud or continuous-Z-girt cross-section. Generate THMX from a fixed, reviewed template; run it in command-line mode; parse the auditable result; compare two mesh settings and a reviewed reference case.
3. If the spike is reproducible, make that single pattern a supported calculation treatment. Keep patterns as data-selected templates, not arbitrary IFC-to-mesh conversion.
4. Route discrete screws/brackets/Z-fixings to `numerical_3d_required` with a structured geometry/evidence request. Evaluate AnTherm only when a real project needs this route and vendor automation/export terms are confirmed.
5. Consider an FEniCSx service only after repeated patterns justify owning geometry meshing and ISO-10211 validation. It is a product investment, not a shortcut.

This approach gets real multidimensional calculations early, while keeping the component knowledge system independent of any one desktop product and avoiding an unbounded "convert any IFC to a solver mesh" commitment.
