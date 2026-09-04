# Pre-commit and AI-harness gate research

Date: 2026-08-02

## Executive finding

Use local hooks for fast, deterministic feedback and use clean CI plus protected-branch rules as the merge authority. Treat a passing test suite as necessary but not sufficient for agent-produced work: acceptance proofs need independent oracles, negative/sensitivity checks, reproducible environments, and evidence bound to the exact revision tested.

## General hook and CI practice

- Git's `pre-commit` hook can abort a commit on non-zero exit, but it can be bypassed with `--no-verify`; hook configuration can also be relocated or disabled through `core.hooksPath`. Hooks are therefore local feedback, not the authoritative enforcement boundary. Source: https://git-scm.com/docs/githooks.html and https://git-scm.com/docs/git-config.html
- Keep pre-commit fast and staged-file-aware. Put deterministic formatting, metadata/config validation, and small affected tests there. Put broader typecheck, unit, integration, and durable tests in pre-push or CI. The pre-commit framework supports file selection, hook stages, include/exclude patterns, and a full `--all-files` sweep. Source: https://pre-commit.com/
- Rebuild CI from a clean checkout. For npm projects, `npm ci` requires a lockfile, removes the existing dependency tree, and fails on manifest/lockfile disagreement; dependency caches should accelerate CI, never determine correctness. Sources: https://docs.npmjs.com/cli/v11/commands/npm-ci/ and https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- Protect the merge boundary with required status checks and reviews. Required checks must pass for the latest commit SHA; skipped or path-filtered checks can create pending or misleading states, so keep an always-created quality-gate job that explains selected and skipped checks. Sources: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches, https://docs.github.com/en/pull-requests/collaborating-with-repositories/working-with-status-checks/about-status-checks, and https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- If a merge queue is used, CI must also handle the merge-group event. Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-a-merge-queue

## AI-engineering and proof-harness findings

- Passing the original suite can overstate correctness. UTBoost's independent test augmentation found erroneous SWE-bench patches among patches that had originally passed; the paper also found evaluator/parser defects that mislabeled erroneous patches as passing. Source: https://aclanthology.org/2025.acl-long.189.pdf
- Therefore validate the validator: lock the runner/configuration, use structured test results instead of fragile log scraping, keep a deliberate canary that must fail under a broken implementation, and periodically replay known-bad patches or mutants to ensure the gate rejects them. This is an engineering recommendation inferred from the UTBoost findings.
- Reproducible agent work needs a fixed task definition and environment. Record task/spec ID, base and head revision, changed-file manifest, exact command/arguments, runner and dependency versions, exit codes, test report, and generated artifacts. SWE-bench's verified set fixes task quality and evaluation configuration; this repository's Ticket 09 evidence manifest follows the same principle. Source: https://www.swebench.com/verified.html
- Codex guidance emphasizes explicit repository instructions, testing commands, standards, expected behavior, constraints, and definition of done. Sources: https://openai.com/index/introducing-codex/ and https://cdn.openai.com/pdf/8a9f00cf-d379-4e20-b06f-dd7ba5196a11/OAI_WhitePaper_Codex-maxxing26.pdf
- Separate implementer authority from reviewer/oracle authority. Agents should not be able to approve their own changes, alter branch protection, or rewrite the acceptance oracle. Human/code-owner review remains a merge gate for risky paths. Sources: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners and https://docs.github.com/en/actions/reference/security/secure-use
- Bind evidence to the artifact or revision that produced it. GitHub artifact attestations provide a first-party model for provenance; local proof manifests should at minimum bind the result to the tested Git tree/commit and retain logs immutably by revision. Source: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations

## Application to Ticket 09-style gates

Ticket 09 already has the right gate content: public/durable boundaries, independent frozen oracles, protected-state hashes, true concurrency, restart, corruption, mutation sensitivity, and explicit `GO`/`NO-GO`. The harness improvement is to make those gates executable at the correct enforcement tier:

1. **Pre-commit:** validate the gate descriptor, proof-map completeness, changed-file routing, test names/commands, and fast deterministic tests. Reject stale evidence when the staged tree differs from the evidence's tested tree.
2. **CI quality gate:** recompute changed-file routing in a clean checkout, run typecheck and the relevant unit/integration suites, execute the Ticket 09 authoritative verifier for durable paths, and publish structured evidence.
3. **Protected merge/release gate:** require CI status, required review/code-owner approval, audit decision, and the final evidence artifact. Do not let an agent's final message or a local hook substitute for this evidence.

The key state is `NOT_PROVEN`, distinct from both `GREEN` and `FAILED`. Missing, stale, unexecuted, or harness-blocked evidence must remain `NOT_PROVEN` and prevent promotion.

## Design cautions

- Do not run a three-minute durable verifier on every commit; developers will bypass a slow hook. Route by changed files and risk tier.
- Do not make path-filtered CI the only required check. Always create a quality-gate job and report why a suite was selected or deemed not applicable.
- Do not duplicate the ticket's invariants in several prose files. Keep the ticket authoritative; keep a compact machine-readable gate index for routing and proof commands.
- Static heuristics can flag suspicious fake seams, but only public-seam tests, independent oracles, and audit review can establish semantic proof.
