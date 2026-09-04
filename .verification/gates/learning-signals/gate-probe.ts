import { pathToFileURL } from "node:url";
import { join } from "node:path";

const candidate = process.argv[2];
const signals = await import(pathToFileURL(join(candidate, "src/development/learning-harness/signals.ts")).href);
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

check("repeated-mismatch-and-tested-prediction-rate", "Repeated misconceptions produce one signal and use tested predictions as the denominator", () => {
  const graph = harness.buildLearningGraph([], [], undefined, [
    { id: "concept", label: "Concept" },
  ]);
  const result = signals.evaluateLearningSignals({
    graph,
    scope: { taskId: "task-1", conceptIds: ["concept"] },
    observations: [
      { id: "prediction-1", conceptId: "concept", taskId: "task-1", observedAt: "2026-08-23T10:00:00.000Z", kind: "prediction", tested: true, correct: false, mismatch: "misconception" },
      { id: "prediction-2", conceptId: "concept", taskId: "task-1", observedAt: "2026-08-24T10:00:00.000Z", kind: "prediction", tested: true, correct: false, mismatch: "misconception" },
      { id: "prediction-3", conceptId: "concept", taskId: "task-1", observedAt: "2026-08-25T09:00:00.000Z", kind: "prediction", tested: false },
    ],
    asOf: "2026-08-25T10:00:00.000Z",
  });
  const metric = result.metrics.find((item: { key: string }) => item.key === "prediction-accuracy");
  return result.signal?.kind === "repeated-mismatch"
    && result.signal.observationIds.length === 2
    && metric?.numerator === 0
    && metric.denominator === 2
    && metric.rate === 0;
});

process.stdout.write(JSON.stringify(results));
