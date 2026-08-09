# 07 — Proof harness preflight and failure classification

**What to build:** Make graph execution distinguish product failures from harness/configuration failures before a ticket is marked for rework.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Preflight every declared proof command and report missing npm scripts before launching a worker.
- [ ] Pass worker prompts as explicit UTF-8 bytes on Windows and add a regression fixture containing non-ASCII ticket text.
- [ ] Classify launcher, encoding, missing-command, timeout, worker, and proof failures separately in graph evidence.
- [ ] Never mark a product ticket rework when the worker never received its packet or the proof never started.
- [ ] Preserve the exact command, exit code, stderr/stdout, and failure class in local evidence.
- [ ] Verify the controller itself with a Windows smoke test and keep existing graph transitions green.

**Required artifact:** A controller regression verifier and an example evidence record for each non-product failure class.
