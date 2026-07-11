# Milestone 4 Issue 004 - Localhost Verifier and Architecture Review

## What to build

Add a localhost verifier that exercises upload, background Job processing, Review submission, recalculation, and Report serving. Record architecture review and any small refactor plan needed to keep modules simple.

## Acceptance criteria

- [ ] Verifier starts the local server on localhost.
- [ ] Verifier uploads a synthetic IFC fixture.
- [ ] Verifier waits for `needs_review` or `completed`.
- [ ] Verifier submits at least one Review input when needed.
- [ ] Verifier opens the Report route and checks calculation, provenance, and revision markers.
- [ ] `PR-LEDGER.md` records Milestone 4 verification and architecture review.

## Blocked by

- 001 Job API and Async Worker
- 002 Review Input and Report API
- 003 Thin Localhost UI

## Triage

- category: enhancement
- state: ready-for-agent
- AFK/HITL: AFK
