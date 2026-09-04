import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const evidenceRoot = process.env.PROTECTED_VERIFIER_EVIDENCE;
const candidate = process.env.PROTECTED_VERIFIER_CANDIDATE;
const requiredCases = JSON.parse(process.env.PROTECTED_VERIFIER_CASES ?? "[]");

if (!evidenceRoot || !candidate) {
  throw new Error("Protected verifier environment is incomplete");
}

const result = await run(candidate, ["npx", "vitest", "run", "tests/learningSession.test.ts"]);
const passed = result.exitCode === 0;
const observation = passed
  ? "The public session test recorded prediction, reality, and mismatch."
  : `${result.stderr || result.stdout || "The public session test failed."}`.trim();

await mkdir(evidenceRoot, { recursive: true });
await writeFile(join(evidenceRoot, "gate-result.json"), JSON.stringify({
  version: 1,
  gateId: "learning-harness-session-evidence-v1",
  cases: requiredCases.map((id) => ({
    id,
    status: passed ? "PASS" : "FAIL",
    observation,
  })),
}, null, 2));

function run(cwd, args) {
  return new Promise((resolve) => {
    const executable = process.platform === "win32" ? "cmd.exe" : args[0];
    const executableArgs = process.platform === "win32" ? ["/d", "/s", "/c", ...args] : args.slice(1);
    const child = spawn(executable, executableArgs, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
