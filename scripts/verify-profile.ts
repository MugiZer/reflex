import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  TEST_INVENTORY,
  VERIFICATION_PROFILES,
  selectVerificationProfile,
  validateProfileInventory,
  type VerificationProfileId,
} from "../src/verifier/verificationProfiles.js";

const profileId = process.argv[2] as VerificationProfileId | undefined;
if (!profileId || !(profileId in VERIFICATION_PROFILES) || profileId === "release") {
  throw new Error("Usage: tsx scripts/verify-profile.ts <fast|integration|numerical>");
}

const discoveredFiles = execFileSync("rg", ["--files", "tests", "-g", "*.test.ts"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => file.replaceAll("\\", "/"));
const entries = selectVerificationProfile(profileId);
validateProfileInventory(TEST_INVENTORY, discoveredFiles);

const profile = VERIFICATION_PROFILES[profileId];
console.log(`PROFILE ${profile.id}: ${profile.purpose}`);
console.log(`INVENTORY ${entries.length} test file(s); maxWorkers=${profile.maxWorkers}; budget=${profile.budgetMs}ms`);
for (const entry of entries) console.log(`SELECTED ${entry.file} deps=${entry.dependencies.join("+") || "none"} worker=${entry.workerMode} resource=${entry.sharedResource}`);

const startedAt = Date.now();
let timedOut = false;
let cleanupPromise: Promise<void> | null = null;
const child = spawn(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", `--maxWorkers=${profile.maxWorkers}`, ...entries.map((entry) => entry.file)], {
  cwd: process.cwd(), shell: false, stdio: "inherit",
});
const timeout = setTimeout(() => {
  timedOut = true;
  console.error(`RESULT ${profile.id} unexecuted: profile budget exceeded.`);
  cleanupPromise = killProcessTree(child.pid);
}, profile.budgetMs);
child.once("error", (error) => {
  clearTimeout(timeout);
  console.error(`RESULT ${profile.id} unexecuted: ${error.message}`);
  process.exitCode = 1;
});
child.once("close", async (code) => {
  clearTimeout(timeout);
  if (timedOut) await (cleanupPromise ?? killProcessTree(child.pid));
  const elapsed = Date.now() - startedAt;
  const outcome = timedOut ? "unexecuted" : code === 0 && elapsed <= profile.budgetMs ? "passed" : "failed";
  console.log(`RESULT ${profile.id} ${outcome} ${elapsed}ms`);
  if (outcome !== "passed") process.exitCode = 1;
});

async function killProcessTree(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (process.platform !== "win32") {
    try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ }
    return;
  }
  await new Promise<void>((done) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: false });
    taskkill.once("close", () => done());
    taskkill.once("error", () => done());
  });
}
