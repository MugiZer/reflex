# Working contract

**Status:** active

**Owns:** durable implementation constraints for the BIM/IFC-to-physics
compiler. Code and tests define existing behavior; this contract defines the
rules for changing it.

## Product flow

```text
IFC input -> immutable IFC evidence -> assembly/review state
-> calculation snapshot -> report
```

Optional component-topology analysis enriches a Revision. It never replaces the
layer-only Calculation Snapshot.

## Trust rules

- Preserve raw IFC evidence and its provenance. User input is a scoped override
  stored separately and creates a new immutable Revision.
- Keep uncertainty explicit: diagnostics, missing datapoints, assumptions,
  readiness, and confidence are output, not incidental logs.
- Auto-resolve exact material aliases only. Suggestions and ambiguous evidence
  require confirmation; low-confidence results use an estimate/range rather
  than a falsely precise value.
- Group assemblies only with strong matching evidence. Otherwise preserve a
  single element or `needs_review` state.

## Module boundaries

```text
app/http -> application -> domain
infrastructure -> domain interfaces/types
```

- `domain/` is deterministic business logic: no HTTP, database, filesystem, or
  `web-ifc` imports.
- `application/` coordinates use cases and lifecycle.
- `infrastructure/` contains parser, persistence, storage, and solver adapters.
- `app/http/` translates requests and renders delivery concerns; it does not
  own domain policy.
- Put third-party mechanics behind a named adapter. Prefer a small public
  interface with diagnostics over generic helpers or pass-through layers.

## Naming and state

Use the canonical vocabulary in `UBIQUITOUS_LANGUAGE.md`. In particular:
`jobStatus` is for jobs; `readinessState` is for assemblies/calculations;
`diagnostics` are domain-visible notes. Do not use vague names such as
`utils`, `helpers`, `manager`, or a catch-all `types` module.

## Verification

Run `npm test` and `npm run typecheck` after code changes. Add or update a
public-seam test that asserts the changed behavior and, where relevant,
provenance, diagnostics, and state transitions. Use the matching verifier from
`package.json` for HTTP or end-to-end work.

## Specialized boundaries

- Topology is preliminary-only. Do not claim `verified` output or re-enable
  legacy Z-girt verification without external validation and owner approval.
  The production worker uses its pinned release-owned Python runtime; never
  resolve Python from `PATH`.
- Thermal-treatment reference adapters are development/test seams. Register a
  supported family through its registry rather than altering generic runners,
  persistence, reporting, or worker-result handling.

## Historical material

`context/prds/` and `context/specs/` are design logs. Consult a specific file
only for historical rationale, a deliberately retained contract, or a task
that explicitly names it; do not treat them as default implementation context.
