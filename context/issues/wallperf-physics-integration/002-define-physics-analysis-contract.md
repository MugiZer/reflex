# WallPerf Physics Integration Issue 002 — Define the Physics Analysis Contract

## Question

What is the smallest versioned Physics Analysis Request and Physics Analysis Result contract that carries reviewed domain inputs to a JSONL worker and returns nominal R/U, temperature and fRsi, moisture, dynamic, RSIE, window, diagnostic, assumption, version, and reproducibility data without leaking WallPerf's Pydantic, API, session, or persistence models into the host domain?

## Triage

- label: wayfinder:prototype
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

None.

## Resolution must decide

- The stable request identity, source Revision and Assembly Group identity, idempotency key, units, and schema-version rules.
- The capability-specific required and optional inputs, including how missing or uncertain values are represented without worker defaults.
- The independent optional result sections and the difference between unavailable, rejected, failed, and calculated outcomes.
- The diagnostic, assumption, warning, source-version, runtime-version, and reproducibility fields required at the public seam.
- Which invariants are validated in TypeScript, in the worker adapter, and inside the WallPerf package.
