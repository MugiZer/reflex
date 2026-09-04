# A — Verification Foundation

**What was built:** One bounded non-topology verification entrypoint shared by local development and CI. It separates typechecking, focused public-seam tests, full regression, HTTP/end-to-end verification, and process cleanup; classifies failures; and writes sanitized evidence.

**Blocked by:** None

**Status:** implemented — retained as the foundation for the 10-paid-user plan

- [x] The verifier defines explicit bounded phases for typechecking, focused public-seam tests, full regression, HTTP/end-to-end tests, and process cleanup.
- [x] Every phase records its scope, start, finish, duration, outcome, and diagnostic.
- [x] Type failure, test failure, timeout, leaked process, and missing fixture are distinct non-zero outcomes.
- [x] The package entrypoint is exercised in subprocess tests for success and every declared failure classification.
- [x] Persisted evidence is reread by the public CLI test and rejects paths, SQL, credentials, and stack-trace markers.
- [x] CI invokes the same package verification entrypoint with an explicit overall timeout and uploads the evidence directory.
- [x] Component Topology verification remains separately governed.
- [x] Operational completion evidence records one successful real, non-fixture run in the intended clean CI/host environment; a harness timeout is recorded as `HARNESS-BLOCKED`, never green. Latest evidence: `evidence/verification-20260813014833512-17252.json`.

**Earning proof:** Execute the real package verification command in the intended clean environment, observe its exit status, and inspect the persisted evidence artifact. The deterministic fixture subprocess tests are sensitivity/supporting proof for classification behavior; they do not substitute for the real full run.

**Why it remains in the merged goal:** This ticket was production-hardening work, but its output is directly reusable. It prevents every new paid-pilot feature from inventing its own incomplete test harness. It does not, by itself, claim that the product is ready for paid users.
