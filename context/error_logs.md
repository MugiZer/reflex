1)

Boundary ownership drift
Application code directly performed filesystem persistence. This blurred application/infrastructure responsibilities.
Rule: application coordinates use cases; infrastructure owns filesystem, storage, process, and solver mechanics.
Regression: application-layer modules must not import node:fs, node:path, or persistence adapters directly.

One-sided protocol implementation
The TypeScript side defined protocol behavior without guaranteeing equivalent Python-side validation.
Rule: every cross-language message needs schemas, validators, and tests on both sides.
Regression: maintain request/result/error/cancel conformance probes.

Invalid input was treated as an exception instead of a product outcome
Invalid requests threw before producing auditable artifacts.
Rule: safe-to-identify invalid requests become persisted rejected outcomes with request and error artifacts.
Regression: test invalid Recipe, hash, bundle, identity, and protocol cases through the public seam.

Lifecycle behavior was implicit
Deadline and cancellation fields were passed through but not enforced.
Rule: timeout, cancellation, crash, malformed output, and unavailable worker behavior must be explicit state transitions.
Regression: test each lifecycle outcome and verify no numerical result is published.

Outcome modeling was incomplete
The type listed blocked and cancelled, but the validator could only produce preliminary-unsafe or generic failures.
Rule: every declared state must be reachable, validated, persisted, and tested.
Regression: maintain an outcome matrix with one public-seam test per state.

Semantic identity validation was too shallow
A non-null Recipe was accepted without verifying its hash or completeness.
Rule: validate semantic payload hashes at the boundary before invoking workers.
Regression: mutate Recipe content, preserve the old hash, and require deterministic rejection.

Idempotency was checked only sequentially
Duplicate replay worked after publication, but concurrent submissions could both run and one could fail during rename.
Rule: idempotency means one immutable outcome under sequential, restarted, and concurrent calls.
Regression: concurrent duplicate test must assert one worker invocation and one request ID.

Evidence and uncertainty were collapsed
The public result exposed only a U-value and error code while diagnostics and uncertainty stayed inside artifacts.
Rule: diagnostics, assumptions, confidence, readiness, and failure context must remain domain-visible.
Regression: assert diagnostics survive persistence, replay, and report rendering.

Failure testing lagged behind happy-path testing
Initial tests covered success, one mismatch, no request, and crash, but omitted timeout, cancellation, stale artifacts, malformed output, and atomic publication.
Rule: acceptance criteria must be converted into a failure-mode test matrix before implementation is considered complete.

Weak domain types encouraged drift
IDs, hashes, correlation keys, and bundle identities were all plain strings, while request metadata was repeatedly passed as loose field groups.
Rule: promote recurring domain concepts into named types and cohesive value objects.
Regression: avoid generic string fields where format and meaning are contractually significant.

Durable behavior was not designed first
Persistence, replay, mutation, corruption, and restart behavior were added after the initial happy path.
Rule: design the artifact lifecycle and replay contract before writing the orchestrator.
Regression: every persisted artifact needs publication, replay, corruption, and cleanup tests.

Acceptance criteria were not used as an implementation checklist
Several requirements were present in the ticket but absent from the first implementation.
Rule: map every acceptance criterion to code, a public-seam test, and—where relevant—a persisted artifact assertion.
Regression: do not mark a ticket complete while any criterion lacks evidence.

General pattern: happy-path implementation of a durable system boundary

The implementation was locally plausible as a request -> worker -> result flow, but the ticket actually specified a durable, auditable boundary that must remain safe under invalid input, failure, cancellation, timeout, replay, corruption, restart, and concurrency. The individual bugs above were different symptoms of one missing design step: the invariants and failure state machine were not made explicit before coding.

Rule: before implementing any asynchronous, persistent, cross-process, or cross-language feature, define the invariants, ownership boundaries, state transitions, artifact lifecycle, and failure matrix. Treat invalid, blocked, rejected, failed, and cancelled cases as first-class outcomes whenever they require auditability.

Regression: require every ticket to contain an explicit Invariants section and failure matrix; require each invariant and matrix row to map to a public-seam test and observable evidence. The implementation harness must check this mapping before completion, and the review harness must look for missing invariants rather than only reviewing the happy path.

Harness improvement: invariant-driven recursive review
The harness should learn from bug clusters, not only individual defects. When multiple findings share a root cause, record the general pattern and update the ticket template, implementation workflow, test checklist, and review prompts together.
Rule: CloudMem stores the reusable lesson; tickets define the authoritative product invariants; skills enforce deriving and testing those invariants; reviews verify that the loop was followed.
Regression: for every durable feature, require proof of (1) invariant definition, (2) state/outcome coverage, (3) failure-matrix coverage, (4) side-effect ownership, (5) replay/concurrency behavior, and (6) unchanged protected state. A passing happy-path test is never sufficient evidence by itself.

--------------------

2026-08-01 — Ticket 03 topology review boundary findings

Severity: medium-high overall. The happy path passed, but trust, durability, and public-seam evidence were incomplete.

- High — Persisted topology reviews did not enforce Recipe hash, request identity, or bundle linkage. A tampered payload could advertise a different Recipe identity while retaining a valid result.
- High — Ambiguous IFC material labels could be silently canonicalized (for example, wood-like labels to softwood) while retaining IFC-derived authority, risking an unjustified topology result.
- High process/release risk — The public HTTP outcome matrix was incomplete, creating a false-green readiness claim for missing/conflicting authority, worker failures, deadline/cancellation, and corruption paths.
- Medium — SQLite persistence imported an application validator, reversing the documented application/infrastructure dependency direction.
- Medium — HTTP topology review submission did not expose deadline and disconnect cancellation propagation.
- Medium — Blocked reviews did not durably preserve the decisive next input, weakening auditability and recovery.

Resolution commits: `fc91464`, `e42488a`, `2cc70a2`, `772e00b`.
Verification after remediation: `npm run typecheck`; `npm test` — 46 files / 165 tests passed.

Regression rule: durable topology review work must prove identity linkage, explicit authority/uncertainty, lifecycle outcomes, and the complete public HTTP matrix before claiming readiness.

--------------------

2026-08-02 — Ticket 04 component scenario evaluation boundary failure

Severity: critical for Ticket 04 readiness. The isolated scenario tests pass, but the required production and durable boundary is not reached.

- Critical — The scenario planner and runner are not connected to the production Job/HTTP path. The real `I do not know` request remains `blocked`, persists no scenario evaluation, and invokes no scenario worker. `runTopologyScenarioPlan` is referenced only by its unit test.
- Critical — Scenario tests substitute a fake request service, fabricate U-values, and return `evidence: null`; this is proof substitution, not evidence that the real persisted topology path solved each Recipe.
- High — SQLite persists only aggregate `JobTopologyReview` records. Evidence snapshots, occurrences, annotations, pattern lifecycle, matches, Recipes, scenario requests/results, evaluations, and unresolved occurrences have no repository records or restart/replay/corruption proof.
- High — The production Recipe stores `parameters.width` as a scalar, while the new test pack binds to `parameters.width.value`; the test contract and production Recipe vocabulary are split.

Root cause: production-composition omission behind a false green. Ticket 04 work was added as an in-memory/unit-test seam without first inserting the promoted-pattern and scenario state machine into the public durable workflow.

Rule: a durable, cross-process feature is incomplete until the same public entry reaches its real adapters, persists each derived record, reloads it, and preserves protected state.

Regression: require one tracer test from IFC Job evidence through promoted matching, real Python execution, per-scenario persistence, aggregate evaluation, restart/replay/corruption, and report consumption. Isolated scenario arithmetic may remain as supporting coverage, but cannot satisfy the ticket gate.

--------------------


