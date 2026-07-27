# Ticket 02 hardening decision report

Date: 2026-07-27

Decision: **Ticket 02 hardening is ready; the real Python worker remains the only topology engine.**

## Changes implemented

- Added an atomic filesystem claim per idempotency key. Claims use an owner PID, do not sweep another process's temporary directory, and only reclaim a lock whose owner process is gone.
- Made publication immutable and replay-verifiable. Request, result/error/cancel, and worker artifacts are recorded with byte size and SHA-256; the manifest has a canonical payload hash.
- Added deterministic replay-audit failure artifacts for corruption and semantic idempotency conflicts. The original published directory is never overwritten.
- Added path containment, traversal, symlink, missing-file, and hash checks for every durable artifact.
- Added release preflight. TypeScript hashes the configured Python executable; Python verifies its interpreter, Shapely/NGSolve versions, dependency lock, registry, pack, runtime, and worker source hashes against release-owned constants before work starts.
- Added bounded JSONL output handling, malformed/multiple/oversized output classification, cooperative cancel messages, a one-second cancellation grace period, Windows process-tree termination, and child-close accounting.
- Added Python control-channel handling so a cancel message can arrive while a real solve is active.
- No TypeScript geometry compilation, Boolean operation, meshing, thermal solving, or numerical fallback was added.

## Release identities

Bundle:

```text
moduleId      repeating-parallel-profile-wall-2d
moduleVersion 1.0.0-draft
registryHash  97a73f5e277bc0971aec1d4ae62f2668447ff7cca587c5dc18f1ed51b3a21f12
packHash      ce5b0c473dc6ccca8d295ae095548271c6ba821a99681b593104bdd002500cc9
runtimeHash   b741ef6c97cec8a826ea89dc7d2c654d5b9a8b5d17eedb118d6acf4b4d8efbd6
```

Pinned runtime verification observed Python 3.12.10 / CPython, Shapely 2.1.2, NGSolve 6.2.2506, Windows-11-10.0.26200-SP0, and requirements SHA-256 `66325fc5d019f70bee2d37155e0e4f741472c8801d3e49d4d42e82cb17f53619`.

The executable digest checked by the TypeScript preflight is:

```text
0b471133e110cfb53a061cad528ce8e517d7b9ac41a0a396c39ad795a487fc14
```

Frozen conformance source-manifest hash: `ce2329bd4ccbac71729addcd11f328ef4b35478767e3089d10bd290d772a3718`.

## Independent Python verification

Command:

```powershell
& .scratch\component-topology-kernel\conformance-proof\.venv\Scripts\python.exe .scratch\component-topology-kernel\conformance-proof\verify.py
```

Duration: 119.5 seconds. Result: passed.

Accepted frozen cases:

| Case | U-value W/m²K | Stable result SHA-256 |
|---|---:|---|
| timber | 0.32245139902732417 | `3d28415da7264b66f5acd9f979f79e224252463deff8360dc116c417adb367b2` |
| single C | 1.1096050180516845 | `6522afdcbaf8e8d2a154766319d0f55a78dc31dd67601a9ab87137f462c4c4bc` |
| aligned C | 0.34368070096044545 | `c1f0fbcd039659d78a2a5babac68bed453b13299485a5ee3cc403343448619b3` |
| staggered C | 0.26493423641835795 | `adea6103fe49e28e4da2acf387ba8e2b9faba2b14013069907a1824a6e6b5f05` |
| Z regression | 0.2399856428620613 | `8692a787fbb816b9ebcea3b9730300f3c6a7b3a03e501501e22a14c81ff17d40` |

Rejected/blocked frozen cases: crossed framing, point fixing, unknown primitive, out-of-host geometry, disconnected member, and missing critical input. All produced the expected rejected/blocked categories.

## TypeScript verification

| Command | Result |
|---|---|
| `& ...python.exe -m py_compile src\infrastructure\topology\python\topology_worker.py` | pass |
| `npm test -- --run tests/topologyHardening.test.ts` | 8/8 pass |
| `npm test -- --run tests/provenPythonTopologyWorker.integration.test.ts -t "terminates deadline"` | pass; deadline and mid-solve cancellation; child counter returned to zero |
| `npm run verify:topology-request-spine-regression` | 11/11 pass |
| `npm run verify:topology-worker-failure-regression` | 6/6 pass; 219.84 seconds |
| `npm test` | 43 files / 160 tests pass; 241.12 seconds |
| `npm run typecheck` | pass; 10.5 seconds |
| `graphify update .` | graph rebuilt: 2,021 nodes / 4,167 edges / 218 communities |

The full real-worker integration matrix passed after preflight was enabled. It covers timber, C, aligned/staggered rows, Z, hat/vendor plugins, invalid geometry, unknown primitives, missing/conflicting input, incompatible bundle identity, deadline, cancellation, and replay corruption.

## Outcome and preservation checks

- Success is still `preliminary-unsafe` and requires canonical geometry, topology audit, numerical proof, reproducibility manifest/hash, artifact index, and pinned identities.
- Every rejected/blocked/failed/cancelled result has `effectiveUValueWPerM2K: null` and `evidence: null`.
- Corrupt request, result/error, manifest, worker artifact, missing artifact, changed hash, unsafe path, spawn, crash, malformed, multiple, and oversized output probes return durable failures without invoking the worker again.
- The representative layer-only snapshot bytes remained unchanged. Fixture byte hashes include `0b3f26381be46653a563a0af126a8a4e4d3f2f39b929d295ffd86e8b19983f00` for `{"uValueWPerM2K":0.315}` and `03ea125e6dd3e46ec338a29b2a838eb37e3d4c72d63155f9370c545a51ec6b33` for the readiness-bearing snapshot.
- The protected product-state fixture used by the seam tests remained byte-identical; its serialized fixture hash is `1f0f3d6b6d0c8e76a401e32fbcdb8dbca5df05819dead1ca3e051cc5f941795e`.

## Known boundary notes

Replay corruption is recorded in a deterministic `.replay-<semantic-hash>` audit directory so the original immutable publication is never overwritten. The audit directory is not used as a replacement numerical result and contains no U-value/evidence. The Python solver thread is terminated with its process after a bounded cancel grace period; NGSolve resource cleanup is therefore process-scoped, not an in-process cooperative solver API.

Generated verification outputs remain under the existing `.scratch` fixture/artifact locations and are not production IFC evidence, revisions, or layer-only snapshots.
