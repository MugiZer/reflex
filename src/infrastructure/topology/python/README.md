# Proven topology worker package

This package is the production JSONL entrypoint for the preliminary
`repeating-parallel-profile-wall-2d` module. TypeScript starts an explicit
pinned CPython executable; `topology_worker.py` owns Recipe validation,
Primitive Registry resolution, canonical Shapely composition/audit, periodic
Netgen geometry, NGSolve solving, numerical gates, and reproducibility
artifacts.

The files under `kernel/` are promoted from the independently frozen
conformance proof. `compiler.py`, `primitive_plugins.py`, `numerical_utils.py`,
and `material-pack.json` are byte-identical to their proven sources.
`numerical_solver.py` differs only by using the packaged sibling
`numerical_utils.py` instead of adding the worker-spike directory to `sys.path`.

Runtime lock:

- CPython 3.12.10
- Shapely 2.1.2
- NGSolve/Netgen 6.2.2506
- MKL 2025.0.1

Install the exact lock into a release-owned environment; never resolve Python
from `PATH`:

```powershell
uv venv --python 3.12.10 .runtime/topology-python
.runtime/topology-python/Scripts/python.exe -m pip install -r src/infrastructure/topology/python/requirements.lock.txt
```

The public application verification is
`tests/provenPythonTopologyWorker.integration.test.ts`. The independent frozen
oracle remains `.scratch/component-topology-kernel/conformance-proof/verify.py`;
the production worker does not update or bless that oracle.
