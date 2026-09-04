# Ticket 09 Gate 9 proof audit

Decision: **GO** at P5 durable-lifecycle and P6 independent-oracle depth.

The bounded tracer and complete 13-case matrix cross the required HTTP, SQLite, pinned-worker, artifact, restart/retry/concurrency, replay, corruption, report, and protected-state boundaries. The direct compiler/solver oracle is frozen separately from aggregation. The final authoritative verifier exited 0 with 13/13 passed, 0 failed, 0 unexecuted in 182407 ms and captured schema-validated per-case public/durable evidence plus literal before/after IFC and layer-projection SHA-256 values. Worker-backed rows reject missing lineage, runtime, artifact, or reload proof. Eight mutations of the captured acceptance evidence are rejected.

Supporting normal exits: Ticket 02 verifier 0/125907 ms; Ticket 03 verifier 0/28597 ms; Ticket 06 verifier 0/7718 ms; full suite 0/264275 ms with 197 tests in 54 files; typecheck 0/18072 ms; graphify update 0/74812 ms. The earlier full-suite timeout is retained as a diagnosed harness-budget failure; its exact assertion passed alone in 701 ms and the clean full rerun passed after an explicit 30-second test budget.

No fake worker, in-memory repository, caller-authored U-value, or structural report validator authorizes GO.
