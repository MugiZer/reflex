# Milestone 4 Issue 001 - Job API and Async Worker

## What to build

Create the first localhost Job API around the existing core workflow. Upload creates a persisted Job id immediately, stores the IFC under a Job-scoped path, and starts in-process background work that moves the Job to `needs_review`, `completed`, or `failed`.

## Acceptance criteria

- [ ] `POST /api/jobs` accepts an IFC upload and returns `{ jobId }`.
- [ ] Upload files are stored under a Job-scoped path.
- [ ] Job metadata is persisted in SQLite.
- [ ] Background processing is observable through `GET /api/jobs/:id`.
- [ ] Failed processing records clear error text.

## Blocked by

None - can start immediately.

## Triage

- category: enhancement
- state: ready-for-agent
- AFK/HITL: AFK
