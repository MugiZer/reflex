import { describe, expect, it } from "vitest";
import {
  buildLearningGraph,
  type CompletedConceptAssessment,
  type LearningEvidence,
  type LearningGraph,
  type LearningStatus,
} from "../src/development/learning-harness/learningHarness.js";
import {
  evaluateLearningSignals,
  type LearningSignalObservation,
} from "../src/development/learning-harness/signals.js";

const assessment = (
  overrides: Partial<CompletedConceptAssessment> = {},
): CompletedConceptAssessment => ({
  id: "assessment-1",
  recordType: "completed-concept-assessment",
  conceptId: "concept",
  capabilityBoundary: "Explain the concept.",
  demonstration: "Explained the concept.",
  kind: "trace",
  outcome: "passed",
  independence: "unprompted",
  assistanceLevel: "none",
  sessionId: "session-1",
  assessedAt: "2026-05-01T10:00:00.000Z",
  rubricVersion: "1",
  delayedRetrieval: false,
  codeAnchors: ["src/example.ts"],
  ...overrides,
});

const understoodGraph = (extraEvidence: CompletedConceptAssessment[] = []): LearningGraph =>
  buildLearningGraph([], [
    assessment({ id: "introduction", kind: "explanation" }),
    assessment({
      id: "retrieval",
      kind: "delayed-retrieval",
      delayedRetrieval: true,
      sessionId: "session-2",
      assessedAt: "2026-05-02T10:00:00.000Z",
    }),
    ...extraEvidence,
  ], undefined, [{ id: "concept", label: "Concept" }]);

const manualConcept = (
  id: string,
  status: LearningStatus,
  prerequisites: string[] = [],
  evidence: LearningEvidence[] = [],
) => ({
  id,
  label: id,
  aliases: [],
  status,
  prerequisites,
  codeAnchors: [],
  sourceClaims: [],
  evidence,
});

describe("learning signal interface", () => {
  it("surfaces one repeated misconception and normalizes predictions by tested attempts", () => {
    const graph = buildLearningGraph([], [], undefined, [
      { id: "dependency-injection", label: "Dependency injection" },
    ]);
    const observations: LearningSignalObservation[] = [
      {
        id: "prediction-1",
        conceptId: "dependency-injection",
        taskId: "task-1",
        observedAt: "2026-08-23T10:00:00.000Z",
        kind: "prediction",
        tested: true,
        correct: false,
        mismatch: "misconception",
      },
      {
        id: "prediction-2",
        conceptId: "dependency-injection",
        taskId: "task-1",
        observedAt: "2026-08-24T10:00:00.000Z",
        kind: "prediction",
        tested: true,
        correct: false,
        mismatch: "misconception",
      },
    ];

    const result = evaluateLearningSignals({
      graph,
      scope: { taskId: "task-1", conceptIds: ["dependency-injection"] },
      observations,
      asOf: "2026-08-25T10:00:00.000Z",
    });

    expect(result.signal).toMatchObject({
      kind: "repeated-mismatch",
      conceptId: "dependency-injection",
      observationIds: ["prediction-1", "prediction-2"],
    });
    expect(result.metrics).toContainEqual({
      key: "prediction-accuracy",
      numerator: 0,
      denominator: 2,
      rate: 0,
    });
  });

  it("reports independent fix rate over attempted fixes and leaves untested predictions out", () => {
    const graph = buildLearningGraph([], [], undefined, [
      { id: "dependency-injection", label: "Dependency injection" },
    ]);
    const result = evaluateLearningSignals({
      graph,
      scope: { conceptIds: ["dependency-injection"] },
      observations: [
        {
          id: "prediction-1",
          conceptId: "dependency-injection",
          observedAt: "2026-08-24T10:00:00.000Z",
          kind: "prediction",
          tested: true,
          correct: true,
        },
        {
          id: "prediction-2",
          conceptId: "dependency-injection",
          observedAt: "2026-08-24T11:00:00.000Z",
          kind: "prediction",
          tested: false,
        },
        {
          id: "fix-1",
          conceptId: "dependency-injection",
          observedAt: "2026-08-24T12:00:00.000Z",
          kind: "fix",
          attempted: true,
          independent: true,
        },
        {
          id: "fix-2",
          conceptId: "dependency-injection",
          observedAt: "2026-08-24T13:00:00.000Z",
          kind: "fix",
          attempted: true,
          independent: false,
        },
        {
          id: "fix-3",
          conceptId: "dependency-injection",
          observedAt: "2026-08-24T14:00:00.000Z",
          kind: "fix",
          attempted: false,
        },
      ],
      asOf: "2026-08-25T10:00:00.000Z",
    });

    expect(result.metrics).toContainEqual({
      key: "independent-fix-rate",
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(result.metrics.find((metric) => metric.key === "prediction-accuracy")).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
  });

  it("warns quietly about stale high-confidence knowledge without changing graph status", () => {
    const graph = understoodGraph();

    const result = evaluateLearningSignals({
      graph,
      scope: { conceptIds: ["concept"] },
      asOf: "2026-08-25T10:00:00.000Z",
    });

    expect(result.signal).toMatchObject({
      kind: "stale-confidence",
      conceptId: "concept",
      observationIds: ["introduction", "retrieval"],
    });
    expect(graph.concepts[0]?.status).toBe("understood");
  });

  it("identifies a weak prerequisite without promoting or demoting either concept", () => {
    const graph: LearningGraph = {
      schemaVersion: 1,
      concepts: [
        manualConcept("prerequisite", "practicing"),
        manualConcept("concept", "understood", ["prerequisite"], [assessment()]),
      ],
    };

    const result = evaluateLearningSignals({
      graph,
      scope: { conceptIds: ["concept"] },
      asOf: "2026-08-25T10:00:00.000Z",
      policy: { staleAfterDays: 365 },
    });

    expect(result.signal).toMatchObject({
      kind: "weak-prerequisite",
      conceptId: "concept",
      prerequisiteId: "prerequisite",
      observationIds: ["assessment-1"],
    });
    expect(result.signal?.kind).not.toBe("untested-transfer");
    expect(graph.concepts.map((concept) => concept.status)).toEqual(["practicing", "understood"]);
  });

  it("suspects regression after an established pass while preserving the earned status", () => {
    const graph = understoodGraph([assessment({
      id: "failed-retrieval",
      kind: "delayed-retrieval",
      outcome: "not-demonstrated",
      delayedRetrieval: true,
      sessionId: "session-3",
      assessedAt: "2026-08-24T10:00:00.000Z",
      demonstration: "Could not retrieve the concept.",
    })]);

    const result = evaluateLearningSignals({
      graph,
      scope: { conceptIds: ["concept"] },
      asOf: "2026-08-25T10:00:00.000Z",
      policy: { staleAfterDays: 365 },
    });

    expect(result.signal).toMatchObject({
      kind: "regression-suspected",
      conceptId: "concept",
      observationIds: ["failed-retrieval"],
    });
    expect(graph.concepts[0]?.status).toBe("understood");
  });

  it("offers transfer as the next quiet check when high-confidence evidence has no transfer", () => {
    const graph = understoodGraph();

    const result = evaluateLearningSignals({
      graph,
      scope: { conceptIds: ["concept"] },
      asOf: "2026-08-25T10:00:00.000Z",
      policy: { staleAfterDays: 365 },
    });

    expect(result.signal).toMatchObject({ kind: "untested-transfer", conceptId: "concept" });
    expect(result.metrics).toContainEqual({
      key: "transfer-coverage",
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
  });

  it("selects one highest-priority task signal and ignores observations from another task", () => {
    const graph = understoodGraph();

    const result = evaluateLearningSignals({
      graph,
      scope: { taskId: "task-1", conceptIds: ["concept"] },
      observations: [
        {
          id: "other-task-1",
          conceptId: "concept",
          taskId: "task-2",
          observedAt: "2026-08-24T10:00:00.000Z",
          kind: "prediction",
          tested: true,
          correct: false,
        },
        {
          id: "other-task-2",
          conceptId: "concept",
          taskId: "task-2",
          observedAt: "2026-08-24T11:00:00.000Z",
          kind: "prediction",
          tested: true,
          correct: false,
        },
      ],
      asOf: "2026-08-25T10:00:00.000Z",
    });

    expect(result.signal?.kind).toBe("stale-confidence");
    expect(result.signal?.observationIds).toEqual(["introduction", "retrieval"]);
    expect(result.metrics.find((metric) => metric.key === "prediction-accuracy")).toMatchObject({
      numerator: 0,
      denominator: 0,
      rate: null,
    });
  });
});
