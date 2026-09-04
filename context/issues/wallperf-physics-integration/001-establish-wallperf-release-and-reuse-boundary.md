# WallPerf Physics Integration Issue 001 — Establish the WallPerf Release and Reuse Boundary

## Question

What immutable, explicitly authorized WallPerf release, source/data/test scope, dependency manifest, and package identity may the BIM-to-Physics Compiler consume so both repositories can continue evolving without copied-code drift or ambiguous reuse rights?

## Triage

- label: wayfinder:task
- state: in-progress
- assignee: codex
- AFK/HITL: HITL

## Blocked by

None.

## Resolution must decide

- The license or contribution grant covering source, material datasets, fixtures, and tests intended for reuse.
- The upstream release tag or commit that first exposes the supported package surface.
- Which modules are supported public package API and which remain donor-repository internals.
- How package version, source commit, dependency lock, and computational identity appear in worker evidence.
- How changes flow upstream so the host does not maintain an untracked fork of WallPerf physics.
