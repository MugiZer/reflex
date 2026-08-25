# Learning-harness backlog — attention and evidence

This backlog is derived from the bounded `HUMAN COGNITION, ATTENTION, AND LEARNING-HARNESS TAKEAWAYS` section of the AI/LEARNING TAKEAWAYS Google Doc. It describes system work, not learner capability evidence.

## L-001 — Make capability evidence and status decisions trustworthy

- **Priority:** highest
- **Status:** planned
- **Problem:** the policy requires a completed concept-level assessment, but the current model accepts any non-empty evidence array for any requested promotion. Existing ledger entries include partial or explicitly incomplete demonstrations that are treated as durable evidence.
- **Cognitive reason:** prior-knowledge classification can only conserve attention when graph confidence is honest.
- **Desired behavior:** validate one completed assessment packet, derive the narrowest status from outcome, independence, timing, transfer, and prerequisites, preserve corrections append-only, and prevent thin observations from promoting concepts.
- **Required data:** concept boundary, consolidated demonstration, assessment kind, outcome, independence, assistance level, session/date, rubric version, anchors, prerequisite state, and superseded-packet reference.
- **Likely files:** `src/development/learning-harness/learningHarness.ts`, `scripts/learning-harness-demo.ts`, `tests/learningHarness.test.ts`, and `learning/evidence/evidence-ledger.jsonl`.
- **Acceptance:** Drive claims remain exposure only; teaching packets remain non-evidence; same-session evidence cannot earn `understood`; every promotion cites a validated packet; partial assessments create no positive mastery claim; legacy observations are quarantined or explicitly migrated without deleting history.
- **Risks:** excessive ceremony, unfair legacy migration, or demotion from one anomalous failure.

## L-002 — Build a pre-task learning-context packet

- **Priority:** high
- **Status:** blocked by L-001
- **Problem:** teaching slices and anchors are hard-coded, and there is no task-relative known / fragile / new classification before work.
- **Desired behavior:** given the current real project task, assemble the relevant code/concept neighborhood, classify concepts, identify blocking prerequisites, and select one attention target plus one prediction.
- **Required data:** current task, changed or anchored files, concept links, validated status, recency, prerequisites, mismatch history, and transfer context.
- **Likely files:** `src/development/learning-harness/learningHarness.ts`, `scripts/learning-harness-demo.ts`, and a focused task-context module with tests.
- **Acceptance:** one bounded context packet per task; irrelevant concepts omitted; selected anchors clickable; missing prerequisites visible; packet is not capability evidence.
- **Risks:** noisy traversal, oversized context, stale anchors, or another dashboard.

## L-003 — Make prediction, mismatch, and debugging explicit

- **Priority:** high
- **Status:** planned
- **Problem:** prediction and diagnosis are tutor instructions, not structured session state.
- **Desired behavior:** track one prediction, observed reality, mismatch category, hint depth, corrected causal model, verification result, and bounded entry/exit from deep debugging mode.
- **Required data:** prediction, command/modification, observation source, expected/actual result, hypothesis, hint/explanation level, diagnosis, fix, and verification.
- **Likely files:** `.agents/skills/next-lesson/SKILL.md`, a session-observation model beside the harness, and focused tests.
- **Acceptance:** no prediction is credited without a reality check; mismatch can become correction evidence; debugging mode has explicit start/exit; deep explanations appear only when needed.
- **Risks:** friction on trivial work, forced predictions, or treating every mismatch as failure.

## L-004 — Add quiet ambient signals and normalized metrics

- **Priority:** medium
- **Status:** planned
- **Problem:** the frontier does not surface repeated mispredictions, weak prerequisites, stale confidence, transfer opportunities, or denominators.
- **Desired behavior:** surface at most one relevant task signal and report rates such as correct predictions / tested predictions and independent fixes / attempted fixes.
- **Required data:** opportunities, attempts, correctness, assistance, recency, task identity, prerequisite edges, project/language context, and production feedback where available.
- **Likely files:** future observation journal, capability evaluator, `selectLessonFrontier`, and generated frontier artifacts.
- **Acceptance:** raw counts always have denominators; signals are quiet and task-relevant; signals link to observations; signals do not directly change mastery.
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
