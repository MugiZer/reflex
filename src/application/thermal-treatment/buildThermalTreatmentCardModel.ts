import type { Revision } from "../../domain/revisions/revisionTypes.js";
import type { ThermalTreatmentFamilyRegistry } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import type { ThermalTreatmentOpportunitySuggestion } from "../../domain/thermal-treatment/detectThermalTreatmentOpportunities.js";

export function buildThermalTreatmentCardModel(command: {
  suggestions: readonly ThermalTreatmentOpportunitySuggestion[];
  registry: ThermalTreatmentFamilyRegistry;
  activeRevision?: Revision | null;
  assemblyGroupIdsForSuggestion?: (suggestion: ThermalTreatmentOpportunitySuggestion) => string[];
}) {
  return command.suggestions.map((suggestion) => {
    const family = command.registry.findByIdentity(suggestion.family);
    if (!family) throw new Error(`Registered Thermal Treatment family is unavailable: ${suggestion.family.familyId}.`);
    const inputs = family.packs.knowledgePack.parameters
      .filter((input) => input.required && isApplicable(input, suggestion.proposedInputs))
      .filter((input) => input.key !== "wallLayerStackJson")
      .filter((input) => (suggestion.proposedInputEvidence[input.key]?.status ?? "missing") !== "confirmed")
      .map((input) => ({ key: input.key, label: input.label, unit: input.unit, inputType: input.allowedValues ? "choice" : typeof suggestion.proposedInputs[input.key] === "boolean" ? "boolean" : "number", value: suggestion.proposedInputs[input.key] ?? null, allowedValues: input.allowedValues ?? input.range?.allowedValues ?? [], status: suggestion.proposedInputEvidence[input.key]?.status ?? "missing" }));
    const assemblyGroupIds = command.assemblyGroupIdsForSuggestion?.(suggestion) ?? [];
    const saved = command.activeRevision?.calculationSnapshots
      .filter((snapshot) => assemblyGroupIds.includes(snapshot.assemblyGroupId))
      .map((snapshot) => snapshot.thermalTreatment)
      .find((record) => record?.selection.familyId === suggestion.family.familyId && record.selection.familyVersion === suggestion.family.familyVersion);
    const isStale = Boolean(saved && saved.thermalConstructionSignature !== suggestion.thermalConstructionSignature);
    const state = isStale ? "stale_evidence" : saved?.trustState === "verified" ? "verified" : saved ? "preliminary_unsafe_estimate" : inputs.length ? "suggestion" : "ready_to_calculate";
    return {
      suggestionId: suggestion.suggestionId, thermalConstructionSignature: suggestion.thermalConstructionSignature,
      family: { familyId: suggestion.family.familyId, familyVersion: suggestion.family.familyVersion, label: family.packs.knowledgePack.presentation?.familyLabel ?? suggestion.family.familyId, summary: family.packs.knowledgePack.presentation?.summary ?? "A repeating thermal component was found in the stored IFC evidence." },
      affectedElementStepIds: suggestion.affectedElementStepIds, assemblyGroupIds, affectedWallCount: suggestion.affectedElementStepIds.length, affectedLocations: suggestion.affectedElementNames, matchExplanation: suggestion.reasonCodes, inputs, state,
      result: saved ? { effectiveUValueWPerM2K: saved.effectiveUValueWPerM2K, layerOnlyUValueWPerM2K: saved.baselineUValueWPerM2K, trustReasons: saved.trustReasons, actionsRequiredForVerification: saved.actionsRequiredForVerification } : null,
      trustConsequence: "Confirmed critical inputs can produce a Verified result; estimated or missing inputs remain a Preliminary Unsafe Estimate.", advanced: { evidenceReferences: suggestion.evidenceReferences, assumptions: suggestion.assumptions, boundaryConditions: suggestion.boundaryConditions, collapsed: true },
    };
  });
}
function isApplicable(input: { applicableWhen?: { inputKey: string; equals: unknown } }, values: Record<string, unknown>): boolean { return !input.applicableWhen || values[input.applicableWhen.inputKey] === input.applicableWhen.equals; }