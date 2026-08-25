# Learning-harness backlog — attention and evidence

This backlog is derived from the bounded `HUMAN COGNITION, ATTENTION, AND LEARNING-HARNESS TAKEAWAYS` section of the AI/LEARNING TAKEAWAYS Google Doc. It describes system work, not learner capability evidence.

## L-001 — Make capability evidence and status decisions trustworthy

- **Priority:** highest
- **Status:** complete (verified 2026-08-25)
- **Problem:** the policy requires a completed concept-level assessment, but the current model accepts any non-empty evidence array for any requested promotion. Existing ledger entries include partial or explicitly incomplete demonstrations that are treated as durable evidence.
- **Cognitive reason:** prior-knowledge classification can only conserve attention when graph confidence is honest.
- **Desired behavior:** validate one completed assessment packet, derive the narrowest status from outcome, independence, timing, transfer, and prerequisites, preserve corrections append-only, and prevent thin observations from promoting concepts.
- **Required data:** concept boundary, consolidated demonstration, assessment kind, outcome, independence, assistance level, session/date, rubric version, anchors, prerequisite state, and superseded-packet reference.
- **Likely files:** `src/development/learning-harness/learningHarness.ts`, `scripts/learning-harness-demo.ts`, `tests/learningHarness.test.ts`, and `learning/evidence/evidence-ledger.jsonl`.
- **Acceptance:** **Verified:** Drive claims remain exposure only; teaching packets remain non-evidence; same-session evidence cannot earn `understood`; every promotion cites a validated packet; partial assessments create no positive mastery claim; legacy observations remain available as non-earning context; corrections are append-only; weak prerequisites cap promotion; and the advisory capability-evidence gate passes these cases without rewriting history.
- **Risks:** excessive ceremony, unfair legacy migration, or demotion from one anomalous failure.

## L-002 — Build a pre-task learning-context packet

- **Priority:** high
- **Status:** complete (verified 2026-08-25)
- **Problem:** teaching slices and anchors are hard-coded, and there is no task-relative known / fragile / new classification before work.
- **Desired behavior:** given the current real project task, assemble the relevant code/concept neighborhood, classify concepts, identify blocking prerequisites, and select one attention target plus one prediction.
- **Required data:** current task, changed or anchored files, concept links, validated status, recency, prerequisites, mismatch history, and transfer context.
- **Likely files:** `src/development/learning-harness/learningHarness.ts`, `scripts/learning-harness-demo.ts`, and a focused task-context module with tests.
- **Acceptance:** **Verified:** the regular local harness build reads the current task and Git diff, retrieves the bounded Graphify/capability neighborhood, writes one context packet, surfaces prerequisites and one attention target, and does not treat the packet as capability evidence.
- **Risks:** noisy traversal, oversized context, stale anchors, or another dashboard.

## L-003 — Make prediction, mismatch, and debugging explicit

- **Priority:** high
- **Status:** complete (verified 2026-08-25)
- **Problem:** prediction and diagnosis are tutor instructions, not structured session state.
- **Desired behavior:** track one prediction, observed reality, mismatch category, hint depth, corrected causal model, verification result, and bounded entry/exit from deep debugging mode.
- **Required data:** prediction, command/modification, observation source, expected/actual result, hypothesis, hint/explanation level, diagnosis, fix, and verification.
- **Likely files:** `.agents/skills/next-lesson/SKILL.md`, a session-observation model beside the harness, and focused tests.
- **Acceptance:** **Verified:** the local `learning:observe` command records one learner prediction around a real project command and its actual exit result; the session model requires the reality check before correction, evidence candidacy, or bounded debugging state can progress. Prediction correctness remains an explicit learner/reviewer judgment rather than a guessed automated claim.
- **Risks:** friction on trivial work, forced predictions, or treating every mismatch as failure.

## L-004 — Add quiet ambient signals and normalized metrics

- **Priority:** medium
- **Status:** complete (verified 2026-08-25)
- **Problem:** the frontier does not surface repeated mispredictions, weak prerequisites, stale confidence, transfer opportunities, or denominators.
- **Desired behavior:** surface at most one relevant task signal and report rates such as correct predictions / tested predictions and independent fixes / attempted fixes.
- **Required data:** opportunities, attempts, correctness, assistance, recency, task identity, prerequisite edges, project/language context, and production feedback where available.
- **Likely files:** future observation journal, capability evaluator, `selectLessonFrontier`, and generated frontier artifacts.
- **Acceptance:** **Verified:** the regular local harness build derives task-scoped signals and normalized rates from persisted real-command sessions; signals remain quiet, link to their source observations, and never change mastery directly.
- **Risks:** notification fatigue, false alarms, vanity metrics, and metric gaming.

## L-005 — Reduce manual harness maintenance

- **Priority:** medium
- **Status:** planned
- **Problem:** `learning:build`, evidence entry, status changes, and Graphify updates are manually coordinated; concepts, slices, and anchors remain hard-coded.
- **Desired behavior:** automate routine context assembly and derived-artifact updates while leaving decomposition, causal modeling, diagnosis, verification, and accept/reject decisions with the learner.
- **Required data:** task/file-change events, graph revision, validated packets, artifact provenance, and explicit learner decisions.
- **Likely files:** `scripts/learning-harness-demo.ts`, Graphify integration, local skill instructions, and generated-artifact tests.
- **Acceptance:** routine retrieval/bookkeeping requires no taxonomy maintenance; artifacts remain reproducible; selection reasons are inspectable; automation never becomes capability evidence.
- **Risks:** hidden automation, stale graph state, over-eager concept creation, and making routine setup harder to understand.

## Not in scope yet

- Large learning dashboard.
- Universal programming taxonomy.
- ML-based misconception detection.
- Gamification or one composite mastery score.
- Automatic demotion from one failure.
- Production telemetry before session evidence is trustworthy.
- Full lesson-orchestration UI.
- Dynamic AI rewriting of prerequisite edges without review.
