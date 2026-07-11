# Milestone 4 Issue 002 - Review Input and Report API

## What to build

Expose assembly-focused review data through the Job resource, accept scoped review inputs, create a revision through the core workflow, recalculate, and serve the prebuilt HTML Report without calculating inside the report route.

## Acceptance criteria

- [ ] `GET /api/jobs/:id` returns Job status, review metadata, links, and error text when present.
- [ ] `POST /api/jobs/:id/review-inputs` accepts assembly-scoped requested inputs.
- [ ] Review input submission creates a Revision and completes recalculation.
- [ ] `GET /api/jobs/:id/report` serves only an existing prebuilt report.
- [ ] Invalid values, units, and override scopes are rejected.

## Blocked by

- 001 Job API and Async Worker

## Triage

- category: enhancement
- state: ready-for-agent
- AFK/HITL: AFK
