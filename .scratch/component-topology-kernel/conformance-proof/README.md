# Conformance proof prototype

Run from the repository root:

```powershell
python .scratch/component-topology-kernel/conformance-proof/verify.py
```

The verifier consumes the Ticket 02 recipe fixtures, compiles five supported
recipes through one registry-dispatched path, and checks deterministic topology
conservation and deterministic rejection categories. It writes its regression
summary to `artifacts/summary.json` and exits non-zero for any regression.

It does **not** claim physical/numerical conformance. The Ticket 01 worker is
C-profile-only and does not expose the required geometry audit, repeat-cell,
heat-balance, or full convergence evidence for the other primitive types.
