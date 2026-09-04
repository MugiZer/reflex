import { describe, expect, it } from "vitest";

import { deriveComponentEvaluationAggregate } from "../src/domain/topology/componentEvaluationAggregate.js";
import type { ComponentEvaluationGraph } from "../src/domain/topology/componentEvaluationRecords.js";

describe("component evaluation aggregate", () => {
  it("screening is conservative only when both gates pass", () => {
    const safe = deriveComponentEvaluationAggregate(graph([0.21, 0.22, 0.23]), { screeningThresholdWPerM2K: 0.25, immaterialityGateWPerM2K: 0.03 });
    expect(safe).toMatchObject({ outcome: "range", payload: { minUValueWPerM2K: 0.21, maxUValueWPerM2K: 0.23, conservativeProposalWPerM2K: 0.23, preliminary: true } });

    const material = deriveComponentEvaluationAggregate(graph([0.21, 0.24, 0.28]), { screeningThresholdWPerM2K: 0.25, immaterialityGateWPerM2K: 0.03 });
    expect(material).toMatchObject({ outcome: "range", payload: { minUValueWPerM2K: 0.21, maxUValueWPerM2K: 0.28, conservativeProposalWPerM2K: null, decisiveNextInput: "memberWidthM" } });

    const incomplete = deriveComponentEvaluationAggregate(graph([0.21, null, 0.28]), { screeningThresholdWPerM2K: 0.25, immaterialityGateWPerM2K: 0.03 });
    expect(incomplete).toMatchObject({ outcome: "range-unavailable", payload: { minUValueWPerM2K: null, maxUValueWPerM2K: null, conservativeProposalWPerM2K: null } });
  });
});

function graph(values: Array<number | null>): ComponentEvaluationGraph {
  const requests = values.map((_, index) => ({ scenarioRequestId: `request-${index}`, evaluationId: "evaluation", recipeId: `recipe-${index}`, idempotencyKey: `key-${index}`, createdAt: "2026-08-02T00:00:00.000Z" }));
  const recipes = requests.map((request, index) => ({ recipeId: request.recipeId, matchId: "match", canonicalRecipe: { index }, recipeSha256: `hash-${index}`, createdAt: request.createdAt }));
  const results = requests.map((request, index) => ({ scenarioResultId: `result-${index}`, scenarioRequestId: request.scenarioRequestId, outcome: values[index] === null ? "rejected" as const : "preliminary-unsafe" as const, resultPayload: { effectiveUValueWPerM2K: values[index] }, artifactIdentity: values[index] === null ? null : `artifact-${index}`, createdAt: request.createdAt }));
  return { schemaVersion: "component-evaluation-sqlite/v1", jobId: "job", sourceRevisionId: "revision", sourceAssemblyGroupId: "assembly", ifcImport: { ifcImportId: "ifc", jobId: "job", revisionId: "revision", contentSha256: "ifc-hash", parserVersion: "web-ifc", createdAt: requests[0]!.createdAt }, evidence: { evidenceSnapshotId: "evidence", ifcImportId: "ifc", canonicalEvidence: {}, evidenceSha256: "evidence-hash", createdAt: requests[0]!.createdAt }, occurrence: { occurrenceId: "occurrence", evidenceSnapshotId: "evidence", elementStepId: 1, opportunityId: "opportunity", evidenceSignature: "signature", createdAt: requests[0]!.createdAt }, annotations: [], pattern: null, match: { matchId: "match", occurrenceId: "occurrence", annotationId: null, patternId: null, patternVersion: null, outcome: "matched", reasons: [], createdAt: requests[0]!.createdAt }, recipes, requests, results, evaluation: { evaluationId: "evaluation", occurrenceId: "occurrence", matchId: "match", scenarioRequestIds: requests.map((item) => item.scenarioRequestId), createdAt: requests[0]!.createdAt }, aggregate: null, unresolvedGroups: [], state: "recoverable" };
}
