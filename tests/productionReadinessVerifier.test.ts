import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRODUCTION_READINESS_PHASES,
  runProductionReadinessVerifier,
  type VerificationRunner,
} from "../src/verifier/productionReadinessVerifier.js";

const successfulRunner: VerificationRunner = async () => ({
  outcome: "passed",
  exitCode: 0,
  output: "all good",
});

describe("production readiness verifier", () => {
  it("proves the public CLI success and every failure classification with persisted sanitized evidence", async () => {
    const cases = [
      ["success", 0, "passed"],
      ["type_failure", 1, "type_failure"],
      ["test_failure", 1, "test_failure"],
      ["timeout", 1, "timeout"],
      ["leaked_process", 1, "leaked_process"],
      ["missing_fixture", 1, "missing_fixture"],
    ] as const;
    for (const [fixture, expectedExit, expectedOutcome] of cases) {
      const evidenceDirectory = await mkdtemp(join(tmpdir(), `production-readiness-cli-${fixture}-`));
      const cli = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/verify-production-readiness.ts", `--evidence=${evidenceDirectory}`], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test", PRODUCTION_READINESS_TEST_FIXTURE: fixture },
        timeout: 15_000,
      });
      expect(cli.status, `${fixture}: ${cli.stdout}\n${cli.stderr}`).toBe(expectedExit);
      const files = (await readdir(evidenceDirectory)).filter((file) => file.endsWith(".json") && file !== "index.json");
      expect(files).toHaveLength(1);
      const evidence = await readFile(join(evidenceDirectory, files[0]!), "utf8");
      expect(JSON.parse(evidence).result.outcome).toBe(expectedOutcome);
      expect(evidence).not.toMatch(/SELECT|INSERT|UPDATE|DELETE|C:\\|node_modules|\bat\s+.+\(/i);
      await rm(evidenceDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("reports every bounded non-topology phase and writes no sensitive output on success", async () => {
    const result = await runProductionReadinessVerifier({
      runner: successfulRunner,
      fixtureAvailable: async () => true,
      cleanup: async () => ({ leakedProcesses: [] }),
      now: clock(),
    });

    expect(result.outcome).toBe("passed");
    expect(result.phases.map((phase) => phase.id)).toEqual(PRODUCTION_READINESS_PHASES.map((phase) => phase.id));
    expect(result.phases.every((phase) => phase.startedAt && phase.finishedAt && phase.durationMs >= 0)).toBe(true);
    expect(result.failure).toBeNull();
  });

  it.each([
    ["typecheck", "type_failure"],
    ["focused-public-seam", "test_failure"],
    ["full-regression", "test_failure"],
    ["http-end-to-end", "test_failure"],
  ] as const)("classifies a failed %s phase as %s", async (phaseId, expectedOutcome) => {
    const result = await runProductionReadinessVerifier({
      runner: async (phase) => phase.id === phaseId
        ? { outcome: "failed", exitCode: 1, output: "Assertion failed at C:\\private\\model.ifc:1:2" }
        : successfulRunner(phase),
      fixtureAvailable: async () => true,
      cleanup: async () => ({ leakedProcesses: [] }),
      now: clock(),
    });

    expect(result.outcome).toBe(expectedOutcome);
    expect(result.failure).toEqual({ phaseId, outcome: expectedOutcome, diagnostic: "Assertion failed at <path>" });
    expect(result.phases.find((phase) => phase.id === phaseId)?.outcome).toBe("failed");
  });

  it("classifies missing fixture, timeout, and leaked process without running later product phases", async () => {
    const missingFixture = await runProductionReadinessVerifier({
      runner: successfulRunner,
      fixtureAvailable: async () => false,
      cleanup: async () => ({ leakedProcesses: [] }),
      now: clock(),
    });
    expect(missingFixture.outcome).toBe("missing_fixture");

    const timeout = await runProductionReadinessVerifier({
      runner: async () => ({ outcome: "timeout", exitCode: null, output: "timed out" }),
      fixtureAvailable: async () => true,
      cleanup: async () => ({ leakedProcesses: [] }),
      now: clock(),
    });
    expect(timeout.outcome).toBe("timeout");

    const leaked = await runProductionReadinessVerifier({
      runner: successfulRunner,
      fixtureAvailable: async () => true,
      cleanup: async () => ({ leakedProcesses: ["node 123"] }),
      now: clock(),
    });
    expect(leaked.outcome).toBe("leaked_process");
    expect(leaked.failure?.diagnostic).toBe("Cleanup found 1 leaked process(es).");
  });

  it("redacts SQL and credential-bearing diagnostic output", async () => {
    const result = await runProductionReadinessVerifier({
      runner: async (phase) => phase.id === "typecheck"
        ? { outcome: "failed", exitCode: 1, output: "SELECT * FROM private_ifc; token=not-for-evidence" }
        : successfulRunner(phase),
      fixtureAvailable: async () => true,
      cleanup: async () => ({ leakedProcesses: [] }),
      now: clock(),
    });
    expect(result.failure?.diagnostic).toBe("Command output contained SQL and was redacted.");
  });
});

function clock(): () => Date {
  let milliseconds = 0;
  return () => new Date((milliseconds += 1000));
}
