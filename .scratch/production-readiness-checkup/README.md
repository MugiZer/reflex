# Ten-Paid-User Trustworthy Pilot Plan

This is the authoritative plan merging two previously separate objectives:

1. harden the non-topology codebase; and
2. reach 10 paid users.

The merged objective is not to complete enterprise-grade hardening before selling. It is to reach 10 paid users through a founder-operated pilot while protecting customer data and Conformity's central promise: no incomplete, unsupported, or irreproducible engineering result appears verified.

Visible failure with manual recovery is acceptable at this stage. Silent or misleading results are not.

## Delivery model

The plan assumes a founder-operated pilot with an isolated workspace or installation per customer. It does not authorize a shared, unauthenticated multi-tenant deployment. Full authentication, organizations, billing automation, and shared-workspace authorization require a separate decision before that delivery model is offered.

## Dependency and completion model

```text
A — Verification Foundation (implemented)
              /                 \
             v                   v
B — Paid-Pilot Safety     C — Automatic Family Adapter
    and Recovery              and Qualification
             \                   /
              v                 v
       Ready for founder-operated paid pilots
```

B and C can proceed independently after A. A and B are now implemented and verified; C is the next engineering frontier. The 10-paid-user pilot is ready only when C also passes its earning proof through the real public/product composition.

## Tickets

- [A — Verification Foundation](issues/01-A-verification-foundation.md) — implemented foundation reused by both remaining tickets.
- [B — Paid-Pilot Safety and Recovery](issues/02-B-paid-pilot-safety-and-recovery.md) — implemented minimum operational guarantees for safely accepting customer IFC files in an isolated founder-operated pilot.
- [C — Automatic Family Adapter and Qualification](issues/03-C-automatic-family-adapter-and-qualification.md) — the differentiating feature, qualified so generated results cannot outrun their evidence.
- [D1 — Verification Profiles and Fast Feedback](issues/04-fast-verification-profiles-and-worker-proof.md) — compact developer feedback with an authoritative profile inventory and deterministic worker proof where numerical work is not the claim.
- [D2 — Numerical Release Proof and Evidence Gate](issues/05-numerical-release-proof-and-evidence-gate.md) — the real-worker release composition and reproducible GO/NO-GO evidence.

## Locked architecture: verification before and after

Implementation tickets: [D1 — Verification Profiles and Fast Feedback](issues/04-fast-verification-profiles-and-worker-proof.md), then [D2 — Numerical Release Proof and Evidence Gate](issues/05-numerical-release-proof-and-evidence-gate.md). This is parallel developer-velocity work and does not block C.

### Developer commands

`npm test` remains the complete working-contract suite. For ordinary feedback, run `npm run verify:fast`: it runs only the declared deterministic tests and refuses an inventory that selects the real Python worker. Run `npm run verify:integration` when changing persistence, local files, WebIFC, or localhost composition; it is deliberately single-worker because its tests use isolated local resources. The test inventory in `src/verifier/verificationProfiles.ts` is authoritative: every test file visible under `tests/` must appear exactly once with its resource facts and budget. A newly added test is therefore forced through classification before either profile can claim a pass.

Before a release decision, run `npm run verify:release`. It executes the fast, integration, and real pinned-worker numerical profiles exactly once, then writes a timestamped decision artifact under `.scratch/production-readiness-checkup/evidence/`. Only `GO` is releasable; `NO-GO`, `NOT-PROVEN`, and `HARNESS-BLOCKED` are explicit non-release outcomes. `npm test` remains required by the working contract and is not replaced by this gate.

### Before

- The default test command runs the entire repository test portfolio, including slow integration and real Python/topology tests.
- The production-readiness verifier overlaps phases: the same public-seam and HTTP test files can run again in full regression.
- Full regression forces one worker for the whole non-topology set, even where tests use isolated temporary state.
- Policy, persistence, and HTTP tests can pay for the real Python worker even when they are not proving numerical behavior.
- The result is a single slow feedback path, while the distinction between fast checks and release proof is implicit.

### After

- A profile-aware verification module exposes four explicit proof profiles: `fast`, `integration`, `numerical`, and `release`.
- Each test file belongs to one release profile by execution cost and dependency, not by filename. The release profile runs every profile once with no accidental overlap.
- `fast` covers deterministic domain/application behavior and safe HTTP semantics without spawning the real Python worker.
- `integration` covers SQLite, filesystem, WebIFC, and localhost composition with isolated temporary state.
- `numerical` contains the small real-worker proof pack: pinned runtime, process protocol, cancellation/deadline behavior, numerical reference cases, and artifact compatibility.
- Non-numerical topology/component tests use the existing worker interface with a deterministic adapter; the real adapter remains mandatory for numerical and release claims.
- Parallelism is enabled per profile only after shared resources are identified. Real-worker and shared-resource proof remains serialized where required.
- `npm test` remains the complete suite required by the working contract; the new fast profile is the short development feedback command, and the release profile is the deliberate pre-release check.

### Locked non-goals

- No shared mutable fixture state across tests.
- No generic test framework or universal worker abstraction.
- No deletion, weakening, or replacement of the real numerical proof pack.
- No requirement that the automatic family-adapter feature wait for this velocity ticket.

## Preserved architecture decisions

- Keep domain modules independent of HTTP, persistence, filesystem, and `web-ifc`.
- Preserve immutable IFC Evidence, explicit diagnostics and uncertainty, immutable Revision history, Calculation Snapshot provenance, and the distinction between verified, preliminary, unsupported, and failed results.
- Keep the Report renderer as a deep module and the Job workspace projection consolidated while each has one primary reason to change.
- Keep SQLite and local-file storage for the isolated low-volume pilot.
- Do not add a generic queue, storage abstraction, multi-worker execution model, or distributed transaction protocol without a real second implementation or observed operating need.
- Component Topology remains separately governed and outside this plan.

## Deferred hardening

The former B–E production-hardening tickets are superseded. Their non-essential guarantees remain recorded in [Over-Engineering vs Necessary Engineering](over-engineering-vs-necessary-engineering.md).

Deferred items include multi-worker leases, automatic continuation after crashes, perfect replay, automatic artifact adoption/quarantine, cancellation and supersession protocols, concurrent publication arbitration, generalized storage/worker abstractions, broad HTTP decomposition, exhaustive fault injection, and a complete all-state release matrix.

Promote a deferred item only when its recorded trigger occurs: multiple workers, expensive unattended Jobs, contractual retention/audit requirements, a second real adapter, adapter volume beyond manual qualification, or a production incident proving the simpler guarantee insufficient.

## Goal completion

The engineering plan is ready for the first paid pilot when:

- Ticket A's real verification command is green in the intended clean environment;
- Ticket B proves isolated customer handling, visible retryable failure, safe publication, safe errors, bounded uploads, and coordinated restore through the real app/storage composition;
- Ticket C proves one generated adapter against an independent numerical oracle and through the real IFC-to-Revision-to-Report flow;
- unsupported or unqualified results cannot appear verified; and
- the founder has a documented onboarding, backup/restore, adapter-disable, and customer-support path.

Reaching 10 paid users also requires customer acquisition and learning; passing these engineering tickets is necessary support for that goal, not evidence that 10 users have paid.
