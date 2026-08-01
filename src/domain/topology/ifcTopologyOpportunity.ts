import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { JsonValue } from "./topologyTypes.js";

type AuthorityState = "ifc-derived" | "user-confirmed" | "missing";
export type Authored<T> = { value: T | null; authority: { state: AuthorityState; sourceRefs: string[]; reason?: string } };
export type TopologyReviewAnswer = string | number | boolean | "i-dont-know" | null;
type Layer = { id: string; material: Authored<string>; thicknessM: Authored<number> };

export type IfcTopologyOpportunity = {
  opportunityId: string;
  thermalConstructionSignature: string;
  affectedElementStepIds: number[];
  affectedElementNames: string[];
  layers: Layer[];
  card: {
    detectedConstruction: string;
    affectedScope: string;
    primaryAction: "Review repeating component";
    advancedCollapsed: true;
    prefilledLayers: Layer[];
    criticalQuestions: Array<{ key: "memberKind" | "memberMaterial" | "memberWidthM" | "repeatSpacingM" | "continuousThroughLayers" | "exteriorBoundary" | "interiorBoundary"; label: string; whyItMatters: string }>;
  };
};

/** Advisory-only mapping from stored IFC evidence. It deliberately does not infer profile geometry or spacing. */
export function detectIfcTopologyOpportunities(command: { calculationInputEvidence: readonly CalculationInputEvidence[] }): IfcTopologyOpportunity[] {
  const grouped = new Map<string, IfcTopologyOpportunity>();
  for (const evidence of command.calculationInputEvidence) {
    const layers = layersFrom(evidence);
    if (evidence.elementClass !== "IfcWall" || !layers.length || !hasRepeatingComponentSignal(layers)) continue;
    const signature = signatureFor(evidence, layers);
    const current = grouped.get(signature);
    if (current) {
      current.affectedElementStepIds.push(evidence.elementStepId);
      current.affectedElementNames.push(evidence.elementName?.trim() || `IFC #${evidence.elementStepId}`);
      continue;
    }
    const names = [evidence.elementName?.trim() || `IFC #${evidence.elementStepId}`];
    grouped.set(signature, {
      opportunityId: `topology_${stableHash(signature)}`,
      thermalConstructionSignature: signature,
      affectedElementStepIds: [evidence.elementStepId],
      affectedElementNames: names,
      layers,
      card: {
        detectedConstruction: "Potential repeating wall component",
        affectedScope: names[0]!,
        primaryAction: "Review repeating component",
        advancedCollapsed: true,
        prefilledLayers: layers,
        criticalQuestions: questions(),
      },
    });
  }
  return [...grouped.values()].sort((left, right) => left.thermalConstructionSignature.localeCompare(right.thermalConstructionSignature));
}

export function confirmIfcTopologyOpportunity(command: { opportunity: IfcTopologyOpportunity; answers: Record<string, TopologyReviewAnswer> }):
  | { outcome: "blocked"; missingKeys: string[] }
  | { outcome: "rejected"; errorCode: "unsupported_member_kind" | "invalid_confirmation" }
  | { outcome: "ready"; recipe: JsonValue } {
  const missingKeys = questions().map((question) => question.key).filter((key) => command.answers[key] === undefined || command.answers[key] === null || command.answers[key] === "i-dont-know");
  if (missingKeys.length) return { outcome: "blocked", missingKeys };
  if (command.answers.memberKind !== "rectangle") return { outcome: "rejected", errorCode: "unsupported_member_kind" };
  if (command.answers.continuousThroughLayers !== true || !positive(command.answers.memberWidthM) || !positive(command.answers.repeatSpacingM) || typeof command.answers.memberMaterial !== "string" || !command.answers.memberMaterial.trim()) return { outcome: "rejected", errorCode: "invalid_confirmation" };
  const depthM = command.opportunity.layers.reduce((total, layer) => total + (layer.thicknessM.value ?? 0), 0);
  if (!positive(depthM)) return { outcome: "rejected", errorCode: "invalid_confirmation" };
  const confirmed = (value: string | number | boolean, key: string) => ({ value, authority: { state: "user-confirmed", sourceRefs: [`topology-review:${command.opportunity.opportunityId}:${key}`] } });
  return {
    outcome: "ready",
    recipe: {
      schemaVersion: "1.0.0-draft",
      topologyModule: { id: "repeating-parallel-profile-wall-2d", version: "1.0.0-draft" },
      periodicity: confirmed(command.answers.repeatSpacingM as number, "repeatSpacingM"),
      projectedArea: confirmed(command.answers.repeatSpacingM as number, "repeatSpacingM"),
      layers: command.opportunity.layers.map((layer) => ({ id: layer.id, material: layer.material, thickness: layer.thicknessM })),
      rows: [{
        id: "confirmed-repeating-member",
        offsetX: confirmed(0, "offsetX"), originY: confirmed(0, "continuousThroughLayers"),
        member: { placementMode: "continuous-parallel", primitive: { kind: "standard.rectangle", version: "1.0.0", parameters: { width: command.answers.memberWidthM as number, depth: depthM } }, material: confirmed(command.answers.memberMaterial.trim(), "memberMaterial") },
      }],
      cavities: [], thermalBreaks: [],
      boundaries: { exterior: confirmed(command.answers.exteriorBoundary as string, "exteriorBoundary"), interior: confirmed(command.answers.interiorBoundary as string, "interiorBoundary"), left: "periodic", right: "periodic" },
    },
  };
}

function layersFrom(evidence: CalculationInputEvidence): Layer[] {
  const found = new Map<number, { id: string; material?: Authored<string>; thicknessM?: Authored<number> }>();
  for (const input of evidence.fixedInputs) {
    if (!input.layer || (input.field !== "layer_material_name" && input.field !== "layer_thickness")) continue;
    const layer = found.get(input.layer.layerIndex) ?? { id: `layer-${input.layer.layerIndex}` };
    const sourceRefs = input.evidenceReferences.map((reference) => reference.evidencePath);
    if (input.field === "layer_material_name" && typeof input.value === "string") layer.material = { value: input.value, authority: { state: "ifc-derived", sourceRefs } };
    if (input.field === "layer_thickness" && typeof input.value === "number" && input.value > 0) layer.thicknessM = { value: input.value, authority: { state: "ifc-derived", sourceRefs } };
    found.set(input.layer.layerIndex, layer);
  }
  return [...found.entries()].sort(([left], [right]) => left - right).flatMap(([, layer]) => layer.material && layer.thicknessM ? [{ id: layer.id, material: layer.material, thicknessM: layer.thicknessM }] : []);
}

function signatureFor(evidence: CalculationInputEvidence, layers: readonly Layer[]): string {
  const inputs = [...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs]
    .map((input) => ({ field: input.field, value: input.value, source: input.source, confidence: input.confidence, reason: input.reason, layerIndex: input.layer?.layerIndex ?? null, evidencePaths: input.evidenceReferences.map((reference) => reference.evidencePath).sort() }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({ elementClass: evidence.elementClass, calculationInputBasis: evidence.calculationInputBasis, layers: layers.map((layer) => ({ material: layer.material.value, thicknessM: layer.thicknessM.value, materialSources: layer.material.authority.sourceRefs, thicknessSources: layer.thicknessM.authority.sourceRefs })), inputs, diagnostics: evidence.diagnostics });
}
function hasRepeatingComponentSignal(layers: readonly Layer[]): boolean { return layers.some((layer) => /\b(stud|rail|girt|profile|channel|timber)\b/i.test(layer.material.value ?? "")); }
function questions(): IfcTopologyOpportunity["card"]["criticalQuestions"] { return [
  { key: "memberKind", label: "Member shape", whyItMatters: "An IFC label is not profile geometry." },
  { key: "memberMaterial", label: "Member material", whyItMatters: "The material controls the thermal bridge." },
  { key: "memberWidthM", label: "Member width", whyItMatters: "Width determines the repeating bridge area." },
  { key: "repeatSpacingM", label: "Repeat spacing", whyItMatters: "Spacing determines how often the bridge occurs." },
  { key: "continuousThroughLayers", label: "Member crosses the full layer stack", whyItMatters: "Contact topology cannot be inferred from IFC labels." },
  { key: "exteriorBoundary", label: "Exterior boundary profile", whyItMatters: "Boundary conditions affect the thermal result." },
  { key: "interiorBoundary", label: "Interior boundary profile", whyItMatters: "Boundary conditions affect the thermal result." },
]; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function stableHash(value: string): string { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
