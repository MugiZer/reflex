# Milestone 5-003 - Browser Smoke Verifier

## What to build

Add a small browser smoke layer to the verifier. It should prove the localhost UI shell is reachable and can show the Job/Review/Report path. The smoke check is not visual polish or pixel-perfect regression.

## Acceptance criteria

- [ ] The verifier opens or fetches the localhost UI.
- [ ] It asserts Upload, Job, Review, or Report affordances are present.
- [ ] It writes browser smoke artifacts under `outputs/verifier/{runId}/screenshots/`.
- [ ] If a browser driver is unavailable, the verifier records a deterministic HTTP DOM fallback artifact instead of failing the whole API verifier.

## Blocked by

- Milestone 5-001.
