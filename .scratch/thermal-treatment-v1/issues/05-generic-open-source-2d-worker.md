# 05 — Generic Open-Source 2-D Calculation Worker

**What to build:** Implement a local, fully open-source steady-state two-dimensional thermal calculation worker behind the kernel's worker contract. The worker must consume a family-neutral analysis model containing geometry, material regions, boundary faces, and solver controls, then return heat-flow results, effective U-value inputs, convergence evidence, diagnostics, and durable calculation artifacts. Netgen and DOLFINx/PETSc are the intended stack unless the implementation spike proves an equivalent open-source route fits the same contract better.

**Blocked by:** 01 — Generic Thermal Treatment Spine

**Status:** ready-for-agent

## Acceptance criteria

- [ ] The existing Node application can start and communicate with the local worker without introducing a cloud service or separately deployed product.
- [ ] The worker accepts only the family-neutral analysis-model contract and contains no Z-girt or other named-family logic.
- [ ] The analysis model supports two-dimensional regions, material conductivity, boundary identification, temperatures or surface resistances, periodic/repeating boundaries where applicable, and requested convergence controls.
- [ ] Geometry validation rejects overlaps, gaps that violate the contract, invalid boundaries, non-positive properties, and non-meshable models with actionable diagnostics.
- [ ] The worker returns heat flow, derived effective conductance/U-value data, mesh/convergence evidence, warnings, worker versions, and references to reproducibility artifacts.
- [ ] A mesh-refinement check prevents unconverged calculations from becoming Verified.
- [ ] Deterministic benchmark cases reproduce analytical or authoritative reference results within documented tolerances.
- [ ] Both development reference adapters can generate models solved by the same worker without worker changes.
- [ ] Worker timeouts, crashes, invalid output, and version incompatibility fail safely and preserve the existing layer-only result.
- [ ] Local development and automated tests run using free/open-source dependencies only.

