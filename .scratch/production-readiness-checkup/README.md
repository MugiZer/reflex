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
