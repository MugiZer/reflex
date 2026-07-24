# Ticket 04 numerical generality proof

The verifier consumes the Ticket 02 recipe fixtures. Primitive plugins emit
local polygons; the shared compiler owns placement, periodic repetition,
Boolean composition, contacts, material regions, topology auditing, and the
canonical solver input. The shared compiler contains no primitive or family
names.

Five accepted cases run through the Ticket 01 Netgen/NGSolve finite-element and
H(div) flux path at at least three mesh refinements (four for the observed
non-monotone sequence) plus a two-cell stability solve.
Crossed framing, point fixings, disconnected members, out-of-host components,
and unknown primitives reject before meshing; missing critical input blocks.
Complete reproducible artifacts are written under
`artifacts/physical-conformance/`; any failed evidence gate exits non-zero.
`expected-stable-results.json` freezes the reviewed source-manifest, accepted
result, and rejection-diagnostic hashes so drift cannot bless itself.

Create the pinned local environment once before verification:

```powershell
uv python install 3.12.10
uv venv --python 3.12.10 .scratch/component-topology-kernel/conformance-proof/.venv
.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe -m pip install -r .scratch/component-topology-kernel/worker-spike/requirements.txt
```

Then run from the repository root:

```powershell
.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe .scratch/component-topology-kernel/conformance-proof/verify.py
```

The frozen proof is environment-scoped to CPython 3.12.10 on
`Windows-11-10.0.26200-SP0`. A different platform or patch release needs a
separately reviewed expected-results manifest.
