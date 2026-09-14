---
name: to-tickets
description: Turn an approved plan, spec, or requested change into publishable tracer-bullet tickets with real blocking edges and executable readiness.
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

For work that changes production behavior, explore enough to find the nearest working production path. Prefer its stable domain owners, policies, adapters, persistence, and proof seams when the new responsibility matches; name a new component only for a distinct responsibility or lifecycle.

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

When a slice changes production composition, persistence, an external provider, identity or validation policy, retry or lifecycle behavior, publication, or a public workflow, give it an `## Existing path` section:

```markdown
- **Extend:** <nearest working production route>
- **Reuse:** <stable owners, policies, adapters, or proof seams>
- **New responsibility:** <distinct responsibility, or "None">
```

Use stable domain vocabulary rather than volatile file paths. If the slice proposes parallel production machinery, state the concrete responsibility or lifecycle the existing owner cannot satisfy.

Before scoping infrastructure, hardening, recovery, deployment, or durable-workflow slices, use the repository's context router to read any active operating-stage contract. Freeze the current topology, required guarantees, accepted inconvenience, and promotion triggers; draft acceptance criteria for the current claim.

When a slice introduces or changes a **durable boundary** — persistent, asynchronous, cross-process, or cross-language behaviour — read [`references/durable-boundary-tickets.md`](references/durable-boundary-tickets.md) in full before drafting that ticket. Drafting is complete only when its ticket check passes.

When a slice claims behaviour through a public entry (HTTP, CLI, UI, or SDK), an external dependency, or a release gate, read [`../gate-design/SKILL.md`](../gate-design/SKILL.md) before publishing it. Name the **earning proof** that reaches the claimed boundary, and keep fake-based tests as unit-only supporting proofs. When Gate Design selects a protected verifier, do not mark the implementation ticket ready until the gate owner has authored, red-tested, calibrated, and protected it; otherwise add a gate-preparation blocker and keep the implementation ticket blocked.

Give every slice a `## Verification` section that names the smallest credible proof that can falsify its acceptance criteria, plus the affected regression scope. Group criteria under one proof when the same check covers them. For every behavior-changing slice with an executable seam, read [`../gate-design/references/earning-gates.md`](../gate-design/references/earning-gates.md) and follow its ticket-handoff branch.

For cross-cutting changes, uncertain affected scope, or proofs too expensive for local iteration, read [`references/verification-scope.md`](references/verification-scope.md) in full before publishing the ticket.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

For every executable behavioral ticket, follow the automatic [Gate Readiness workflow](../gate-readiness/reference.md). Generate a random immutable UUID and publish it as the draft's `Work item` before calling `start`; then let the public loop dispatch narrow Gate Design and Audit Proof Gaps work orders and resume them. Promote only its `IMPLEMENTATION_READY` result; preserve any genuine external blocker verbatim.

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** <ready-for-agent | gate-pending, derived from Gate Session readiness>

Work item: <random immutable UUID generated before Gate Readiness starts>

Authority: <advisory | protected>

Claim: <one observable behavior claim>

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

## Verification

- **Proof:** <observable proof and the acceptance criteria it covers>
- **Affected regression:** <smallest relevant module or package suite>

## Earning gate (behavior-changing tickets)

- **Session:** <prepared Gate Session reference>
- **Authority:** advisory | protected
- **Readiness:** <READY_FOR_IMPLEMENTATION, or the exact ACTION_REQUIRED outcome>
- **Gate review:** <GATE-READY for protected authority; not applicable for advisory authority>

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Verification

- **Proof:** <observable proof and the acceptance criteria it covers>
- **Affected regression:** <smallest relevant module or package suite>

## Earning gate (behavior-changing tickets)

- **Session:** <prepared Gate Session reference>
- **Authority:** advisory | protected
- **Readiness:** <READY_FOR_IMPLEMENTATION, or the exact ACTION_REQUIRED outcome>
- **Gate review:** <GATE-READY for protected authority; not applicable for advisory authority>

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

Work the frontier one ticket at a time with `/implement`, clearing context between tickets.
