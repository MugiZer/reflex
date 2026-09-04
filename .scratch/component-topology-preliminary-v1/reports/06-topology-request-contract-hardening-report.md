# Ticket 06 topology request contract hardening report

**Decision:** complete. This report authorizes Ticket 09 to rely on the existing topology request boundary; it is not Ticket 09 acceptance evidence.

## Previously reproducible weaknesses and regression probes

| Weakness | Preventing probe |
| --- | --- |
| Concurrent equal submissions could publish more than once | `shares one durable outcome across independent service instances`; `shares one in-flight publication for concurrent equal idempotency submissions` |
| A caller could mutate the cached result and layer-only snapshot | `returns defensive immutable snapshots after caller mutation` |
| Persisted U-value, indexed bundle identity, Recipe identity, or outcome corruption could be reused or expose unstable diagnostics | `refuses changed persisted U-values manifest identities and outcomes after restart`; `refuses a review whose durable recipe identity was tampered with` |
| Changed request/error/manifest files or path traversal could be replayed | `refuses changed request, error, manifest, and path-unsafe artifacts on replay`; `publishes a durable integrity failure when a persisted artifact is corrupted` |
| Relative runtime paths and malformed deadlines could reach launch | `rejects non-absolute runtime paths and invalid deadlines deterministically` |
| Non-success could leak numerical output or mutate layer-only state | `publishes no U-value or evidence for every non-success and preserves product state` |

## Verification

- `npm run verify:topology-request-contract` — exit 0; 3 files, 22 tests passed; 3.76 s runner duration (22 s command wall time).
- `npm run typecheck` — exit 0; 22.1 s command wall time.
- `npm test` — exit 0; 46 files, 169 tests passed; 193.59 s runner duration (196.1 s command wall time).

The first full-suite attempt timed out at 124.1 s and was classified unexecuted. A verbose diagnostic then reproduced one Ticket 03 E2E failure under parallel worker contention: its propagation-only 30-second caller deadline expired while the same real-worker test passed alone in 12.9 s. The propagation allowance is now 120 seconds; dedicated lifecycle tests continue to prove deadline expiry and cancellation.
