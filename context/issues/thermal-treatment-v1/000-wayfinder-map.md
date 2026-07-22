# Wayfinder Map — Thermal Treatment V1

## Destination

Specify the smallest real architect-facing extension that upgrades a supported repeating wall component from a layer-only U-value to a traceable effective U-value calculation.

## Notes

- Treat this as an extension of the BIM-to-Physics Compiler, not a new product.
- Use generic, parameterized 2-D thermal families; IFC supplies evidence and context, not the solver cross-section.
- Consult `codebase-design` when defining the kernel and seams.
- V1 must use a local, fully open-source 2-D worker and preserve the existing Node application as the control plane.

## Decisions so far

- The first real product slice supports one repeating **continuous Z-girt/rail wall** family; steel-stud walls are the next adapter.
- The kernel is family-neutral. A family is a code adapter plus a versioned knowledge pack and validation pack.
- Existing layer-only calculations remain in place. A supported family upgrades an eligible wall to a thermal-treatment calculation.
- Family matching is broad enough to suggest likely opportunities, but a trusted calculation requires user confirmation and resolved critical inputs.
- The primary result is effective wall U-value, shown against the layer-only U-value and optional user-supplied project target.
- A missing critical input may yield a prominently labelled Preliminary Unsafe Estimate; only inputs inside a validated family envelope yield a Verified result.
- V1 supports repeating within-wall components only. Junctions, corners, windows, and arbitrary 3-D brackets are out of scope.
- No manufacturer-specific packs are required. Verification applies to a bounded generic parameterized family and its confirmed project inputs.

## Not yet specified

- Exact generic Z-profile parameter envelope and its benchmark/reference geometries.
- Validation acceptance thresholds for the open-source worker.
- The exact request/result and artifact contracts at the family/kernel/worker seams.
- Whether a genuine benchmark requires an external reviewed calculation in addition to numerical and analytical regression cases.

## Out of scope

- Regulatory compliance, certification, or engineering sign-off.
- A user-authored knowledge-pack editor.
- Arbitrary IFC-to-cross-section or IFC-to-3-D solver conversion.
- Slab-edge, corner, window-junction, and discrete-fixing families.
- Cloud solver deployment or microservices.
