import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createComponentKnowledgeBase, resolveTopologyScenarioPlan } from "../src/domain/topology/componentKnowledgeBase.js";
import { runTopologyScenarioPlan } from "../src/application/topology/runTopologyScenarioPlan.js";
import type { SubmitTopologyAnalysisRequest, TopologyResult } from "../src/domain/topology/topologyTypes.js";

const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) };
const baseRecipe = { schemaVersion: "1.0.0-draft", rows: [{ member: { primitive: { parameters: { width: 0.04 } } } }] };

describe("Topology scenario estimate seam", () => {
  it("uses only pack-compatible unknown ranges, persists every scenario, and returns tested extrema", async () => {
    const pack = createComponentKnowledgeBase({ packId: "timber-wall", version: "1.0.0", lifecycle: "promoted", supportedUnknowns: [{ key: "memberWidthM", values: [0.035, 0.06], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "width"] }], immaterialityGateWPerM2K: 0.03 });
    const plan = resolveTopologyScenarioPlan({ pack, recipe: baseRecipe, unknownKeys: ["memberWidthM"] });
    expect(plan).toMatchObject({ outcome: "ready", plan: { scenarios: [{ parameters: { memberWidthM: { authority: { state: "preliminary-estimate" } } } }, { parameters: { memberWidthM: { authority: { state: "preliminary-estimate" } } } }] } });

    const submitted: SubmitTopologyAnalysisRequest[] = [];
    const result = await runTopologyScenarioPlan({
      plan: plan.outcome === "ready" ? plan.plan : fail("expected scenario plan"), sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "00000000-0000-4000-8000-000000000001", idempotencyKey: hash("estimate"), layerOnlySnapshot: { uValueWPerM2K: 0.31 }, bundle,
      requests: { async submit(request) { submitted.push(request); return topologyResult(request, widthOf(request) === 0.035 ? 0.21 : 0.24); } },
      projectThresholdUValueWPerM2K: 0.25,
    });

    expect(submitted).toHaveLength(2);
    expect(result).toMatchObject({ outcome: "preliminary-unsafe", uValueRangeWPerM2K: { min: 0.21, max: 0.24 }, dominantUncertainty: { key: "memberWidthM" }, conservativeScreeningValueWPerM2K: 0.24 });
    expect(result.scenarios.every((scenario) => scenario.outcome === "preliminary-unsafe" && scenario.pack.packId === "timber-wall")).toBe(true);
    expect(result.scenarios.map((scenario) => scenario.effectiveUValueWPerM2K)).toEqual([0.21, 0.24]);
  });

  it("refuses unsupported unknowns and never creates a screening value when a gate is not met", async () => {
    const pack = createComponentKnowledgeBase({ packId: "timber-wall", version: "1.0.0", lifecycle: "promoted", supportedUnknowns: [{ key: "memberWidthM", values: [0.035, 0.06], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "width"] }], immaterialityGateWPerM2K: 0.02 });
    expect(resolveTopologyScenarioPlan({ pack, recipe: baseRecipe, unknownKeys: ["repeatSpacingM"] })).toEqual({ outcome: "blocked", reason: "unsupported_unknown:repeatSpacingM" });
    const plan = resolveTopologyScenarioPlan({ pack, recipe: baseRecipe, unknownKeys: ["memberWidthM"] });
    const result = await runTopologyScenarioPlan({ plan: plan.outcome === "ready" ? plan.plan : fail("expected scenario plan"), sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "00000000-0000-4000-8000-000000000002", idempotencyKey: hash("material"), layerOnlySnapshot: {}, bundle, projectThresholdUValueWPerM2K: 0.25, requests: { async submit(request) { return topologyResult(request, widthOf(request) === 0.035 ? 0.2 : 0.24); } } });
    expect(result).toMatchObject({ outcome: "preliminary-unsafe", conservativeScreeningValueWPerM2K: null, decisiveNextInput: { key: "memberWidthM" } });
  });

  it("uses declarative bindings only and rejects missing or incompatible targets", () => {
    const pack = createComponentKnowledgeBase({ packId: "timber-wall", version: "1.0.0", lifecycle: "promoted", supportedUnknowns: [{ key: "memberWidthM", values: [0.035, 0.06], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "width"] }], immaterialityGateWPerM2K: 0.02 });
    expect(resolveTopologyScenarioPlan({ pack, recipe: baseRecipe, unknownKeys: [] })).toMatchObject({ outcome: "ready", plan: { scenarios: [{ parameters: {} }] } });
    const invalidPack = createComponentKnowledgeBase({ packId: "timber-wall", version: "1.0.0", lifecycle: "promoted", supportedUnknowns: [{ key: "memberWidthM", values: [0.035, 0.06], label: "Member width", binding: ["rows", 2, "member", "primitive", "parameters", "width"] }], immaterialityGateWPerM2K: 0.02 });
    expect(resolveTopologyScenarioPlan({ pack: invalidPack, recipe: baseRecipe, unknownKeys: ["memberWidthM"] })).toEqual({ outcome: "rejected", reason: "invalid_binding:memberWidthM" });
  });
});

function topologyResult(request: SubmitTopologyAnalysisRequest, effectiveUValueWPerM2K: number): TopologyResult {
  return { requestId: hash(request.idempotencyKey), sourceRevisionId: request.sourceRevisionId, sourceAssemblyGroupId: request.sourceAssemblyGroupId, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, recipeHash: request.recipeHash, outcome: "preliminary-unsafe", bundle: request.bundle, layerOnlySnapshot: request.layerOnlySnapshot, effectiveUValueWPerM2K, evidence: null, artifactDirectory: "artifacts", errorCode: null, diagnostics: null };
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function fail(message: string): never { throw new Error(message); }
function widthOf(request: SubmitTopologyAnalysisRequest): number { return (request.recipe as any).rows[0].member.primitive.parameters.width; }
