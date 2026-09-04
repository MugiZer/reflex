import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  runProductionReadinessVerifier,
  type ProductionReadinessPhase,
type VerificationRunnerResult,
} from "../src/verifier/productionReadinessVerifier.js";

type TestFixture = "success" | "type_failure" | "test_failure" | "timeout" | "leaked_process" | "missing_fixture";

const root = process.cwd();
const evidenceDirectory = resolve(argumentValue("--evidence") ?? ".scratch/production-readiness-checkup/evidence");
const activeChildren = new Map<number, ReturnType<typeof spawn>>();
const testFixture = process.env.PRODUCTION_READINESS_TEST_FIXTURE as TestFixture | undefined;

if (testFixture && process.env.NODE_ENV !== "test") {
  throw new Error("PRODUCTION_READINESS_TEST_FIXTURE is only available in NODE_ENV=test.");
}

const result = await runProductionReadinessVerifier({
  runner: testFixture ? runTestFixture : runPhase,
  fixtureAvailable: async () => testFixture ? testFixture !== "missing_fixture" : existsSync(resolve(root, "tests/milestone5Verifier.test.ts")),
  cleanup: async () => {
    if (testFixture === "leaked_process") return { leakedProcesses: ["test-fixture-child"] };
    const leakedProcesses = [...activeChildren.keys()].map((pid) => `pid ${pid}`);
    await Promise.all([...activeChildren.keys()].map(killProcessTree));
    activeChildren.clear();
    return { leakedProcesses };
  },
});

const evidencePath = await writeEvidence(evidenceDirectory, result);
for (const phase of result.phases) {
  console.log(`${phase.outcome.toUpperCase()} ${phase.id} ${phase.durationMs}ms — ${phase.scope}${phase.diagnostic ? `: ${phase.diagnostic}` : ""}`);
}
console.log(`EVIDENCE ${relative(root, evidencePath)}`);
if (result.outcome !== "passed") process.exitCode = 1;

async function runTestFixture(phase: ProductionReadinessPhase): Promise<VerificationRunnerResult> {
  if (testFixture === "type_failure" && phase.id === "typecheck") return failedFixture("typecheck failed at C:\\private\\model.ifc:1:2");
  if (testFixture === "test_failure" && phase.id === "focused-public-seam") return failedFixture("Assertion failed at C:\\private\\model.ifc:1:2");
  if (testFixture === "timeout" && phase.id === "typecheck") return { outcome: "timeout", exitCode: null, output: "phase exceeded timeout" };
  return { outcome: "passed", exitCode: 0, output: "test fixture passed" };
}

function failedFixture(output: string): VerificationRunnerResult {
  return { outcome: "failed", exitCode: 1, output };
}

async function runPhase(phase: ProductionReadinessPhase): Promise<VerificationRunnerResult> {
  const command = commandFor(phase.id);
  return await new Promise((resolveResult) => {
    const child = spawn(process.execPath, command, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void killProcessTree(child.pid);
    }, phase.timeoutMs);
    if (child.pid) activeChildren.set(child.pid, child);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.once("error", (error) => { output += error.message; });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (child.pid) activeChildren.delete(child.pid);
      resolveResult({
        outcome: timedOut ? "timeout" : code === 0 ? "passed" : "failed",
        exitCode: code,
        output,
      });
    });
  });
}

function commandFor(phaseId: ProductionReadinessPhase["id"]): string[] {
  if (phaseId === "typecheck") return [resolve("node_modules/typescript/bin/tsc"), "--noEmit"];
  if (phaseId === "focused-public-seam") return [resolve("node_modules/vitest/vitest.mjs"), "run", "tests/milestone5Verifier.test.ts", "tests/reviewWorkflowRegression.test.ts", "tests/localhostAppLifecycle.test.ts", "tests/paidPilotSafety.test.ts"];
  if (phaseId === "full-regression") return [resolve("node_modules/vitest/vitest.mjs"), "run", "--maxWorkers=1", "--exclude", "tests/**/*topology*.test.ts", "--exclude", "tests/**/*Topology*.test.ts", "--exclude", "tests/component*.test.ts", "--exclude", "tests/provenPythonTopologyWorker.integration.test.ts"];
  if (phaseId === "http-end-to-end") return [resolve("node_modules/vitest/vitest.mjs"), "run", "tests/milestone5Verifier.test.ts"];
  throw new Error(`No executable command is registered for ${phaseId}.`);
}

async function writeEvidence(directory: string, value: unknown): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `verification-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}.json`);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify({ schema: "production-readiness-verification/v1", result: value }, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  const indexPath = join(directory, "index.json");
  const previous = await readEvidenceIndex(indexPath);
  await writeFile(`${indexPath}.tmp-${process.pid}`, `${JSON.stringify({ schema: "production-readiness-evidence-index/v1", artifacts: [...previous, relative(directory, path)] }, null, 2)}\n`, "utf8");
  await rename(`${indexPath}.tmp-${process.pid}`, indexPath);
  return path;
}

async function readEvidenceIndex(path: string): Promise<string[]> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { artifacts?: unknown };
    return Array.isArray(value.artifacts) ? value.artifacts.filter((artifact): artifact is string => typeof artifact === "string") : [];
  } catch { return []; }
}

function argumentValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function killProcessTree(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (process.platform !== "win32") {
    try { process.kill(pid, "SIGTERM"); } catch { /* the process already exited */ }
    return;
  }
  await new Promise<void>((resolveKill) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: false });
    taskkill.once("close", () => resolveKill());
    taskkill.once("error", () => resolveKill());
  });
}
