# 02 - Prove the pinned Python topology worker through the production request seam

**What to build:** A supported declarative Recipe submitted through the production Topology Analysis Request seam runs in the release-owned Python worker and returns one auditable preliminary result. Every invalid, unsupported, failed, timed-out, cancelled, replayed, or corrupted case produces its declared durable outcome without publishing a U-value or changing the layer-only Calculation Snapshot.

**Blocked by:** 01 - Generic topology request spine. Ticket 01 must already enforce boundary ownership, immutable publication, concurrent idempotency, semantic hash validation, persisted outcomes for safe-to-identify invalid requests, and the complete outcome model recorded in `context/error_logs.md`.

**Status:** ready-for-agent

## Current implementation and resumption point

The codebase already contains:

- a generic Python Recipe compiler and Primitive Registry;
- real Netgen/NGSolve meshing and solving;
- topology audits, refinement evidence, flux diagnostics, repeat-cell checks, and reproducibility manifests;
- a TypeScript process adapter with bounded output, deadline propagation, cancellation, and artifact hashing;
- a pinned bundle identity and locked Python dependency list;
- real-worker integration fixtures for timber, C, Z, hat, unsupported primitives, invalid geometry, lifecycle failures, and artifact replay;
- a focused worker regression command.

The first TypeScript physics implementation was reverted because it fabricated geometry, used a parallel-resistance approximation, and invented convergence evidence. Do not restore any TypeScript geometry or thermal calculation fallback.

Resume by auditing the existing Python/TypeScript boundary against the invariants and matrix below. Preserve proven numerical code unless a failing public-seam probe demonstrates a defect.

## Exact prior failures

- Tests initially asserted field presence instead of independent numerical truth.
- TypeScript produced nominal success without genuine mesh, geometry partition, flux, or convergence evidence.
- Cross-language behavior was implemented more strongly on the TypeScript side than the Python side.
- Some lifecycle paths passed deadline/cancellation fields without proving enforcement and process cleanup.
- The focused suite previously stalled with live Python children and no final test summary.
- Runtime selection depended on a development environment instead of proving one release-owned configuration.
- Replay corruption tests covered worker artifacts incompletely and did not prove the entire request/result/error artifact lifecycle.

## Invariants

- Domain and application code contain no solver, subprocess, filesystem, or Python-environment mechanics. Infrastructure owns the process and artifact adapters.
- TypeScript and Python validate the same versioned request, result, error, and cancellation protocol.
- A success is always `preliminary-unsafe`; this ticket cannot produce a verified result.
- A success contains canonical geometry, topology audit, numerical proof, uncertainty/diagnostics, reproducibility identities, and verified artifact hashes.
- Every non-success contains no U-value and no numerical evidence.
- Every worker invocation has a finite deadline, settles once, and awaits child termination.
- One idempotency key produces one immutable outcome under sequential, restarted, and concurrent submission.
- Temporary artifacts never become published results. Published artifacts are immutable and replay-verifiable.
- IFC Evidence, the active Revision, historical Revisions, and the layer-only Calculation Snapshot remain byte-for-byte unchanged for every outcome.
- Runtime and bundle identities are release-owned and never discovered from `PATH`.

## Outcome and failure matrix

| Case | Required durable outcome | Public-seam evidence |
| --- | --- | --- |
| Supported timber Recipe | `preliminary-unsafe` | Real process run, independently checked analytical/conformance result, complete artifacts |
| Supported C-profile Recipe | `preliminary-unsafe` | Real mesh/solve, convergence and balance gates, complete artifacts |
| Missing critical Recipe input | `blocked` | Persisted request/error artifact, missing-input diagnostics, no U-value |
| Invalid Recipe structure or stale Recipe hash | `rejected` | Both-language validation probe, persisted rejection, worker not invoked when detectable before launch |
| Unknown primitive, module, or incompatible bundle | `rejected` | Stable code and version diagnostics, no numerical artifact |
| Worker unavailable or spawn failure | `failed` | Stable infrastructure code, no final numerical result, child count returns to zero |
| Empty, malformed, multiple, or oversized worker output | `failed` | Protocol probe and atomic-publication assertion |
| Worker crash | `failed` | Exit diagnostics, no U-value, no published partial result |
| Deadline exceeded | `failed` | Deadline code, process termination awaited, no U-value |
| Cancellation before or during solve | `cancelled` | Cancellation artifact, process termination awaited, no U-value |
| Equal sequential/restarted/concurrent replay | Same immutable outcome | One request ID, one worker execution, validated artifact reuse |
| Changed semantic payload under the same key | `rejected` | No worker execution and a persisted identity-conflict outcome |
| Missing, changed, or path-unsafe artifact | `failed` | Replay refusal with stable corruption code; no reused U-value |

## Implementation instructions

1. Write the outcome matrix as public-seam probes before changing production code.
2. Put shared message schemas or equivalent validators on both language sides and prove version/identity parity with conformance fixtures.
3. Keep all process, filesystem, artifact, and runtime mechanics behind infrastructure ports. Add an architecture regression that prevents application imports of filesystem/process modules.
4. Validate Recipe content against its hash and required contract fields before launching Python. Persist safe-to-identify invalid requests as rejected outcomes.
5. Verify that every declared outcome is reachable, persisted, reloadable, and rendered with diagnostics.
6. Make the worker lifecycle single-settlement: spawn, write one request, bound stdout/stderr, enforce deadline/cancellation, terminate if needed, await close, then publish atomically.
7. Prove the configured Python executable, dependencies, worker sources, module, registry, pack, and runtime identities before accepting work.
8. Independently compare representative results against the analytical slab and frozen conformance fixtures. Do not accept self-reported worker gates without recomputing the declared comparisons.
9. Exercise sequential, restarted, and simultaneous duplicate submissions and assert one request ID and one worker execution.
10. Corrupt each durable artifact class in turn and prove replay refusal without changing protected product state.
11. Run the focused worker verifier under an outer deadline, require a normal test-runner exit, and prove no tracked child remains.
12. Run the full suite and typecheck. A hung, killed, skipped, or manually terminated run is failure.

## Acceptance criteria

- [ ] Every invariant above has at least one named public-seam test.
- [ ] Every matrix row is reachable and asserts outcome, stable code, diagnostics, artifact set, worker invocation count, and protected-state bytes.
- [ ] Real timber and C-profile Recipes pass independent geometry and numerical checks.
- [ ] Request/result/error/cancel conformance probes pass on both TypeScript and Python.
- [ ] Semantic hash mutation is rejected before solve and leaves an auditable rejection.
- [ ] All non-success outcomes publish no U-value or numerical evidence.
- [ ] Deadline, cancellation, spawn failure, crash, malformed output, output limit, and cleanup tests exit normally with no orphan worker.
- [ ] Sequential, restart, and concurrent replay produce one immutable outcome.
- [ ] Artifact corruption and unsafe paths refuse replay.
- [ ] No TypeScript fallback physics or fabricated evidence exists.
- [ ] The focused verifier, full suite, and typecheck pass with final summaries.

## Required completion artifact

Return a Markdown decision report containing the invariant-to-test map, complete outcome matrix, both-language protocol results, runtime/bundle identities, fixture tolerances, exact commands and durations, worker invocation counts, artifact hashes, corruption results, no-orphan proof, unchanged layer-only hashes, and a final ready/not-ready decision.

