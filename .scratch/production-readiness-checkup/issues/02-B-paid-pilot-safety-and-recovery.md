# B — Paid-Pilot Safety and Recovery

**What to build:** A founder can operate an isolated Conformity workspace for a paying customer, accept a bounded IFC upload, and recover visibly from an application restart or failed calculation without exposing another customer's data or activating incomplete engineering output. Manual retry and founder intervention are acceptable.

**Blocked by:** A — Verification Foundation

**Status:** implemented — verified through the real localhost/SQLite/filesystem composition

- [x] The supported pilot deployment is explicitly isolated per customer; the application refuses or the operating contract forbids sharing one unauthenticated workspace between customers.
- [x] An IFC upload has an explicit byte limit and an oversized or malformed request fails before unbounded buffering or durable Job creation.
- [x] A successfully accepted upload has a durable Job record before the response is returned.
- [x] On startup, abandoned `queued` or `processing` Jobs reach an explicit `failed/retryable` outcome instead of remaining indefinitely active.
- [x] A founder or user can manually retry failed work while the earlier failure remains diagnosable and previously completed Revisions remain unchanged.
- [x] A Job cannot report `completed` unless its required Revision and Report can be loaded and belong to that Job.
- [x] A new Revision and Report are complete before `activeRevisionId` changes; failed publication preserves the previously active Revision and Report.
- [x] Invalid input returns 400/422, a missing Job-owned resource returns 404, stale or conflicting state returns 409, and an unexpected defect returns a generic correlated 500.
- [x] Customer responses and operational evidence do not expose private IFC content, raw filesystem paths, SQL, credentials, or stack traces.
- [x] SQLite metadata and Job artifacts have one coordinated backup procedure, and a restore exercise recovers a completed Job, active Revision, and Report together.
- [x] The founder-facing operating notes cover onboarding, workspace isolation, backup, restore, manual retry, retention/deletion, and support escalation.
- [x] One earning test crosses the real HTTP app, SQLite repository, local upload/artifact storage, restart boundary, and restored Report; it proves success, abandoned-Job retryability, failed-publication protected state, oversized upload rejection, and one representative safe error from each category.

**Verification evidence:** `tests/paidPilotSafety.test.ts` and `evidence/verification-20260813014833512-17252.json`.

**Earning proof:** Run the paid-pilot tracer through the real localhost HTTP entrypoint and production local adapters, stop and recreate the app between defined steps, reread state from SQLite/files, and fetch the restored Report. Injected repositories or in-memory artifact stores are supporting tests only.

**Out of scope:** multiple workers, execution leases, distributed claims, automatic continuation after a crash, perfect replay, artifact quarantine/adoption, cancellation/supersession protocols, distributed transactions, full authentication, shared multi-tenancy, and broad HTTP-server restructuring.
