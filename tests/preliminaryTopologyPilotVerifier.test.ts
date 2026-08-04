import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";

describe("preliminary topology pilot verifier", () => {
  it("pilot verifier rejects missing skipped stale and mutated proof", () => {
    expect(existsSync(resolve("scripts/verify-preliminary-topology-pilot.ts"))).toBe(true);
    expect(existsSync(resolve("src/verifier/preliminaryTopologyPilotEvidence.ts"))).toBe(true);
    const base = { schema: "preliminary-topology-pilot-gate-evidence/v1", tested: { revision: "revision", testedTreeSha256: "tree" }, command: { argv: ["verifier"], workingDirectory: process.cwd(), exitStatus: 0 }, sensitivityCommand: { argv: ["verifier", "--sensitivity"], workingDirectory: process.cwd(), exitStatus: 0 }, counts: { selected: 1, passed: 1, failed: 0, unexecuted: 0 }, proofIds: ["PILOT-A12"], proofs: [{ id: "PILOT-A12", status: "passed" }], sensitivity: { missingProofRejected: true, skippedProofRejected: true, staleRevisionRejected: true, mutatedProtectedStateRejected: true, fabricatedValueRejected: true, publicBoundaryRerun: true }, oracleValues: [0.8424804269783203, 0.9136190712232274, 0.9955419279501067], protectedState: { ifcBefore: "same", ifcAfter: "same", layerBefore: "same", layerAfter: "same" }, decision: "GO" };
    expect(validatePreliminaryTopologyPilotEvidence(base, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A12"] }).valid).toBe(true);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, counts: { selected: 1, passed: 0, failed: 0, unexecuted: 1 } }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, tested: { revision: "stale", testedTreeSha256: "tree" } }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, oracleValues: [0.2, 0.3, 0.4] }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, protectedState: { ifcBefore: "same", ifcAfter: "changed", layerBefore: "same", layerAfter: "same" } }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A12"] }).valid).toBe(false);
  });
});
