import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assessReleaseVerification,
  validateReleaseEvidence,
  type ReleaseProfileResult,
} from "../src/verifier/releaseVerificationGate.js";
import { TEST_INVENTORY, VERIFICATION_PROFILES } from "../src/verifier/verificationProfiles.js";

const expectedProfiles = ["fast", "integration", "numerical"] as const;

function passing(profile: typeof expectedProfiles[number]): ReleaseProfileResult {
  const selected = TEST_INVENTORY.filter((entry) => entry.profile === profile);
  return {
    profile,
    command: `npm run verify:${profile}`,
    durationMs: 1,
    outcome: "passed",
    counts: { selected: selected.length, passed: selected.length, failed: 0, unexecuted: 0 },
    selectedFiles: selected.map((entry) => entry.file),
    runtimeIdentities: profile === "numerical" ? [{ executable: "python", executableSha256: "pinned-executable", runtimeHash: "pinned-runtime", workerMode: "real-python" }] : [],
    fixtureIdentities: profile === "numerical" ? [{ path: "tests/fixtures/frozen.json", sha256: "fixture" }] : [],
  };
}

describe("release verification gate", () => {
  it("permits GO only when every classified profile executes once and numerical proof used the real worker", () => {
    const assessment = assessReleaseVerification(expectedProfiles.map(passing), TEST_INVENTORY);
    expect(assessment.decision).toBe("GO");
    expect(assessment.counts).toEqual({
      selected: TEST_INVENTORY.length,
      passed: TEST_INVENTORY.length,
      failed: 0,
      unexecuted: 0,
    });
  });

  it("rejects overlapping profiles, skipped numerical proof, and budget overruns without self-certifying", () => {
    const overlap = assessReleaseVerification([...expectedProfiles.map(passing), passing("fast")], TEST_INVENTORY);
    expect(overlap.decision).toBe("NO-GO");
    expect(overlap.reasons.join(" ")).toContain("more than once");

    const skippedNumerical = passing("numerical");
    skippedNumerical.outcome = "unexecuted";
    skippedNumerical.counts = { ...skippedNumerical.counts, passed: 0, unexecuted: skippedNumerical.counts.selected };
    skippedNumerical.runtimeIdentities = [];
    const skipped = assessReleaseVerification([passing("fast"), passing("integration"), skippedNumerical], TEST_INVENTORY);
    expect(skipped.decision).toBe("NOT-PROVEN");

    const overBudget = passing("fast");
    overBudget.durationMs = VERIFICATION_PROFILES.fast.budgetMs + 1;
    const overBudgetAssessment = assessReleaseVerification([overBudget, passing("integration"), passing("numerical")], TEST_INVENTORY);
    expect(overBudgetAssessment.decision).toBe("NO-GO");
    expect(overBudgetAssessment.reasons.join(" ")).toContain("budget");
  });

  it("rejects stale or incomplete GO evidence", () => {
    const assessment = assessReleaseVerification(expectedProfiles.map(passing), TEST_INVENTORY);
    const evidence = {
      schema: "release-verification/v1",
      tested: { revision: "revision", committedTree: "tree", workingTreeSha256: "worktree" },
      workingDirectory: "C:/dev/conformity",
      profiles: expectedProfiles.map(passing),
      assessment,
    };
    expect(validateReleaseEvidence(evidence, { revision: "revision", committedTree: "tree", workingTreeSha256: "worktree" }).valid).toBe(true);
    expect(validateReleaseEvidence({ ...evidence, tested: { ...evidence.tested, revision: "stale" } }, { revision: "revision", committedTree: "tree", workingTreeSha256: "worktree" }).valid).toBe(false);
    expect(validateReleaseEvidence({ ...evidence, profiles: evidence.profiles.slice(0, 2) }, { revision: "revision", committedTree: "tree", workingTreeSha256: "worktree" }).valid).toBe(false);
    expect(validateReleaseEvidence({ ...evidence, profiles: [passing("fast"), passing("fast"), passing("numerical")] }, { revision: "revision", committedTree: "tree", workingTreeSha256: "worktree" }).valid).toBe(false);
  });

  it("publishes a non-GO artifact for a controlled skipped-worker mutation", async () => {
    const evidenceDirectory = await mkdtemp(join(tmpdir(), "release-verification-"));
    try {
      const cli = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/verify-release.ts", "--known-bad=skip-worker", `--evidence=${evidenceDirectory}`], { cwd: resolve("."), encoding: "utf8", shell: false, timeout: 15_000 });
      expect(cli.status).toBe(1);
      expect(`${cli.stdout}\n${cli.stderr}`).toContain("NOT-PROVEN");
      const artifact = (await readdir(evidenceDirectory)).find((file) => file.endsWith(".json"));
      expect(artifact).toBeTruthy();
      const evidence = JSON.parse(await readFile(join(evidenceDirectory, artifact!), "utf8"));
      expect(evidence.assessment.decision).toBe("NOT-PROVEN");
      expect(evidence).toMatchObject({
        schema: "release-verification/v1",
        workingDirectory: expect.any(String),
        tested: { revision: expect.any(String), committedTree: expect.any(String), workingTreeSha256: expect.any(String) },
      });
      expect(evidence.profileInventory).toHaveLength(TEST_INVENTORY.length);
      expect(evidence.profiles.map((profile: { profile: string }) => profile.profile)).toEqual(["fast", "integration", "numerical"]);
    } finally {
      await rm(evidenceDirectory, { recursive: true, force: true });
    }
  }, 20_000);
});
