# Ticket 09 durable component scenario completion

Decision: **GO**

## Contract and record graph

Schema `component-evaluation-sqlite/v1` is append-only: `IfcImport -> EvidenceSnapshot -> ComponentOccurrence -> PatternMatch -> EvaluationRun`; annotations attach to occurrences; exact Recipes attach to matches; scenario requests attach to evaluations/Recipes; terminal results attach to requests and artifact identities; aggregates attach to evaluations and publish only after a fresh SQLite reconstruction. Unresolved groups retain unmatched occurrence identities. Publications never rewrite source evidence, historical derivations, IFC bytes, or the ordinary layer-only calculation.

Identity hashes use language-neutral canonical JSON and SHA-256. `evidenceSnapshotId` hashes canonical source evidence; `annotationId` hashes evidence/authority/payload; exact Recipe identity includes Recipe plus pattern/compiler/registry/material/runtime/boundary versions; request identity includes Recipe/Revision/Assembly Group; result artifact identity includes request/outcome/payload/artifact hash; evaluation identity includes occurrence/match/Recipe identities. SQLite stores canonical payload SHA-256 beside immutable indexed identities and fails closed on mismatch.

Pattern `repeating-metal-c-profile@1.0.0` is promoted at `2026-08-02T00:00:00.000Z`. Frozen dataset `repeating-c-profile-safety-v1` SHA-256 `3088a9bc7bbb4263c78c9570d0e6f367098c0a009f87f4818afb5cfdc48ab7e1` covers development, varying dimensions, near-neighbour negatives, rejections, and frozen holdout. Promotion proof records recall `1.0` and unsafe false positives `0`. Oracle `repeating-c-profile-pinned-python-v1` SHA-256 `fca3dda946e42ae54a23f16b050518eec54f98edcd6ec5f9638b6523576f4036` is a direct pinned compiler/solver boundary independent of HTTP, SQLite, and aggregation.

## Invariant-to-test map

- INV[immutable-evidence]: `localhost IFC review records a matched component occurrence`; `bounded unknown runs all three durable Python scenarios`.
- INV[domain-independence]: `component evaluation identities are deterministic`; `Recipe bindings target the production scalar vocabulary`.
- INV[append-only-history]: `promoted version replays unresolved history append-only`; public HTTP replay proof.
- INV[real-worker-only]: `known promoted match runs one durable Python scenario`; bounded and conservative public E2E proofs.
- INV[honest-aggregate]: `restart recomputes the same range from stored scenarios`; `screening is conservative only when both gates pass`.
- INV[fail-closed]: `one scenario non-success prevents a successful range`; `report refuses altered or incomplete success evidence`.
- INV[idempotent-durable]: `simultaneous duplicate submission publishes one immutable evaluation`; restart resubmission equality.
- INV[protected-state]: bounded-success and mixed-terminal literal hashes in the verifier manifest.

## Outcome matrix

- CASE[exact-known]: one real Recipe/request/result; U-value `0.9136190712232274 W/m2K` within `1e-8`; restart stable.
- CASE[bounded-unknown]: depths `0.041/0.075/0.100 m`; U-values `0.8424804269783203/0.9136190712232274/0.9955419279501067 W/m2K`; three manifests; restart stable.
- CASE[conservative-range]: narrow real-worker bounds pass threshold and immateriality gates; literal worst case is the preliminary proposal.
- CASE[material-range]: material width/range returns min/max and decisive next input `memberWidthM`, with no single proposal.
- CASE[blocked]: missing declared authority is persisted/reloaded with no Recipe/result/value.
- CASE[rejected]: conflict/out-of-range is persisted/reloaded with stable rejection and no value.
- CASE[unmatched]: unresolved occurrence is grouped by evidence signature and remains durable.
- CASE[ambiguous]: two promoted candidates persist ambiguity with both candidates and no Recipe.
- CASE[lifecycle]: draft/candidate/rejected versions are runtime-ineligible and yield durable unresolved state.
- CASE[mixed-terminal]: real out-of-host Recipe rejection yields `range-unavailable`, null extrema/proposal, retained per-scenario outcomes.
- CASE[duplicates]: sequential, simultaneous, restarted, and restarted-resubmitted requests converge on one immutable evaluation and worker artifact.
- CASE[replay]: version-2 promotion creates a new public durable derivation while the original unresolved version remains byte/identity equal.
- CASE[corruption]: isolated match, Recipe, result, and manifest alterations produce safe GET/report diagnostics and no component number.

## Durable-state proof rows

Authority, input identity, protocol symmetry, outcome reachability, lifecycle, publication interruption, replay, idempotency conflict, runtime mutation, persisted corruption, protected state, evidence visibility, and cleanup/recovery map respectively to `componentPatternInterpreter`, Ticket 06 request-contract verifier, topology hardening tests, public outcome matrix, worker failure regression, component SQLite interruption tests, public replay, simultaneous/restarted duplicates, defensive snapshot tests, corruption E2E, protected hash observations, report lineage projection, and durable artifact-store retry tests.

## Real traces and protected state

The exact and bounded traces use IFC fixture SHA-256 `68a4762fadc42730a4638a77de7794075cfd388bbb004b3563e8fab1008ed6f7` and the pinned executable `.scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe`. Bounded success retained IFC hash `68a476...ed6f7` and layer projection hash `4a5d24e3cdc0a50ccf4bc23f318977d2f6231d22fc2ff24e8c34e68b5b0e33d3` before/after. Mixed-terminal failure retained IFC hash `fb4ae09147264cc01f60156a4386cad0f5470cf33bceeb9cbcfdaf4d85f7a196` and layer hash `08eff8253c521bda1cdc6cd5bba19924e13ce411980e5cc9eaa1a9a110e96a30` before/after.

## Verification evidence

Authoritative manifest schema `durable-component-scenario-verifier/v1`, run `2026-08-02T15:45:39.799Z`–`15:48:42.200Z`, duration `182407 ms`, exit `0`, counts selected/passed/failed/unexecuted `13/13/0/0`, stdout SHA-256 `f9a377d2994f1435a3b6d15fa9097d9747192abd7c2280e197da19c5f572697f`, stderr SHA-256 `0a8c6dfd41e115de347d64d06dcde349bce43060f12a2266a58371b2a684727c`. Each named case carries schema-validated public/durable evidence; worker-backed cases require actual Recipe/request/result identities, pinned runtime identity, artifact hashes, fresh reload outcome, and protected hashes where applicable. All eight mutations of that captured evidence were rejected, including fabricated oracle values, missing scenarios, missing worker execution, skipped restart, sequential-only submission, forbidden mixed-terminal range, lifecycle leakage, and protected-state mutation. Gate 5 and Gate 8 proof-gap audits returned GO at P5 durable-lifecycle and P6 independent-oracle depth. Minimum vertical-slice commit: `efb20084c7dd82cf6b79aaa71490372e0b9629a3`.

Upstream/final commands: Ticket 02 exit `0`/`125907 ms`; Ticket 03 exit `0`/`28597 ms`; Ticket 06 exit `0`/`7718 ms`; final `npm test` exit `0`/`283700 ms` with `197` tests across `54` files; final `npm run typecheck` exit `0`/`8115 ms`; final `graphify update .` exit `0`/`24600 ms` with a non-fatal zero-node warning for non-source/empty inputs. The earlier full-suite run exited `1` after `296913 ms` on one 5-second contention timeout; the exact proof passed alone in `701 ms`, received an explicit `30000 ms` budget, and complete clean reruns passed. Gate 9 audit is GO. Standards and Spec review axes both APPROVE with no unresolved findings. No fake-backed or unit-only proof authorizes readiness.
