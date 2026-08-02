import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluatePatternPromotion, replayUnresolvedOccurrence } from "../src/domain/topology/componentPatternPromotion.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import type { ComponentEvaluationGraph } from "../src/domain/topology/componentEvaluationRecords.js";
import { SqliteComponentEvaluationRepository } from "../src/infrastructure/persistence/sqlite/SqliteComponentEvaluationRepository.js";

describe("component pattern promotion and replay", () => {
  it("promotion requires frozen safety metrics", async () => {
    const dataset = JSON.parse(await readFile(resolve("tests/fixtures/component-patterns/repeating-c-profile-v1.json"), "utf8"));
    const decision = evaluatePatternPromotion({ pattern: { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }, dataset, minimumRecall: 1 });
    expect(decision).toMatchObject({ outcome: "promoted", unsafeFalsePositives: 0, recall: 1, patternVersion: "1.0.0", datasetId: "repeating-c-profile-safety-v1" });
    expect(decision.datasetSha256).toMatch(/^[a-f0-9]{64}$/);
    const unsafe = structuredClone(dataset); unsafe.nearNeighbourNegatives[0] = { ...unsafe.nearNeighbourNegatives[0], profileKind: "c", materialLabel: "steel" };
    expect(evaluatePatternPromotion({ pattern: { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }, dataset: unsafe, minimumRecall: 1 })).toMatchObject({ outcome: "refused", unsafeFalsePositives: 1 });
    expect(evaluatePatternPromotion({ pattern: { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }, dataset, minimumRecall: 1.01 })).toMatchObject({ outcome: "refused", recall: 1 });
    const rejectionMiss = structuredClone(dataset); rejectionMiss.rejections[0].expected = "matched";
    expect(evaluatePatternPromotion({ pattern: { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }, dataset: rejectionMiss, minimumRecall: 1 })).toMatchObject({ outcome: "refused", expectationMisses: ["c-conflict"] });
    const dimensionMiss = structuredClone(dataset); dimensionMiss.varyingDimensions[0] = "missing-dimension-case";
    expect(evaluatePatternPromotion({ pattern: { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }, dataset: dimensionMiss, minimumRecall: 1 })).toMatchObject({ outcome: "refused", varyingDimensionMisses: ["missing-dimension-case"] });
  }, 20_000);

  it("promoted version replays unresolved history append-only", async () => {
    const original = unresolvedGraph();
    const pattern = { ...REPEATING_C_PROFILE_PATTERN, version: "2.0.0", recognition: { ...REPEATING_C_PROFILE_PATTERN.recognition, profileKinds: ["z"] } };
    const replay = replayUnresolvedOccurrence({ original, pattern, promotedAt: "2026-08-02T01:00:00.000Z" });
    const retry = replayUnresolvedOccurrence({ original, pattern, promotedAt: "2026-08-02T01:00:00.000Z" });
    expect(replay).toEqual(retry);
    expect(replay).toMatchObject({ evidence: original.evidence, occurrence: original.occurrence, pattern: { version: "2.0.0" }, match: { outcome: "matched" }, unresolvedGroups: [] });
    expect(replay.evaluation.evaluationId).not.toBe(original.evaluation.evaluationId);
    expect(original).toEqual(unresolvedGraph());
    const root=await mkdtemp(join(tmpdir(),"component-replay-")); const path=join(root,"replay.db");
    try { const first=new SqliteComponentEvaluationRepository(path); const second=new SqliteComponentEvaluationRepository(path); first.append(original); await Promise.all([Promise.resolve().then(()=>first.append(replay)),Promise.resolve().then(()=>second.append(retry))]); first.close(); second.close(); const reader=new SqliteComponentEvaluationRepository(path); try { expect(new Map(reader.listByJobId("job").map((item)=>[item.evaluation.evaluationId,item]))).toEqual(new Map([[original.evaluation.evaluationId,original],[replay.evaluation.evaluationId,replay]])); } finally { reader.close(); } }
    finally { await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); }
  }, 20_000);
});

function unresolvedGraph(): ComponentEvaluationGraph {
  const at="2026-08-02T00:00:00.000Z";
  return { schemaVersion:"component-evaluation-sqlite/v1",jobId:"job",sourceRevisionId:"revision",sourceAssemblyGroupId:"assembly",ifcImport:{ifcImportId:"ifc",jobId:"job",revisionId:"revision",contentSha256:"hash",parserVersion:"web-ifc",createdAt:at},evidence:{evidenceSnapshotId:"evidence",ifcImportId:"ifc",canonicalEvidence:{},evidenceSha256:"ehash",createdAt:at},occurrence:{occurrenceId:"occurrence",evidenceSnapshotId:"evidence",elementStepId:1,opportunityId:"opportunity",evidenceSignature:"signature",createdAt:at},annotations:[{annotationId:"annotation",occurrenceId:"occurrence",payload:{answers:{memberKind:"z",memberMaterial:"galvanized steel",memberWidthM:0.075}},authority:"user-confirmed",createdAt:at}],pattern:null,match:{matchId:"match-v1",occurrenceId:"occurrence",annotationId:"annotation",patternId:null,patternVersion:null,outcome:"unmatched",reasons:["unmatched"],createdAt:at},recipes:[],requests:[],results:[],evaluation:{evaluationId:"evaluation-v1",occurrenceId:"occurrence",matchId:"match-v1",scenarioRequestIds:[],createdAt:at},aggregate:null,unresolvedGroups:[{unresolvedGroupId:"unresolved",evidenceSignature:"signature",occurrenceIds:["occurrence"],createdAt:at}],state:"recoverable" };
}
