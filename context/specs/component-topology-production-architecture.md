# Component topology production architecture and rollout

**Status:** approved for Component Topology Preliminary V1 implementation
**Date:** 2026-07-25
**Readiness:** ready for preliminary-V1 implementation tickets; not ready for Verified-envelope release work.

This specifies production boundaries for optional topology enrichment from
Tickets 01–04. It does not authorize a production `verified` result or replace
the layer-only calculation. Owner approval has been granted for preliminary V1;
only a future Verified-envelope release remains blocked.

## Product invariant

Every Assembly Group keeps its existing layer-only Calculation Snapshot. A
Topology Result is a separately versioned optional enrichment attached to the
source Revision by immutable `sourceRevisionId`; it does not create, replace,
or alter that Revision's layer-only snapshot or active-Revision choice. A later
user change that changes Recipe inputs creates a new Revision and a new linked
Topology Result. Missing input, unsupported topology, worker failure, or
missing artifact must never change the layer-only result, report, or historical
Revision. IFC labels suggest an opportunity only; they never infer geometry,
placement, contact, material, or validation evidence.

## Module ownership

```text
IFC Evidence -> recipe author/review -> TS orchestrator -> Python worker
     |                 |                    |                  |
layer-only calc        v                    v                  v
     |            primitive registry   persistence        canonical geometry
     +-----------------------> validation policy <---------- numerical proof
                                               |
                                         UI / Report / support
```

| Owner | Owns | Must not own |
| --- | --- | --- |
| IFC extraction | Raw IFC facts, paths, opportunity signals | Recipe inference or trust state |
| Layer-only calculation | Existing Physics Assembly and snapshot | Topology fallback or preconditions |
| Recipe authoring/review | Authority-tagged values and confirmation | Geometry or solver controls |
| TypeScript orchestrator | Boundary validation, protocol/lifecycle, compatibility negotiation, persistence handoff | Primitive/family geometry branches or plugin execution |
| Primitive plugin | Local parameter validation, polygons, local contacts, capabilities | Placement, repetition, solver, UI |
| Topology compiler/module | Cell placement/repetition, Boolean composition, regions/interfaces/audit, canonical input | IFC parsing or presentation |
| Python worker | Resolve pinned registry bundle; execute plugins and generic compilation; validate canonical geometry; mesh/solve; numerical evidence/manifest | Business trust classification, IFC parsing or Recipe mutation |
| Validation policy | Envelope and eligibility gates | Repairing geometry or solver failure |
| Persistence | Immutable request/result/error artifacts and Revision linkage | Result reinterpretation |
| UI/report | Separate projections, provenance, warnings, support access | Reclassification or suppressed failures |

The shared compiler resolves `registry.resolve(kind, version)` only. Plugins own
local polygons; the generic compiler owns global composition. There are no
primitive or family-name conditionals in this boundary.

## Cross-language protocol

The TypeScript orchestrator and separately packaged Python worker communicate
using newline-delimited UTF-8 JSON on stdin/stdout; stderr is structured logs.
Both sender and receiver validate against the same published JSON Schema before
writing or consuming a message.

| Schema | Minimum payload |
| --- | --- |
| `topology-analysis.request.v1` | `requestId`, `correlationId`, `idempotencyKey`, schema version, immutable Recipe/hash, module/registry snapshot, material/boundary/validation pack identities, worker config/hash, artifact destination |
| `topology-analysis.result.v1` | echoed identities, outcome, canonical geometry/hash, topology audit, numerical proof, validation inputs, reproducibility manifest/hash, artifact index, timings |
| `topology-analysis.error.v1` | echoed identities, stable category/code, safe message, retryability, phase, diagnostic artifacts, runtime identity |
| `topology-analysis.cancel.v1` | request identity, reason and deadline |

`requestId` identifies an attempt; `correlationId` joins UI, API, worker and
support logs; `idempotencyKey` hashes the immutable Recipe, registry/module,
packs and solver configuration. Duplicate matching keys share the immutable
result; a key with a different payload is invalid. Unknown major versions,
incompatible modules/primitives/packs/locks/runtimes, and semantically unknown
fields reject deterministically. Optional minor fields may be ignored only if
the schema declares them optional and semantics unchanged.

The only analysis content crossing into Python is the immutable Recipe,
identities/hashes for the compatible registry bundle and packs, worker
configuration, and artifact location. The worker verifies and resolves that
bundle locally, executes primitive plugins and the generic compiler, and
returns canonical geometry only in a complete result artifact. TypeScript never
constructs polygons or invokes plugins. Thus the worker is the sole compiler
and solver owner; the orchestrator owns only routing and lifecycle.

Cancellation is terminal: after `cancel.v1`, the worker writes either the
normal complete result or one `topology-analysis.error.v1` with category
`cancelled`, code, phase and diagnostic-log reference. It must not publish
canonical geometry or numerical evidence as a result artifact. The error
manifest may identify the discarded temporary directory only for privileged
support cleanup, never as a consumable calculation artifact.

## Worker operations and supportability

The worker is a pinned executable/container, not Python discovered from `PATH`.
The initial release baseline is CPython 3.12.10, NGSolve/Netgen 6.2.2506 and
Shapely 2.1.2—the exact runtime that produced the Ticket 04 conformance
manifest. A release-owned hash-locked requirements file is the source of truth
for those packages and every transitive dependency; its exact lock hash and the
immutable image digest are required release inputs and appear in every result
manifest. A Python/runtime upgrade requires frozen-fixture compatibility before
a validation pack accepts it.

A `health.v1` command returns supported protocol versions, module/registry
hashes, runtime/lock identity and a deterministic slab self-check. Failure
makes topology unavailable only. Local development uses the same image,
schemas, fixture packs and physical verification; it may not emit release
artifacts from an unpinned local environment.

The orchestrator supplies a deadline and cancellation token, sends `cancel.v1`,
waits a configured grace period, then terminates the isolated process. It may
retry exactly once only for a classified pre-solve transient infrastructure
failure. Geometry/schema/numerical/validation/deadline failures never retry.
Timeout, cancellation, OOM, invalid output and crashes yield no partial result.

The worker writes all files to a request-scoped temporary directory, fsyncs and
hash-verifies contents, writes the manifest last, then atomically renames the
directory. Persistence records it only after rename; startup removes stale
unreferenced temporary directories and never promotes them. Retain request,
result/error, canonical geometry, audit, numerical evidence, manifest and
scoped logs for the Revision retention period; retain release/validation
fixtures indefinitely. Redact raw IFC and user identifiers from logs.

Logs include timestamp, level, event, request/correlation IDs, idempotency-key
prefix, module/pack/runtime hashes, phase, duration, outcome and stable code.
Metrics cover outcomes, phase latency, queue/deadline/cancel/crash/retry counts,
artifact errors, gate failures and fallback use. Alert on crash loops, artifact
write failure, sustained timeouts and incompatible runtimes.

## Failure policy

| Condition | Topology outcome | User-safe behavior |
| --- | --- | --- |
| No Recipe | `not-requested` | Layer-only only; no verification implication |
| Complete supported solve outside approved envelope | `preliminary-unsafe` | Separate exploration result, assumptions/actions; never compliance/construction use |
| Missing/conflicting critical input | `blocked` | Preserve layer-only and request resolution |
| Unsupported/invalid topology, crossed framing, point fixing, invalid geometry or failed numerical gate | `rejected` | Preserve layer-only; diagnostic/new-module route; no estimate |
| Timeout/crash/runtime/artifact failure | `failed` | Preserve layer-only; retry only classified transient failure |
| Approved inputs, envelope and L0–L6 evidence | `verified` | Persist separate topology result and evidence |

`preliminary-unsafe` requires a valid compile and numerical solve; it is never a
fallback for unsupported, invalid, numerical, or infrastructure failure.

## Extension policy

Register a Primitive only when existing 2-D periodic semantics, placement,
contacts and physics apply and only local shape/parameters are new. Compose a
Recipe pack when existing primitives express the construction. Expand a
versioned Validation Envelope only with approved interaction fixture, bounds,
numerical proof, comparator/reference evidence and required specialist review.
Create a new Topology Module when dimension, representative volume, boundaries,
interaction physics or solver formulation changes: crossed framing, point
fixings, discontinuities, junctions, transient/moisture physics or arbitrary
solids are examples.

## Expand–migrate–contract rollout

1. **Expand/dark launch:** add schemas, immutable request/result store,
   packaged-worker health check and observability behind a feature flag. Run the
   five conformance recipes only, with frozen artifact hashes; do not expose a
   topology result or alter legacy Z-girt behavior.
2. **Migrate/shadow then preliminary pilot:** author Recipes from reviewed
   inputs without changing layer-only snapshots. Shadow selected Revisions,
   then expose only `preliminary-unsafe` to an owner-selected cohort. Keep
   historical Revisions on their original contracts and disable legacy Z-girt
   `approvedForVerification` before this stage.
3. **Contract:** after release gates pass, use the generic Recipe path for the
   approved pilot envelope. Remove the legacy family-specific production adapter
   only after every active use has an immutable replacement or retained
   layer-only result; retain a read-only historical adapter. Never contract the
   layer-only path.

Each stage has a kill switch to stop/cancel topology work and return to
unchanged layer-only calculation. Roll back by choosing an earlier compatible
immutable worker/module/registry/pack bundle, never by rewriting artifacts or
historical classifications.

## Release gates and implementation frontier

The first preliminary pilot needs protocol contract tests; health, timeout,
cancellation, crash-recovery and atomic-artifact tests; five generic cases plus
deterministic rejections; three refinements; H(div) hot/cold/periodic fluxes;
residual/convergence; one/two-cell stability; reproducibility hashes; and an
in-environment observability/rollback drill.

`verified` additionally requires approved L0–L6 validation: ISO 10211
references, analytical/geometry/numerical evidence, independent comparator and
application case, approved envelope matrix, specialist and owner approval. The
legacy Z-girt pack is non-Verified until independently rebuilt.

After approval, create four large demoable vertical slices:

1. Safe topology job — persistence, protocol, packaged worker and typed outcomes while layer-only stays unchanged.
2. Auditable pilot result — evidence persistence, trust gates, diagnostics and separate preliminary UI/report.
3. Operational rollout — feature flag, idempotency, cancellation, health, retry/recovery, retention, metrics and rollback drill.
4. Verified-envelope release — reviewed packs/reference/comparator, narrow envelope, then audited Z-adapter migration.

## Readiness: later Verified-envelope decisions

The following are not blockers for preliminary V1 implementation. They are required before any `verified` result is enabled:

1. Three-state trust policy, initial parameter bounds and quantitative gates.
2. Mandatory specialist review for first/material-change Verified packs and any maintenance exception.
3. ISO 10211 access and copyright-safe fixture ownership.
4. Feel++ role, Conducteö GPLv3/legal disposition, and independent Z comparator/reference result.
5. Approved initial validation matrix for timber, single C, aligned C, staggered C and Z, not merely conformance proof.
6. Explicit demotion of legacy Z-girt `verified` approval pending revalidation.
7. Deployment owner values: deadline/grace period, Revision retention, artifact access, SLO/alerts and pilot cohort.

The owner approved preliminary V1 on 2026-07-25. `/to-tickets` may now create
implementation tickets for the first three vertical slices only. The fourth,
Verified-envelope release, remains blocked by the decisions above.
