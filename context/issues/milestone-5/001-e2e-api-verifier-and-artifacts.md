# Milestone 5-001 - E2E API Verifier and Artifacts

## What to build

Create `verify:e2e` as a full Job verifier using the localhost app boundary. It must start the app, upload a deterministic synthetic IFC payload, wait for the Job, submit one Review input when needed, fetch the Report, assert calculation output plus provenance, and write verifier artifacts.

## Acceptance criteria

- [ ] `npm run verify:e2e` starts a temporary localhost app and creates a Job through `POST /api/jobs`.
- [ ] The verifier waits until the Job reaches `needs_review` or `completed`, fails on `failed`, and times out on stuck Jobs.
- [ ] When Review is needed, the verifier submits one valid User Input and checks a Revision is created.
- [ ] The verifier fetches the Report and asserts result plus provenance markers.
- [ ] The verifier writes `outputs/verifier/{runId}/summary.json` and `report.html`.
- [ ] Console output prints terse `PASS ...` steps.

## Blocked by

None - can start immediately.
