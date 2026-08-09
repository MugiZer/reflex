# 04 - Persist one promoted component pattern from IFC evidence through real scenario evaluation

**What to build:** Record immutable component evidence in local SQLite, match one dimension-independent promoted repeating-profile pattern, generate an exact Recipe or a bounded preliminary scenario set, solve every Recipe through the real persisted topology path, and return an honest range, conservative proposal, decisive next input, or non-success outcome. Unmatched evidence enters a durable queue for later pattern development.

**Blocked by:** 03 - Connect IFC opportunity review to the real localhost job and persistence flow.

**Status:** ready-for-agent

## Current implementation and resumption point

The codebase already has:

- canonical IFC Calculation Input Evidence and provenance;
- topology opportunity detection and construction signatures;
- an in-memory Component Knowledge Base with bounded unknown values and an immateriality gate;
- Cartesian scenario generation, extrema, dominant uncertainty, decisive-next-input logic, and conservative screening;
- a scenario runner that submits each generated Recipe through a request-service interface.

Resume by replacing the fake/in-memory proof with one narrow durable vertical slice. Preserve useful deterministic scenario mathematics, but remove first-row/hardcoded parameter mutation and route all calculations through Ticket 03's persisted HTTP/job path and Ticket 02's Python worker.

## Exact prior failures

- Scenario tests injected a fake request service returning fabricated U-values such as `0.42`.
- Packs were caller-supplied in memory and had no draft/candidate/promoted/rejected lifecycle.
- Parameter application mutated only the first row and special-cased a few key names.
- Evidence snapshots, occurrences, annotations, pattern versions, matches, Recipe instances, solver runs, evaluations, and unresolved occurrences were not persisted.
- Pattern identity was not separated from ordinary dimensional values.
- Matching, ambiguity, authority, and applicability had no frozen negative/holdout evaluation.
- Scenario results were not linked durably to Job, Revision, opportunity, pattern, Recipe, request, result, or artifact identities.
- Failure of one scenario was collapsed into a summary without a complete durable per-scenario outcome contract.

## Invariants

- Raw IFC Evidence is append-only and never rewritten by annotations, matches, patterns, replays, or agent-authored knowledge.
- An annotation is separate from source evidence and records its authority/provenance.
- Pattern identity describes topology/physics applicability and is independent of ordinary dimensions such as 41, 75, or 100 mm depth.
- Exact Recipe identity includes every dimension, material, boundary, pattern version, compiler/module, registry, pack, and runtime identity.
- Only promoted pattern versions can match at runtime.
- Pattern packs are declarative data interpreted by one generic domain module; they contain no executable U-value formula and add no family branch to physics, HTTP, persistence, or scenario orchestration.
- Missing, conflicting, ambiguous, unsupported, and out-of-range evidence never silently becomes confirmed.
- Every scenario uses the real persisted request path and Python worker; no fabricated result is accepted.
- A conservative proposed estimate is allowed only when the worst credible case is below the project threshold and the declared range is within the immateriality gate. It remains preliminary, never verified.
- Replay can create new derived records but never mutate original evidence or historical results.
- SQLite and artifact mechanics remain infrastructure concerns behind domain/application ports.

## Outcome and failure matrix

| Case | Required durable outcome | Public-seam evidence |
| --- | --- | --- |
| Known complete evidence matching promoted pattern | One exact `preliminary-unsafe` result | Persisted match, Recipe, request, Python evidence, restart/reload |
| Supported bounded unknowns | `preliminary-unsafe` range | Every scenario persisted and genuinely solved; extrema recomputed from stored results |
| Bounded range immaterial and worst case below target | Conservative proposed estimate | Stored gate inputs/calculation; clearly preliminary label |
| Bounded range material or crosses target | Range plus decisive next input | No single proposed U-value |
| Missing critical unsupported input | `blocked` | Missing key/authority persisted; no scenario fabricated |
| Conflicting or out-of-range evidence | `rejected` | Stable applicability diagnostics and no solve |
| No promoted pattern | `unmatched` | Durable unresolved occurrence; no U-value |
| Multiple equally plausible promoted patterns | `ambiguous` | Candidate identities/reasons persisted; no U-value |
| Draft/candidate/rejected pattern | Ignored at runtime | Evaluation may inspect it, runtime cannot match it |
| Any scenario blocked/rejected/failed/cancelled | Honest aggregate non-success/range unavailable | Per-scenario outcomes preserved; no fabricated extrema |
| Duplicate IFC/job processing | Idempotent derived records | Evidence deduplicated by content identity while provenance is retained |
| New promoted version replayed historically | New derived match/evaluation | Original evidence, old match, old Recipe, and old result remain unchanged |
| Corrupted persisted match/Recipe/result | Refused reuse | Stable corruption evidence and no displayed result |

## Implementation instructions

1. Define domain records and repository ports for evidence snapshots, occurrences, annotations, pattern versions, matches, Recipe instances, per-scenario requests/results, evaluation runs, and unresolved occurrences.
2. Implement a versioned transactional SQLite adapter. Add migration/restart/concurrency tests; do not put SQLite imports in domain/application code.
3. Record component occurrences automatically from the real IFC Job flow and retain source Job/Revision/element provenance.
4. Define separate IFC content hash, evidence signature, pattern ID/version, exact Recipe hash, request/result identity, and artifact hashes. Document every included field.
5. Define one constrained declarative pattern-pack contract with recognition signals, applicability, parameter sources/ranges, primitive/topology vocabulary, Recipe bindings, authority rules, and lifecycle state.
6. Implement one generic interpreter returning `matched`, `ambiguous`, `unmatched`, `blocked`, or `rejected` with structured diagnostics.
7. Replace special-key/first-row mutation with validated bindings capable of addressing the declared Recipe vocabulary. Unknown or incompatible targets reject deterministically.
8. Add one repeating C-profile development pattern whose identity covers at least 41, 75, and 100 mm dimension variants, plus near-neighbour negatives.
9. Generate one Recipe for known inputs or the complete bounded Cartesian set for explicitly supported unknowns. Bound scenario count and reject explosion.
10. Execute every Recipe through the real Ticket 03 job/request/persistence path. Persist per-scenario identities and evidence before deriving summary range/gates.
11. Add frozen development, negative, varying-dimension, rejection, and holdout datasets. Promotion requires declared matching/applicability metrics and zero unsafe false positives in the frozen safety set.
12. Add unresolved grouping by evidence signature and historical replay as append-only derived work.
13. Run every matrix row through repository restart and protected-evidence assertions.

## Acceptance criteria

- [ ] Every invariant has a named test and every matrix row maps to persisted/public-seam evidence.
- [ ] Component evidence records automatically through the real IFC Job flow and survives restart.
- [ ] Source evidence, annotations, matches, Recipes, results, and evaluations are separate immutable records.
- [ ] One promoted pattern handles 41, 75, and 100 mm variants without dimension-specific adapters.
- [ ] Pattern identity and exact Recipe identity are demonstrably different and deterministic.
- [ ] The generic interpreter has no family-specific physics branch and rejects invalid bindings.
- [ ] Every scenario reaches the real Python worker and persists complete evidence; fake numerical services are absent from acceptance.
- [ ] Exact, bounded-range, conservative, material-uncertainty, blocked, rejected, unmatched, ambiguous, and partial-scenario-failure outcomes are all proven.
- [ ] Only promoted versions match at runtime and frozen/holdout evaluations gate promotion.
- [ ] Unresolved evidence is queryable and historical replay is append-only.
- [ ] Corruption, restart, concurrency, and duplicate processing tests pass without mutating protected evidence or layer-only results.
- [ ] Focused evaluator, Tickets 02-03 verifiers, full suite, and typecheck pass.

## Required completion artifact

Return a Markdown dataset/evaluation report with the invariant-to-test map, full outcome matrix, schema/migration version, record relationships, hash field definitions, pattern contract/version, lifecycle evidence, frozen and holdout inventories/metrics, one real exact trace, one real bounded trace, unresolved/replay evidence, corruption/concurrency results, protected-state hashes, exact verification summaries, and final promotion/readiness decision.

