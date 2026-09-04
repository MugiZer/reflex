# WallPerf Physics Integration Issue 003 — Prove the Versioned WallPerf Worker

## Question

Can the existing release-owned Python supervision infrastructure load one immutable authorized WallPerf package, accept the versioned JSONL contract, execute the complete pure-physics capability bundle deterministically, and return bounded validated artifacts with reliable preflight, timeout, cancellation, and failure behavior on the supported Windows path?

## Triage

- label: wayfinder:prototype
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

- Establish the WallPerf Release and Reuse Boundary.
- Define the Physics Analysis Contract.

## Resolution must decide

- Whether the physics worker shares a release-owned Python distribution with topology or needs an independently pinned environment.
- Whether WallPerf can remain an upstream installed dependency without vendoring or modifying its core in the host repository.
- The worker entrypoint, JSONL lifecycle, preflight handshake, output bounds, cancellation, timeout, and process-tree behavior.
- The minimum immutable request/result and runtime evidence needed to reproduce a calculation.
- Which packaging or dependency result would force a different integration route before implementation planning.
