import type { EffectiveElementEvidence } from "./effectiveElementEvidenceTypes.js";
import type {
  CalculationInput,
  CalculationInputEvidence,
} from "./calculationInputEvidenceTypes.js";
import type {
  CandidatePropertyEvidence,
  Diagnostic,
  LayeredMaterialEvidence,
  MaterialEvidence,
} from "./evidenceTypes.js";

export type DeriveCalculationInputEvidenceResult = {
  calculationInputEvidence: CalculationInputEvidence[];
  diagnostics: Diagnostic[];
};

export function deriveCalculationInputEvidence(command: {
  effectiveElementEvidence: EffectiveElementEvidence[];
}): DeriveCalculationInputEvidenceResult {
  const calculationInputEvidence = command.effectiveElementEvidence.map(
    deriveElementCalculationInputEvidence,
  );

  return {
    calculationInputEvidence,
    diagnostics: calculationInputEvidence.flatMap(
      (evidence) => evidence.diagnostics,
    ),
  };
}

function deriveElementCalculationInputEvidence(
  effectiveElementEvidence: EffectiveElementEvidence,
): CalculationInputEvidence {
  const layeredEvidence =
    effectiveElementEvidence.effectiveMaterialEvidence.find(
      isLayeredMaterialEvidence,
    ) ?? null;
  const candidateInputs = candidateInputsFromEvidence(effectiveElementEvidence);
  const assemblyThicknessCandidates = candidateInputs.filter(
    (input) => input.field === "assembly_thickness",
  );
  const hasNonLayeredMaterialEvidence =
    effectiveElementEvidence.effectiveMaterialEvidence.some(
      (evidence) => !isLayeredMaterialEvidence(evidence),
    );

  if (layeredEvidence !== null) {
    return layeredCalculationInputEvidence({
      effectiveElementEvidence,
      layeredEvidence,
      candidateInputs,
    });
  }

  if (hasNonLayeredMaterialEvidence && assemblyThicknessCandidates.length > 0) {
    return {
      elementStepId: effectiveElementEvidence.elementStepId,
      elementGlobalId: effectiveElementEvidence.elementGlobalId,
      elementClass: effectiveElementEvidence.elementClass,
      calculationInputBasis: "non_layered_estimate_possible",
      fixedInputs: [],
      candidateInputs,
      missingInputs: [
        missingInput({
          field: "layer_stack",
          reason:
            "Non-layered material evidence plus assembly thickness can support only a broad estimate until ordered layers are known.",
          evidenceReferences: effectiveElementEvidence.evidenceReferences,
        }),
      ],
      diagnostics: effectiveElementEvidence.conflictDiagnostics,
    };
  }

  return {
    elementStepId: effectiveElementEvidence.elementStepId,
    elementGlobalId: effectiveElementEvidence.elementGlobalId,
    elementClass: effectiveElementEvidence.elementClass,
    calculationInputBasis: "blocked_missing_evidence",
    fixedInputs: [],
    candidateInputs,
    missingInputs: [
      missingInput({
        field: "calculation_basis_evidence",
        reason:
          "No layered material, non-layered material, or assembly thickness evidence can support calculation input.",
        evidenceReferences: effectiveElementEvidence.evidenceReferences,
      }),
    ],
    diagnostics: effectiveElementEvidence.conflictDiagnostics,
  };
}

function layeredCalculationInputEvidence(command: {
  effectiveElementEvidence: EffectiveElementEvidence;
  layeredEvidence: LayeredMaterialEvidence;
  candidateInputs: CalculationInput[];
}): CalculationInputEvidence {
  const layers = command.layeredEvidence.layers;
  const lambdaCandidatesByLayer = layers.flatMap((layer) =>
    layer.candidatePropertyEvidence
      .filter(
        (candidate) =>
          candidate.candidateKind === "lambda" &&
          candidate.lambdaClassification === "confirmed_lambda" &&
          candidate.normalizedValue !== null &&
          candidate.normalizedValue !== undefined,
      )
      .map((candidate) => ({ layer, candidate })),
  );
  const fixedLambdaLayerStepIds = new Set(
    lambdaCandidatesByLayer.map(({ layer }) => layer.layerStepId),
  );
  const fixedInputs: CalculationInput[] = [
    {
      field: "layer_order",
      value: layers.map((layer) => layer.layerStepId),
      source: "ifc_fixed",
      confidence: "high",
      evidenceReferences: [command.layeredEvidence.layerSet.evidenceReference],
      reason: "IfcMaterialLayerSet.MaterialLayers provides ordered layer evidence.",
    },
    ...layers
      .filter((layer) => layer.thickness?.normalizedValue !== null)
      .map((layer): CalculationInput => ({
        field: "layer_thickness",
        value: layer.thickness?.normalizedValue,
        source: "ifc_fixed",
        confidence: layer.thickness?.confidence ?? "low",
        evidenceReferences:
          layer.thickness === null ? [] : [layer.thickness.evidenceReference],
        reason: "IfcMaterialLayer.LayerThickness provides fixed thickness evidence.",
        layer: layerIdentity(layer),
      })),
    ...layers
      .filter((layer) => layer.materialName !== null)
      .map((layer): CalculationInput => ({
        field: "layer_material_name",
        value: layer.materialName,
        source: "ifc_fixed",
        confidence: "high",
        evidenceReferences: [layer.evidenceReference],
        reason: "IfcMaterialLayer.Material provides material identity evidence.",
        layer: layerIdentity(layer),
      })),
    ...lambdaCandidatesByLayer.map(({ layer, candidate }): CalculationInput => ({
      field: "layer_lambda",
      value: candidate.normalizedValue,
      source: "ifc_fixed",
      confidence: candidate.confidence,
      evidenceReferences: [candidate.evidenceReference],
      reason: "Confirmed lambda candidate provides fixed thermal conductivity evidence.",
      layer: layerIdentity(layer),
    })),
  ];
  const missingInputs: CalculationInput[] = [
    ...layers
      .filter((layer) => layer.thickness?.normalizedValue === null)
      .map((layer) =>
        missingInput({
          field: "layer_thickness",
          reason: "Layer thickness is missing or lacks normalized units.",
          evidenceReferences: [layer.evidenceReference],
          layer: layerIdentity(layer),
        }),
      ),
    ...layers
      .filter((layer) => layer.materialName === null)
      .map((layer) =>
        missingInput({
          field: "layer_material_name",
          reason: "Layer material name is missing.",
          evidenceReferences: [layer.evidenceReference],
          layer: layerIdentity(layer),
        }),
      ),
    ...layers
      .filter((layer) => !fixedLambdaLayerStepIds.has(layer.layerStepId))
      .map((layer) =>
        missingInput({
          field: "layer_lambda",
          reason:
            "Layer lambda was not fixed by IFC evidence and must be resolved by Material Library or user input later.",
          evidenceReferences: [layer.evidenceReference],
          layer: layerIdentity(layer),
        }),
      ),
  ];

  return {
    elementStepId: command.effectiveElementEvidence.elementStepId,
    elementGlobalId: command.effectiveElementEvidence.elementGlobalId,
    elementClass: command.effectiveElementEvidence.elementClass,
    calculationInputBasis:
      missingInputs.some((input) => input.field === "layer_lambda") ||
      missingInputs.length > 0
        ? "layered_needs_material_resolution"
        : "layered_ifc_complete",
    fixedInputs,
    candidateInputs: command.candidateInputs,
    missingInputs,
    diagnostics: command.effectiveElementEvidence.conflictDiagnostics,
  };
}

function candidateInputsFromEvidence(
  effectiveElementEvidence: EffectiveElementEvidence,
): CalculationInput[] {
  return dedupeCalculationInputs([
    ...effectiveElementEvidence.candidatePropertyEvidence,
    ...effectiveElementEvidence.effectiveMaterialEvidence.flatMap((evidence) =>
      isLayeredMaterialEvidence(evidence)
        ? evidence.layers.flatMap((layer) => layer.candidatePropertyEvidence)
        : [],
    ),
  ].map(candidateInputFromCandidateEvidence));
}

function candidateInputFromCandidateEvidence(
  candidate: CandidatePropertyEvidence,
): CalculationInput {
  return {
    field:
      candidate.candidateKind === "lambda"
        ? "layer_lambda"
        : candidate.candidateKind === "assembly_thickness"
          ? "assembly_thickness"
          : "calculation_basis_evidence",
    value: candidate.normalizedValue ?? candidate.rawValue,
    source: "ifc_candidate",
    confidence: candidate.confidence,
    evidenceReferences: [candidate.evidenceReference],
    reason: candidate.reason,
  };
}

function missingInput(command: {
  field: CalculationInput["field"];
  reason: string;
  evidenceReferences: CalculationInput["evidenceReferences"];
  layer?: CalculationInput["layer"];
}): CalculationInput {
  return {
    field: command.field,
    value: null,
    source: "missing",
    confidence: "high",
    evidenceReferences: command.evidenceReferences,
    reason: command.reason,
    layer: command.layer,
  };
}

function isLayeredMaterialEvidence(
  evidence: MaterialEvidence,
): evidence is LayeredMaterialEvidence {
  return (
    evidence.materialStructureKind === "layer_set" ||
    evidence.materialStructureKind === "layer_set_usage"
  );
}

function dedupeCalculationInputs(inputs: CalculationInput[]): CalculationInput[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = [
      input.field,
      JSON.stringify(input.value),
      input.evidenceReferences.map((reference) => reference.evidencePath).join("|"),
    ].join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function layerIdentity(layer: LayeredMaterialEvidence["layers"][number]): CalculationInput["layer"] {
  return {
    layerIndex: layer.layerIndex,
    layerStepId: layer.layerStepId,
    materialName: layer.materialName,
  };
}
