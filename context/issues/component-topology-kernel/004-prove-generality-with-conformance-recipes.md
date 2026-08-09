# General Component Topology Kernel Issue 004 — Prove Generality with Conformance Recipes

## Question

Does one recipe compiler and one Repeating 2-D Topology Module represent rectangular timber framing, single- and double-row C-stud framing, and the existing Z profile as declarative conformance recipes—without named-family branches, hidden topology-specific assumptions, or changes to kernel orchestration—and correctly reject constructions outside the supported two-dimensional vocabulary?

## Triage

- label: wayfinder:prototype
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

- Prove the Open-Source Topology Worker.
- Define the Recipe and Primitive Registry Contract.

## Resolution must decide

- Whether the chosen recipe and primitive interfaces are deep enough to support materially different constructions through registration and data alone.
- Whether one/two-row alignment, offset, cavity fill, and optional break composition produce complete non-overlapping representative cells.
- Which unsupported examples must fail structurally rather than degrade into misleading 2-D geometry.
- Whether the existing hard-coded Z geometry can be retired in favor of a regression recipe without making Z terminology part of the kernel.
- What interface changes are justified before the contract is frozen for implementation tickets.

