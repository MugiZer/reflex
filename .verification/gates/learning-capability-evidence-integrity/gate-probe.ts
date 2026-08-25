import { pathToFileURL } from "node:url";
import { join } from "node:path";

const candidate = process.argv[2];
const harness = await import(pathToFileURL(join(candidate, "src/development/learning-harness/learningHarness.ts")).href);

const results: Record<string, { status: "PASS" | "FAIL"; observation: string }> = {};
const check = (id: string, claim: string, assertion: () => boolean): void => {
  try {
    results[id] = assertion()
      ? { status: "PASS", observation: claim }
      : { status: "FAIL", observation: `Assertion failed: ${claim}` };
  } catch (error) {
    results[id] = { status: "FAIL", observation: error instanceof Error ? error.message : String(error) };
  }
};

const concept = (id: string, status = "seed", prerequisites: string[] = [], evidence: unknown[] = []) => ({
  id,
  label: id,
  aliases: [],
  status,
  prerequisites,
  codeAnchors: [],
  sourceClaims: [],
  evidence,
});

check("legacy-observation-is-non-earning", "Legacy observations remain available but do not award capability status", () => {
  const graph = harness.buildLearningGraph([], [{
    id: "legacy-1",
    conceptId: "concept",
    kind: "trace",
    description: "An incomplete trace",
    demonstratedAt: "2026-08-24T10:00:00.000Z",
  }], undefined, [{ id: "concept", label: "Concept" }]);
  return graph.concepts[0].status === "seed" && graph.concepts[0].evidence.length === 1;
});

check("delayed-independent-retrieval-earns-understood", "Independent delayed retrieval after introduction earns understood", () => {
  const introduced = {
    id: "assessment-1",
    recordType: "completed-concept-assessment",
    conceptId: "concept",
    capabilityBoundary: "Explain the mechanism",
    demonstration: "Explained it",
    kind: "explanation",
    outcome: "passed",
    independence: "unprompted",
    assistanceLevel: "none",
    sessionId: "session-1",
    assessedAt: "2026-08-20T10:00:00.000Z",
    rubricVersion: "1",
    delayedRetrieval: false,
    codeAnchors: ["src/example.ts"],
  };
  const delayed = { ...introduced, id: "assessment-2", kind: "delayed-retrieval", sessionId: "session-2", assessedAt: "2026-08-24T10:00:00.000Z", delayedRetrieval: true };
  const graph = { schemaVersion: 1, concepts: [concept("concept", "introduced", [], [introduced])] };
  return harness.reviewCapabilityAssessment(graph, delayed).decision.resultingStatus === "understood";
});

check("partial-assessment-does-not-demote", "One partial assessment cannot automatically demote an earned status", () => {
  const graph = { schemaVersion: 1, concepts: [concept("concept", "understood")] };
  const partial = {
    id: "assessment-partial",
    recordType: "completed-concept-assessment",
    conceptId: "concept",
    capabilityBoundary: "Explain the mechanism",
    demonstration: "Incomplete explanation",
    kind: "explanation",
    outcome: "partial",
    independence: "unprompted",
    assistanceLevel: "none",
    sessionId: "session-3",
    assessedAt: "2026-08-24T10:00:00.000Z",
    rubricVersion: "1",
    delayedRetrieval: false,
    codeAnchors: ["src/example.ts"],
  };
  return harness.reviewCapabilityAssessment(graph, partial).decision.resultingStatus === "understood";
});

check("weak-prerequisite-caps-promotion", "A concept cannot outrun a weaker prerequisite", () => {
  const graph = { schemaVersion: 1, concepts: [concept("prerequisite", "practicing"), concept("concept", "practicing", ["prerequisite"])] };
  const transfer = {
    id: "assessment-transfer",
    recordType: "completed-concept-assessment",
    conceptId: "concept",
    capabilityBoundary: "Apply the mechanism elsewhere",
    demonstration: "Applied independently",
    kind: "transfer",
    outcome: "passed",
    independence: "unprompted",
    assistanceLevel: "none",
    sessionId: "session-4",
    assessedAt: "2026-08-24T10:00:00.000Z",
    rubricVersion: "1",
    delayedRetrieval: false,
    codeAnchors: ["src/example.ts"],
    transferContext: "A different repository boundary",
  };
  return harness.reviewCapabilityAssessment(graph, transfer).decision.resultingStatus === "practicing";
});

process.stdout.write(JSON.stringify(results));
