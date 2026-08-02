# 09 — Complete the durable component-scenario remediation

**What to build:** Given one real IFC upload containing a supported repeating C-profile with an unknown but bounded `memberWidthM`, the public localhost API persists immutable source evidence, matches one promoted dimension-independent pattern, generates the complete bounded Recipe set, solves every Recipe through the pinned Python worker, persists every scenario outcome, survives restart, and returns the same honest aggregate recomputed from SQLite without mutating the original IFC evidence or layer-only result.

**Blocked by:** 06 — Topology request contract probes and persistence hardening. Ticket 03's localhost review path and Ticket 02's pinned worker remain required foundations. Ticket 04 is historical context, not completion evidence.

**Status:** ready-for-agent once blockers are complete

## Why this ticket exists

Ticket 04 received a partial in-memory planner and fake-backed tests. Those tests prove useful deterministic scenario mathematics at an isolated seam, but they do not prove the product goal. The scenario planner is not composed into the real Job workflow, unknown input is blocked in production, scenario lineage is not persisted, and the test Recipe binding disagrees with the production scalar Recipe shape.

This is one remediation objective owned by one implementation agent. The numbered changes below are progressive implementation gates inside that objective. Passing a supporting unit test never earns the ticket. Only the final public HTTP/durable verifier can authorize green.

## Progressive-disclosure reading order

The implementation agent should keep this ticket as the controlling contract and load only the material needed for the current gate:

1. **Always:** active domain context, this ticket, the Ticket 04 proof-gap error-log entry, and the current production composition trace.
2. **Before Changes 1–3:** the evidence/dataset architecture and declarative Recipe/primitive contracts.
3. **Before Changes 4–6:** Tickets 02, 03, and 06 completion evidence plus the existing localhost topology-review E2E.
4. **Before Changes 7–9:** the frozen conformance dataset, durable-boundary backlog, and required completion-artifact contract.

Do not load historical design documents merely because they mention topology. Current code, active domain language, and this remediation contract take precedence.

## Frozen production contract

- Use the existing localhost Job topology-review endpoint and its production composition. Do not add a second endpoint or orchestration path.
- Use the existing pinned topology request service and real Python worker.
- Use SQLite through repository ports. Domain code must remain independent of HTTP, SQLite, filesystems, and `web-ifc`.
- Build reports from persisted and revalidated records. A caller-constructed successful result is never displayable evidence.
- Keep the original IFC evidence, prior derived records, and layer-only snapshot immutable.
- Keep the existing fake-backed scenario test only as supporting P1 coverage, clearly labelled unit-only. It cannot be referenced by the completion decision.

## Ticket-level proof map

```text
Claim:
A supported bounded unknown produces a complete, restart-safe preliminary range
through the real localhost Job, SQLite, artifact, and pinned-Python-worker path.

Public seam:
Upload and review through the real localhost HTTP API; reload through a freshly
constructed server/repository; retrieve the review/report through HTTP.

Independent oracle:
A committed, non-private frozen C-profile IFC/evidence fixture; a separately
reviewed promoted pattern version; literal bounded values {0.041, 0.075, 0.100}
metres; three expected canonical Recipe identities; and frozen expected numerical
results/tolerances whose values are reviewed independently of the new aggregator.
The existing pinned-worker conformance manifest may be reused when the generated
Recipes are identical; otherwise create and review a new expected-results manifest
before implementing aggregation.

Failure probes:
Invalid binding, scenario-count explosion, unsupported evidence, ambiguity,
one real worker non-success, interrupted append, concurrent duplicate submission,
and tampered match/Recipe/result/artifact records.

Protected state:
IFC evidence payload/hash, annotations, historical pattern/match/Recipe/result
records, and the byte-identical layer-only snapshot.

Durability/lifecycle:
Fresh SQLite reader, server restart, simultaneous independent clients, idempotent
retry, append-only replay, atomic evaluation publication, and fail-closed recovery.

Evidence the tests ran:
Named tests visible in verbose output; exact command, selected/passed/failed counts,
exit status, duration, SQLite schema version, worker process/result identities,
and protected-state hashes captured in the completion report.
```

## Global false-green rules

The following may support development but cannot satisfy an acceptance criterion:

- a mocked or fake `requests.submit` result;
- an in-memory repository;
- a direct call to the scenario planner, interpreter, repository, or worker presented as HTTP proof;
- numerical expectations calculated by the production aggregator or copied from the run being asserted;
- asserting that rows, files, or fields merely exist without verifying identity, provenance, and relationships;
- sequential duplicate requests presented as concurrency proof;
- reopening the same repository object presented as restart proof;
- an error assertion that does not also prove forbidden U-values/artifacts are absent and protected state is unchanged;
- a timed-out or undiscovered test presented as a behavioral failure.

Every focused red must show the named assertion executed and failed for the intended missing behavior before production code changes.

## Change 1 — Separate the immutable domain records and identities

Define separate records for IFC imports/evidence snapshots, component occurrences, annotations, pattern versions, matches, exact Recipe instances, scenario requests/results, evaluation runs/aggregates, and unresolved occurrence groups. Define deterministic IFC content, evidence signature, pattern, Recipe, request, result/artifact, and evaluation identities.

### Tangible supporting tests

**`component evaluation identities separate topology from dimensions`**

- Given the frozen repeating C-profile evidence at 41, 75, and 100 mm, assert one literal pattern ID/version for all three.
- Assert three distinct literal exact Recipe hashes because ordinary dimensions are included in Recipe identity.
- Change annotation authority only: the source evidence hash stays identical while annotation and derived evaluation identities change.
- Change compiler, primitive-registry, material-pack, runtime, boundary, or pattern version: exact Recipe/request identity changes.
- Red capability: the test must fail if pattern identity includes the ordinary depth or Recipe identity omits any declared semantic field.

**`pattern lifecycle controls runtime eligibility`**

- Given otherwise identical `draft`, `candidate`, `promoted`, and `rejected` versions, assert only the promoted version is eligible for runtime matching.
- Assert ignored lifecycle versions produce no match, Recipe, request, or U-value.

### Gate 1

- [x] Identity fields and canonicalization inputs are documented with literal sensitivity tests.
- [x] Records are separate immutable domain concepts rather than optional fields on `JobTopologyReview`.
- [x] Domain tests pass without importing storage, HTTP, filesystem, or worker modules.

## Change 2 — Persist the evaluation graph transactionally in SQLite

Persist the Change 1 graph append-only using canonical payloads plus indexed identity columns, foreign keys, schema versioning, atomic publication, and reload-time cross-checks.

### Tangible adapter tests

**`component evaluation graph survives a fresh SQLite reader`**

- Create a complete three-scenario graph in a temporary database, close the repository, construct a fresh repository, and reload it by Job/evaluation identity.
- Assert every edge: source Job/Revision/element/opportunity → evidence → occurrence → promoted match → three Recipes → three requests/results/artifacts → aggregate.
- Assert canonical payload identities agree with indexed columns and hashes.

**`interrupted evaluation append publishes no trusted aggregate`**

- Interrupt after planned scenarios and after the first completed result using a transaction-boundary fault probe.
- A fresh reader must expose the durable non-success/recoverable state but no range, conservative value, or successful aggregate.
- Retry must either resume the same semantic evaluation or create one explicitly linked revision; it must not duplicate completed scenario effects.

**`corrupt evaluation lineage fails closed`**

- On isolated database copies, alter one indexed identity, canonical payload, match version, Recipe hash, result value, artifact hash/path, and outcome discriminator.
- Fresh reload and public projection must reject each corruption with a stable diagnostic and expose no U-value.

**`simultaneous evaluation writers publish one graph`**

- Synchronize two independent repository/server actors at the contested idempotency boundary.
- Assert one ownership decision, one immutable evaluation identity, three scenario effects, no mixed graph, and the same result after fresh reload.

### Gate 2

- [x] Normal write, restart, partial write, corruption, missing component, concurrent writer, and idempotent retry rows have explicit outcomes.
- [x] SQLite mechanics remain infrastructure-only.
- [x] No mutable UPSERT can rewrite evidence, patterns, Recipes, results, or evaluations.

## Change 3 — Interpret one promoted declarative C-profile pattern

Build one generic interpreter returning `matched`, `ambiguous`, `unmatched`, `blocked`, or `rejected`. The repeating C-profile pack declares recognition, applicability, authority, permitted unknowns/ranges, topology vocabulary, and Recipe bindings as data. It contains no U-value formula and adds no family branch to HTTP, persistence, worker physics, or scenario orchestration.

### Tangible interpreter and dataset tests

**`one promoted C-profile pattern matches 41 75 and 100 mm variants`**

- Run the frozen development examples and assert the same literal pattern ID/version with dimension values retained as Recipe parameters.
- Run near-neighbour negative fixtures and assert `unmatched` or `rejected`, never a successful match.

**`interpreter exposes every honest outcome`**

- One matching promoted version → `matched` with structured reasons.
- Two equally ranked promoted versions → `ambiguous` with both identities/reasons and no Recipe.
- No promoted version → `unmatched` and unresolved signature.
- Missing required authoritative signal → `blocked` with the decisive missing key/authority.
- Conflicting/out-of-range signal or invalid binding → `rejected` with stable diagnostics.

**`Recipe bindings target the production scalar vocabulary`**

- Apply the bounded value to the production scalar Recipe parameter and assert the canonical Recipe contains the literal value.
- A binding ending in an incompatible `.value` target, wrong row, unknown parameter, non-number target, or forbidden path rejects deterministically.

**`scenario generation is complete and capped`**

- `{0.041, 0.075, 0.100}` produces exactly three ordered, uniquely identified scenarios.
- Multiple supported unknowns produce the exact bounded Cartesian count.
- A plan above the declared maximum rejects before any request or result record is created.

### Gate 3

- [x] Frozen development, near-neighbour negative, rejection, varying-dimension, and holdout inventories exist.
- [x] Recognition and expected outcomes are literal reviewed data, not generated by the interpreter under test.
- [x] No C-profile-specific executable physics/orchestration branch exists outside declarative data.

## Change 4 — Record evidence and occurrences through the real Job flow

After the existing Job, Revision, opportunity, ownership, Assembly Group, and layer-only validations pass, record/deduplicate the immutable evidence snapshot and source occurrence, run the promoted-pattern interpreter, persist its outcome, and queue unmatched occurrences.

### Tangible public-seam tests

**`localhost IFC review records a matched component occurrence`**

- Upload the frozen IFC through localhost HTTP, obtain the Job/opportunity, and submit a review against the authoritative Revision and Assembly Group.
- Retrieve through HTTP, restart the server/repository, retrieve again, and assert the same evidence, occurrence, match, provenance, and promoted pattern identity.
- Capture IFC evidence and layer-only hashes before review and assert they remain identical afterward and after restart.

**`localhost IFC review records unresolved evidence without solving`**

- Upload a frozen near-neighbour/unmatched IFC fixture through the same route.
- Assert a durable unresolved occurrence grouped by evidence signature, no Recipe/request/result, and no U-value before and after restart.

**`invalid review authority cannot create derived success records`**

- Submit stale Revision, wrong owner, wrong Assembly Group, and conflicting evidence cases.
- Assert stable HTTP/domain outcomes, no match/Recipe/request/result, and unchanged evidence/layer-only hashes.

### Gate 4

- [x] Component occurrences originate automatically from the production Job route.
- [x] Every interpreter outcome is persisted with provenance.
- [x] Source evidence is never rewritten by annotations, matches, or unresolved grouping.

## Change 5 — Execute exact and bounded Recipes through the real worker path

Compose promoted matches into the existing pinned request service. A known complete match creates one Recipe/request. A supported bounded unknown creates the complete capped plan and persists planned Recipes before submitting each through the real Python worker. Persist every terminal scenario outcome before aggregation.

### Tangible public/cross-process tests

**`known promoted match runs one durable Python scenario`**

- Submit a known complete review through localhost HTTP.
- Assert one persisted Recipe, request, pinned Python result, artifact manifest, and `preliminary-unsafe` outcome.
- Restart and assert identical identities and numerical result within the frozen oracle tolerance.

**`bounded unknown runs all three durable Python scenarios`**

- Submit `memberWidthM: "i-dont-know"` for the supported promoted C-profile.
- Assert exactly three planned Recipes for `{0.041, 0.075, 0.100}`, exactly three real pinned-worker terminal results, three validated artifact manifests, and no caller-authored/fabricated U-values.
- Assert each observed value matches its separately frozen expected value/tolerance and changes with the asymmetric dimension fixture as expected.

**`one scenario non-success prevents a successful range`**

- Use a controlled real worker/Recipe failure fixture that reaches the worker boundary and makes one scenario `blocked`, `rejected`, `failed`, or `cancelled` while retaining all per-scenario outcomes.
- Assert the aggregate is an honest non-success/range-unavailable outcome, with no extrema, conservative screening value, or successful report number.
- Assert retry policy and cleanup follow the declared terminal state and protected state is unchanged.

### Gate 5 — First executable vertical slice

- [x] The supported-unknown E2E is behavioral red before production composition changes and green afterward.
- [x] All three scenarios cross HTTP → application → SQLite → pinned Python worker → artifacts → SQLite.
- [x] A fake request service or in-memory repository cannot make this gate pass.
- [ ] Changes 1–5 and the Gate 5 public test form the minimum first commit.

## Change 6 — Persist and project the honest aggregate

Derive exact/range/conservative/material-uncertainty outcomes only from complete, revalidated persisted scenario results. Store gate inputs, dominant uncertainty, decisive next input, preliminary label, and lineage. Regenerate workspace/report output from persisted evaluation records.

### Tangible public/report tests

**`restart recomputes the same range from stored scenarios`**

- Capture the public range and report, stop the server, construct a fresh server/repository, and reload.
- Independently read the three validated stored scenario values and assert the literal min/max and public range agree within declared tolerance.
- Assert evaluation identity, scenario lineage, preliminary label, and layer-only hash are unchanged.

**`screening is conservative only when both gates pass`**

- Frozen case A: worst credible result below threshold and range width within immateriality gate → conservative preliminary proposal equals literal worst case.
- Frozen case B: range material or crossing threshold → no single proposal; return range plus decisive next input.
- Frozen case C: incomplete/non-success scenario → no range and no proposal.

**`report refuses altered or incomplete success evidence`**

- Tamper isolated match, Recipe, result, or artifact records after a successful run.
- Public reload/report must show a safe diagnostic and no topology U-value/range while retaining the ordinary layer-only result.

### Gate 6

- [ ] The report never derives topology numbers from caller input or `JobTopologyReview` alone.
- [ ] Every displayed number links to persisted Recipe, request, result, worker, bundle, and artifact identities.
- [ ] Layer-only output remains byte-identical for every outcome.

## Change 7 — Gate promotion with frozen datasets and append-only replay

Make pattern promotion depend on independently reviewed development, negative, varying-dimension, rejection, and holdout datasets. Runtime sees only promoted versions. Replaying historical unresolved evidence creates new derived records without rewriting history.

### Tangible evaluation/replay tests

**`promotion requires frozen safety metrics`**

- Evaluate draft/candidate versions against all frozen sets without making them runtime-eligible.
- Assert promotion is refused when any unsafe negative false-positive occurs or a declared threshold is missed.
- Assert holdout expectations are frozen before evaluation and results include dataset/version/hash identities.

**`promoted version replays unresolved history append-only`**

- Persist an unmatched occurrence under version 1, then promote version 2 that recognizes it.
- Replay creates a new match/evaluation linked to version 2.
- Original evidence, unresolved record, version-1 outcome, Recipes, results, and timestamps/hashes remain unchanged and queryable.

### Gate 7

- [ ] Promotion decision has independently reviewable metrics and zero unsafe false positives in the safety set.
- [ ] Draft/candidate/rejected versions never match at runtime.
- [ ] Historical replay is append-only and idempotent under retry/concurrency.

## Change 8 — Replace the false green with one authoritative verifier

Add one focused verifier that owns the acceptance decision. It must start the real localhost application composition with temporary SQLite/artifact storage and the pinned Python worker, perform real HTTP requests, restart all readers/process composition, and emit an evidence manifest.

### Tangible verifier cases

The verifier must execute and name all of these cases:

1. Exact known promoted match.
2. Supported bounded unknown with all three real scenarios.
3. Conservative immaterial range below threshold.
4. Material/crossing range with decisive next input.
5. Blocked missing authority/input.
6. Rejected conflicting/out-of-range input or binding.
7. Unmatched durable unresolved occurrence.
8. Ambiguous promoted candidates.
9. Draft/candidate/rejected pattern ignored at runtime.
10. One scenario non-success with no aggregate range.
11. Sequential, restarted, retried, and truly simultaneous duplicate submission.
12. Append-only historical replay.
13. Corrupted match, Recipe, result, and artifact fail-closed retrieval.

For every case, capture public outcome, stable diagnostic, relevant record identities, worker invocation/process evidence, artifact hashes, fresh-reload outcome, and before/after protected-state hashes.

### Verifier sensitivity checks

- Missing one scenario record must make the bounded case fail.
- Replacing a worker value with the old fabricated unit-test constants must make oracle/hash verification fail.
- Changing the pattern lifecycle from promoted to candidate must make runtime-match assertions fail.
- Returning a range when one scenario is non-success must make forbidden-output assertions fail.
- Mutating evidence or the layer-only snapshot must make protected-state assertions fail.
- Skipping restart, using sequential callers for concurrency, or failing to launch the worker must be classified as harness/proof failure, not product green.

### Gate 8

- [ ] The focused verifier reports selected/passed/failed/unexecuted counts and exits normally.
- [ ] Every acceptance claim reaches its required public/durable depth.
- [ ] `audit-proof-gaps` returns GO for the bounded-unknown tracer and then for the complete outcome matrix.

## Change 9 — Produce the evidence-backed completion artifact

Write the required Markdown completion report from captured verifier evidence. It is a decision artifact, not a narrative claim.

### Tangible report validation

**`completion manifest covers every invariant and outcome exactly once`**

- Validate that every invariant, the 13 verifier cases, and every applicable durable-state row maps to a named executed test/run identifier.
- Validate the schema version, record graph, identity field definitions, pattern/dataset versions and hashes, exact and bounded traces, replay/unresolved evidence, corruption/concurrency results, protected-state hashes, commands, exit statuses, durations, and readiness decision are present.
- Reject references to fake-backed/unit-only tests as acceptance evidence.

The structural validator is supporting evidence only. Final readiness still requires inspection of the referenced run artifacts and an independent two-axis code review.

### Gate 9 — Completion

- [ ] Focused evaluator/verifier passes with a normal exit.
- [ ] Ticket 02, Ticket 03, and Ticket 06 verifiers pass with normal exits.
- [ ] `npm test` passes; any timeout is reported as unexecuted scope, never green.
- [ ] `npm run typecheck` passes.
- [ ] `graphify update .` completes after code changes.
- [ ] `audit-proof-gaps` returns GO at the required P5 durable lifecycle and P6 independent-oracle depths.
- [ ] `code-review` finds no unresolved P0/P1 issues and both Standards and Spec axes approve the fixed-point diff.
- [ ] The completion report records exact commands, counts, exits, durations, identities, hashes, unresolved lower-severity findings, and the final GO/NO-GO decision.

## Required TDD execution order

For each change:

1. Write its proof map and the named test through the highest seam claimed by that change.
2. Run the focused command and prove the named assertion executed.
3. Record a behavioral red that distinguishes the missing behavior from fixture or harness failure.
4. Implement the smallest production vertical change that satisfies the proof without bypassing the frozen production contract.
5. Run focused and neighbouring tests, then refactor while they remain green.
6. At Gates 5, 8, and 9, run the public/durable verifier and `audit-proof-gaps` before accepting green.
7. If no trustworthy behavioral red can be produced, or the production route is unclear, stop coding and use `diagnosing-bugs` until a reproducible root cause and regression proof exist.

## Required completion artifact

Return a Markdown report containing the invariant-to-test map, full outcome matrix, schema/migration version, record relationships, hash field definitions, pattern contract/version, lifecycle evidence, frozen/holdout inventory and metrics, one real exact trace, one real bounded trace, unresolved/replay evidence, corruption/concurrency results, protected-state hashes, exact verification summaries, review findings, and final readiness decision.
