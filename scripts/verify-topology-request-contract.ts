import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** Ticket 06's focused contract verifier. */
const result = spawnSync(
  process.execPath,
  [
    join("node_modules", "vitest", "vitest.mjs"),
    "run",
    "tests/topologyAnalysisRequest.test.ts",
    "tests/topologyHardening.test.ts",
    "tests/sqliteJobRepository.test.ts",
    "--reporter=verbose",
  ],
  { stdio: "inherit", shell: false },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
