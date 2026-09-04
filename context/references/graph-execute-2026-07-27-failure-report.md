# Graph execution failure report — 2026-07-27

## Direct Ticket 01 acceptance

The previously missing command now exists and passed:

```text
npm run verify:topology-request-spine-regression
Test Files  2 passed (2)
Tests       8 passed (8)
```

The complete gate also passed:

```text
npm test
Test Files  42 passed (42)
Tests       148 passed (148)
npm run typecheck
exit code 0
```

## Graph result

- Ticket 01: earned; proof evidence recorded by the graph.
- Ticket 02: earned; proof evidence recorded by the graph.
- Ticket 03: rework; no implementation or acceptance proof ran.

## Exact Ticket 03 failure

The fresh worker exited before reading its ticket packet:

```text
warning: `--full-auto` is deprecated; use `--sandbox workspace-write` instead.
Failed to read prompt from stdin: input is not valid UTF-8 (invalid byte at offset 2271). Convert it to UTF-8 and retry (e.g., `iconv -f <ENC> -t UTF-8 prompt.txt`).
```

This is a graph-harness encoding failure, not a Ticket 03 product failure. No
source files were changed and no Ticket 03 acceptance command ran.

## Evidence

- Ticket 03 run: `.graph-engineering/evidence/03/20260727T021211.887075Z/`
- Ticket 01 proof: `.graph-engineering/evidence/01/20260727T021405.408185Z.json`
- Ticket 02 proof: `.graph-engineering/evidence/02/20260727T022209.960125Z.json`

## Required remediation

Make the graph controller pass the packet to Codex as UTF-8 bytes (or encode
the prompt explicitly before `subprocess.run`) and rerun Ticket 03. Do not
mark Ticket 03 earned from the worker exit; its real localhost acceptance proof
must still pass.
