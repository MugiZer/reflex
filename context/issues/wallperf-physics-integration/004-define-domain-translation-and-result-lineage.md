# WallPerf Physics Integration Issue 004 — Define Domain Translation and Result Lineage

## Question

How does the TypeScript domain translate reviewed IFC evidence and User Input into physics requests, then translate validated worker metrics into immutable Calculation Snapshot and Revision state while preserving provenance, uncertainty, assumptions, diagnostics, and historical replay?

## Triage

- label: wayfinder:grilling
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

- Define the Physics Analysis Contract.

## Resolution must decide

- The domain-owned source types for conductivity, density, specific heat, vapor resistance, climate, framing, window product-U, and boundary conditions.
- Whether enhanced results extend Calculation Snapshot directly or use a nested immutable Physics Analysis section referenced by the snapshot.
- How every worker input and output traces to IFC Evidence, User Input, Material Resolution, constants, and worker/runtime identities.
- Which input or package changes create a new Revision and which only change delivery projections.
- How historical Revisions remain renderable and reproducible after contract or WallPerf package upgrades.
