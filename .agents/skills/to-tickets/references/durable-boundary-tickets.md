# Durable boundary tickets

A durable boundary persists state, runs asynchronously, or communicates across processes or languages. Its happy path is only one part of its observable behaviour.

Select lifecycle cases from the current claim before drafting. A case applies when the ticket promises it, the current operating topology can produce it, failure would violate a named product invariant, or a recorded incident demonstrates the risk. Attach other future-hardening cases to a promotion trigger. Crossing a durable boundary does not make every lifecycle case mandatory.

## Draft the contract

Express these as independently verifiable acceptance criteria:

- The invariants and ownership boundaries.
- Every declared outcome that must be reachable.
- Applicable invalid-input, failure, cancellation, replay, restart, and concurrency behaviour.
- The state that remains unchanged when an operation does not succeed.
- The earning proof through the public seam, plus any unit-only supporting proofs.

When an operating-stage contract exists, summarize the current scenario, topology, protected guarantee, accepted failure behaviour, and any deferred promotion trigger in the ticket.

Split cases that have different outcomes or require different evidence. Split the ticket itself if proving these behaviours no longer fits one fresh context window.

## Ticket check

Map every promised outcome, invariant, and selected lifecycle case to an acceptance criterion and an earning proof with observable evidence. Mark a fake-based test unit-only whenever it replaces a named production dependency. The ticket passes when every selected case has evidence and every deferred case has a promotion trigger instead of an umbrella statement such as “handles failures.”
