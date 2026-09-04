# Gate toolchain for the Reflex build

Imported 2026-09-04. The harness is **not vendored** — its source lives with the Codex projects and the runtime is installed globally; this file pins the toolchain so every gate session resolves to the same bits.

## Source

- Harness source: `C:\Users\moham\Documents\Codex\2026-07-27\writing-great-skills-c-users-moham-4\work\protected-verification-harness` (your repo, MIT license)
- Installed runtime: global npm `protected-verification-harness@0.3.0` (`protected-verifier`, `gate-readiness` on PATH)
- Verified on this machine: `protected-verifier capabilities --json` → `{"gateReadiness":1,"protectedVerification":1,"sealedHandoff":1}`; Node `v24.11.0` (requires ≥22.18); Reflex repo has `.git` (required by gate-readiness)

## Why not copied into this repo

The harness source carries its own `.git`, `node_modules/`, `dist/`, and CI logs — vendoring that into a Python project would be bloat with a second git history inside the first. The supported consumption is the installed CLI (its README installs from a release tarball the same way). Revisit only if the build needs offline/air-gap reproduction, in which case vendor the release tarball + LICENSE, never the working checkout.

## Ticket contract (from the harness README)

A gate-tracked ticket carries these lines, which our `tickets/` files already use:

```markdown
Status: gate-pending
Work item: <immutable-uuid>
Claim: <one observable behavior claim>
Authority: advisory | protected
```

## Workflow (used by tickets 13 and 14)

```shell
gate-readiness start --repo . --ticket <ticket-file> --json
gate-readiness advance --repo . --work-item <uuid> --json
gate-readiness status --repo . --work-item <uuid> --json
```

The coordinator creates isolated Git worktrees and returns one structured next action; it never edits the original checkout. Verifier subprocesses default to a five-minute deadline (`GATE_READINESS_TIMEOUT_MS` overrides). Evidence lands under `.verification/` (created by the harness at runtime — not yet present in this repo).

## Upgrade rule

If the harness source moves past `0.3.0`, reinstall globally, re-run the capabilities check above, and update the pin in this file. Never mix versions within one gate session.
