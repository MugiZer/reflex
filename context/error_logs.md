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

2026-08-09 — Ticket A verification foundation proof-gap audit (commit 37c76f2)

Status: NO-GO. The production-readiness verifier has bounded phase orchestration and unit-level outcome classification, but the required public P4/P5 tracer was not completed.

- High — Public-seam substitution. `tests/productionReadinessVerifier.test.ts` calls the exported orchestration function with injected runners and cleanup results; it never invokes `npm run verify:production-readiness`. Real command selection, child-process timeout handling, CLI exit status, evidence persistence, and CI composition are therefore unproved.
- High — Cleanup lifecycle unproven. No controlled leaked-child probe demonstrates that process-tree cleanup is detected and classified as `leaked_process`; no fresh-process recovery observation exists.
- Medium — Evidence lifecycle only partially proved. Per-run evidence files and CI upload are implemented, and SQL/credential/path redaction has unit coverage, but no public CLI test rereads the persisted artifact and verifies the complete forbidden-content contract.
- Harness observation — `npm run verify:production-readiness` and `npm test` exceeded the local 64-second command window during regression execution. This is `HARNESS-BLOCKED` for an attributable completed tracer, not product evidence of success or failure.

Root cause: proof substitution and acceptance drift at the verifier boundary. P1 unit evidence is being used for a ticket whose claims cross CLI, process, CI, and durable artifact boundaries.

Regression rule: every production-readiness change must include a controlled public CLI tracer that proves success, type/test/timeout/leaked-process/missing-fixture classifications, non-zero exit behavior, persisted evidence reread, and forbidden-content redaction. A passing injected-runner test cannot authorize the gate.

Queued probe: add a test-only deterministic command fixture and invoke the package entrypoint in a subprocess; inspect its exit code and evidence directory from a fresh reader, including a deliberate leaked-child and timeout case.

Remediation recorded 2026-08-10:

- Added a subprocess test that invokes `scripts/verify-production-readiness.ts` through the public CLI seam for success, type failure, test failure, timeout, leaked process, and missing fixture fixtures.
- The test rereads the persisted per-run evidence and rejects SQL, credentials, private paths, and stack-trace markers.
- Added long-running verification guidance to the TDD skill covering measured budgets, progress heartbeats, process-tree cleanup, and host-timeout versus product-timeout attribution.

The real non-fixture command remains a long-running integration gate; its completion must be observed in CI or a host window long enough to cover the configured phase budget.

Root-cause clarification: the immediate false-green mechanism was fake-runner substitution. `tests/productionReadinessVerifier.test.ts` injects `successfulRunner` and synthetic cleanup results into `runProductionReadinessVerifier`; it never executes `scripts/verify-production-readiness.ts`. Consequently, the tests bypassed real child-process spawning, phase timeouts, process-tree cleanup, CLI exit codes, and evidence persistence. The observed long-running command was a symptom that exposed this missing public-seam proof, not the primary defect.

--------------------

2026-08-08 — Ticket 05 topology pilot reporting audit findings (commit 411b956)

Status: NO-GO. The reported 18/18 GO evidence is not independent P6 proof.

- Critical — The sensitivity rerun is a false green. `verify-preliminary-topology-pilot.ts` runs the identical Vitest command twice; the six sensitivity flags only search the unchanged passing output for test names. `--sensitivity-rerun` is recorded but never interpreted, so no skipped worker/restart, fabricated value, corrupted state, or protected-state mutation is exercised.
- High — Protected-state evidence is self-authored. The verifier writes fixed strings (`fixture-preserved`, `layer-snapshot-preserved`) instead of hashing and rereading the IFC/layer artifacts, and the validator only checks equality of those strings. A changed source can therefore still produce a valid GO manifest.
- High — Server-owned resource limits are declared but unenforced. `maxScenarioCount` is not applied to scenario execution and `deadlineMs` is not used to bound the request; the request-derived deadline header is forwarded instead.
- High — Report publication is not atomically linked to pilot disposition. The component evaluation is persisted before the pilot run/event; a failure between those writes can leave a report rendering a topology result without a durable completed pilot run.

Root cause: proof substitution and incomplete durable-boundary ownership at the release verifier/report seam. Unit, full-suite, typecheck, graphify, and manifest-format validation are supporting evidence only; they do not establish the required public P6 claim.

Regression rule: every sensitivity claim must run an independent mutation or failure-injection command and fail when the production boundary is bypassed; protected-state observations must be measured hashes/readbacks; policy limits must be enforced server-side; and numerical report publication must commit atomically with its validated pilot disposition or fail closed.

--------------------

2026-08-03 — Ticket 02 explicit persistence-seam audit findings

Status: NO-GO. The implementation seam is structurally improved, but the required Gate 2 proof was not executable and the repository-wide completion gate was not green.

- High process/release risk — The gate plan required `npm run verify:component-topology-foundation -- --gate=2`, but `package.json` does not register that script. The required `foundation-gate-evidence.json` was also absent before the audit. Focused adapter and HTTP tests therefore cannot authorize the P5 gate.
- Medium — Splitting Component Evaluation into a second SQLite repository initially left that connection open. Existing callers closed only `app.jobs`, producing Windows `EBUSY` cleanup failures. The composition root now needs one lifecycle owner that closes both repositories.
- Medium — The real pinned-worker scenario failed once under the full-suite load but passed in isolation. This is a suite-isolation/contention signal, not evidence to dismiss as harmless flakiness; shared resources and synchronization need classification.
- High gate failure — `npm test` exited non-zero (194/198 tests passed), including a stale completion-manifest assertion. `npm run typecheck` passed, but FND-P10 requires both gates to pass.

Root cause: acceptance and evidence drift at the release boundary. The code change updated dependency ownership, but the declared verifier, lifecycle preflight, and clean-suite proof were not treated as part of the same production change.

Regression rules:

- Gate design must preflight every named proof command before implementation: verify the package/CI registration, invoke it with a deliberately failing or empty selection, and record the exact command and exit class.
- A gate plan is not executable until its verifier entry point, evidence schema, and decision-artifact path exist in the tested revision.
- Any new composed resource must have one root-owned shutdown path, and lifecycle tests must exercise restart/cleanup on the target operating systems.
- Full-suite contention failures must be reproduced alone and under controlled overlap; an isolated rerun may classify a failure but cannot erase the original suite failure.

Gate-design skill improvement: add an explicit “proof preflight” step requiring command registration, verifier discovery, evidence-artifact creation, and a known-red probe before the gate can be considered implementation-ready. The current skill already requires executable proofs and reproducible evidence, so this is a missing enforcement checkpoint rather than a change to the gate-depth model.

--------------------

2026-08-03 — Post-gate-design Ticket 01 identity audit findings

Status: NO-GO. This is a post-gate-design finding: the gate plan correctly required P5 public durable proof, but the implementation still contains identity-contract defects and the authoritative tracer did not complete.

- High — Incomplete semantic identity input is accepted. `componentEvaluationIdentities.exactRecipe({ recipe: null, ... })` returns a durable identity instead of rejecting the malformed Recipe. The recursive validator treats `null` as complete for every field, so FND-I07 is not proved.
- High — Contract split-brain remains. The centralized `patternVersion()` identity exists, but SQLite uses the alternate `${patternId}@${version}` node key. FND-I01/I02 therefore still have more than one production identity formula.
- High — P5 durability is unproven. Focused identity, aggregate, replay, and SQLite tests pass, but the localhost durable verifier/HTTP duplicate run exceeded the harness's 64-second command limit before producing attributable evidence. Unit and adapter green cannot certify restart, replay, concurrency, corruption, publication, or protected-state behavior.

Root cause: the identity contract was added after gate design, but the implementation did not finish the boundary migration or field-specific semantic validation, and the proof workflow did not produce a completed public tracer artifact.

Post-gate-design / skill-improvement lesson:

- `gate-design` must freeze the identity owner, required depth, protected state, and red-capable tracer before implementation.
- `tdd` must keep the proof map executable: each claimed P5 row needs a public-seam test, an independent oracle, and an attributable run result; a timeout is harness-blocked, not green.
- `to-tickets` must carry these invariants into explicit acceptance rows: malformed input rejection, one identity owner, duplicate/restart/replay/concurrency, corruption, and protected-state preservation. Each row needs a named test and durable observation.
- Future completion reviews must reject a ticket when any identity producer/index remains outside the contract or when only P1/P2 tests are available for a P5 claim.

Regression rule: do not mark FND-G1 GO until every identity producer and durable index uses the same contract, field-specific malformed-input probes fail closed, and the real localhost tracer completes with restart, replay, concurrency, corruption, publication, and protected-state evidence.

Remediation recorded 2026-08-03:

- The identity validator now rejects null required values, non-finite numbers, and empty required identity arrays while preserving explicitly nullable outcome fields.
- Field-specific shape checks now reject wrong-shaped arrays/strings and require annotation occurrence ownership; nullable fields remain explicit rather than universal.
- SQLite pattern nodes now use `componentEvaluationIdentities.patternVersion(...)`; the alternate `${patternId}@${version}` key is covered by a regression assertion.
- SQLite reads retain a named legacy-key compatibility path for immutable databases written before the migration; new writes never emit the legacy formula.
- A localhost public-seam proof now covers concurrent duplicate submission, fresh restart equality, and promoted append-only replay. The focused identity/SQLite/localhost suite passes 15/15, and the real duplicate/replay HTTP tests pass 2/2; `npm run typecheck` passes.

Gate status remains NO-GO until the complete authoritative tracer (including pinned-worker success, publication, corruption, and protected-state evidence) produces its bounded attributable artifact; focused green tests are remediation evidence, not a substituted P5 gate.

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


