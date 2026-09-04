# Milestone 5-002 - Optional Private IFC Local Verifier

## What to build

Create `verify:e2e:local -- "<private ifc path>"` so developers can run the same verifier flow against a local private IFC file without committing private fixtures.

## Acceptance criteria

- [ ] The command requires a path argument and reads that file as the upload payload.
- [ ] The command reuses the same E2E verifier path as the synthetic verifier.
- [ ] Private IFC content is not written into repo-tracked fixture paths.
- [ ] Summary artifacts identify the original filename but do not require committing the IFC file.

## Blocked by

- Milestone 5-001.
