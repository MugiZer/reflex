# Milestone 3 Issue 002 - Material Resolution and Precedence

## What to build

Add a small versioned Material Library and resolve lambda using the Milestone 3 precedence rule: user input, fixed IFC lambda, exact Material Library alias match, candidate suggestion only, then missing datapoint.

## Acceptance criteria

- [ ] User-provided lambda wins over fixed IFC and Material Library lambda.
- [ ] Fixed IFC lambda wins over Material Library lambda.
- [ ] Exact Material Library alias matches produce fixed lambda.
- [ ] Fuzzy or candidate material matches do not auto-resolve.
- [ ] Unresolved lambda creates a Requested Input.

## Blocked by

- 001-core-review-calculation-report-spine

## Triage

- category: enhancement
- state: ready-for-agent
- AFK/HITL: AFK
