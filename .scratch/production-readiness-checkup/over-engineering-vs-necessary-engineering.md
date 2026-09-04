# Over-Engineering vs Necessary Engineering

This log records where production hardening protects Conformity's core promise and where it would currently add complexity for hypothetical scale. It is intentionally decision-oriented: deferred work is not rejected; it is waiting for the operating conditions that justify it.

The original production-hardening Tickets B–E were superseded when the project goal changed to a founder-operated path to 10 paid users. Active work now lives in Ticket B (Paid-Pilot Safety and Recovery) and Ticket C (Automatic Family Adapter and Qualification). This file is the backlog for guarantees intentionally omitted from those tickets.

## Product invariant

Never present an incomplete, unsupported, or irreproducible engineering result as verified.

An explicit failure that requires a manual retry is currently acceptable. A silent or misleading result is not.

## Decisions recorded on 2026-08-12

| Area | Necessary engineering now | Over-engineering for current stage | Decision |
|---|---|---|---|
| Job execution | Persist the Job before accepting it; detect abandoned queued/processing Jobs; mark them retryable; never report completion without required output; support manual retry. | Leases, multi-worker claim arbitration, automatic artifact adoption/quarantine, perfect replay, cancellation/supersession protocols, exhaustive crash-point injection. | Implement a small retryable lifecycle. Backlog advanced recovery until there are multiple workers, unattended processing, or manual retry becomes costly. |
| Revision publication | Build the Revision and Report before changing `activeRevisionId`; validate minimum completeness and Job/parent ownership; preserve the previous active Revision on failure. | A distributed-transaction-style publication protocol across SQLite and files, recovery manifests, automatic orphan adoption, exhaustive interruption simulation, concurrent winner arbitration. | Keep the publication ordering and add focused invariant tests. Backlog sophisticated reconciliation. |
| Thermal Treatment adapters | Require immutable dataset/family/adapter identity, provenance, supported parameter envelope, independent reference cases, worker compatibility, and explicit verified/preliminary/unsupported trust state. | Exhaustive numerical matrices for every possible input, broad solver orchestration, automatic proof of every generated adapter, release qualification for unsupported families. | Protect numerical truth now. Qualify each generated family with a small independent reference pack before enabling it. |
| HTTP failures | Classify invalid input, missing resources, lifecycle conflicts, and unexpected failures; return safe status codes/messages; retain internal diagnostics and correlation IDs. | Decomposing the whole HTTP server, adding route classes for every endpoint, generalized dependency injection, exhaustive browser coverage of theoretical failures. | Implement the small error contract. Keep structural refactoring in backlog until real change pressure appears. |
| Verification | Keep typechecking and the important public/end-to-end checks bounded and reproducible. | A grand gate covering every lifecycle state, every failure combination, every viewport, all fault-injection points, and every numerical scenario. | Maintain a focused release check for the feature being shipped; expand it when usage or risk expands. |
| Workspace/report modules | Preserve the Report renderer as a deep module; keep the workspace projection consolidated while it has one main consumer. | Splitting by file size or speculative consumers; adding interfaces without a second implementation or divergent freshness requirement. | Do not refactor for shape alone. Revisit after a second consumer, adapter, or independent change axis exists. |

## Why this boundary exists

The hardening work falls into three consequence levels:

1. **Truth failure:** an unsupported or incorrect calculation appears verified. Prevent aggressively.
2. **State-integrity failure:** the application points to incomplete or mismatched evidence. Prevent at the publication boundary.
3. **Operational inconvenience:** a crash leaves work retryable or an unused artifact behind. Detect and expose it; automate recovery when the cost justifies it.

The original B–E tickets treated all three levels almost equally. This log narrows the immediate scope to the first two and accepts visible, recoverable inconvenience while the product is still moving quickly.

## Promotion triggers for deferred hardening

Move a deferred item into active implementation when one of these becomes true:

- more than one worker or process can execute the same Job;
- Jobs run unattended or take long enough that manual retry is materially expensive;
- users depend on retention, audit, or recovery guarantees;
- generated datasets or adapters are numerous enough that manual qualification is insufficient;
- a second storage/worker adapter makes the current abstraction a real seam;
- production incidents demonstrate that the simpler guarantee is insufficient.

Until then, prefer the smallest design that protects the product invariant and makes failure visible.
