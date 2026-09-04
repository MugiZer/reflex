import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  applyLearningSessionEvent,
  createLearningSession,
  type LearningSession,
} from "../src/development/learning-harness/session.js";

type StoredSession = {
  schemaVersion: 1;
  taskId: string;
  conceptId: string;
  session: LearningSession;
};

const args = process.argv.slice(2);
const divider = args.indexOf("--");
if (divider < 0) throw new Error("Use: learning:observe <session-id> <task-id> <concept-id> <prediction> <matches> -- <command>");
const [id, taskId, conceptId, expectedResult, matches] = args.slice(0, divider);
const command = args.slice(divider + 1);
if (![id, taskId, conceptId, expectedResult].every((value) => value?.trim()) || command.length === 0) {
  throw new Error("A session id, task id, concept id, prediction, and command are required");
}
if (matches !== "true" && matches !== "false") throw new Error("matches must be true or false");

const root = process.cwd();
const sessionsDir = join(root, "learning", "sessions");
const path = join(sessionsDir, `${id}.json`);
try {
  await access(path);
  throw new Error(`Session ${id} already exists; recorded observations are immutable.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const now = new Date().toISOString();
const commandText = command.join(" ");
const sourceKind = commandText.includes("typecheck") ? "typecheck"
  : commandText.includes("lint") ? "lint"
    : commandText.includes("test") ? "test"
      : "runtime";
const npmCli = process.env.npm_execpath;
if (command[0] === "npm" && !npmCli) throw new Error("npm must invoke learning:observe so its executable path is available");
const executable = command[0] === "npm" ? process.execPath : command[0]!;
const commandArgs = command[0] === "npm" ? [npmCli!, ...command.slice(1)] : command.slice(1);
const exitCode = await new Promise<number>((resolve, reject) => {
  const child = spawn(executable, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
const session = applyLearningSessionEvent(
  createLearningSession({ id: id!, task: taskId!, startedAt: now }),
  { type: "prediction", input: { expectedResult: expectedResult!, command: commandText, predictedAt: now } },
);
const observed = applyLearningSessionEvent(session, {
  type: "observation",
  input: {
    actualResult: `Command exited with code ${exitCode}.`,
    source: { kind: sourceKind, command: commandText },
    matchesPrediction: matches === "true",
    observedAt: new Date().toISOString(),
  },
});
await mkdir(sessionsDir, { recursive: true });
await writeFile(path, `${JSON.stringify({ schemaVersion: 1, taskId, conceptId, session: observed } satisfies StoredSession, null, 2)}\n`);
process.exitCode = exitCode;
