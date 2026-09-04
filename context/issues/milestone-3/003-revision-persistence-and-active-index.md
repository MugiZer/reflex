# Milestone 3 Issue 003 - Revision Persistence and Active Index

## What to build

Persist immutable Revision JSON files and an active revision index under `outputs/{fileHash}/revisions/`.

## Acceptance criteria

- [ ] New revisions include id, parent id, reason, user inputs, overrides, snapshots, and diagnostics.
- [ ] Previous revisions remain untouched.
- [ ] Revision index records all revisions and one active revision.
- [ ] Report generation uses the active revision id.

## Blocked by

- 001-core-review-calculation-report-spine

## Triage

- category: enhancement
- state: ready-for-agent
- AFK/HITL: AFK
