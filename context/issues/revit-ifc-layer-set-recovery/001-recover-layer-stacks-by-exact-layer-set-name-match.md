# Revit Layer Recovery 001 - Recover Layer Stacks By Exact Layer-Set Name Match

> *This was generated from `context/prds/revit-ifc-layer-set-recovery.md`.*

## Triage

- Category: enhancement
- State: ready-for-agent
- Type: AFK
- Blocked by: none

## What to build

Implement the first conservative recovery path for Barclay-style Revit IFC exports:

```text
relevant wall ObjectType / type-like name
-> exact normalized match
-> IfcMaterialLayerSet.LayerSetName
-> recovered LayeredMaterialEvidence
-> Assembly Candidate sees layer stack
-> Missing Datapoints ask for lambda, not layer thickness
```

Official `IfcRelAssociatesMaterial` evidence remains higher precedence. Recovered evidence must be marked as recovered/candidate provenance, not official material association evidence.

## Acceptance criteria

- [x] Official `IfcRelAssociatesMaterial` material/layer evidence still works and remains highest precedence.
- [x] When official material association evidence is absent, exact unique wall `ObjectType` to `IfcMaterialLayerSet.LayerSetName` match recovers ordered layers.
- [x] Recovered evidence cites source element/type STEP ids, layer-set STEP id, layer STEP ids, and material STEP ids where present.
- [x] Ambiguous duplicate layer-set name matches emit diagnostics and do not silently choose.
- [x] No match preserves current missing-evidence behavior.
- [x] Recovered layer thicknesses normalize through project units before becoming usable calculation input evidence.
- [x] Missing lambda still becomes Requested Input; layer recovery must not invent conductivity.
- [x] Assembly Candidates reflect recovered layer stack, layer count, material names, and thickness availability.
- [x] Diagnostics explain absent official material links and recovered exact name matches.
- [x] Existing gates pass: `npm test`, `npm run typecheck`, `npm run verify:e2e`.
- [x] Optional local gate passes or documents current blocker: `npm run verify:e2e:local -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"`.

## Implementation status

- Status: complete and integrated into the localhost Job pipeline.
- Product integration: uploaded Jobs now derive `calculation-input-evidence.json` from real IFC extraction by default; synthetic evidence is only an explicit verifier/test override.
- Local Barclay gate: `npm run verify:revit-layer-recovery:local -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"` passed with 536 recovered layer-set matches, 298 recovered multi-layer stacks, and 536 calculation inputs requiring lambda.
- Verification: `npm test`, `npm run typecheck`, `npm run verify:milestone-4`, `npm run verify:e2e`, and the narrow local recovery verifier passed.

## Context files

Read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/domain.md`
- `context/specs/module-architecture.md`
- `context/specs/ifc-evidence-extractor.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`
- `context/prds/revit-ifc-layer-set-recovery.md`

## Agent brief

Keep fallback recovery as a parser/evidence feature. Do not push Revit-name logic into calculation, Review UI, Report, or viewer code.

Prefer a small deep recovery module with a clear interface over scattered string matching.

Start exact-only. No fuzzy matching.
