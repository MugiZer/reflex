import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { JsonValue } from "./topologyTypes.js";

type AuthorityState = "ifc-derived" | "user-confirmed" | "validated-default" | "preliminary-estimate" | "conflicting" | "missing";
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
  | { outcome: "rejected"; errorCode: "unsupported_member_kind" | "unsupported_material_vocabulary" | "invalid_confirmation" }
  | { outcome: "ready"; recipe: JsonValue } {
  const allowedKeys = new Set(questions().map((question) => question.key));
  if (Object.keys(command.answers).some((key) => !allowedKeys.has(key as never))) return { outcome: "rejected", errorCode: "invalid_confirmation" };
  const missingKeys = questions().map((question) => question.key).filter((key) => command.answers[key] === undefined || command.answers[key] === null || command.answers[key] === "i-dont-know");
  if (missingKeys.length) return { outcome: "blocked", missingKeys };
  if (command.answers.memberKind !== "rectangle") return { outcome: "rejected", errorCode: "unsupported_member_kind" };
  if (command.answers.continuousThroughLayers !== true || !positive(command.answers.memberWidthM) || !positive(command.answers.repeatSpacingM) || command.answers.memberWidthM >= command.answers.repeatSpacingM || typeof command.answers.memberMaterial !== "string" || !command.answers.memberMaterial.trim() || command.answers.exteriorBoundary !== "external-wall" || command.answers.interiorBoundary !== "internal") return { outcome: "rejected", errorCode: "invalid_confirmation" };
  const memberMaterial = topologyMaterialId(command.answers.memberMaterial);
  const topologyLayers = command.opportunity.layers.map((layer) => {
    const resolution = topologyMaterialId(layer.material.value);
    if (resolution.value === null) return { ...layer, material: { ...layer.material, value: null, authority: { ...layer.material.authority, reason: `Unsupported topology material vocabulary: ${layer.material.value ?? "(missing)"}.` } } };
    if (resolution.wasAlias) {
      return {
        ...layer,
        material: {
          ...layer.material,
          value: resolution.value,
          authority: {
            ...layer.material.authority,
            sourceRefs: [...layer.material.authority.sourceRefs, `material-alias:${resolution.normalized}->${resolution.value}`],
            reason: `Resolved exact registered material alias ${resolution.normalized} to ${resolution.value}.`,
          },
        },
      };
    }
    return { ...layer, material: { ...layer.material, value: resolution.value } };
  });
  const unresolvedLayerAuthority = command.opportunity.layers.some((layer) => layer.material.authority.state === "missing" || layer.material.authority.state === "preliminary-estimate" || layer.material.authority.state === "conflicting");
  if (unresolvedLayerAuthority) return { outcome: "blocked", missingKeys: ["layerMaterial"] };
  if (!memberMaterial.value || topologyLayers.some((layer) => layer.material.value === null)) return { outcome: "rejected", errorCode: "unsupported_material_vocabulary" };
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
      layers: topologyLayers.map((layer) => ({ id: layer.id, material: layer.material, thickness: layer.thicknessM })),
      rows: [{
        id: "confirmed-repeating-member",
        offsetX: confirmed(0, "offsetX"), originY: confirmed(0, "continuousThroughLayers"),
        member: { placementMode: "continuous-parallel", primitive: { kind: "standard.rectangle", version: "1.0.0", parameters: { width: command.answers.memberWidthM as number, depth: depthM } }, material: confirmed(memberMaterial.value, "memberMaterial") },
      }],
      cavities: [], thermalBreaks: [],
      boundaries: { exterior: confirmed(command.answers.exteriorBoundary as string, "exteriorBoundary"), interior: confirmed(command.answers.interiorBoundary as string, "interiorBoundary"), left: "periodic", right: "periodic" },
    },
  };
}

function layersFrom(evidence: CalculationInputEvidence): Layer[] {
  const found = new Map<number, { id: string; material?: Authored<string>; thicknessM?: Authored<number> }>();
  const materialValues = new Map<number, Set<string>>();
  for (const input of [...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs]) {
    if (!input.layer || (input.field !== "layer_material_name" && input.field !== "layer_thickness")) continue;
    const layer = found.get(input.layer.layerIndex) ?? { id: `layer-${input.layer.layerIndex}` };
    const sourceRefs = input.evidenceReferences.map((reference) => reference.evidencePath);
    const state: AuthorityState = input.source === "missing" ? "missing" : input.source === "ifc_candidate" ? "preliminary-estimate" : "ifc-derived";
    if (input.field === "layer_material_name") {
      if (typeof input.value === "string") {
        const values = materialValues.get(input.layer.layerIndex) ?? new Set<string>();
        values.add(input.value.trim().toLowerCase());
        materialValues.set(input.layer.layerIndex, values);
      }
      const currentRank = layer.material ? authorityRank(layer.material.authority.state) : -1;
      if (authorityRank(state) >= currentRank) layer.material = { value: typeof input.value === "string" ? input.value : null, authority: { state, sourceRefs, ...(input.reason ? { reason: input.reason } : {}) } };
    }
    if (input.field === "layer_thickness") layer.thicknessM = { value: typeof input.value === "number" && input.value > 0 ? input.value : null, authority: { state, sourceRefs, ...(input.reason ? { reason: input.reason } : {}) } };
    found.set(input.layer.layerIndex, layer);
  }
  return [...found.entries()].sort(([left], [right]) => left - right).flatMap(([index, layer]) => {
    if (layer.material && (materialValues.get(index)?.size ?? 0) > 1) layer.material = { value: null, authority: { state: "conflicting", sourceRefs: [...(materialValues.get(index) ?? [])], reason: "Multiple material authorities disagree for this IFC layer." } };
    return layer.material && layer.thicknessM ? [{ id: layer.id, material: layer.material, thicknessM: layer.thicknessM }] : [];
  });
}
function authorityRank(state: AuthorityState): number { return state === "ifc-derived" || state === "user-confirmed" || state === "validated-default" ? 2 : state === "preliminary-estimate" ? 1 : 0; }

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
export function topologyMaterialId(value: string | null): { value: string | null; normalized: string | null; wasAlias: boolean } {
  if (value === null) return { value: null, normalized: null, wasAlias: false };
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  const aliases: Record<string, string> = { "timber-stud": "softwood", "mineral-wool": "mineral-wool", "gypsum": "gypsum", "gypsum-board": "gypsum", "sheathing": "sheathing", "softwood": "softwood", "galvanized-steel": "galvanized-steel" };
  const resolved = aliases[normalized] ?? null;
  return { value: resolved, normalized, wasAlias: resolved !== null && resolved !== normalized };
}
function stableHash(value: string): string { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
