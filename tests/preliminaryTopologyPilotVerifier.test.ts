import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";
import { validPilotEvidence } from "./helpers/preliminaryTopologyPilotEvidenceFixture.js";

describe("preliminary topology pilot verifier", () => {
  it("pilot verifier rejects missing skipped stale and mutated proof", () => {
    expect(existsSync(resolve("scripts/verify-preliminary-topology-pilot.ts"))).toBe(true);
    expect(existsSync(resolve("src/verifier/preliminaryTopologyPilotEvidence.ts"))).toBe(true);
    const base = validPilotEvidence("PILOT-A12");
    expect(validatePreliminaryTopologyPilotEvidence(base, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] }).valid).toBe(true);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, counts: { selected: 1, passed: 0, failed: 0, unexecuted: 1 } }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, tested: { revision: "stale", testedTreeSha256: "a".repeat(64) } }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, oracleValues: [0.2, 0.3, 0.4] }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] }).valid).toBe(false);
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, protectedState: { ...base.protectedState, ifcBytes: { ...base.protectedState.ifcBytes, after: "3".repeat(64) } } }, { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] }).valid).toBe(false);
  });
});
