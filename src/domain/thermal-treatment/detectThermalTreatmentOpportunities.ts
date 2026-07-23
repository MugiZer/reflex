import { assemblyGroupIdForEvidence } from "../review/reviewGrouping.js";
import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { ThermalTreatmentFamilyMatch, ThermalTreatmentFamilyRegistry, ThermalTreatmentInputEvidenceStatus, ThermalTreatmentInputValue } from "./thermalTreatmentTypes.js";

export type ThermalTreatmentOpportunitySuggestion = {
  suggestionId: string;
  family: { familyId: string; familyVersion: string };
  confidence: "low" | "medium" | "high";
  reasonCodes: string[];
  evidenceReferences: ReturnType<typeof evidenceReferencesFor>;
  affectedElementStepIds: number[];
  affectedElementNames: string[];
  thermalConstructionSignature: string;
  proposedInputs: Record<string, ThermalTreatmentInputValue>;
  proposedInputEvidence: Record<string, { status: ThermalTreatmentInputEvidenceStatus; detail: string }>;
  assumptions: string[];
  boundaryConditions: Record<string, string>;
  selection: null;
};

export type ThermalTreatmentConfirmationCard = {
  suggestionId: string;
  familyLabel: string;
  affectedWallCount: number;
  affectedLocations: string[];
  criticalInputs: Array<{ key: string; label: string; unit: string; status: ThermalTreatmentInputEvidenceStatus }>;
  trustConsequence: string;
  primaryAction: "Confirm and calculate";
  secondaryAction: "Change family or parameters";
  advancedEvidenceCollapsed: true;
};

/** Reuses normalized calculation-input evidence to make advisory family suggestions; it never confirms a selection. */
export function detectThermalTreatmentOpportunities(command: {
  calculationInputEvidence: readonly CalculationInputEvidence[];
  registry: ThermalTreatmentFamilyRegistry;
}): { suggestions: ThermalTreatmentOpportunitySuggestion[] } {
  const suggestions = new Map<string, ThermalTreatmentOpportunitySuggestion>();
  for (const evidence of command.calculationInputEvidence) {
    const candidate = candidateFor(evidence);
    for (const family of command.registry.availableFamilies()) {
      const match = family.matchOpportunity({ evidence: candidate });
      if (!match) continue;
      const signature = thermalConstructionSignature({ family: family.identity, evidence, match });
      const key = `${family.identity.familyId}@${family.identity.familyVersion}:${signature}`;
      const current = suggestions.get(key);
      if (current) {
        current.affectedElementStepIds.push(evidence.elementStepId);
        current.affectedElementNames.push(evidence.elementName?.trim() || `IFC #${evidence.elementStepId}`);
        continue;
      }
      suggestions.set(key, {
        suggestionId: `tts_${stableHash(key)}`,
        family: family.identity,
        confidence: match.confidence,
        reasonCodes: [...match.reasonCodes],
        evidenceReferences: candidate.evidenceReferences,
        affectedElementStepIds: [evidence.elementStepId],
        affectedElementNames: [evidence.elementName?.trim() || `IFC #${evidence.elementStepId}`],
        thermalConstructionSignature: signature,
        proposedInputs: { ...match.proposedInputs },
        proposedInputEvidence: { ...match.proposedInputEvidence },
        assumptions: [...match.assumptions],
        boundaryConditions: { ...match.boundaryConditions },
        selection: null,
      });
    }
  }
  return { suggestions: [...suggestions.values()].sort(compareSuggestions) };
}

export function buildThermalTreatmentConfirmationCards(command: { suggestions: readonly ThermalTreatmentOpportunitySuggestion[]; registry?: ThermalTreatmentFamilyRegistry }): ThermalTreatmentConfirmationCard[] {
  return command.suggestions.map((suggestion) => {
    const family = command.registry?.findByIdentity(suggestion.family);
    const criticalInputs = family?.packs.knowledgePack.parameters.filter((input) => input.critical).map((input) => ({ key: input.key, label: input.label, unit: input.unit, status: suggestion.proposedInputEvidence[input.key]?.status ?? "missing" })) ?? [];
    return {
      suggestionId: suggestion.suggestionId,
      familyLabel: `${suggestion.family.familyId} v${suggestion.family.familyVersion}`,
      affectedWallCount: suggestion.affectedElementStepIds.length,
      affectedLocations: [...suggestion.affectedElementNames],
      criticalInputs,
      trustConsequence: "Suggestion only — confirmation and resolved critical inputs are required before a result can be Verified.",
      primaryAction: "Confirm and calculate",
      secondaryAction: "Change family or parameters",
      advancedEvidenceCollapsed: true,
    };
  });
}

function candidateFor(evidence: CalculationInputEvidence) {
  return {
    assemblyGroupId: assemblyGroupIdForEvidence(evidence),
    calculationInputEvidence: [evidence],
    materialNames: materialNamesFor(evidence),
    evidenceReferences: evidenceReferencesFor(evidence),
  };
}

function materialNamesFor(evidence: CalculationInputEvidence): string[] {
  return [...evidence.fixedInputs, ...evidence.candidateInputs]
    .filter((input) => input.field === "layer_material_name" && typeof input.value === "string")
    .map((input) => typeof input.value === "string" ? input.value.trim() : "")
    .filter(Boolean);
}

function evidenceReferencesFor(evidence: CalculationInputEvidence) {
  return [...evidence.fixedInputs, ...evidence.candidateInputs].flatMap((input) => input.evidenceReferences);
}

function thermalConstructionSignature(command: { family: { familyId: string; familyVersion: string }; evidence: CalculationInputEvidence; match: ThermalTreatmentFamilyMatch }): string {
  const layers = [...command.evidence.fixedInputs, ...command.evidence.candidateInputs, ...command.evidence.missingInputs]
    .filter((input) => (input.field === "layer_material_name" || input.field === "layer_thickness" || input.field === "layer_lambda") && input.layer)
    .map((input) => ({ field: input.field, layerIndex: input.layer?.layerIndex, value: input.value, source: input.source, confidence: input.confidence, reason: input.reason }))
    .sort((a, b) => `${a.layerIndex}:${a.field}:${a.source}`.localeCompare(`${b.layerIndex}:${b.field}:${b.source}`));
  return JSON.stringify({ family: command.family, elementClass: command.evidence.elementClass, calculationInputBasis: command.evidence.calculationInputBasis, layers, inputs: command.match.proposedInputs, inputEvidence: command.match.proposedInputEvidence, boundaryConditions: command.match.boundaryConditions, assumptions: command.match.assumptions });
}

function compareSuggestions(left: ThermalTreatmentOpportunitySuggestion, right: ThermalTreatmentOpportunitySuggestion): number {
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  return confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || right.reasonCodes.length - left.reasonCodes.length
    || left.family.familyId.localeCompare(right.family.familyId)
    || left.thermalConstructionSignature.localeCompare(right.thermalConstructionSignature);
}
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
/** Converts one reviewed suggestion into an explicit selection; callers must still invoke the calculation workflow. */
export function confirmThermalTreatmentOpportunity(command: {
  suggestion: ThermalTreatmentOpportunitySuggestion;
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
}): { thermalConstructionSignature: string; selection: { familyId: string; familyVersion: string; confirmedInputs: Record<string, ThermalTreatmentInputValue>; inputEvidence: Record<string, { status: ThermalTreatmentInputEvidenceStatus; detail: string }> } } {
  const inputEvidence = { ...command.suggestion.proposedInputEvidence };
  for (const key of Object.keys(command.confirmedInputs)) inputEvidence[key] = { status: "confirmed", detail: "Confirmed by architect during Thermal Treatment review." };
  return {
    thermalConstructionSignature: command.suggestion.thermalConstructionSignature,
    selection: { familyId: command.suggestion.family.familyId, familyVersion: command.suggestion.family.familyVersion, confirmedInputs: { ...command.suggestion.proposedInputs, ...command.confirmedInputs }, inputEvidence },
  };
}