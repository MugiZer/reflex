import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Ticket 02's public regression: run the real pinned-worker seam, including
 * malformed output, artifact replay, deadline, cancellation, and child exit.
 */
const result = spawnSync(
  process.execPath,
  [join("node_modules", "vitest", "vitest.mjs"), "run", "tests/provenPythonTopologyWorker.integration.test.ts"],
  { stdio: "inherit", shell: false },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
