import { join } from "node:path";
import { pathToFileURL } from "node:url";

const candidate = process.argv[2];
if (!candidate) throw new Error("Candidate path is required");

const harness = await import(pathToFileURL(join(candidate, "src/development/learning-harness/learningHarness.ts")).href);
const taskContext = await import(pathToFileURL(join(candidate, "src/development/learning-harness/taskContext.ts")).href);

const assessment = (conceptId: string, id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  recordType: "completed-concept-assessment" as const,
  conceptId,
  capabilityBoundary: "Explain the concept in the task path.",
  demonstration: "Explained the concept and its ownership.",
  kind: "trace" as const,
  outcome: "passed" as const,
  independence: "unprompted" as const,
  assistanceLevel: "none" as const,
  sessionId: `${id}-session`,
  assessedAt: "2026-08-20T00:00:00.000Z",
  rubricVersion: "1",
  delayedRetrieval: false,
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  ...overrides,
});

const graphify = {
  nodes: [
    { id: "process", label: "processIfcJob()", source_file: "src/application/jobs/processIfcJob.ts", source_location: "L1" },
    { id: "repository", label: "JobRepository", source_file: "src/domain/jobs/jobRepository.ts", source_location: "L1" },
    { id: "unrelated", label: "renderReport()", source_file: "src/app/report.ts", source_location: "L1" },
  ],
  links: [{ source: "process", target: "repository", relation: "calls" }],
};

const task = {
  id: "task-1",
  title: "Trace the repository boundary",
  description: "Understand dependency injection at the repository boundary.",
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  changedFiles: ["src/domain/jobs/jobRepository.ts"],
};

const run = (fn: () => void): { status: "PASS" | "FAIL"; observation: string } => {
  try {
    fn();
    return { status: "PASS", observation: "Task-context behavior matched the public contract" };
  } catch (error) {
    return { status: "FAIL", observation: error instanceof Error ? error.message : String(error) };
  }
};

const results = {
  "assembles-task-relative-neighborhood": run(() => {
    const graph = harness.buildLearningGraph([], [], undefined, [
      { id: "dependency-injection", label: "Dependency injection" },
      { id: "repository-boundary", label: "Repository boundary", prerequisites: ["dependency-injection"] },
    ]);
    graph.concepts.forEach((concept: { codeAnchors: string[]; id: string }) => {
      concept.codeAnchors = concept.id === "repository-boundary"
        ? ["src/domain/jobs/jobRepository.ts"]
        : [...task.codeAnchors];
    });
    const packet = taskContext.buildTaskContext({ task, graphify, learningGraph: graph });
    if (packet.concepts.length !== 2) throw new Error("Expected two task-linked concepts");
    if (packet.graphify.nodes.map((node: { id: string }) => node.id).join(",") !== "process,repository") throw new Error("Unexpected Graphify neighborhood");
    if (packet.graphify.links.length !== 1) throw new Error("Unrelated Graphify link leaked into packet");
  }),
  "classifies-recency-and-prerequisite-gap": run(() => {
    const graph = harness.buildLearningGraph([], [
      assessment("known", "known-explanation", { kind: "explanation", assessedAt: "2026-08-10T00:00:00.000Z" }),
      assessment("known", "known-retrieval", { kind: "delayed-retrieval", delayedRetrieval: true, sessionId: "known-retrieval", assessedAt: "2026-08-20T00:00:00.000Z" }),
      assessment("dependent", "dependent-explanation", { kind: "explanation", assessedAt: "2026-08-24T00:00:00.000Z" }),
    ], undefined, [
      { id: "known", label: "Known concept" },
      { id: "dependent", label: "Dependent concept", prerequisites: ["missing-prerequisite"] },
    ]);
    const packet = taskContext.buildTaskContext({ task, graphify, learningGraph: graph, options: { now: "2026-08-25T00:00:00.000Z" } });
    if (packet.concepts.find((concept: { conceptId: string }) => concept.conceptId === "known")?.familiarity !== "known") throw new Error("Validated concept was not classified known");
    if (packet.prerequisiteGaps[0]?.reason !== "missing-concept") throw new Error("Missing prerequisite was not exposed");
  }),
  "returns-one-bounded-attention-target": run(() => {
    const graph = harness.buildLearningGraph([], [], undefined, Array.from({ length: 10 }, (_, index) => ({
      id: `concept-${index}`,
      label: `Concept ${index}`,
    })));
    graph.concepts.forEach((concept: { codeAnchors: string[] }) => { concept.codeAnchors = [...task.codeAnchors]; });
    const packet = taskContext.buildTaskContext({ task, graphify, learningGraph: graph, options: { maxConcepts: 3, maxGraphNodes: 2 } });
    if (packet.concepts.length !== 3) throw new Error("Concept selection exceeded configured bound");
    if (packet.graphify.nodes.length !== 2) throw new Error("Graph selection exceeded configured bound");
    if (!packet.attentionTarget || Array.isArray(packet.attentionTarget)) throw new Error("Expected exactly one attention target");
  }),
};

console.log(JSON.stringify(results));
