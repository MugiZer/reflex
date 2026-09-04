# Incident report: Ticket 02 implementation attempt

**Ticket:** `02-composable-2d-topology-worker-integration`

**Date:** 2026-07-25

**Disposition:** rejected and reverted. No topology-worker implementation from this attempt remains in the working tree.

## Executive summary

An implementation was attempted for a composable two-dimensional topology worker. It added a TypeScript worker, a small primitive registry, service support for evidence-bearing worker results, and seam tests. The targeted tests, full suite, and typecheck passed. That green state was misleading: the tests asserted the worker's synthetic fields, not physical or geometric correctness.

The required two-axis review found that the worker fabricated a clean canonical geometry, topology audit, and numerical-convergence evidence even when the construction was geometrically invalid. In particular, it retained complete layer rectangles and added member rectangles on top, reported zero overlap without calculating it, and emitted fixed mesh/refinement/residual diagnostics from a parallel-resistance approximation rather than a real 2-D solve.

Because a `preliminary-unsafe` result must still be a genuine solved result—not an approximation presented as numerical evidence—the implementation was reverted immediately. The repository's prior topology request spine remains intact.

## Timeline and commits

| Time / action | Result |
| --- | --- |
| Read ticket and architecture/contract material | Confirmed the public seam is `TopologyAnalysisRequestService` and the intended worker is a pinned, generic compiler/solver. |
| Wrote red seam tests | Initially failed because the new worker module did not exist. |
| Added TypeScript implementation and tests | Targeted tests passed after several local corrections. |
| Ran compatibility checks | `tests/composable2dTopologyWorker.test.ts`, `tests/topologyAnalysisRequest.test.ts`, and `npm run typecheck` passed. |
| Commit `59efcee` | `feat: add composable 2d topology worker`; 153 additions across four files. |
| Ran full suite | 38 files / 147 tests passed while the experimental commit was present. |
| Performed standards and specification review | Both reviews identified safety-critical correctness gaps. |
| Reverted immediately | Commit `614a1c5` (`Revert "feat: add composable 2d topology worker"`). |
| Re-ran repository verification | Current baseline: 37 files / 134 tests passed; typecheck passed. |

The one-test-file / 13-test difference between the two full-suite counts is expected: the reverted experimental test file had 13 tests.

## What the attempted implementation changed

Commit `59efcee` changed four files:

| File | Intended purpose |
| --- | --- |
| `src/infrastructure/topology/Composable2dTopologyWorker.ts` | In-process TypeScript registry/compiler/worker for rectangle, C, Z, hat, and extension primitives. |
| `src/application/topology/createTopologyAnalysisRequestService.ts` | Accept worker `blocked`/`rejected` outputs and carry worker evidence into a `TopologyResult`. |
| `src/domain/topology/topologyTypes.ts` | Add optional opaque `workerEvidence` to `TopologyResult`. |
| `tests/composable2dTopologyWorker.test.ts` | Test supported primitives, a vendor block plugin, several rejections, two rows, and request-seam preservation. |

Those changes were entirely removed by `614a1c5`.

## Exact review findings

### Safety-critical specification failures

1. **No generic Boolean composition or region partitioning.**

   The worker retained each complete layer rectangle and appended member rectangles as additional material regions. The same physical area was therefore assigned to both host and member material. It did not subtract member geometry from host material, compute the union of primitive pieces, or partition the cell into non-overlapping Material Regions.

   Consequence: the emitted `CanonicalAnalysisGeometry` was invalid by its own contract, while the audit claimed `materialAreaM2 = cellAreaM2`, `gapAreaM2 = 0`, and `overlapAreaM2 = 0`.

2. **Overlap was deliberately hard-coded to zero.**

   `overlapAreaM2` was set to `0`; an `overlap()` helper existed but was unused. The test accepted two aligned C rows even though the rows could coincide. Local primitive pieces also overlapped at web/flange joins and were never unioned.

   Consequence: invalid or colliding member geometry could receive a successful `preliminary-unsafe` result instead of `rejected`.

3. **Periodic seam crossing was invalid.**

   The implementation wrapped only a rectangle's `x` origin with modulo arithmetic. It did not split a rectangle that crossed the periodic cell boundary. A member placed near the seam could extend past the cell, but still pass validation.

   Consequence: out-of-domain geometry could appear in a supposedly canonical periodic cell.

4. **C-section geometry was wrong.**

   The C web used `height: flangeWidth` rather than `height: depth`, so it did not model the requested section. Similar local-geometry concerns applied to the other simplified shapes.

   Consequence: even a geometrically non-overlapping calculation would not represent the submitted primitive parameters correctly.

5. **Cavities and thermal breaks were universally rejected.**

   The ticket and PRD require them as part of the module vocabulary, with deterministic audit outcomes. The attempted worker rejected every non-empty cavity or thermal-break list.

6. **The numerical path was not a real 2-D solve.**

   It used a parallel-resistance estimate. The steel material contribution was hard-coded through `totalDepth / 50`; the member material did not actually determine the path. Unknown materials silently defaulted to `0.04 W/(m·K)`.

   It reported fixed diagnostics such as three refinements, mesh counts `[32, 64, 128]`, residual `1e-9`, and convergence `true` without meshing or solving.

   Consequence: it would fabricate numerical proof, convergence, flux, and reproducibility evidence. This was the principal reason for the revert.

7. **The worker did not enforce a pinned registry by default.**

   Registry-hash validation was optional. Constructing the worker without that optional field accepted any request registry hash.

8. **The public request seam allowed a successful result with no evidence.**

   The service change only rejected a partially supplied evidence triple. It accepted a `preliminary-unsafe` output that contained none of canonical geometry, audit, or numerical evidence, preserving compatibility with the earlier stub tests.

   Consequence: the new ticket's requirement—success must persist all three evidence categories—was not actually enforced at the public seam.

9. **Primitive contract was too weak.**

   Plugins exposed rectangles and parameter names only. They had no declared capabilities or contact data. Interfaces were synthetic `perfect-contact` records unrelated to actual shared boundaries.

### Code-quality findings

1. The compiler boundary used `Record<string, any>`, `any[]`, and untyped regions. This bypassed TypeScript exactly where invalid external JSON needs the strongest validation.

2. Reproducibility hashes used `JSON.stringify`, which depends on object insertion order. Equivalent semantic objects could have different hashes.

3. The implementation packed core geometry/solver behavior into dense single-line functions, making it difficult to inspect and validate.

## Test results and logs

### Initial red test

Command:

```powershell
npm test -- --run tests/composable2dTopologyWorker.test.ts
```

Result before implementation:

```text
Test Files  1 failed (1)
Tests       no tests
Error: Cannot find module '../src/infrastructure/topology/Composable2dTopologyWorker.js'
```

This was the expected red state: the test imported a module not yet present.

### Experimental targeted checks

Command:

```powershell
npm test -- --run tests/composable2dTopologyWorker.test.ts tests/topologyAnalysisRequest.test.ts
npm run typecheck
```

Result:

```text
Test Files  2 passed (2)
Tests       17 passed (17)
tsc --noEmit: success
```

### Experimental full suite

Command:

```powershell
npm test
```

Result:

```text
Test Files  38 passed (38)
Tests       147 passed (147)
Duration    14.66s
```

Warnings were only existing Node SQLite experimental warnings. They were unrelated to topology work.

### Current post-revert verification

Command:

```powershell
npm test
npm run typecheck
```

Result:

```text
Test Files  37 passed (37)
Tests       134 passed (134)
Duration    20.01s
tsc --noEmit: success
```

The working tree has no modified production topology source from this attempt. Existing unrelated user changes remain unmodified.

## Why the tests did not catch it

The test suite was behaviorally shallow in the wrong way:

- It asserted the presence of audit and numerical fields rather than independently checking their physical or geometric truth.
- The two-row test asserted `preliminary-unsafe` for aligned and staggered C rows, so it encoded an unsupported expectation instead of detecting overlap.
- It did not inspect the union/partition of layer and member regions.
- It did not include a seam-crossing periodic member.
- It did not exercise unknown material resolution, material-dependent flux changes, actual refinement deltas, or independent analytical fixtures.
- It let the service accept legacy successful worker output without the new required evidence.

The testing lesson is not merely “add more tests.” The replacement tests must compare against independent references: analytical layered cases, frozen conformance fixtures from the proven worker, actual mesh/refinement values, conservation checks, and known rejected geometry.

## Correct remediation plan

Do not revive the reverted TypeScript approximation. Instead:

1. **Promote the existing proven Python worker stack.** Use the conformance implementation under `.scratch/component-topology-kernel/conformance-proof/` as the starting point, including its generic compiler, `PrimitiveRegistry`, actual Shapely geometry operations, and NGSolve/Netgen numerical adapter. Package it as the pinned worker specified by the production architecture.

2. **Keep TypeScript at the orchestration boundary.** The application should only launch the pinned worker, enforce protocol identity/idempotency/artifacts, and preserve layer-only snapshots. It must not reconstruct polygons or provide a fallback numerical calculation.

3. **Make the successful result contract strict.** Require canonical geometry, topology audit, numerical evidence, reproducibility manifest/hash, and artifact index for every `preliminary-unsafe` output. A missing or malformed item is `rejected` or `failed`, never a partial success.

4. **Use contract-defined error categories.** Return `blocked` for missing/conflicting critical values and `rejected` for unsupported/invalid geometry. Persist a structured error artifact with the stable code and no U-value.

5. **Adopt the frozen fixtures before integration.** Port the known timber, single-C, aligned-C, staggered-C, Z, hat, vendor block, point-fixing, crossed-framing, unknown primitive, out-of-host, and invalid-geometry cases into the production worker's verification suite. Do not bless output generated by the implementation under test.

6. **Add public seam tests.** Through `TopologyAnalysisRequestService`, verify that a success contains all evidence artifacts, invalid results contain no number, and failure/rejection leaves the layer-only snapshot byte-for-byte unchanged.

7. **Add required geometry and numerical gates.** Explicitly test partition conservation, gaps, overlap, slivers, periodic face matching, material resolution, contact interfaces, mesh refinement, solver residual, hot/cold/periodic flux diagnostics, cell stability, and deterministic manifest hashes.

## Recommended restart point

Start with a thin TypeScript process adapter around the already-proven worker, with a fixture-backed end-to-end test for one timber Recipe. Do not begin by rewriting the compiler or solver in TypeScript. Once that path persists canonical artifacts correctly, add the registry bundle and the full primitive conformance set.

## Relevant paths

- Ticket: `.scratch/component-topology-preliminary-v1/issues/02-composable-2d-topology-worker-integration.md`
- Production architecture: `context/specs/component-topology-production-architecture.md`
- Recipe contract: `context/specs/declarative-construction-recipe-contract.md`
- Existing compiler proof: `.scratch/component-topology-kernel/conformance-proof/`
- Existing worker spike: `.scratch/component-topology-kernel/worker-spike/`
- Reverted attempt: commit `59efcee`
- Revert: commit `614a1c5`
