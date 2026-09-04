# Ticket 05 launch package

## Recommended execution

- Model: GPT-5.6 xhigh.
- One primary agent; no subagents.
- One continuous objective with four gate checkpoints.
- Ticket scope, gate decisions, and TDD construction remain in separate files.

## Authority order

1. `.scratch/component-topology-preliminary-v1/issues/05-preliminary-result-reporting-operational-pilot.md`
2. `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-plan.md`
3. `.scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-tdd-proof-plan.md`
4. Active context, current production code/tests, and current upstream evidence.

## Execution plan

1. Record the starting revision, worktree hash, and pre-existing changed files.
   Run the foundation, Ticket 4, request-contract, and worker-failure preflight.
2. Gate 1: implement policy, real composition, durable disposition/events, and
   validated report projection through Changes 1–4 using the named TDD reds.
3. Gate 2: implement request-abort/deadline lifecycle, bounded retry, semantic
   idempotency, and independent concurrency through Changes 5–6. Run proof-gap
   audit; any NO-GO returns to the responsible proof.
4. Gate 3: implement actual dependency health, startup/terminal cleanup,
   startup kill, and compatible-bundle restart rollback through Change 7.
5. Gate 4: implement the public verifier, evidence validator, decision artifact,
   sensitivity runs, full suite/typecheck, proof-gap audit, and code review.

## Exact launch prompt

```text
[$implement](C:\Users\moham\.agents\skills\implement\SKILL.md)

Own and complete Ticket 05 as one continuous objective:

C:\dev\conformity\.scratch\component-topology-preliminary-v1\issues\05-preliminary-result-reporting-operational-pilot.md

Do not spawn or delegate to subagents.

Authority:

1. The ticket owns behavior and scope.
2. C:\dev\conformity\.scratch\component-topology-preliminary-v1\reports\05-preliminary-topology-pilot-gate-plan.md owns proof IDs, gates, evidence, and GO/NO-GO.
3. C:\dev\conformity\.scratch\component-topology-preliminary-v1\reports\05-preliminary-topology-pilot-tdd-proof-plan.md owns exact test names, proof maps, expected reds, and focused commands.

Goal:

Given one real supported IFC upload, an eligible localhost Job must cross the existing HTTP → durable Component Evaluation repository → pinned Python worker → restart/reload → validated report path and return an honest preliminary result or durable non-success disposition. Policy and operational history must be server-owned and durable. IFC evidence, immutable Revisions, Ticket 4 history, and the layer-only Calculation Snapshot must remain unchanged.

Preflight before production edits:

- Inspect and record the current revision, worktree hash, and pre-existing changed-file manifest. Preserve unrelated and pre-existing changes; do not assume a clean tree.
- Use graphify to confirm the current production route.
- Run the four upstream commands in the TDD proof plan. A missing, stale, timed-out, abnormal, or undiscovered proof is HARNESS-BLOCKED or NOT-PROVEN, not green.
- Confirm the gate plan remains executable and proportionate with:
  [$gate-design](C:\Users\moham\.agents\skills\gate-design\SKILL.md)

For each gate, use:

[$tdd](C:\Users\moham\.codex\skills\tdd\SKILL.md)

Write only the next named tracer test. Prove its assertion executed and produced the specified behavioral red before modifying production code. Then implement the smallest vertical green, run neighboring tests and typecheck, and refactor while green. Real successful numerical proof must use the pinned worker and frozen Ticket 4 oracle. Controlled worker adapters are permitted only for failure/lifecycle injection and can never fabricate acceptance success.

If a red is unclear, a route is uncertain, or a fix does not address the observed failure, stop coding and use:

[$diagnosing-bugs](C:\Users\moham\.agents\skills\diagnosing-bugs\SKILL.md)

Run Gate 1 after Changes 1–4, Gate 2 after Changes 5–6, Gate 3 after Change 7, and Gate 4 after Changes 8–9. At Gates 2 and 4 use:

[$audit-proof-gaps](C:\Users\moham\.agents\skills\audit-proof-gaps\SKILL.md)

Any NO-GO returns work to the responsible proof ID. Do not add authentication, an asynchronous pilot endpoint, a cancel-by-run endpoint, a second worker/result store/report pipeline, or dynamic public operator controls. Cancellation is HTTP request abort/deadline; rollback is graceful shutdown and restart with a compatible server-selected bundle.

Completion requires every ticket checkbox, all PILOT-A* and PILOT-S* IDs executed at their required depth, the public verifier and evidence validator, current-revision evidence with zero unexecuted cases, upstream verifiers, npm test, npm run typecheck, graphify update ., and:

[$code-review](C:\Users\moham\.agents\skills\code-review\SKILL.md)

Only the evidence artifact may authorize GO. Mocks, fake numerical services, in-memory pilot state, unit-only report tests, sequential-only concurrency, stale evidence, or the final message cannot authorize completion. Commit only intentional Ticket 05 changes that can be isolated from the recorded starting worktree; never absorb unrelated pre-existing changes.
```
