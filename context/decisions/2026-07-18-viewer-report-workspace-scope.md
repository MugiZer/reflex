# Viewer, Report, and Workspace Scope — 2026-07-18

## Decision

Retain the Thermal Review Workspace, bounded IFC viewer, and generated HTML report as three cooperating surfaces with deliberately narrow contracts:

- The workspace owns browser interaction state: review mode, target U-value, filters, drafts and provenance, submission navigation, and viewer selection. Target/mode/filter state is URL-backed; drafts stay in memory and are handed off during target navigation, with no client-side persistence.
- The viewer endpoint returns one versioned full-model payload per Job/source hash. Review STEP ids are selection state, not geometry-extraction variants, so they do not create separate cache entries.
- The report remains a prebuilt HTML artifact served by the existing Job route. The workspace may link to it, but it does not calculate, assemble, or redesign the report.

## Reconciliation with the UI redesign

This keeps the expansion aligned with `context/prds/conformity-ui-redesign.md`:

- the viewer remains an app/frontend adapter and keeps raw IFC ids subordinate to architect-facing labels;
- the no-framework, no-bundler localhost shell remains unchanged;
- the report stays the existing traceable artifact rather than becoming a second interactive UI;
- no model tree, section planes, property editing, or full BIM controls are added.

The payload contract is `ifc-viewer-geometry.v6`; cache variation is limited to the Job-scoped source hash. Any future viewer redesign must preserve this boundary or record a new decision before expanding it.