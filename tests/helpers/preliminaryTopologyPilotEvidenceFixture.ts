import { createHash } from "node:crypto";

export function protectedStateFixture() {
  const section = (value: string) => ({ before: sha256(value), after: sha256(value), beforeContent: value, afterContent: value });
  return {
    ifcBytes: { before: "68a4762fadc42730a4638a77de7794075cfd388bbb004b3563e8fab1008ed6f7", after: "68a4762fadc42730a4638a77de7794075cfd388bbb004b3563e8fab1008ed6f7" },
    evidenceLedger: section("evidence"), revisionHistory: section("revision"), layerOnlySnapshot: section("layers"), evaluationGraph: section("graph"), publishedArtifacts: section("artifacts"), pilotRecords: section("pilots"),
  };
}

export function validPilotEvidence(proofId: string) {
  return {
    schema: "preliminary-topology-pilot-gate-evidence/v1",
    tested: { revision: "revision", testedTreeSha256: "a".repeat(64) },
    command: { argv: ["verifier"], workingDirectory: process.cwd(), exitStatus: 0, stdoutSha256: "b".repeat(64), stderrSha256: "c".repeat(64) },
    sensitivityCommand: { argv: ["verifier", "--sensitivity"], workingDirectory: process.cwd(), exitStatus: 0, stdoutSha256: "d".repeat(64), stderrSha256: "e".repeat(64) },
    counts: { selected: 1, passed: 1, failed: 0, unexecuted: 0 },
    proofIds: [proofId],
    proofs: [{ id: proofId, status: "passed" }],
    sensitivity: { missingProofRejected: true, skippedProofRejected: true, staleRevisionRejected: true, mutatedProtectedStateRejected: true, fabricatedValueRejected: true, candidatePatternRejected: true, workerLaunchRequired: true, failedRangeRejected: true, fabricatedWorkerValueRejected: true, publicBoundaryRerun: true },
    oracle: { path: "tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json", sha256: "fca3dda946e42ae54a23f16b050518eec54f98edcd6ec5f9638b6523576f4036" },
    oracleValues: [0.8424804269783203, 0.9136190712232274, 0.9955419279501067],
    protectedState: protectedStateFixture(),
    decision: "GO",
  };
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
