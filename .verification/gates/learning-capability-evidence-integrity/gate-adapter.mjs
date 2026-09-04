import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const evidenceRoot = process.env.PROTECTED_VERIFIER_EVIDENCE;
const candidate = process.env.PROTECTED_VERIFIER_CANDIDATE;
const requiredCases = JSON.parse(process.env.PROTECTED_VERIFIER_CASES ?? "[]");

if (!evidenceRoot || !candidate) {
  throw new Error("Protected verifier environment is incomplete");
}

const probe = await run(candidate, [
  "npx",
  "tsx",
  join(process.env.PROTECTED_VERIFIER_GATE, "gate-probe.ts"),
  candidate,
]);

let observations = {};
try {
  observations = JSON.parse(probe.stdout.trim());
} catch {
  observations = Object.fromEntries(requiredCases.map((id) => [id, {
    status: "FAIL",
    observation: probe.stderr || probe.stdout || "Capability evidence probe produced no result",
  }]));
}

const cases = requiredCases.map((id) => ({
  id,
  status: observations[id]?.status === "PASS" ? "PASS" : "FAIL",
  observation: observations[id]?.observation ?? `Missing probe result for ${id}`,
}));

await mkdir(evidenceRoot, { recursive: true });
await writeFile(join(evidenceRoot, "gate-result.json"), JSON.stringify({
  version: 1,
  gateId: "learning-capability-evidence-integrity-v3",
  cases,
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
    child.on("error", (error) => resolve({ stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", () => resolve({ stdout, stderr }));
  });
}
