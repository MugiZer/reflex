# WallPerf Physics Integration Issue 006 — Lock Runtime, Failure, and Artifact Ownership

## Question

How should the existing application infrastructure own the WallPerf worker's release identity, process supervision, retries, cancellation, artifact persistence, safe diagnostics, and graceful layer-only degradation without introducing a second job lifecycle or hiding enhanced-physics failures?

## Triage

- label: wayfinder:grilling
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

- Prove the Versioned WallPerf Worker.
- Define Domain Translation and Result Lineage.

## Resolution must decide

- Which existing topology/thermal worker mechanisms become shared infrastructure and which remain capability-specific.
- The failure taxonomy and the mapping from worker events to Job status, Calculation Snapshot availability, diagnostics, retryability, and support correlation.
- Atomic artifact locations, hashes, retention, cleanup, and publication requirements.
- When the existing layer-only result remains publishable and when the whole calculation must remain blocked.
- Health, observability, concurrency, resource-bound, and release-preflight requirements.
