import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Ticket 01's authoritative public-boundary regression.
 * Keep this command independent of private fixtures: it exercises the
 * persisted request seam and its review adapter through the real test runner.
 */
const result = spawnSync(
  process.execPath,
  [join("node_modules", "vitest", "vitest.mjs"), "run", "tests/topologyAnalysisRequest.test.ts", "tests/ifcTopologyOpportunity.test.ts"],
  { stdio: "inherit", shell: false },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
