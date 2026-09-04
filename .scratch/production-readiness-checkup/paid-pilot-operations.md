# Paid-Pilot Operating Contract

This is the supported operating model while Conformity is proving value with its first ten paid users. It is intentionally founder-operated and isolated; it is not a shared multi-tenant service.

## Onboard one customer

1. Create one private workspace with its own SQLite database, `storage` directory, and `outputs` directory.
2. Do not place two customers in one unauthenticated workspace. Start a separate app instance and workspace for each customer.
3. Bind the pilot app to localhost or a customer-specific protected host. Do not expose the current unauthenticated app directly to the public internet.
4. Record the customer, workspace paths, onboarding date, agreed retention date, and founder support contact outside the app. Never put credentials in filenames or Job notes.

## Daily operation and recovery

- A failed Job is visible as `failed`. If `retryable` is true, inspect its safe failure code/message and use `POST /api/jobs/{jobId}/retry` after correcting the cause.
- Restart recovery deliberately marks abandoned `queued` or `processing` Jobs failed/retryable. It does not silently resume them.
- Never present a Job as verified unless it is `completed` and its Report endpoint succeeds. If publication fails, the earlier active Revision and Report remain the customer-visible result.
- Give a customer the correlation ID from a generic 500 response when escalating. Do not send raw logs or workspace files over chat or email.

## Coordinated backup

Stop the app before backup so SQLite and the artifact directories represent one point in time. Choose a new backup directory outside the active workspace:

```powershell
npm run pilot:workspace -- backup --database=C:\pilot\acme\app.db --storage=C:\pilot\acme\storage --outputs=C:\pilot\acme\outputs --backup=D:\pilot-backups\acme-2026-08-12
```

The command copies all three stores and writes a SHA-256 inventory. A backup is usable only when the command prints `Backup verified`.

## Restore exercise

Keep the app stopped. Restore accepts only the original recorded workspace paths and refuses to overwrite existing targets. Move damaged targets aside first; do not delete them until the restored Job is verified.

```powershell
npm run pilot:workspace -- restore --database=C:\pilot\acme\app.db --storage=C:\pilot\acme\storage --outputs=C:\pilot\acme\outputs --backup=D:\pilot-backups\acme-2026-08-12
```

After restore, start the app, open one known completed Job, and fetch its Report. Record the exercise date and Job ID. If either fails, stop the app and preserve both the restored and moved-aside workspaces for investigation.

## Retention and deletion

- Agree a retention period during onboarding. Until automated deletion exists, review it manually at least monthly.
- Stop the customer instance before deletion. Delete the database, `storage`, `outputs`, and customer backup set together; partial deletion can leave customer IFC content or derived evidence behind.
- Record who approved and performed deletion. This procedure is intentionally manual for ten users.

## Support escalation

Capture the customer/workspace identifier, Job ID, UTC time, failure code, correlation ID if present, and the last successful Revision ID. Do not copy IFC content, absolute filesystem paths, SQL, credentials, or stack traces into tickets. Preserve the isolated workspace and its latest backup until the incident is resolved.
