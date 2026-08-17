# Ticket 4 — Agent provider seam proof audit

**Fixed point:** `a7533b5` (`feat: persist agent attempt evidence`)

**Decision:** `NO-GO` for Ticket 4 as written. This is a proof/composition gap,
not evidence that the local Codex adapter is broken.

## Scope and proportionality

The active working contract requires app/http-to-application composition, explicit
uncertainty, immutable evidence, and protected snapshots/revisions. For a launch
serving roughly ten paid users, this audit excludes high-scale concerns such as
multi-worker concurrency, retry queues, provider failover, durable replay,
automatic credential rotation, and HA. It does not exclude the ticket's basic
claim that the selected provider is the one used by the application and that a
provider failure cannot change protected customer state.

## Tracer

**Claim:** fit, builder, and verifier orchestration uses only the neutral provider
seam, records approved attempt evidence, and leaves protected state unchanged on
infrastructure failure.

**Required depth:** P4 for a public/application composition claim, with the
selected P5 protected-state and evidence-visibility rows.

**Actual path:** `OpenRouterAgentProvider` / `CodexCliAgentProvider` ->
`executeAgentRoleAttempt` -> `SqliteAgentAttemptRepository`.

`rg` finds no production import or composition of `createAgentProvider` or
`executeAgentRoleAttempt`; their only callers are tests (apart from direct
adapter construction by the canary). Therefore the product path does not reach
the seam and no public route can demonstrate protected-state preservation.

**Status:** `PARTIAL` (P2 provider tests and a P3-like direct use-case/persistence
test; no P4 composition, no applicable P5 protected-state observation).

**Focused evidence:**

```text
rtk npm test -- agentProviderSeam.test.ts agentAttemptDurability.test.ts openRouterProviderCanary.test.ts
3 test files passed; 9 tests passed.
```

This proves real local Codex CLI completion/timeout/cancellation and selected
OpenRouter protocol behavior. It does not prove deployment composition.

## Remaining findings

1. **P0 launch blocker — unused production seam (proof substitution).** There is
   no application or HTTP composition root which selects a configured provider,
   calls `executeAgentRoleAttempt`, and attaches the persisted evidence to the
   relevant job/revision. Add one integration/public-seam test that injects an
   infrastructure failure and asserts the targeted correction cycle, Calculation
   Snapshot, and Revision are byte/identity unchanged. This is a small wiring and
   one test, not a retry system or workflow engine.

2. **P0 before enabling OpenRouter — canary is advisory, not a release gate
   (acceptance drift).** `runOpenRouterProviderCanary` is never used by
   `releaseVerificationGate.ts` or `scripts/verify-release.ts`; it cannot make a
   release `NOT-PROVEN`. Either make one manually recorded successful canary a
   deployment checklist requirement, or wire its single `GO`/`NOT-PROVEN` result
   into the existing release command. Do not run it in ordinary tests and do not
   add credential automation for this stage.

3. **P1 low-cost contract test gap — controlled HTTP server only proves the
   success mapping (proof substitution).** The loopback-server test covers
   mapping/header/schema/parse success, while rate limit, malformed response,
   timeout, and cancellation use injected `fetch`. Extend the same loopback
   server test with those four responses. This is test-only work; no production
   hardening is required.

4. **P1 configuration claim is weaker than stated (contract split-brain).**
   Structured-output support is determined by caller-supplied
   `structuredOutputModels`. For this launch, a reviewed, version-controlled
   allow-list in the production configuration is sufficient; a dynamic capability
   discovery service is explicitly deferred. The configuration must remain
   single-source-of-truth and be shown in one production-composition test.

## Accepted deferrals / promotion triggers

- SQLite restart/replay/concurrency/corruption recovery for agent attempts.
- Persistent queues, automatic retries, provider fallback, multi-provider
  routing, circuit breakers, and HA.
- Automated credentialed canary execution in CI. Promote only when a secret
  manager/release pipeline is introduced.

## Root-cause clusters

- **NEW — Proof substitution:** isolated adapter/use-case tests stand in for a
  public composition and protected-state proof (finding 1).
- **NEW — Acceptance drift:** canary and controlled-server requirements exist but
  are not connected to their claimed release/boundary proof (findings 2–3).
- **NEW — Contract split-brain:** model capability is asserted by input config
  rather than owned production configuration (finding 4).
