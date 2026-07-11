# Refactor Plan - Milestone 4 SQLite Adapter Stability

## Status

Implemented on 2026-06-08.

## Problem Statement

Milestone 4 uses `node:sqlite` to avoid native dependencies and keep the localhost prototype simple. Node 24 marks this module experimental, so the current adapter is acceptable for prototype work but may become fragile if the runtime changes.

## Solution

Keep all SQLite usage behind the Job Repository module and add a later dependency decision only when the app needs non-experimental persistence. Do not spread SQLite calls into application or HTTP modules.

## Commits

1. Done - Add a public Job Repository interface type consumed by Job application modules.
2. Done - Update the current SQLite adapter to implement that interface without changing behavior.
3. Done - Move direct adapter imports out of application modules and into app composition.
4. Done - Add repository contract tests for create, update, list, Review state, and report metadata.
5. Deferred - Decide whether to keep `node:sqlite` or swap to a stable package once Node support and deployment target are known.

## Decision Document

- Job metadata stays in SQLite.
- Upload, evidence, revision, and report blobs stay in local files.
- Application modules should depend on a Job Repository interface, not the concrete SQLite adapter.
- No Redis, external queue, or cloud storage is introduced.

## Testing Decisions

- Test through repository behavior, not DB internals.
- Keep API tests as the main external behavior proof.
- Add adapter contract tests before swapping persistence implementation.

## Out of Scope

- Replacing SQLite now.
- Adding auth, multi-user state, queue workers, or cloud storage.
- Rewriting Job lifecycle behavior.
