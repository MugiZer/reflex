import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { Diagnostic } from "../evidence/evidenceTypes.js";
import type { MaterialLibrary, ResolvedLambda } from "../materials/materialTypes.js";
import type { UserInput } from "../review/reviewTypes.js";
import {
  assemblyGroupIdForEvidence,
  layerOccurrenceRequestedInputId,
  materialDecisionRequestedInputId,
  normalizeMaterialKey,
} from "../review/reviewGrouping.js";
import { defaultSurfaceResistanceProfileFor } from "./surfaceResistanceProfiles.js";
import type { DatapointSource, PhysicsAssembly, PhysicsLayer } from "./calculationTypes.js";

export type BuildPhysicsAssembliesResult = {
  physicsAssemblies: PhysicsAssembly[];
  diagnostics: Diagnostic[];
};

export function buildPhysicsAssemblies(command: {
  calculationInputEvidence: CalculationInputEvidence[];
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
}): BuildPhysicsAssembliesResult {
  const diagnostics: Diagnostic[] = [];
  const seenAssemblyGroupIds = new Set<string>();
  const physicsAssemblies = command.calculationInputEvidence.flatMap((evidence) => {
    const assemblyGroupId = assemblyGroupIdForEvidence(evidence);
    if (seenAssemblyGroupIds.has(assemblyGroupId)) {
      return [];
    }
    const physicsAssembly = buildPhysicsAssembly({
      evidence,
      assemblyGroupId,
      materialLibrary: command.materialLibrary,
      userInputs: command.userInputs,
      diagnostics,
    });
    if (physicsAssembly === null) {
      return [];
    }
    seenAssemblyGroupIds.add(assemblyGroupId);
    return [physicsAssembly];
  });

  return { physicsAssemblies, diagnostics };
}

function buildPhysicsAssembly(command: {
  evidence: CalculationInputEvidence;
  assemblyGroupId: string;
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
  diagnostics: Diagnostic[];
}): PhysicsAssembly | null {
  const layers = layerIndexes(command.evidence).map((layerIndex) =>
    buildPhysicsLayer({
      evidence: command.evidence,
      materialLibrary: command.materialLibrary,
      userInputs: command.userInputs,
      layerIndex,
    }),
  );
  if (layers.length === 0 || layers.some((layer) => layer === null)) {
    command.diagnostics.push({
      code: "physics_assembly_blocked",
      severity: "warning",
      message: `Assembly for element ${command.evidence.elementStepId} lacks complete layer inputs.`,
      stepIds: [command.evidence.elementStepId],
    });
    return null;
  }
  const completeLayers = layers as PhysicsLayer[];
  const isIfcExtractedOnly = completeLayers.every((layer) =>
    layer.datapointSources.every((source) => source === "ifc_extracted"),
  );

  return {
    assemblyGroupId: command.assemblyGroupId,
    elementClass: command.evidence.elementClass,
    calculationBasis: isIfcExtractedOnly ? "extracted_layered" : "user_completed_layered",
    confidence: isIfcExtractedOnly ? "high" : "medium",
    surfaceResistanceProfile: defaultSurfaceResistanceProfileFor(command.evidence.elementClass),
    layers: completeLayers,
  };
}

function buildPhysicsLayer(command: {
  evidence: CalculationInputEvidence;
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
  layerIndex: number;
}): PhysicsLayer | null {
  const thicknessInput = numericInput(command.evidence, "layer_thickness", command.layerIndex, command.userInputs);
  const materialInput = stringInput(command.evidence, "layer_material_name", command.layerIndex, command.userInputs);
  const lambda = resolveLambdaForLayer({
    evidence: command.evidence,
    materialName: materialInput?.value ?? null,
    materialLibrary: command.materialLibrary,
    userInputs: command.userInputs,
    layerIndex: command.layerIndex,
  });
  if (thicknessInput === null || materialInput === null || lambda === null) {
    return null;
  }

  const lambdaSource: DatapointSource =
    lambda.source === "material_library"
      ? "material_library"
      : lambda.source === "user_input"
        ? "user_input"
        : "ifc_extracted";

  return {
    layerOccurrenceId: `layer_${command.evidence.elementStepId}_${command.layerIndex}`,
    materialName: materialInput.value,
    thicknessM: thicknessInput.value,
    lambdaWPerMK: lambda.value,
    datapointSources: unique([thicknessInput.source, materialInput.source, lambdaSource]),
    provenance: unique([
      ...thicknessInput.provenance,
      ...materialInput.provenance,
      ...lambda.evidenceReferences.map((reference) => reference.evidencePath),
    ]),
  };
}

function layerIndexes(evidence: CalculationInputEvidence): number[] {
  const explicitIndexes = [
    ...evidence.fixedInputs,
    ...evidence.candidateInputs,
    ...evidence.missingInputs,
  ].flatMap((input) => input.layer === undefined ? [] : [input.layer.layerIndex]);
  if (explicitIndexes.length > 0) {
    return unique(explicitIndexes).sort((a, b) => a - b);
  }

  const layerOrder = evidence.fixedInputs.find((input) => input.field === "layer_order")?.value;
  return Array.isArray(layerOrder) && layerOrder.length > 0
    ? layerOrder.map((_, index) => index)
    : [0];
}

function numericInput(
  evidence: CalculationInputEvidence,
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  layerIndex: number,
  userInputs: UserInput[],
): { value: number; provenance: string[]; source: DatapointSource } | null {
  const reviewed = userInputForLayer(evidence, field, layerIndex, userInputs);
  if (typeof reviewed?.value === "number" && reviewed.value > 0) {
    return { value: reviewed.value, provenance: [], source: "user_input" };
  }
  const input = inputForLayer(evidence, field, layerIndex);
  return typeof input?.value === "number" && input.value > 0
    ? {
        value: input.value,
        provenance: input.evidenceReferences.map((reference) => reference.evidencePath),
        source: "ifc_extracted",
      }
    : null;
}

function stringInput(
  evidence: CalculationInputEvidence,
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  layerIndex: number,
  userInputs: UserInput[],
): { value: string; provenance: string[]; source: DatapointSource } | null {
  const reviewed = userInputForLayer(evidence, field, layerIndex, userInputs);
  if (typeof reviewed?.value === "string" && reviewed.value.trim() !== "") {
    return { value: reviewed.value.trim(), provenance: [], source: "user_input" };
  }
  const input = inputForLayer(evidence, field, layerIndex);
  return typeof input?.value === "string" && input.value.trim() !== ""
    ? {
        value: input.value,
        provenance: input.evidenceReferences.map((reference) => reference.evidencePath),
        source: "ifc_extracted",
      }
    : null;
}

function userInputForLayer(
  evidence: CalculationInputEvidence,
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  layerIndex: number,
  userInputs: UserInput[],
): UserInput | undefined {
  const requestedInputId = layerOccurrenceRequestedInputId(
    evidence.elementStepId,
    field,
    layerIndex,
  );
  return userInputs.find((input) =>
    input.requestedInputId === requestedInputId && input.datapoint === field
  );
}

function inputForLayer(
  evidence: CalculationInputEvidence,
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  layerIndex: number,
) {
  return evidence.fixedInputs.find(
    (candidate) =>
      candidate.field === field &&
      (candidate.layer?.layerIndex === layerIndex ||
        (candidate.layer === undefined && layerIndex === 0)),
  );
}

function resolveLambdaForLayer(command: {
  evidence: CalculationInputEvidence;
  materialName: string | null;
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
  layerIndex: number;
}): ResolvedLambda | null {
  const userInput = command.userInputs.find(
    (input) =>
      input.datapoint === "layer_lambda" &&
      input.requestedInputId ===
        layerOccurrenceRequestedInputId(
          command.evidence.elementStepId,
          "layer_lambda",
          command.layerIndex,
        ) &&
      typeof input.value === "number" &&
      input.value > 0,
  ) ?? command.userInputs.find(
    (input) =>
      input.datapoint === "layer_lambda" &&
      input.requestedInputId ===
        materialDecisionRequestedInputId(normalizeMaterialKey(command.materialName)) &&
      typeof input.value === "number" &&
      input.value > 0,
  );
  if (userInput !== undefined && typeof userInput.value === "number") {
    return {
      value: userInput.value,
      unit: "W/mK",
      source: "user_input",
      confidence: "medium",
      sourceLabel: "review input",
      evidenceReferences: [],
      userInput,
    };
  }

  const ifcLambda = inputForLayer(command.evidence, "layer_lambda", command.layerIndex);
  if (
    ifcLambda?.source === "ifc_fixed" &&
    typeof ifcLambda.value === "number" &&
    ifcLambda.value > 0
  ) {
    return {
      value: ifcLambda.value,
      unit: "W/mK",
      source: "ifc_fixed",
      confidence: ifcLambda.confidence,
      sourceLabel: "IFC fixed lambda evidence",
      evidenceReferences: ifcLambda.evidenceReferences,
    };
  }

  const normalizedName = normalize(command.materialName);
  const materialEntry = command.materialLibrary.entries.find((entry) =>
    [entry.displayName, ...entry.aliases].some((alias) => normalize(alias) === normalizedName),
  );
  return materialEntry === undefined
    ? null
    : {
        value: materialEntry.lambdaWPerMK,
        unit: "W/mK",
        source: "material_library",
        confidence: materialEntry.confidence,
        sourceLabel: materialEntry.sourceLabel,
        evidenceReferences: [],
      };
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
