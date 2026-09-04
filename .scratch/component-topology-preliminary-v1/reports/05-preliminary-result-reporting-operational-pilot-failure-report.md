# Ticket 05 implementation failure report

**Ticket:** `05-preliminary-result-reporting-operational-pilot.md`  
**Recorded:** 2026-07-25  
**Repository:** `C:\dev\conformity`  
**Status:** incomplete; uncommitted changes remain in the working tree.

## Outcome

The run did not complete Ticket 05. Two focused seams were added and passed, but the full suite did not produce output before it was manually terminated. The required final code review and commit were therefore not performed.

More importantly, the code added only a standalone application-level pilot gate and an optional report projection. It does **not** yet connect topology requests, pilot configuration, result persistence, or the new report projection to the localhost HTTP/job path. It also does not implement the ticket's complete operational requirements: deployed health checks, structured persisted logs, retention/cleanup policy, retry classification, rollback drill, or a full IFC-to-report topology E2E verifier.

## Exact test and command record

### 1. Initial focused test attempt

Command:

```powershell
npm test -- topologyOperationalPilot.test.ts
```

Result: failed before tests loaded.

```text
failed to load config from C:\dev\conformity\vitest.config.ts
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

The stack trace originated in Vite's dependency externalization while it attempted to spawn a local helper process. This was a sandbox permission failure, not a test failure.

### 2. Focused pilot test outside sandbox — red

Command:

```powershell
npm test -- topologyOperationalPilot.test.ts
```

Result: failed as expected before the implementation existed.

```text
Error: Cannot find module '../src/application/topology/createTopologyOperationalPilot.js'
imported from C:/dev/conformity/tests/topologyOperationalPilot.test.ts
Test Files  1 failed (1)
Tests       no tests
```

### 3. Focused pilot test — green

After adding `createTopologyOperationalPilot.ts`, the same command passed.

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

### 4. Focused report test — red

Command:

```powershell
npm test -- topologyReport.test.ts
```

Result: failed as expected because the generated report did not include the preliminary topology projection.

```text
AssertionError: expected '<!doctype html><html lang="en"><head>…' to contain
'Layer-only Calculation Snapshot'
```

### 5. Focused report and pilot tests plus typecheck — green

Command:

```powershell
npm test -- topologyOperationalPilot.test.ts topologyReport.test.ts
npm run typecheck
```

Result:

```text
Test Files  2 passed (2)
Tests       2 passed (2)

> tsc --noEmit
```

Both focused tests and TypeScript typechecking passed.

### 6. Full suite — terminated

Command:

```powershell
npm test
```

The process ran for roughly two minutes without returning output through the tool. It was manually terminated. No passing/failing suite summary was emitted, so the full-suite result is **unknown**, not passing.

## Tooling failures encountered

`apply_patch` repeatedly failed when updating existing files with this environment error:

```text
apply_patch verification failed: Failed to read file to update
C:\dev\conformity\...: failed to prepare fs sandbox:
windows unelevated restricted-token sandbox cannot enforce split writable root sets directly;
refusing to run unsandboxed
```

New-file patches succeeded. Some existing-file updates were applied through `git apply --unidiff-zero` after escalation. PowerShell's text pipeline also converted literal Unicode separators to `?`; the report title was changed to use the TypeScript escape `\u2014` to avoid this for the em dash.

## Code changes made

### New, untracked files

1. `src/application/topology/createTopologyOperationalPilot.ts`
   - Adds an in-memory pilot gate with:
     - owner-cohort gating;
     - feature enable/disable state;
     - a kill switch that returns a layer-only-safe response;
     - correlation-ID/bundle-identity event records;
     - in-memory metric counters and health state.
   - It deliberately does not record the owner ID in events.
   - Limit: it is not wired into the HTTP server or persistent job state.

2. `tests/topologyOperationalPilot.test.ts`
   - Proves an excluded cohort member does not submit topology work.
   - Proves an included cohort member receives a preliminary result.
   - Proves telemetry contains the correlation ID but not the owner ID.
   - Proves the kill switch preserves the layer-only snapshot.

3. `tests/topologyReport.test.ts`
   - Proves a layer-only snapshot and a preliminary topology result appear as separate report artifacts.

### Modified, uncommitted file

`src/application/reports/generateHtmlReport.ts`

- Adds an optional `topologyResults` argument.
- Adds a visible `Layer-only Calculation Snapshot` heading.
- Renders a separate topology section containing:
  - `Preliminary topology result — not verified` for a successful preliminary result;
  - topology outcome and U-value;
  - module/version;
  - correlation identifier;
  - registry, pack, and runtime hashes;
  - a support-safe artifact reference.
- Known defect: two presentation separators became literal `?` characters because of the PowerShell encoding issue. This is cosmetic but should be corrected before commit.

## Working-tree state at report time

Files directly attributable to this incomplete attempt:

```text
M  src/application/reports/generateHtmlReport.ts
?? src/application/topology/createTopologyOperationalPilot.ts
?? tests/topologyOperationalPilot.test.ts
?? tests/topologyReport.test.ts
```

The worktree also contained pre-existing or unrelated modifications and untracked files, including topology architecture documentation, `componentKnowledgeBase.ts`, `skills-lock.json`, other scratch tickets, context files, and `learning/`. They were not staged, modified intentionally, reviewed, or committed as part of this attempt.

## Required next actions

1. Repair the cosmetic `?` separators in `generateHtmlReport.ts`.
2. Decide whether the standalone pilot gate is the desired interface, then wire it into the localhost HTTP/job path with persistent topology-result linkage.
3. Add the requested health check, cancellation/deadline/retry/recovery, retention/atomic-cleanup, and rollback-drill behavior at the deployed path.
4. Extend the E2E verifier to exercise IFC evidence through opportunity/review, topology execution or scenario sweep, report rendering, flag disablement, and failure recovery.
5. Re-run the full suite and investigate why it did not return output.
6. Run the required two-axis code review against a fixed point.
7. Stage only the ticket-owned files and commit after the above succeeds.
