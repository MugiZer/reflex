# Verification scope

Use this branch when the default—focused tests while implementing, then the affected module or package suite before completion—cannot carry the ticket's proof.

## Choose the scope

| Changed surface | Ticket completion proof | Later tier |
| --- | --- | --- |
| Local logic | Focused behavior plus affected module tests | Repository defaults |
| Module/component | Public component behavior plus package suite | Broader affected regression |
| Public/external boundary | Earning proof through the real boundary | Clean-environment CI proof when needed |
| Shared/cross-cutting infrastructure | Affected consumers | Full regression in CI |
| Release/configuration | Real startup or production composition | Full verifier or platform matrix |

Assign slow, environment-sensitive, or platform-matrix proofs to CI or release. A full repository suite is an integration decision, not a per-ticket default; require it for the ticket only when repository policy says so or the blast radius makes affected-test selection unreliable.

Add failure, recovery, lifecycle, performance, or platform proofs only for a risk named by the ticket's claim or acceptance criteria.

Take command names from the repository rather than copying discoverable scripts into ordinary tickets. A gate plan may record exact commands when reproducibility is part of its evidence contract.

## Route deep claims

For a public entry, external dependency, durable lifecycle, cross-process composition, or release decision, use `$gate-design`. Summarize its earning proof or stable gate IDs in the ticket. Fake-based tests remain supporting proofs when they replace a production dependency.

## Ticket check

Drafting is complete when every acceptance criterion is covered by a credible proof, each additional proof names the risk it covers, the affected regression scope is named, every deferred proof has an execution tier, and any per-ticket full-suite requirement gives its repository-policy or blast-radius reason.
