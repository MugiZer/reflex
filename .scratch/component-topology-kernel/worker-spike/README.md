# Topology worker spike

Ticket 01 has one claimed executable worker: `topology_worker.py`. It validates an immutable request, builds the corrected same-direction copied-edge periodic C-profile geometry, applies gauge-based local refinement, solves with NGSolve, recovers H(div) face fluxes, compares Dirichlet reactions and volume energy, and atomically publishes result/error/log artifacts.

Supporting modules are `worker_support.py` (request/artifact concerns), `numerical_utils.py` (free-DOF residual and flux diagnostics), `c_profile_solver.py` (geometry/mesh/solve), and `homogeneous_slab.py` (analytical verification case). `verify.py` is the only verification entry point.

Windows PowerShell setup and verification:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python verify.py
```

The command verifies the 2.1 W/m analytical slab, the corrected C-profile through the canonical worker, Ticket 03 convergence/balance limits, independent H(div)/reaction/energy agreement, invalid inputs, real Netgen meshing failure, missing dependency, non-convergence, crash, supervisor timeout, stdout/stderr capture, and atomic publication. It exits nonzero on any failed assertion.

Generated environments and `__pycache__` directories are not deliverables.
