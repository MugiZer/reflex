# Ticket 09 Gate 5 proof audit

Decision: **GO**

Audited claim: a supported bounded C-profile unknown crosses the production localhost HTTP, application, append-only SQLite, pinned Python worker, artifact validation, SQLite reload, and protected-state boundary with three honest terminal results.

## Tracer proof

- Public command: `npx vitest run tests/componentScenarioHttpE2e.test.ts --reporter=verbose`
- Result: 3/3 passed; exit 0; 134.30 s.
- Known match: one Recipe/request/result, `preliminary-unsafe`, frozen-oracle agreement, validated evidence manifest, fresh-server equality.
- Bounded unknown: literal ordered depths `0.041`, `0.075`, `0.100`; three real worker terminals/artifacts; each value agrees with `repeating-c-profile-oracle-v1.json` within `1e-8 W/m2K`; asymmetric sensitivity is monotonic.
- Controlled failure: two successes plus one real `recipe_invalid` terminal; no component aggregate; fresh-server equality; IFC hash and ordinary assembly projection unchanged.
- Persistence command: `npx vitest run tests/componentEvaluationSqlite.test.ts --reporter=verbose`
- Result: 5/5 passed; exit 0. Recoverable results reconstruct from immutable append-only rows after a fresh reader; interruption never publishes an aggregate.
- Type boundary: `npm run typecheck`; exit 0.

## False-green assessment

- No proof substitution: the authorizing E2E uses localhost HTTP, the real SQLite repositories, and the pinned conformance Python executable.
- No self-certification: numerical expectations were frozen from a direct compiler/solver conformance run outside HTTP, SQLite projection, and aggregation.
- No durability illusion: every terminal result is appended before the next request; success and mixed failure are reloaded by a fresh server/repository.
- No protected-state omission: source IFC bytes and ordinary layer-only assembly projection are equal after success/failure and restart.
- No payload-shape substitution: successful results require validated worker evidence, topology audit, reproducibility manifest, artifact identity, and numerical oracle agreement.

Remaining lifecycle/corruption/report probes belong to the ticket's later Gates 6, 8, and 9 and do not authorize those gates here.
