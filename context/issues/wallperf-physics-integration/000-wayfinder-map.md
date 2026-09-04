# Wayfinder Map — WallPerf Physics Integration

## Destination

Produce a merge specification and agent-ready implementation route that adds the reusable WallPerf physics capabilities to the BIM-to-Physics Compiler through a versioned local Python JSONL worker, while the existing TypeScript domain remains authoritative for reviewed inputs, evidence, Revisions, Calculation Snapshots, uncertainty, persistence, target evaluation, UI, and reporting.

## Notes

- The repository at `C:\dev\conformity` is the canonical host. `wallperf` remains an installable package maintained in Kaveh's repository and is consumed only from an immutable authorized release tag or commit.
- The intended capability bundle includes nominal R/U, temperature and fRsi, Glaser moisture, ISO 13786 dynamic response, Quebec RSIE, window product-U, and climate/boundary calculations where the required reviewed inputs exist.
- The worker receives reviewed, domain-owned calculation inputs rather than IFC files. WebIfc extraction, Material Resolution, User Input, and review remain in the TypeScript domain.
- The worker is a computational provider, not a second domain, API, persistence model, compliance authority, or source of silent defaults.
- Validated worker outputs are translated into the host's domain and attached to immutable Calculation Snapshots and Revisions. Raw requests, responses, diagnostics, versions, and reproducibility evidence remain immutable artifacts.
- Existing TypeScript layer-only calculation remains available during shadow comparison and as graceful degradation when enhanced worker capabilities are unavailable.
- The existing shell is the first delivery surface. A React/Vite reconsideration belongs in the backlog after the integration is proven.
- Import underlying metrics, not donor compliance verdicts. Design comparisons use explicitly labelled Design Benchmarks; regulatory claims require a separate Target Evaluation gate with jurisdiction, code edition, applicability, source, and authority.
- Implementation should occur on a separate branch only after this map reaches its destination.
- Every session should consult `codebase-design`, `domain-modeling`, the active working contract, and the relevant current source before resolving a ticket.

## Decisions so far

<!-- Decisions are appended here only when child tickets are resolved. -->

## Not yet specified

- The exact versioned request/result schema and the capability-specific required-input matrix.
- Whether the release-owned physics environment shares a pinned Python distribution with topology workers or uses a separately pinned environment.
- The quantitative shadow-comparison tolerances, external reference cases, and promotion evidence for each capability.
- The final implementation-ticket breakdown and parallel work frontier; these emerge only after the contract, package proof, domain mapping, and gates are resolved.

## Out of scope

- Implementing the integration while wayfinding; this map produces the merge specification and executable route.
- Making FastAPI, Pydantic models, WallPerf sessions, or donor JSON storage authoritative in the host application.
- Sending IFC files directly to the physics worker or replacing WebIfc as canonical evidence extraction in this effort.
- Allowing worker-side material matching, silent defaults, mutable overrides, or source-free calculation values.
- Replacing the existing TypeScript calculation before capability-specific shadow gates are earned.
- Treating Design Benchmarks as regulatory compliance, certification, or professional sign-off.
- Migrating the current shell to React/Vite during the first integration.
- Fixing unrelated baseline defects during wayfinding; implementation must begin from a separately restored green host baseline.

