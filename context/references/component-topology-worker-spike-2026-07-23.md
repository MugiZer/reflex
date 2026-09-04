# Component topology worker spike — 2026-07-23

## Decision: adopt with named changes � Ticket 01 closed

The numerical blocker was isolated and corrected. The consolidated canonical verification passes and Ticket 01 is closed. The pinned runtime is Python 3.12.10, Shapely 2.1.2, NGSolve/Netgen 6.2.2506, MKL 2025.0.1 on Windows 11 10.0.26200. Windows still requires explicit Netgen/MKL DLL directories.

## Analytical homogeneous slab

The calibration cell is 0.2 m through-plane by 0.6 m periodic height, conductivity 0.035 W/(m K), cold face 0 C and hot face 20 C. The analytical heat flow per metre out of plane is `k A deltaT / L = 2.1 W/m`. Three meshes used maximum sizes 0.05, 0.025, and 0.0125 m (98, 390, and 1,684 elements).

### Hypothesis 1 — boundary selection

Explicit `Integrate(1, mesh, BND, definedon=mesh.Boundaries(name))` returns 0.6 m for exterior and interior and 0.2 m for each periodic edge at every refinement. Boundary naming and BND selection are therefore correct and nonempty.

### Root cause discovered before hypotheses 2–4

The first run used bottom `p0 -> p1` and top `p2 -> p3`. It produced drifting face fluxes (2.01, 2.31, 2.62 W/m), reaction fluxes (2.37, 2.68, 2.99 W/m), and nonzero periodic flow. Netgen's periodic documentation requires master and copied slave edges in the same direction. Defining top `p3 -> p2` with `leftdomain=0`, `rightdomain=1` corrected the degree-of-freedom mapping. This is physically necessary because equal-x points must be identified; the reversed definition paired `x` with `L-x`.

### Hypothesis 2 — volume-side H1 gradient on BND skeleton

Selected formulation: a `NumberSpace` linear form with `SymbolicLFI(-k grad(T) dot n q, BND, skeleton=True, definedon=...)`. It deliberately does not call `grad(T).Trace()`; the skeleton integrator supplies the mapped volume-side rule. Corrected slab outward fluxes are exterior `+2.1 W/m`, interior `-2.1 W/m`, and periodic net below `7e-16 W/m` on every mesh. This establishes the sign convention: cold outward is positive, hot outward is negative, and hot input is `-q_hot,out`.

### Hypothesis 3 — constrained Dirichlet reactions

The constrained residual `A T - f` is selected by a boundary nodal marker. Slab reactions are exterior `-2.1 W/m` and interior `+2.1 W/m`; their negatives equal physical outward flux. Agreement with the analytical result and the independent skeleton integration is within floating-point roundoff at every refinement. Reaction flux is conservative because it is the discrete force required to enforce the strong Dirichlet data.

### Hypothesis 4 — H(div) recovery

`-k grad(T)` is interpolated into first-order `HDiv`, then its normal component is integrated with the same BND skeleton mechanism. Slab results are exterior `+2.1 W/m`, interior `-2.1 W/m`, and periodic net below `2e-16 W/m`. H(div) gives a single-valued normal flux and is selected as the reported reference face method for heterogeneous cases. On the homogeneous linear solution it agrees exactly with raw H1 and reactions; it is retained because normal conformity is the relevant conservation property once element gradients are discontinuous.

Captured analytical results: `.scratch/component-topology-kernel/worker-spike/artifacts/homogeneous-slab-flux-probes-corrected.json`. The earlier wrong-orientation results are retained as `homogeneous-slab-flux-probes.json`.

## Corrected C-profile rerun

The copied top edge now has the same direction as the bottom master. Thin steel interfaces receive `maxh = min(global maxh, gauge/2) = 0.001 m`. The three runs contain 8,878, 10,578, and 18,422 elements. H(div)-mean heat flow is 2.178053, 2.176562, and 2.175736 W/m; U-value is 0.181504, 0.181380, and 0.181311 W/(m2 K). Relative changes are 0.06845% and 0.03792%, genuinely meeting the declared 0.5% rule.

At the finest mesh, independent H(div) face values are cold outward `2.175733961 W/m` and hot input `2.175738946 W/m`; hot/cold imbalance is `4.98e-6 W/m`. Periodic net outward is `-0.001411 W/m` and decreases with refinement. The independent Dirichlet reaction magnitude is `2.175733833 W/m`, volume-energy heat flow is `2.175733833 W/m`, and H(div) face mean differs from energy by `2.62e-6 W/m`. Free-DOF residual is `7.65e-12`. Volume energy is comparison evidence only and is not used as either face flux.

## Interpretation and remaining risks

The raw H1 skeleton flux is analytically valid on the slab and nearly conservative on the refined C cell. H(div) recovery is the reference reporting method; constrained reactions provide an independent global check. Production acceptance should set explicit tolerances for hot/cold imbalance, periodic net flow, reaction-versus-H(div), and refinement change. Independent external benchmark cases, runtime packaging/legal review, and native cancellation remain production risks assigned to later tickets. The canonical `verify.py` suite passes, so Ticket 01 is closed with the decision adopt with named changes.
