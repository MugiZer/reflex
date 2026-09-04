# Automatic bilingual material resolution — implementation state

Last updated: 2026-07-19

## Purpose

When Material Library review mode is selected, recognized IFC material names are matched automatically and their default thermal conductivity values are prefilled. The user does not need to enter those values manually.

## Exact implementation

### Material aliases

`src/domain/materials/library.v1.ts` adds these aliases:

- `blocs beton manufactures` → `concrete_block` / Concrete block
- `brique modulaire b1a` → `masonry_brick` / Masonry brick
- `brique modulaire b2a` → `masonry_brick` / Masonry brick

### Special thermal paths

`src/domain/materials/materialResolution.ts` recognizes metallic studs and resilient bars, including French and English names. They are classified as `metal_path` and remain unresolved until a parallel-path or thermal-bridge treatment is provided.

### Existing-job migration

`src/application/jobs/getJobWorkspace.ts` now refreshes stored review questions whenever a job is in `needs_review`:

1. Read the stored IFC calculation evidence.
2. Run `planRequestedInputs` with `defaultMaterialLibraryV1`.
3. Compare the newly planned questions with the stored questions.
4. Persist changed questions through `saveReviewState`.
5. Render the refreshed state in both the review context and architect action model.

This makes old analyses pick up the latest matcher when they are opened.

### Browser review state

`src/app/http/frontend/appShellClient.ts` seeds browser state when `reviewMode=library`:

```js
drafts[requestedInputId] = String(library.lambdaWPerMK)
sources[requestedInputId] = {
  source: "material_library",
  materialLibraryKey: library.materialKey
}
```

The value is displayed as filled in the review form. On submission, it is persisted as `valueSource: "material_library"`; until submission it exists only in the browser's current review state.

## What remains manual

The library does not auto-invent values for evidence gaps or unsafe physics cases. Air cavities, curtain walls, missing material names, metallic thermal bridges, and other special cases still require evidence or an explicit user decision.

## Local deployment state

The local deployment was reset on 2026-07-19:

- Deleted `data/app.db`.
- Deleted all files under `storage/uploads`.
- Recreated empty `data` and `storage` directories.
- Restarted `npm run serve:localhost` from the current source.
- Verified `GET /api/jobs` returns zero jobs.

## Verification

- TypeScript typecheck passes.
- 24 test files pass.
- 89 tests pass.
- Local server responds at `http://127.0.0.1:4173`.
