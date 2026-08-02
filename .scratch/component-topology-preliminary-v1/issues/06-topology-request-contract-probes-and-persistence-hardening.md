# 06 — Topology request contract probes and persistence hardening

**What to build:** Make the topology request spine safe under replay, mutation, concurrency, and persisted-artifact corruption. The same idempotency key must produce one immutable outcome, and a restarted service must reject any altered result or unsafe artifact reference.

**Blocked by:** 01 — Generic topology request spine; 02 — Prove the pinned Python topology worker through the production request seam

**Status:** complete — evidence in `../reports/06-topology-request-contract-hardening-report.md`

- [x] Add deterministic contract probes for concurrent duplicate submission, runtime mutation of returned results, changed persisted U-values, changed manifest identities, invalid outcome values, and unsafe artifact paths.
- [x] Enforce one in-flight operation per idempotency key and preserve exactly-once publication under concurrent calls.
- [x] Return defensive immutable snapshots and include every semantic field needed to detect replay mismatches.
- [x] Revalidate persisted results against the original request, final numerical refinement, bundle identities, artifact directory, and artifact hashes before reuse.
- [x] Reject every non-absolute worker/runtime path and invalid deadlines deterministically.
- [x] Keep non-success outcomes free of U-values/evidence and preserve the layer-only snapshot byte-for-byte.
- [x] Run the focused contract verifier, full test suite, and typecheck.

**Required artifact:** A passing contract-probe verifier plus a short report listing each previously reproducible weakness and the test that prevents its regression.
