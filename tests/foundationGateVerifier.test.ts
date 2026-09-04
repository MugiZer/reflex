import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assessGate,
  commandRegistrationIsValid,
  FOUNDATION_COMMAND,
  FOUNDATION_SCHEMA,
  FOUNDATION_GATES,
  gateForNumber,
  validateEvidenceForPreflight,
  validateGateRegistry,
} from "../src/verifier/foundationGateVerifier.js";

describe("component topology foundation gate verifier", () => {
  it("registers all three gates with non-empty public proof selections", () => {
    expect(validateGateRegistry()).toEqual([]);
    expect(Object.keys(FOUNDATION_GATES)).toEqual(["1", "2", "3"]);
    expect(gateForNumber("1")?.id).toBe("FND-G1");
    expect(gateForNumber("2")?.id).toBe("FND-G2");
    expect(gateForNumber("3")?.id).toBe("FND-G3");
    expect(gateForNumber("4")).toBeNull();
  });

  it("classifies missing, failed, and unexecuted proofs as non-green", () => {
    const gate = gateForNumber("2")!;
    const passing = Object.fromEntries(gate.proofs.map((proof) => [proof.id, "passed" as const]));
    const sensitivity = Object.fromEntries(gate.sensitivityCases.map((caseId) => [caseId, true]));
    expect(assessGate(gate, passing, sensitivity).decision).toBe("GO");

    const unexecuted = { ...passing, [gate.proofs[0]!.id]: "unexecuted" as const };
    expect(assessGate(gate, unexecuted, sensitivity).decision).toBe("NOT-PROVEN");

    const failed = { ...passing, [gate.proofs[0]!.id]: "failed" as const };
    expect(assessGate(gate, failed, sensitivity).decision).toBe("NO-GO");
    expect(assessGate(gate, passing, sensitivity, true, false).decision).toBe("NO-GO");
  });

  it("preflight rejects stale evidence and GO with unreconciled counts", () => {
    const gate = gateForNumber("2")!;
    const expected = {
      gate: gate.id,
      command: FOUNDATION_COMMAND.replace("<n>", "2"),
      revision: "revision",
      committedTree: "tree",
      workingTreeSha256: "working-tree",
      proofIds: gate.proofs.map((proof) => proof.id),
    } as const;
    const valid = {
      schema: FOUNDATION_SCHEMA,
      gate: gate.id,
      tested: { revision: expected.revision, committedTree: expected.committedTree, workingTreeSha256: expected.workingTreeSha256, changedFileManifest: [] },
      counts: { selected: gate.proofs.length, passed: gate.proofs.length, failed: 0, unexecuted: 0 },
      proofs: gate.proofs.map((proof) => ({ id: proof.id, status: "passed" })),
      runtimeIdentities: [],
      artifactIdentities: [],
      recordIdentities: [],
      fixtureIdentities: [],
      oracleIdentities: [],
      protectedStateObservations: [],
      mutationResults: { required: { all: true }, knownBadMutationRejected: true },
      command: { declared: expected.command, argv: ["--gate=2"], workingDirectory: resolve("."), exitStatus: 0 },
      decision: "GO",
    };
    expect(validateEvidenceForPreflight(valid, expected).valid).toBe(true);
    expect(validateEvidenceForPreflight({ ...valid, tested: { ...valid.tested, workingTreeSha256: "stale" } }, expected).valid).toBe(false);
    expect(validateEvidenceForPreflight({ ...valid, counts: { selected: gate.proofs.length, passed: 0, failed: 0, unexecuted: gate.proofs.length } }, expected).reasons).toContain("GO is forbidden when proofs are missing, failed, or unexecuted");
    expect(validateEvidenceForPreflight({ ...valid, proofs: valid.proofs.slice(0, 1) }, expected).valid).toBe(false);
  });

  it("requires the registered package command", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as unknown;
    expect(commandRegistrationIsValid(packageJson)).toBe(true);
    expect(commandRegistrationIsValid({ scripts: {} })).toBe(false);
  });

  it("exposes a discoverable CLI that rejects a deliberate known-red mutation", () => {
    const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/verify-component-topology-foundation.ts", "--gate=2", "--known-red"], {
      cwd: resolve("."),
      encoding: "utf8",
      shell: false,
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("known-red rejected as expected");
  }, 15_000);
});
