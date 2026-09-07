# Proof-gap patterns

Load this catalog after a tracer proof falls below its required depth or prior history reports a false green. Name only patterns supported by concrete evidence.

## Proof substitutions

- A fake service, repository, worker, clock, or artifact store stands in for the boundary named by the claim.
- A direct use-case call is described as HTTP, CLI, UI, or Job proof.
- A test-only constructor, fallback, or scratch runtime bypasses release composition.
- Implementation-authored diagnostics, geometry, hashes, snapshots, or fixtures act as their own oracle.
- Payload-shape assertions stand in for semantic, relational, or artifact validation.
- A claim of durable reuse has a write-path test but no required reload/read-path consumer.
- A failure-preservation claim omits protected-state or no-value-on-failure evidence.

## Root-cause vocabulary

- **Proof substitution:** the verifier bypasses or fakes the claimed path.
- **Self-certification:** the implementation supplies its own truth oracle.
- **Boundary drift:** policy and side effects live under the wrong owner.
- **State-machine omission:** declared outcomes or lifecycle transitions are unreachable.
- **Durability illusion:** one successful run substitutes for a claimed publication, reload, replay, concurrency, or corruption behaviour.
- **Contract split-brain:** validators, identities, or outcomes differ across a boundary.
- **Authority inversion:** advisory review, scout output, or a green harness earns completion without deterministic product proof.
- **Acceptance drift:** ticket criteria never map to code, proof, and observable evidence.
- **Scope inflation:** hypothetical topology or a promotion-triggered guarantee is treated as a current gate requirement.

Prefer a more specific cause when the evidence supports it. Cluster symptoms under the design omission that explains them.

## Harness attribution

Preserve the exact command, working directory, input packet/encoding, exit code, stdout, stderr, duration, and failure class. Distinguish launcher/configuration, missing command/dependency, encoding/transport, harness timeout, worker/runtime, assertion/proof, and confirmed product failures.

Use `CONTRADICTED` only when the product path received the intended input and an authoritative assertion failed. Otherwise use `HARNESS-BLOCKED`.

## Advisory scout

A bounded scout may read the ticket, changed-file manifest, proof summary, and prior incidents to suggest missing probes. Require each current-gate suggestion to name the claim, present risk, and executable reproduction or precise contract probe. Record future-topology suggestions as promotion triggers. Keep scout output separate: deterministic product proof, not scout availability, decides the gate.
