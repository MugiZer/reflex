import { describe, expect, it } from "vitest";
import {
  buildTaskContext,
  type TaskContextTask,
} from "../src/development/learning-harness/taskContext.js";
import {
  buildLearningGraph,
  type CompletedConceptAssessment,
  type LearningGraph,
} from "../src/development/learning-harness/learningHarness.js";
import type { GraphifyGraph } from "../src/development/learning-harness/teaching.js";

const task = (overrides: Partial<TaskContextTask> = {}): TaskContextTask => ({
  id: "task-1",
  title: "Trace the repository boundary",
  description: "Understand dependency injection at the repository boundary.",
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  changedFiles: ["src/domain/jobs/jobRepository.ts"],
  ...overrides,
});

const graphify: GraphifyGraph = {
  nodes: [
    { id: "process", label: "processIfcJob()", source_file: "src/application/jobs/processIfcJob.ts", source_location: "L1" },
    { id: "repository", label: "JobRepository", source_file: "src/domain/jobs/jobRepository.ts", source_location: "L1" },
    { id: "unrelated", label: "renderReport()", source_file: "src/app/report.ts", source_location: "L1" },
  ],
  links: [
    { source: "process", target: "repository", relation: "calls" },
  ],
};

const assessment = (
  conceptId: string,
  overrides: Partial<CompletedConceptAssessment> = {},
): CompletedConceptAssessment => ({
  id: `${conceptId}-assessment`,
  recordType: "completed-concept-assessment",
  conceptId,
  capabilityBoundary: "Explain the concept in the task path.",
  demonstration: "Explained the concept and its ownership.",
  kind: "trace",
  outcome: "passed",
  independence: "unprompted",
  assistanceLevel: "none",
  sessionId: `${conceptId}-session`,
  assessedAt: "2026-08-20T00:00:00.000Z",
  rubricVersion: "1",
  delayedRetrieval: false,
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  ...overrides,
});

const withTaskAnchors = (learningGraph: LearningGraph): LearningGraph => ({
  ...learningGraph,
  concepts: learningGraph.concepts.map((concept) => ({
    ...concept,
    codeAnchors: concept.id === "repository-boundary"
      ? ["src/domain/jobs/jobRepository.ts"]
      : ["src/application/jobs/processIfcJob.ts"],
  })),
});

const taskGraph = (learningGraph: LearningGraph = withTaskAnchors(buildLearningGraph([], [], undefined, [
  {
    id: "dependency-injection",
    label: "Dependency injection",
  },
  {
    id: "repository-boundary",
    label: "Repository boundary",
    prerequisites: ["dependency-injection"],
  },
]))) => buildTaskContext({
  task: task(),
  graphify,
  learningGraph,
  options: { now: "2026-08-25T00:00:00.000Z" },
});

describe("task context interface", () => {
  it("assembles relevant concepts and a bounded Graphify neighborhood from task files", () => {
    const packet = taskGraph();

    expect(packet.concepts.map((concept) => concept.conceptId)).toEqual([
      "dependency-injection",
      "repository-boundary",
    ]);
    expect(packet.graphify.nodes.map((node) => node.id)).toEqual(["process", "repository"]);
    expect(packet.graphify.links).toEqual([
      { source: "process", target: "repository", relation: "calls" },
    ]);
    expect(packet.source.unmatchedFiles).toEqual([]);
    expect(packet.capabilityEvidence).toBe(false);
  });

  it("classifies validated state with recency and exposes the weakest prerequisite", () => {
    const learningGraph = withTaskAnchors(buildLearningGraph([], [
      assessment("known", { kind: "explanation", assessedAt: "2026-08-10T00:00:00.000Z" }),
      assessment("known", {
        id: "known-retrieval",
        kind: "delayed-retrieval",
        delayedRetrieval: true,
        sessionId: "known-retrieval-session",
        assessedAt: "2026-08-20T00:00:00.000Z",
      }),
      assessment("dependent", { kind: "explanation", assessedAt: "2026-08-24T00:00:00.000Z" }),
      assessment("fragile", { kind: "explanation", assessedAt: "2026-08-24T00:00:00.000Z" }),
      assessment("stale", { kind: "explanation", assessedAt: "2026-06-01T00:00:00.000Z" }),
      assessment("stale", {
        id: "stale-retrieval",
        kind: "delayed-retrieval",
        delayedRetrieval: true,
        sessionId: "stale-retrieval-session",
        assessedAt: "2026-06-10T00:00:00.000Z",
      }),
    ], undefined, [
      { id: "known", label: "Known concept" },
      { id: "dependent", label: "Dependent concept", prerequisites: ["fragile"] },
      { id: "fragile", label: "Fragile concept" },
      { id: "stale", label: "Stale concept" },
      { id: "new", label: "New concept" },
    ]));

    const packet = buildTaskContext({
      task: task({ codeAnchors: ["src/application/jobs/processIfcJob.ts"], changedFiles: [] }),
      graphify,
      learningGraph,
      options: { now: "2026-08-25T00:00:00.000Z", staleAfterDays: 30 },
    });
    const byId = new Map(packet.concepts.map((concept) => [concept.conceptId, concept]));

    expect(byId.get("known")).toMatchObject({ status: "understood", familiarity: "known", recency: "recent" });
    expect(byId.get("fragile")).toMatchObject({ status: "introduced", familiarity: "fragile", recency: "recent" });
    expect(byId.get("stale")).toMatchObject({ status: "understood", familiarity: "fragile", recency: "stale" });
    expect(byId.get("new")).toMatchObject({ status: "seed", familiarity: "new", recency: "never" });
    expect(packet.prerequisiteGaps).toEqual([
      expect.objectContaining({
        conceptId: "dependent",
        prerequisiteId: "fragile",
        reason: "fragile",
      }),
    ]);
    expect(packet.attentionTarget).toMatchObject({
      kind: "concept",
      conceptId: "fragile",
      reason: "prerequisite-gap",
    });
  });

  it("keeps concept and graph selection bounded while returning one target", () => {
    const seeds = Array.from({ length: 10 }, (_, index) => ({
      id: `concept-${index}`,
      label: `Concept ${index}`,
      codeAnchors: ["src/application/jobs/processIfcJob.ts"],
    }));
    const packet = buildTaskContext({
      task: task({ codeAnchors: ["src/application/jobs/processIfcJob.ts"], changedFiles: [] }),
      graphify: {
        ...graphify,
        nodes: [
          ...graphify.nodes,
          ...Array.from({ length: 10 }, (_, index) => ({
            id: `detail-${index}`,
            label: `detail${index}()`,
            source_file: "src/application/jobs/processIfcJob.ts",
          })),
        ],
      },
      learningGraph: withTaskAnchors(buildLearningGraph([], [], undefined, seeds)),
      options: { now: "2026-08-25T00:00:00.000Z", maxConcepts: 3, maxGraphNodes: 2 },
    });

    expect(packet.concepts).toHaveLength(3);
    expect(packet.graphify.nodes).toHaveLength(2);
    expect(Array.isArray(packet.attentionTarget)).toBe(false);
    expect(packet.attentionTarget).toMatchObject({ kind: "concept" });
  });
});
