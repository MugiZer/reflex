# Milestone 4 PRD - Thin Web App + Async Job Backend

## Problem Statement

Milestone 3 proves the non-UI product loop: parser evidence becomes review inputs, overrides, revisions, calculations, and a standalone HTML report. The next risk is making that loop usable by colleagues through a browser without overbuilding auth, cloud infrastructure, or a full product dashboard.

Users should not need to run CLI commands or edit scripted review files. They need a local web app that accepts an IFC upload, creates a real async Job, processes it in the background, shows assembly-focused review questions, accepts missing datapoints, recalculates, and opens the prebuilt HTML Report.

Milestone 4 must provide a colleague-usable localhost prototype while keeping complexity low.

## Solution

Build a thin web app and real async Job backend around the Milestone 3 core workflow.

The app will:

- accept IFC uploads from a browser;
- create a persisted Job id immediately;
- process the Job in an in-process background worker;
- store Job metadata in SQLite;
- store uploads, evidence artifacts, full revisions, and `report.html` in local files;
- show minimal Job status;
- show assembly-focused review questions after extraction;
- submit review inputs through an API endpoint;
- create revisions and recalculate in the background;
- serve a prebuilt HTML Report.

Milestone 4 is localhost-only, single-workspace mode. It has no full auth and no cloud queue/storage. It should avoid singleton assumptions that block multi-user support later.

## User Stories

1. As a colleague, I want to open a local web page, so that I can use the prototype without CLI commands.
2. As a colleague, I want to upload an IFC file, so that the system can process my model.
3. As a colleague, I want upload to return a Job id quickly, so that slow IFC parsing does not block the browser request.
4. As a colleague, I want to see a Job page after upload, so that I know processing started.
5. As a colleague, I want minimal Job status, so that I know whether the Job is queued, processing, needs review, completed, or failed.
6. As a colleague, I want the page to show clear failure text, so that I know when processing failed.
7. As a colleague, I want the app to take me to review when inputs are missing, so that I can complete the calculation.
8. As a colleague, I want the app to skip review when no inputs are missing, so that I can open the report faster.
9. As a colleague, I want review after extraction and before final report, so that the report reflects my completed datapoints.
10. As a colleague, I want review questions grouped by Assembly Group, so that I am not overwhelmed by a global unresolved datapoint list.
11. As a colleague, I want to see one Assembly Group at a time, so that review stays focused.
12. As a colleague, I want to see a compact unresolved assembly list, so that I can jump or skip.
13. As a colleague, I want to see found evidence summary beside questions, so that I understand what the system already knows.
14. As a colleague, I want to see candidate suggestions, so that I can use helpful IFC hints without the system silently trusting them.
15. As a colleague, I want to enter missing lambda values, so that U-value calculation can complete.
16. As a colleague, I want to enter missing thickness values, so that layer R-values can be calculated.
17. As a colleague, I want to confirm classification when needed, so that ambiguous proxies/slabs are handled safely.
18. As a colleague, I want to choose an override scope when submitting an input, so that my answer applies at the intended level.
19. As a colleague, I want submitted inputs to create a revision, so that changes are traceable.
20. As a colleague, I want recalculation to happen after input submission, so that the report updates.
21. As a colleague, I want to open the generated report in the browser, so that I can inspect the result.
22. As a colleague, I want the report to show U-value or range, inputs, assumptions, warnings, provenance, and revision id, so that I can trust the output.
23. As a developer, I want a real async Job boundary, so that the API contract can survive slower IFC parsing and later worker upgrades.
24. As a developer, I want the first worker to be in-process, so that Milestone 4 avoids Redis, BullMQ, and separate worker services.
25. As a developer, I want SQLite to store Job and Revision metadata, so that state survives basic local app use.
26. As a developer, I want uploads and artifacts stored as local files, so that large IFC/evidence/report blobs do not go into SQLite.
27. As a developer, I want every file path scoped by Job id, so that multiple Jobs can coexist safely.
28. As a developer, I want no global active Job, so that future multi-user support is not blocked.
29. As a developer, I want no auth in Milestone 4, so that local colleague prototype work stays fast.
30. As a developer, I want the app bound to localhost by default, so that private IFC files stay local.
31. As a developer, I want polling instead of websockets, so that status UI stays simple.
32. As a developer, I want routes to serve prebuilt reports, so that report rendering stays in the report module.
33. As a developer, I want a clean functional UI, so that colleagues can use it without design polish becoming the work.
34. As a developer, I want a localhost verifier, so that upload/review/report behavior does not regress.
35. As a developer, I want the verifier to use fixtures when private IFCs are awkward, so that CI-style testing is possible later.

## Implementation Decisions

- Milestone 4 builds **Thin Web App + Async Job Backend**.
- Use a real async API boundary.
- Use an in-process background worker for the first implementation.
- Do not use Redis, BullMQ, S3, a separate worker service, Kubernetes, or cloud infrastructure.
- Acceptable V1 limitation: if the server restarts, queued/in-progress Jobs may need manual rerun.
- Use local single-workspace mode.
- Do not implement full auth, users, roles, teams, permissions, or concurrent editing.
- Do not design around a single global user/job assumption:
  - every Job has a Job id;
  - every file path is scoped by Job id;
  - no global active Job;
  - no global active Revision except inside a Job;
  - browser localStorage is not source of truth.
- Backend API:

```text
POST /api/jobs
GET /api/jobs/:id
POST /api/jobs/:id/review-inputs
GET /api/jobs/:id/report
```

- `POST /api/jobs`:
  - accepts multipart IFC upload;
  - persists Job as queued;
  - persists upload file;
  - enqueues local background work;
  - returns `{ jobId }` immediately.
- `GET /api/jobs/:id`:
  - returns Job id, Job status, minimal links, and enough review/report metadata for UI.
- `POST /api/jobs/:id/review-inputs`:
  - accepts assembly-scoped review inputs;
  - stores User Inputs and Overrides through core workflow;
  - creates Revision/recalculation work;
  - returns Job id, Revision id when available, and current Job status.
- `GET /api/jobs/:id/report`:
  - serves prebuilt `report.html`;
  - does not calculate;
  - does not assemble report data.
- Job statuses stay minimal:

```text
queued
processing
needs_review
completed
failed
```

- Optional stage detail may be added only if cheap. It is not significant.
- Use polling through `GET /api/jobs/:id`; no websocket needed.
- UI pages:

```text
/
  upload + recent jobs

/jobs/:id
  minimal status + links

/jobs/:id/review
  assembly-focused questions

/jobs/:id/report
  open/render prebuilt report
```

- Review page:
  - shows one Assembly Group at a time;
  - shows missing questions;
  - shows found evidence summary;
  - shows candidate suggestions;
  - shows confidence/warnings;
  - submits inputs;
  - allows skipping assembly;
  - allows compact view of unresolved assemblies.
- Review input endpoint body shape:

```json
{
  "assemblyGroupId": "...",
  "inputs": [
    {
      "requestedInputId": "...",
      "value": 0.035,
      "unit": "W/mK",
      "overrideScope": "assembly_group"
    }
  ]
}
```

- Response shape:

```json
{
  "jobId": "...",
  "revisionId": "...",
  "jobStatus": "processing"
}
```

- Storage split:
  - SQLite stores metadata/state.
  - Local files store heavy artifacts.
- SQLite stores:
  - Jobs;
  - Revision metadata/index;
  - optional Job events if cheap.
- Local files store:

```text
uploads/{jobId}/source.ifc
outputs/{jobId}/evidence/*
outputs/{jobId}/revisions/*
outputs/{jobId}/report.html
```

- Do not store IFC files, evidence blobs, revision blobs, or HTML report blobs in SQLite.
- Report is prebuilt HTML filled by backend report generation with calculation results.
- `GET /api/jobs/:id/report` only serves the file.
- UI polish target:
  - clean;
  - quiet;
  - professional;
  - colleague-usable;
  - no marketing/dashboard-heavy layout.
- Must have:
  - upload works;
  - Job status clear;
  - review form usable;
  - report opens;
  - errors visible.
- Do not spend time on:
  - animations;
  - advanced filters;
  - account settings;
  - PDF;
  - complex design system.

## Testing Decisions

- Test backend Job behavior through API-level tests where possible.
- Test storage behavior through public repository interfaces, not direct DB internals.
- Test worker behavior through observable Job state and artifact outputs.
- Test UI through localhost browser verifier focused on the happy path.
- Backend/API tests:
  - `POST /api/jobs` returns Job id immediately;
  - upload file is stored under Job-scoped path;
  - Job state transitions from queued/processing to needs_review/completed/failed;
  - failed processing exposes error text;
  - `GET /api/jobs/:id` returns status and links;
  - `POST /api/jobs/:id/review-inputs` accepts valid inputs and rejects invalid scopes/units/values;
  - `GET /api/jobs/:id/report` serves prebuilt HTML only when report exists.
- Storage tests:
  - SQLite stores Job metadata;
  - local files store upload/evidence/revision/report artifacts;
  - paths are scoped by Job id;
  - no IFC/report blob is stored in SQLite.
- Review flow tests:
  - extraction result needing review produces review page data;
  - submitted review input creates User Input, Override, Revision;
  - recalculation updates active revision/report.
- UI/localhost verifier:
  - start local server;
  - open localhost;
  - upload fixture IFC or test fixture;
  - wait for Job to reach `needs_review` or `completed`;
  - if `needs_review`, submit one review input;
  - open report;
  - assert report contains calculation/result text, revision id, assumptions/provenance markers.
- Use synthetic fixtures if private Barclay IFC is awkward for automated verifier.
- Keep private Barclay IFC as local manual/regression target and do not commit it.

## Out of Scope

- Full auth.
- Users table.
- Roles/teams/permissions.
- Multi-user editing.
- Concurrent review locking.
- Cloud deployment.
- Redis, BullMQ, SQS, or external queue.
- Separate worker service.
- S3/cloud object storage.
- PDF export.
- Advanced dashboard.
- Advanced filters/search.
- Account/settings UI.
- Websocket/live progress.
- Report calculation inside route handler.
- Material Library editing UI.
- Broad IFC coverage work.
- New physics features.

## Further Notes

Milestone 4 exists to make the working core product loop usable in a browser. It should not become a broad SaaS build.

Acceptance demo:

```text
1. Start local server.
2. Open localhost.
3. Upload IFC/fixture.
4. API creates Job id immediately.
5. Background worker processes Job.
6. Job page shows needs_review or completed.
7. If needs_review, review page shows assembly-focused questions.
8. User submits at least one input.
9. Backend creates Revision and recalculates.
10. Report page opens prebuilt HTML.
11. Report shows U-value or range, inputs, assumptions, warnings, provenance, revision id.
```

Context files to read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`
- `context/prds/milestone-2-calculation-input-parser.md`
- `context/prds/milestone-3-review-calculation-report-core.md`
- `context/specs/module-architecture.md`
- `context/specs/v1-system-design.md`

First likely implementation issue:

```text
Create the Job API and local async worker around the existing core workflow, proving POST /api/jobs returns immediately while background processing writes job-scoped artifacts and transitions Job status.
```
