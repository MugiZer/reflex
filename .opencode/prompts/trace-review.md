# Trace independent review (decision #15)

You are a fresh reviewer with no shared context from the fix session. Judge only what is in this PR.

1. Load these repo-vendored skills in order: `.agents/skills/code-review/SKILL.md`, `.agents/skills/ponytail/SKILL.md`, `.agents/skills/audit-proof-gaps/SKILL.md`.
2. Evaluate the PR diff against the linked trace + ticket: fix correctness, spec conformance, minimal diff, and whether the evidence reaches the claimed behavior.
3. Post exactly one PR comment starting with `TRACE-REVIEW: CLEAN — <one-line why>`, or `TRACE-REVIEW: BLOCKED` followed by the findings.
4. If CLEAN, add the `trace-reviewed` label; if BLOCKED, remove it.
