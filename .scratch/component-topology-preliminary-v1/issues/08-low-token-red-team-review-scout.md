# 08 — Low-token red-team review scout

**What to build:** Add an optional, non-authoritative review step that reads only the ticket, changed-file manifest, and proof summary, then reports likely missing failure probes without editing code or earning tickets.

**Blocked by:** 07 — Proof harness preflight and failure classification

**Status:** ready-for-agent

- [ ] Limit the scout input to the ticket, diff summary, acceptance output, and relevant failure reports.
- [ ] Require every finding to name a reproducible command or a concrete missing contract probe.
- [ ] Keep the scout advisory: only deterministic acceptance proofs can earn a ticket.
- [ ] Enforce a small token/time budget and record its output separately from product evidence.
- [ ] Add a smoke fixture proving scout failure cannot unlock a ticket and scout availability cannot block a passing proof.

**Required artifact:** A bounded scout runner, sample report, and graph integration test proving advisory-only behavior.
