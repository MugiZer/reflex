import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";
import { validPilotEvidence } from "./helpers/preliminaryTopologyPilotEvidenceFixture.js";

describe("preliminary topology pilot evidence", () => {
  it("pilot evidence manifest binds GO to the current revision and every proof ID", () => {
    expect(existsSync(resolve("scripts/verify-preliminary-topology-pilot-evidence.ts"))).toBe(true);
    expect(existsSync(resolve("src/verifier/preliminaryTopologyPilotEvidence.ts"))).toBe(true);
    const valid = validPilotEvidence("PILOT-A13");
    expect(validatePreliminaryTopologyPilotEvidence(valid, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A13"] }).valid).toBe(true);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, proofs: [] }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A13"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, tested: { revision: "stale", testedTreeSha256: "a".repeat(64) } }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A13"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...valid, sensitivityCommand: { ...valid.sensitivityCommand, exitStatus: 1 } }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A13"] }).valid).toBe(false);
  });
});
