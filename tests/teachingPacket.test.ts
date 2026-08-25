import { describe, expect, it } from "vitest";
import {
  buildTeachingFrontier,
  type GraphifyGraph,
  type TeachingSliceDefinition,
} from "../src/development/learning-harness/teaching.js";
import { buildLearningGraph } from "../src/development/learning-harness/learningHarness.js";

const definition = (
  overrides: Partial<TeachingSliceDefinition> = {},
): TeachingSliceDefinition => ({
  id: "job-flow",
  title: "Job flow",
  objective: "Trace the job.",
  conceptIds: ["dependency-injection"],
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  boundary: "Application coordinates.",
  failurePath: "Processing fails.",
  proof: "Job tests.",
  visual: {
    questionKind: "call-flow",
    question: "How does the job flow through the application?",
    focus: "The application call path",
    highlightedPath: ["processIfcJob"],
    applicationQuestion: "Which call would stop if the repository were unavailable?",
  },
  ...overrides,
});

const learningGraph = () => buildLearningGraph([], [], undefined, [
  { id: "dependency-injection", label: "Dependency injection" },
]);

describe("teaching packet interface", () => {
  it("builds the final packet directly from Graphify data and a teaching definition", () => {
    const graph: GraphifyGraph = {
      nodes: [{
        id: "job",
        label: "processIfcJob()",
        source_file: "src/application/jobs/processIfcJob.ts",
        source_location: "L1",
      }],
      links: [],
    };

    const [packet] = buildTeachingFrontier(graph, learningGraph(), [definition()]);

    expect(packet).toMatchObject({
      sliceId: "job-flow",
      representation: { kind: "call-tree" },
      source: { missingAnchors: [], omittedAnchors: [] },
      capabilityEvidence: false,
    });
  });

  it("hides scratch and Graphify-memory nodes from the final packet", () => {
    const graph: GraphifyGraph = {
      nodes: [
        { id: "production", label: "processIfcJob()", source_file: "src/application/jobs/processIfcJob.ts" },
        { id: "scratch", label: "draft", source_file: ".scratch/draft.md" },
        { id: "memory", label: "old answer", source_file: "graphify-out/memory/query.md" },
      ],
      links: [{ source: "scratch", target: "production", relation: "references" }],
    };

    const [packet] = buildTeachingFrontier(graph, learningGraph(), [definition()]);

    expect(packet?.representation.graphNodes.map((node) => node.id)).toEqual(["production"]);
    expect(packet?.representation.graphEdges).toEqual([]);
  });

  it("keeps the visual attention budget while reporting omitted source anchors", () => {
    const graph: GraphifyGraph = {
      nodes: Array.from({ length: 9 }, (_, index) => ({
        id: `node-${index}`,
        label: index === 0 ? "processIfcJob()" : `node${index}()`,
        source_file: `src/application/jobs/file${index}.ts`,
        source_location: `L${index + 1}`,
      })),
      links: Array.from({ length: 8 }, (_, index) => ({
        source: `node-${index}`,
        target: `node-${index + 1}`,
        relation: "calls",
      })),
    };
    const codeAnchors = graph.nodes.map((node) => node.source_file ?? "");

    const [packet] = buildTeachingFrontier(graph, learningGraph(), [definition({
      codeAnchors,
      visual: {
        questionKind: "time-flow",
        question: "How does the verification job move over time?",
        focus: "Durable identity before asynchronous processing",
        highlightedPath: ["processIfcJob"],
        applicationQuestion: "What remains available when processing fails?",
      },
    })]);

    expect(packet?.representation.kind).toBe("sequence");
    expect(packet?.representation.graphNodes).toHaveLength(7);
    expect(packet?.source.omittedAnchors).toEqual(codeAnchors.slice(7));
  });

  it.each([
    ["value-shape", "object-shape"],
    ["time-flow", "sequence"],
    ["ownership", "file-tree"],
    ["failure", "expected-vs-actual"],
  ] as const)("selects %s questions as %s representations", (questionKind, expected) => {
    const graph: GraphifyGraph = {
      nodes: [{ id: "job", label: "processIfcJob()", source_file: "src/application/jobs/processIfcJob.ts" }],
      links: [],
    };

    const [packet] = buildTeachingFrontier(graph, learningGraph(), [definition({
      visual: { ...definition().visual, questionKind },
    })]);

    expect(packet?.representation.kind).toBe(expected);
  });

  it("reserves a visual node for every source stage before adding detail", () => {
    const anchors = Array.from({ length: 5 }, (_, index) => `src/stage-${index}.ts`);
    const graph: GraphifyGraph = {
      nodes: anchors.flatMap((source_file, index) => [
        { id: `file-${index}`, label: `stage-${index}.ts`, source_file, source_location: "L1" },
        { id: `detail-${index}`, label: `detail${index}()`, source_file, source_location: "L10" },
      ]),
      links: [],
    };

    const [packet] = buildTeachingFrontier(graph, learningGraph(), [definition({
      codeAnchors: anchors,
      visual: {
        questionKind: "time-flow",
        question: "How does the value cross all five stages?",
        focus: "End-to-end coverage",
        highlightedPath: ["stage 0", "stage 1", "stage 2", "stage 3", "stage 4", "detail4"],
        applicationQuestion: "Which stage owns the final value?",
      },
    })]);
    const representedSources = new Set(packet?.representation.graphNodes.map((node) => node.source_file));

    expect(anchors.every((anchor) => representedSources.has(anchor))).toBe(true);
    expect(packet?.representation.graphNodes.some((node) => node.label === "detail4()" )).toBe(true);
    expect(packet?.representation.graphNodes.some((node) => node.label === "detail0()" )).toBe(false);
    expect(packet?.source.omittedAnchors).toEqual([]);
  });

  it("orders final packets by unresolved concepts and valid source anchors", () => {
    const graph: GraphifyGraph = {
      nodes: [{ id: "job", label: "processIfcJob()", source_file: "src/application/jobs/processIfcJob.ts" }],
      links: [],
    };

    const packets = buildTeachingFrontier(graph, learningGraph(), [
      definition({ id: "missing", title: "Missing", codeAnchors: ["src/missing.ts"] }),
      definition({ id: "available", title: "Available" }),
    ]);

    expect(packets.map((packet) => packet.sliceId)).toEqual(["available", "missing"]);
  });
});
