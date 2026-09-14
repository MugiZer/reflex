# Durable proof matrix

Apply this matrix when a claim crosses persistence, asynchronous execution, process/runtime, or language boundaries. Select rows before designing proofs. A row applies when the claim promises it, the current operating topology can produce it, failure would violate a named product invariant, or a recorded incident demonstrates the risk. Record other rows as excluded scope or attach them to a promotion trigger. A durable boundary does not make every row mandatory, and selecting a row does not make every candidate probe in that row mandatory. Choose the smallest probe set that can falsify the exact claim; let one proof cover multiple selected rows when they share a production route. A selected row is evidence only when exercised through the deepest public seam required by the claim.

| Area | Candidate probes | Required observations when selected |
| --- | --- | --- |
| Authority | missing, conflicting, stale, wrong owner, wrong revision/signature | stable honest outcome; no trusted identity accepted from caller input |
| Input identity | mutated semantic payload with old hash; invalid ID/hash/deadline/path | deterministic rejection before unsafe work |
| Protocol symmetry | unknown major version, incompatible bundle, identity mismatch, invalid request/result/error/cancel on each side | both sides reject the same invalid message classes |
| Outcome reachability | success, blocked, rejected, failed, cancelled, not-requested where declared | each selected state reaches the validation, persistence, reload, or display observations promised by the claim |
| Lifecycle | timeout, cancellation, unavailable worker, crash, malformed/truncated/oversized output | explicit terminal transition; diagnostics retained; no partial numerical success |
| Publication | interruption before and between writes, stale temp artifacts, failed rename/index/database update | atomic committed set or recoverable non-success; no half-published final state |
| Replay/restart | equal sequential request, service/repository restart | one immutable identity/outcome and the promised side-effect behavior |
| Concurrency | simultaneous callers or workers when the operating topology admits them | one authoritative outcome and bounded side effects under contention |
| Idempotency conflict | same key with different semantic payload | deterministic conflict; original result unchanged |
| Runtime mutation | caller mutates returned object or cached result | defensive immutable snapshot; later reads unchanged |
| Persisted corruption | changed payload value, outcome, relation, manifest, hash, missing file, unsafe path | reload/reuse refused; no value leaks to workspace/report |
| Protected state | failure and success around immutable evidence, historical revisions, active selection, baseline result | byte/identity-equal protected state unless the claim explicitly authorizes change |
| Evidence visibility | diagnostics, uncertainty, assumptions, confidence, readiness, failure context | selected evidence survives each claimed boundary through the final claimed consumer |
| Cleanup/recovery | abandoned in-flight work, temp artifacts, retry after restart, retention cleanup | deterministic recovery policy without deleting immutable evidence |
