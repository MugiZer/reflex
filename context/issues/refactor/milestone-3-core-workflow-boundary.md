# Refactor Plan - Milestone 3 Core Workflow Boundary

## Problem Statement

Milestone 3 adds the first Review + Calculation + Report Core path. The main architecture risk is letting the demo workflow become a shallow grab bag that normalizes Physics Assemblies, applies review inputs, calculates, persists revisions, and renders reports in one module.

## Solution

Keep the app workflow as orchestration only. Domain behavior should stay behind narrow modules:

- Requested Input planning.
- Material lambda resolution.
- Physics Assembly construction.
- Thermal calculation.
- Revision creation.
- HTML report rendering.
- Local file persistence.

## Commits

1. Add tests proving the current workflow output before changing module shape.
2. Extract Physics Assembly construction behind a domain module interface.
3. Keep file writing only in local-file infrastructure adapters.
4. Keep report rendering in the report module, not in review orchestration.
5. Add verifier coverage once real parser artifacts feed the workflow.

## Decision Document

- App review workflow may compose modules and adapters.
- App review workflow must not own thermal calculation rules.
- Domain modules must not import filesystem, HTML rendering, Express, SQLite, or `web-ifc`.
- Synthetic demo evidence is allowed for Milestone 3 while private IFC evidence remains too poor, but it must be labeled as a fixture.

## Testing Decisions

- Tests should target public module behavior: requested input planning, material precedence, thermal calculation, and full core workflow output.
- Future tests should add real parser-artifact fixture coverage when Milestone 2 artifacts contain calculable layered evidence.

## Out of Scope

- Web UI.
- Express routes.
- SQLite.
- Full real-IFC demo dependency.
- Large material database.
