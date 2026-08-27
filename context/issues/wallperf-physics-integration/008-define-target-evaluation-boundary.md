# WallPerf Physics Integration Issue 008 — Define the Target Evaluation Boundary

## Question

What domain model cleanly separates underlying WallPerf metrics from non-authoritative Design Benchmarks and from governed Regulatory Targets so every Target Evaluation records applicability, jurisdiction, code edition, source, authority, uncertainty, and result without implying certification?

## Triage

- label: wayfinder:grilling
- state: ready-for-agent
- AFK/HITL: HITL

## Blocked by

- Define Domain Translation and Result Lineage.

## Resolution must decide

- The identities and required provenance of Design Benchmarks, Regulatory Targets, and Target Evaluations.
- How opaque assemblies, windows, RSIE modes, moisture metrics, and unavailable values select or reject an applicable target.
- Which comparisons are allowed before a regulatory target is fully qualified.
- The language and state model that distinguish guidance, comparison, supported evaluation, and professional sign-off.
- How target updates create new evaluations without mutating historical Calculation Snapshots or Revisions.
