## Parent

#2

## What to build

When a live fit, builder, or verifier route selects OpenRouter, make the
reviewed strict-structured-output model allow-list part of that production
composition and record the selected provider/model in the attempt evidence.

## Acceptance criteria

- [ ] One reviewed deployment configuration owns the configured OpenRouter
  model and its strict-structured-output eligibility; request callers cannot
  override either value.
- [ ] A production-composition test proves an unsupported or mismatched model
  fails closed before network work.
- [ ] The persisted attempt evidence identifies the selected provider and model
  without retaining credentials, prompts, or private IFC content.

## Verification

- **Proof:** the first real agent-role Job-flow tracer selects OpenRouter from
  deployment configuration, rejects an ineligible model before HTTP, and
  reloads only the approved attempt metadata.
- **Affected regression:** that role's public-flow test, agent provider seam
  tests, and type checking.

## Blocked by

- #5 — Use the fit agent for ambiguous component-family reuse, or #6 — Build
  and verify an unsupported adapter; either establishes the first live agent
  role through which production composition can be observed.
