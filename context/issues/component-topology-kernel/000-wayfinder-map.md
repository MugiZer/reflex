# Wayfinder Map — General Component Topology Kernel

## Destination

Produce an agent-ready specification and implementation route for a family-neutral Component Topology Kernel whose first production Topology Module compiles optional declarative recipes for steady-state repeating 2-D construction components into validated thermal analysis models, while preserving the existing layer-only workflow and leaving a clean routing seam for future dimension-specific modules.

## Notes

- This is an optional enrichment of the existing IFC Evidence → Review → Calculation Snapshot → Revision → Report workflow, not a replacement calculation path or a new product.
- The kernel is not built for Z-girts, studs, or any named family. Rectangular timber, C-stud single/double row, and the existing Z profile are conformance fixtures proving one registry-driven implementation.
- The first modeling vocabulary is deliberately constrained: ordered layers; rectangular, C, Z, and hat primitives; one or two parallel rows; aligned or staggered offsets; repeat spacing; cavities; low-conductivity breaks; and interior, exterior, periodic, or symmetry boundaries.
- Adding a construction inside an existing topology requires a declarative knowledge/validation pack. Adding genuinely different dimensional physics requires a new Topology Module.
- Geometrically supported recipes may calculate broadly, but Verified requires the complete recipe and parameters to fall inside a versioned validation envelope. Unsupported or out-of-envelope recipes may only produce a Preliminary Unsafe Estimate.
- The intended open-source numerical route is a local Python worker using Shapely and Netgen/NGSolve, while the existing TypeScript application retains evidence, business rules, trust, UI, Revisions, Reports, and worker supervision.
- The initial reliability model is one isolated, version-pinned Python process per calculation with immutable request/result artifacts, dual-language schema validation, structured correlated logs, explicit error categories, timeouts, health checks, and graceful layer-only fallback.
- Every session should consult `codebase-design`, `domain-modeling`, and the source-backed open-source research before resolving a ticket.

## Decisions so far

<!-- Decisions are appended here only when child tickets are resolved. -->

## Not yet specified

- Exact topology/compiler invariants and numerical tolerance policies that will emerge from the worker and recipe prototypes.
- Exact version-compatibility and migration rules across recipe schema, primitive implementations, topology modules, worker runtime, knowledge packs, and validation packs.
- Exact production validation envelopes and how independent reference cases will be acquired for combinations rather than isolated primitives.
- Packaging and installation details that depend on the Windows worker spike, including whether the production runtime is bundled, installed, or provisioned separately.
- The final implementation-ticket breakdown; it will be produced only after the architecture, validation route, and generality proof are resolved.

## Out of scope

- Implementing the production feature while wayfinding; this map produces decisions and an agent-ready route.
- Arbitrary user-drawn polygons or a general-purpose CAD editor.
- Crossed or non-parallel framing whose geometry varies in both in-plane directions.
- Discrete screws, clips, brackets, anchors, point thermal bridges, arbitrary IFC solids, and 3-D geometry implementation.
- Junction-specific geometry such as corners, parapets, slab edges, and window perimeters.
- Regulatory certification, compliance sign-off, or claims that open-source solver use alone establishes ISO conformity.
- Manufacturer-specific pack authoring or a user-facing recipe/pack editor.
- Cloud solver deployment, persistent worker pools, or distributed calculation infrastructure.

