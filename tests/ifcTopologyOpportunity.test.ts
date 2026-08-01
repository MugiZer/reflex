import { describe, expect, it } from "vitest";
import { confirmIfcTopologyOpportunity, detectIfcTopologyOpportunities } from "../src/domain/topology/ifcTopologyOpportunity.js";
import { submitIfcTopologyConfirmation } from "../src/application/topology/submitIfcTopologyConfirmation.js";
import type { TopologyAnalysisRequestService } from "../src/application/topology/submitIfcTopologyConfirmation.js";

const reference = { evidencePath: "IfcMaterialLayerSet.MaterialLayers", sourceStepIds: [101], pathParts: [] };
const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "registry", packHash: "pilot-pack", runtimeHash: "runtime" };

function wall(overrides: Partial<{ id: number; thickness: number; material: string }> = {}) {
  const id = overrides.id ?? 101;
  return {
    elementStepId: id, elementGlobalId: `wall-${id}`, elementName: "North facade", elementObjectType: "External wall", elementClass: "IfcWall" as const,
    calculationInputBasis: "layered_needs_material_resolution" as const,
    fixedInputs: [
      { field: "layer_material_name" as const, value: overrides.material ?? "Timber stud", source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC material", layer: { layerIndex: 0, layerStepId: id * 10, materialName: overrides.material ?? "Timber stud" } },
      { field: "layer_thickness" as const, value: overrides.thickness ?? 0.14, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC thickness", layer: { layerIndex: 0, layerStepId: id * 10, materialName: overrides.material ?? "Timber stud" } },
      { field: "layer_material_name" as const, value: "Mineral wool", source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC material", layer: { layerIndex: 1, layerStepId: id * 10 + 1, materialName: "Mineral wool" } },
      { field: "layer_thickness" as const, value: 0.04, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC thickness", layer: { layerIndex: 1, layerStepId: id * 10 + 1, materialName: "Mineral wool" } },
    ], candidateInputs: [], missingInputs: [], diagnostics: [],
  };
}

describe("IFC topology opportunity review seam", () => {
  it("groups only exact Thermal Construction Signatures and leaves geometry un-authored", () => {
    const opportunities = detectIfcTopologyOpportunities({ calculationInputEvidence: [wall(), wall({ id: 102 }), wall({ id: 103, thickness: 0.16 })] });
    expect(opportunities).toHaveLength(2);
    expect(opportunities[0]).toMatchObject({ affectedElementStepIds: [101, 102], card: { primaryAction: "Review repeating component", advancedCollapsed: true } });
    expect(opportunities[0]!.card.criticalQuestions.map((question) => question.key)).toEqual(["memberKind", "memberMaterial", "memberWidthM", "repeatSpacingM", "continuousThroughLayers", "exteriorBoundary", "interiorBoundary"]);
    expect(opportunities[0]!.card.prefilledLayers[0]).toMatchObject({ material: { authority: { state: "ifc-derived" } }, thicknessM: { authority: { state: "ifc-derived" } } });
    expect(JSON.stringify(opportunities[0])).not.toContain("gaugeM");
  });

  it("creates a separately submitted authority-tagged Recipe only after the compact confirmation is complete", async () => {
    const [opportunity] = detectIfcTopologyOpportunities({ calculationInputEvidence: [wall()] });
    const submitted: unknown[] = [];
    const requests: TopologyAnalysisRequestService = { async submit(request) { submitted.push(request); return { outcome: "preliminary-unsafe", requestId: "top_1" }; } };

    const result = await submitIfcTopologyConfirmation({
      opportunity: opportunity!, sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "cor_1", idempotencyKey: "topology-1", layerOnlySnapshot: { uValueWPerM2K: 0.31 }, bundle, requests,
      answers: { memberKind: "rectangle", memberMaterial: "softwood", memberWidthM: 0.045, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" },
    });

    expect(result).toMatchObject({ outcome: "preliminary-unsafe", topologyRequest: { requestId: "top_1" } });
    expect(submitted).toHaveLength(1);
    const request = submitted[0] as { sourceRevisionId: string; sourceAssemblyGroupId: string; recipe: any };
    expect(request).toMatchObject({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1" });
    expect(request.recipe.rows[0]).toMatchObject({ member: { primitive: { kind: "standard.rectangle", parameters: { width: 0.045 } } } });
    expect(request.recipe.layers[0]).toMatchObject({ material: { value: "softwood", authority: { state: "ifc-derived" } } });
  });

  it("keeps the layer-only flow available when the reviewer does not know a required value", async () => {
    const [opportunity] = detectIfcTopologyOpportunities({ calculationInputEvidence: [wall()] });
    const requests: TopologyAnalysisRequestService = { async submit() { throw new Error("must not submit"); } };
    const result = await submitIfcTopologyConfirmation({
      opportunity: opportunity!, sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "cor_1", idempotencyKey: "topology-unknown", layerOnlySnapshot: { uValueWPerM2K: 0.31 }, bundle, requests,
      answers: { memberKind: "rectangle", memberMaterial: "softwood", memberWidthM: "i-dont-know", repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" },
    });
    expect(result).toEqual({ outcome: "blocked", missingKeys: ["memberWidthM"], layerOnlySnapshot: { uValueWPerM2K: 0.31 } });
  });
});
