import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";

describe("preliminary topology pilot evidence", () => {
  it("pilot evidence manifest binds GO to the current revision and every proof ID", () => {
    expect(existsSync(resolve("scripts/verify-preliminary-topology-pilot-evidence.ts"))).toBe(true);
    expect(existsSync(resolve("src/verifier/preliminaryTopologyPilotEvidence.ts"))).toBe(true);
    const valid = { schema: "preliminary-topology-pilot-gate-evidence/v1", tested: { revision: "revision", testedTreeSha256: "tree" }, command: { argv: ["verifier"], workingDirectory: process.cwd(), exitStatus: 0 }, sensitivityCommand: { argv: ["verifier", "--sensitivity"], workingDirectory: process.cwd(), exitStatus: 0 }, counts: { selected: 1, passed: 1, failed: 0, unexecuted: 0 }, proofIds: ["PILOT-A13"], proofs: [{ id: "PILOT-A13", status: "passed" }], sensitivity: { missingProofRejected: true, skippedProofRejected: true, staleRevisionRejected: true, mutatedProtectedStateRejected: true, fabricatedValueRejected: true, publicBoundaryRerun: true }, protectedState: { ifcBefore: "same", ifcAfter: "same", layerBefore: "same", layerAfter: "same" }, decision: "GO" };
    expect(validatePreliminaryTopologyPilotEvidence(valid, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A13"] }).valid).toBe(true);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, proofs: [] }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A13"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, tested: { revision: "stale", testedTreeSha256: "tree" } }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A13"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, sensitivityCommand: { ...valid.sensitivityCommand, exitStatus: 1 } }, { revision: "revision", testedTreeSha256: "tree", proofIds: ["PILOT-A13"] }).valid).toBe(false);
  });
});
