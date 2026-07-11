# Local PR State Machine

## Stages

1. Context scanned
2. Issues sliced
3. Issues triaged
4. Implementation
5. Verification
6. Architecture review
7. Done

## Required Artifacts

- Context scanned: relevant PRD and `CONTEXT.md` read.
- Issues sliced: local issue files exist under `context/issues/{milestone}`.
- Issues triaged: issue files include category, state, and AFK/HITL.
- Implementation: code and tests changed for the active slice.
- Verification: `npm test`, `npm run typecheck`, and target demo command run.
- Architecture review: `PR-LEDGER.md` records architecture review and any refactor plan.
- Done: final response reports mode, changed files, commands, risks, next step, and audit.

## HITL Gates

Stop only when product scope, destructive change, external access, or unclear acceptance criteria blocks implementation.
