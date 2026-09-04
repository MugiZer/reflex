import type { CalculationSnapshot } from "../../domain/calculations/calculationTypes.js";
import type { CalculationInput, CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { ElementClass, EvidenceReference } from "../../domain/evidence/evidenceTypes.js";
import type { MaterialLibrary, MaterialResolution, SpecialPhysicsIssue } from "../../domain/materials/materialTypes.js";
import { resolveLayerLambda } from "../../domain/materials/resolveLayerLambda.js";
import { specialPhysicsIssuesForEvidence } from "../../domain/materials/materialResolution.js";
import { groupCalculationInputEvidenceByAssembly } from "../../domain/review/reviewGrouping.js";
import type { UserInput } from "../../domain/review/reviewTypes.js";

export type ReportInventoryLayer = {
  layerIndex: number;
  rawMaterialName: string | null;
  thicknessM: number | null;
  lambdaWPerMK: number | null;
  materialResolution: MaterialResolution | undefined;
  provenance: EvidenceReference[];
};
export type ReportInventorySource = {
  elementStepId: number;
  elementGlobalId: string | null;
  elementName: string | null;
  elementObjectType: string | null;
  elementClass: ElementClass;
};
export type ReportInventoryView = {
  assemblyGroupId: string;
  elementClass: ElementClass;
  sources: ReportInventorySource[];
  layers: ReportInventoryLayer[];
  snapshot: CalculationSnapshot | null;
  readinessState: "ready" | "needs_review" | "estimated" | "blocked";
  nextActions: string[];
  specialIssues: SpecialPhysicsIssue[];
};

export function buildReportInventory(command: {
  calculationInputEvidence: CalculationInputEvidence[];
  calculationSnapshots: CalculationSnapshot[];
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
}): ReportInventoryView[] {
  const snapshots = new Map(command.calculationSnapshots.map((snapshot) => [snapshot.assemblyGroupId, snapshot]));
  return [...groupCalculationInputEvidenceByAssembly(command.calculationInputEvidence).entries()].map(([assemblyGroupId, evidence]) => {
    const representative = evidence[0];
    if (!representative) throw new Error("Report inventory groups must contain evidence.");
    const specialIssues = specialPhysicsIssuesForEvidence({ evidence: representative, materialLibrary: command.materialLibrary });
    const layers = layerIndexes(representative).map((layerIndex) => {
      const material = inputForLayer(representative, "layer_material_name", layerIndex);
      const thickness = inputForLayer(representative, "layer_thickness", layerIndex);
      const rawMaterialName = typeof material?.value === "string" ? material.value : material?.layer?.materialName ?? null;
      const lambda = resolveLayerLambda({ calculationInputEvidence: representative, materialName: rawMaterialName, materialLibrary: command.materialLibrary, userInputs: command.userInputs, elementStepId: representative.elementStepId, layerIndex });
      return { layerIndex, rawMaterialName, thicknessM: typeof thickness?.value === "number" ? thickness.value : null, lambdaWPerMK: lambda.lambda?.value ?? null, materialResolution: lambda.resolution, provenance: [...(material?.evidenceReferences ?? []), ...(thickness?.evidenceReferences ?? [])] };
    });
    const nextActions = snapshots.has(assemblyGroupId) ? [] : [...specialIssues.map((issue) => issue.nextAction), ...layers.filter((layer) => layer.lambdaWPerMK === null && layer.rawMaterialName !== null).map((layer) => "Resolve a documented thermal basis for '" + layer.rawMaterialName + "'."), ...(layers.some((layer) => layer.thicknessM === null) ? ["Provide normalized IFC layer thickness evidence."] : [])];
    return { assemblyGroupId, elementClass: representative.elementClass, sources: evidence.map((item) => ({ elementStepId: item.elementStepId, elementGlobalId: item.elementGlobalId, elementName: item.elementName ?? null, elementObjectType: item.elementObjectType ?? null, elementClass: item.elementClass })), layers, snapshot: snapshots.get(assemblyGroupId) ?? null, readinessState: snapshots.get(assemblyGroupId)?.readinessState ?? (specialIssues.length ? "blocked" : "needs_review"), nextActions: [...new Set(nextActions)], specialIssues };
  });
}
function layerIndexes(evidence: CalculationInputEvidence): number[] {
  return [...new Set([...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs].flatMap((input) => input.layer === undefined ? [] : [input.layer.layerIndex]))].sort((a, b) => a - b);
}
function inputForLayer(evidence: CalculationInputEvidence, field: CalculationInput["field"], layerIndex: number): CalculationInput | undefined {
  return [...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs].find((input) => input.field === field && input.layer?.layerIndex === layerIndex);
}