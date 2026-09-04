import { describe, expect, it } from "vitest";
import {
  applyLearningSessionEvent,
  completeLearningSession,
  createLearningSession,
  toCompletedConceptAssessment,
  type LearningSession,
  type LearningSessionEvent,
} from "../src/development/learning-harness/session.js";
import {
  buildLearningGraph,
  reviewCapabilityAssessment,
  type SourceClaim,
} from "../src/development/learning-harness/learningHarness.js";

const claim: SourceClaim = {
  conceptId: "repository-boundary",
  label: "Repository boundary",
  claim: "learning-goal",
  source: {
    kind: "google-drive",
    documentId: "drive-1",
    documentTitle: "Learning Profile",
    documentUrl: "https://example.test/doc",
    revisionId: "revision-1",
    importedAt: "2026-08-25T00:00:00.000Z",
  },
};

const event = (session: LearningSession, change: LearningSessionEvent): LearningSession =>
  applyLearningSessionEvent(session, change);

const prediction = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "prediction" }>["input"]): LearningSession =>
  event(session, { type: "prediction", input });

const observation = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "observation" }>["input"]): LearningSession =>
  event(session, { type: "observation", input });

const mismatch = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "mismatch" }>["input"]): LearningSession =>
  event(session, { type: "mismatch", input });

const correction = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "correction" }>["input"]): LearningSession =>
  event(session, { type: "correction", input });

const diagnosis = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "diagnosis" }>["input"]): LearningSession =>
  event(session, { type: "diagnosis", input });

const verification = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "verification" }>["input"]): LearningSession =>
  event(session, { type: "verification", input });

const completedWork = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "completed-work" }>["input"]): LearningSession =>
  event(session, { type: "completed-work", input });

const hint = (session: LearningSession, hintDepth: 0 | 1 | 2 | 3): LearningSession =>
  event(session, { type: "hint", input: { hintDepth } });

const enterDebugging = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "enter-deep-debugging" }>["input"]): LearningSession =>
  event(session, { type: "enter-deep-debugging", input });

const debuggingStep = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "debugging-step" }>["input"]): LearningSession =>
  event(session, { type: "debugging-step", input });

const exitDebugging = (session: LearningSession, input: Extract<LearningSessionEvent, { type: "exit-deep-debugging" }>["input"]): LearningSession =>
  event(session, { type: "exit-deep-debugging", input });

const mismatchedSession = () => {
  const session = createLearningSession({
    id: "session-2",
    task: "Fix the repository boundary",
    startedAt: "2026-08-25T10:00:00.000Z",
  });
  return mismatch(observation(prediction(session, {
    expectedResult: "The focused test passes after the repository is injected.",
    modification: "Inject the repository into the application service.",
    predictedAt: "2026-08-25T10:01:00.000Z",
  }), {
    actualResult: "The focused test still fails because construction remains in the service.",
    source: "test",
    matchesPrediction: false,
    observedAt: "2026-08-25T10:02:00.000Z",
  }), {
    category: "causal-model",
    explanation: "The service still owns repository construction.",
    recordedAt: "2026-08-25T10:03:00.000Z",
  });
};

describe("learning session public seam", () => {
  it("records one prediction, its reality check, and the resulting mismatch", () => {
    const session = createLearningSession({
      id: "session-1",
      task: "Add a repository boundary",
      startedAt: "2026-08-25T10:00:00.000Z",
    });
    const predicted = prediction(session, {
      expectedResult: "The focused test passes after the repository is injected.",
      command: "npm test -- tests/repository.test.ts",
      predictedAt: "2026-08-25T10:01:00.000Z",
    });
    const observed = observation(predicted, {
      actualResult: "The test still fails because the dependency is constructed in the application.",
      source: { kind: "test", name: "tests/repository.test.ts" },
      matchesPrediction: false,
      observedAt: "2026-08-25T10:02:00.000Z",
    });
    const mismatched = mismatch(observed, {
      category: "causal-model",
      explanation: "The application owns construction instead of receiving the repository.",
      recordedAt: "2026-08-25T10:03:00.000Z",
    });

    expect(session.prediction).toBeNull();
    expect(mismatched.prediction?.expectedResult).toBe(
      "The focused test passes after the repository is injected.",
    );
    expect(mismatched.observation).toMatchObject({
      actualResult: "The test still fails because the dependency is constructed in the application.",
      source: { kind: "test", name: "tests/repository.test.ts" },
      matchesPrediction: false,
    });
    expect(mismatched.mismatch).toMatchObject({
      category: "causal-model",
      explanation: "The application owns construction instead of receiving the repository.",
    });
  });

  it("keeps session revisions immutable and prevents a second active prediction", () => {
    const session = createLearningSession({
      id: "session-immutable",
      task: "Check one prediction",
      startedAt: "2026-08-25T10:00:00.000Z",
    });
    const predicted = prediction(session, {
      expectedResult: "The check passes.",
      command: "npm test -- tests/example.test.ts",
      predictedAt: "2026-08-25T10:01:00.000Z",
    });

    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(predicted)).toBe(true);
    expect(session.prediction).toBeNull();
    expect(() => prediction(predicted, {
      expectedResult: "A second prediction is not allowed.",
      command: "npm test",
      predictedAt: "2026-08-25T10:02:00.000Z",
    })).toThrow(/only one active prediction/);
  });

  it("requires an observed mismatch before entering bounded deep debugging", () => {
    const session = createLearningSession({
      id: "session-debug-boundary",
      task: "Diagnose a failing test",
      startedAt: "2026-08-25T10:00:00.000Z",
    });
    const predicted = prediction(session, {
      expectedResult: "The test passes.",
      command: "npm test -- tests/example.test.ts",
      predictedAt: "2026-08-25T10:01:00.000Z",
    });

    expect(() => enterDebugging(predicted, {
      reason: "The test is unexpectedly red.",
      maxSteps: 2,
      enteredAt: "2026-08-25T10:02:00.000Z",
    })).toThrow(/recorded mismatch/);

    const entered = enterDebugging(mismatchedSession(), {
      reason: "The failing test needs a causal diagnosis.",
      maxSteps: 2,
      enteredAt: "2026-08-25T10:04:00.000Z",
    });
    const oneStep = debuggingStep(entered, {
      description: "Trace the construction path.",
      recordedAt: "2026-08-25T10:05:00.000Z",
    });
    const twoSteps = debuggingStep(oneStep, {
      description: "Compare the application and repository seams.",
      recordedAt: "2026-08-25T10:06:00.000Z",
    });

    expect(twoSteps.debuggingMode).toMatchObject({ status: "active", maxSteps: 2, stepsUsed: 2 });
    expect(() => debuggingStep(twoSteps, {
      description: "A third deep-debugging step is out of budget.",
      recordedAt: "2026-08-25T10:07:00.000Z",
    })).toThrow(/budget is exhausted/);
    expect(() => completeLearningSession(twoSteps, {
      completedAt: "2026-08-25T10:08:00.000Z",
    })).toThrow(/Exit deep debugging/);

    const exited = exitDebugging(twoSteps, {
      reason: "The bounded diagnosis is complete.",
      exitedAt: "2026-08-25T10:08:00.000Z",
    });
    expect(exited.debuggingMode).toMatchObject({
      status: "exited",
      stepsUsed: 2,
      exitReason: "The bounded diagnosis is complete.",
    });
  });

  it("captures meaningful verified coding work as a candidate without promoting it", () => {
    let session = mismatchedSession();
    session = hint(session, 1);
    session = correction(session, {
      correctedCausalModel: "The application service must receive the repository dependency.",
      fix: "Pass the repository through the application constructor.",
      correctedAt: "2026-08-25T10:09:00.000Z",
    });
    session = diagnosis(session, {
      hypothesis: "The service constructs a concrete repository internally.",
      diagnosis: "The composition root is bypassed by the service constructor.",
      diagnosedAt: "2026-08-25T10:10:00.000Z",
    });
    session = verification(session, {
      result: "passed",
      source: { kind: "test", name: "tests/repository.test.ts" },
      details: "The focused test passes after the dependency is injected.",
      verifiedAt: "2026-08-25T10:11:00.000Z",
    });
    session = completedWork(session, {
      conceptId: claim.conceptId,
      capabilityBoundary: "Trace and change the repository composition boundary.",
      kind: "diagnosis",
      description: "Diagnosed and fixed the repository construction boundary, then verified the focused test.",
      changedFiles: ["src/application/repositoryService.ts"],
      codeAnchors: ["src/application/repositoryService.ts"],
      producedArtifact: "tests/repository.test.ts",
      completedAt: "2026-08-25T10:12:00.000Z",
    });
    const completed = completeLearningSession(session, {
      completedAt: "2026-08-25T10:13:00.000Z",
    });

    expect(completed.evidenceCandidate).toMatchObject({
      recordType: "capability-evidence-candidate",
      promotionStatus: "candidate",
      conceptId: claim.conceptId,
      suggestedAssessment: {
        outcome: "passed",
        independence: "lightly-prompted",
        assistanceLevel: "minor",
      },
    });
    expect(completed.evidenceCandidate?.id).toBe("session-2:evidence-candidate");

    const candidate = completed.evidenceCandidate;
    if (!candidate) throw new Error("Expected a candidate for meaningful verified work");
    const graph = buildLearningGraph([claim], []);
    expect(graph.concepts[0]?.status).toBe("seed");
    expect(() => reviewCapabilityAssessment(graph, candidate as never)).toThrow(
      /recordType must be completed-concept-assessment/,
    );

    const reviewPacket = toCompletedConceptAssessment(candidate, {
      id: "assessment-from-session-2",
      rubricVersion: "1",
      outcome: "passed",
      independence: "lightly-prompted",
      assistanceLevel: "minor",
      consequentialWork: false,
    });
    const review = reviewCapabilityAssessment(graph, reviewPacket);

    expect(review.decision.resultingStatus).toBe("practicing");
    expect(review.graph.concepts[0]?.evidence[0]).toMatchObject({
      recordType: "completed-concept-assessment",
      id: "assessment-from-session-2",
      consequentialWork: false,
    });
  });

  it("does not derive evidence from a trivial or unverified action", () => {
    let session = createLearningSession({
      id: "session-trivial",
      task: "Run a formatter",
      startedAt: "2026-08-25T11:00:00.000Z",
    });
    session = prediction(session, {
      expectedResult: "The formatter reports no changes.",
      command: "npm exec prettier -- --check README.md",
      predictedAt: "2026-08-25T11:01:00.000Z",
    });
    session = observation(session, {
      actualResult: "The formatter reports no changes.",
      source: "test",
      matchesPrediction: true,
      observedAt: "2026-08-25T11:02:00.000Z",
    });
    session = verification(session, {
      result: "passed",
      source: "manual",
      verifiedAt: "2026-08-25T11:03:00.000Z",
    });
    session = completedWork(session, {
      conceptId: claim.conceptId,
      capabilityBoundary: "This action is intentionally trivial.",
      kind: "trivial",
      description: "Ran a formatter check without changing code.",
      changedFiles: [],
      completedAt: "2026-08-25T11:04:00.000Z",
    });

    const completed = completeLearningSession(session, {
      completedAt: "2026-08-25T11:05:00.000Z",
    });
    expect(completed.evidenceCandidate).toBeNull();
  });
});
