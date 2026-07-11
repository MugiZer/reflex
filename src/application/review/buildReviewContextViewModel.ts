import type { CalculationInputEvidence, CalculationInputField } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { ElementClass, EvidenceReference, StepId } from "../../domain/evidence/evidenceTypes.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import type { OverrideScopeKind, RequestedInput } from "../../domain/review/reviewTypes.js";

export type ReviewContextViewModel = {
  jobId: string;
  groups: ReviewContextGroupViewModel[];
  scopeOptions: ReviewScopeOptionViewModel[];
};

export type ReviewContextGroupViewModel = {
  assemblyGroupId: string;
  primaryLabel: string;
  secondaryLabel: string;
  sourceElementCount: number;
  reviewTargetStepIds: StepId[];
  displayStepIds: StepId[];
  highlightMode: ReviewHighlightMode;
  /** Compatibility alias for older UI code. Prefer displayStepIds for viewer use. */
  highlightStepIds: StepId[];
  questions: ReviewQuestionViewModel[];
};

export type ReviewHighlightMode = "element" | "material_decision" | "assembly_group" | "element_type";

export type ReviewQuestionViewModel = {
  requestedInputId: string;
  assemblyGroupId: string;
  question: string;
  inputType: RequestedInput["inputType"];
  datapoint: CalculationInputField;
  missingValueLabel: string;
  unit: string | null;
  scopeKind: OverrideScopeKind;
  scopeOptions: ReviewScopeOptionViewModel[];
  evidenceSummary: ReviewEvidenceSummaryViewModel;
  reviewTargetStepIds: StepId[];
  displayStepIds: StepId[];
  highlightMode: ReviewHighlightMode;
  /** Compatibility alias for older UI code. Prefer displayStepIds for viewer use. */
  highlightStepIds: StepId[];
  technicalIds: {
    requestedInputId: string;
    assemblyGroupId: string;
    scopeKind: RequestedInput["scope"]["scopeKind"];
  };
};

export type ReviewScopeOptionViewModel = {
  scopeKind: OverrideScopeKind;
  label: string;
  explanation: string;
};

export type ReviewEvidenceSummaryViewModel = {
  ifcClassLabel: string;
  elementLabel: string;
  layerLabel: string | null;
  materialLabel: string | null;
  sourceElementCount: number;
  evidencePathLabel: string;
};

export function buildReviewContextViewModel(command: {
  jobId: string;
  requestedInputs: RequestedInput[];
  calculationInputEvidence?: CalculationInputEvidence[];
}): ReviewContextViewModel {
  const evidenceByElement = new Map(
    (command.calculationInputEvidence ?? []).map((evidence) => [evidence.elementStepId, evidence]),
  );
  const groups = groupBy(command.requestedInputs, (input) => input.reviewGroupId).map(
    ([reviewGroupId, requestedInputs]) => {
      const questions = requestedInputs.map((input) =>
        questionViewModel(input, evidenceByElement, command.calculationInputEvidence ?? []),
      );
      const first = questions[0];
      return {
        assemblyGroupId: first?.assemblyGroupId ?? reviewGroupId,
        primaryLabel: first
          ? groupPrimaryLabel(first)
          : "Assembly requiring review",
        secondaryLabel: first?.evidenceSummary.ifcClassLabel ?? "IFC element",
        sourceElementCount: first?.evidenceSummary.sourceElementCount ?? 0,
        reviewTargetStepIds: unique(questions.flatMap((question) => question.reviewTargetStepIds)),
        displayStepIds: unique(questions.flatMap((question) => question.displayStepIds)),
        highlightMode: first?.highlightMode ?? "element",
        highlightStepIds: unique(questions.flatMap((question) => question.displayStepIds)),
        questions,
      };
    },
  );

  return {
    jobId: command.jobId,
    groups,
    scopeOptions: scopeOptions(),
  };
}

function questionViewModel(
  input: RequestedInput,
  evidenceByElement: Map<StepId, CalculationInputEvidence>,
  allEvidence: CalculationInputEvidence[],
): ReviewQuestionViewModel {
  const elementStepId = elementStepIdFor(input);
  const elementEvidence = elementStepId === null ? undefined : evidenceByElement.get(elementStepId);
  const elementClass = elementEvidence?.elementClass ?? elementClassFor(input);
  const sourceElementCount = sourceElementCountFor(input, allEvidence);
  const reviewTargetStepIds = reviewTargetStepIdsFor(input);
  const displayStepIds = displayStepIdsFor(input, allEvidence);
  const highlightMode = highlightModeFor(input);
  const evidenceSummary: ReviewEvidenceSummaryViewModel = {
    ifcClassLabel: elementClass ?? "IFC element",
    elementLabel: elementClass ? humanElementClass(elementClass) : "Building element",
    layerLabel: layerLabelFor(input, elementEvidence),
    materialLabel: materialLabelFor(input, elementEvidence),
    sourceElementCount,
    evidencePathLabel: evidencePathLabelFor(input.evidenceReferences),
  };

  return {
    requestedInputId: input.requestedInputId,
    assemblyGroupId: input.assemblyGroupId,
    question: input.question,
    inputType: input.inputType,
    datapoint: input.datapoint,
    missingValueLabel: missingValueLabelFor(input.datapoint),
    unit: input.unit,
    scopeKind: input.scope.scopeKind,
    scopeOptions: scopeOptions(),
    evidenceSummary,
    reviewTargetStepIds,
    displayStepIds,
    highlightMode,
    highlightStepIds: displayStepIds,
    technicalIds: {
      requestedInputId: input.requestedInputId,
      assemblyGroupId: input.assemblyGroupId,
      scopeKind: input.scope.scopeKind,
    },
  };
}

function scopeOptions(): ReviewScopeOptionViewModel[] {
  return [
    {
      scopeKind: "layer_occurrence",
      label: "Only this layer in this element",
      explanation: "Use this when the value applies only to the selected layer occurrence.",
    },
    {
      scopeKind: "material_decision",
      label: "All matching layers using this material",
      explanation: "Use this when the same material label should receive one lambda value across this review.",
    },
    {
      scopeKind: "assembly_group",
      label: "All matching assemblies in this review group",
      explanation: "Use this when the same value should apply to matching assemblies grouped for this review.",
    },
    {
      scopeKind: "element_type",
      label: "All elements using this IFC type",
      explanation: "Use this when the value belongs to the shared IFC type definition.",
    },
  ];
}

function elementStepIdFor(input: RequestedInput): StepId | null {
  if (input.scope.scopeKind === "layer_occurrence") {
    return input.scope.elementStepId;
  }
  if (input.scope.scopeKind === "material_decision") {
    return input.scope.affectedLayers[0]?.elementStepId ?? null;
  }
  const firstSourceStepId = input.evidenceReferences[0]?.sourceStepIds[0];
  return typeof firstSourceStepId === "number" ? firstSourceStepId : null;
}

function elementClassFor(input: RequestedInput): ElementClass | null {
  return input.scope.scopeKind === "element_type" ? input.scope.elementClass : null;
}

function sourceElementCountFor(
  input: RequestedInput,
  allEvidence: CalculationInputEvidence[],
): number {
  if (allEvidence.length === 0) {
    return 1;
  }
  if (input.scope.scopeKind === "element_type") {
    const elementClass = input.scope.elementClass;
    return allEvidence.filter((evidence) => evidence.elementClass === elementClass).length;
  }
  if (input.scope.scopeKind === "material_decision") {
    return unique(input.scope.affectedLayers.map((layer) => layer.elementStepId)).length;
  }
  if (input.scope.scopeKind === "assembly_group") {
    return allEvidence.filter((evidence) => assemblyGroupIdForEvidence(evidence) === input.assemblyGroupId).length;
  }
  return 1;
}

function reviewTargetStepIdsFor(input: RequestedInput): StepId[] {
  const sourceStepIds = unique(input.evidenceReferences.flatMap((ref) => ref.sourceStepIds));
  if (sourceStepIds.length > 0) {
    return sourceStepIds;
  }
  if (input.scope.scopeKind === "material_decision") {
    return unique(input.scope.affectedLayers.flatMap((layer) =>
      layer.layerStepId === null ? [layer.elementStepId] : [layer.layerStepId],
    ));
  }
  if (input.scope.scopeKind === "layer_occurrence") {
    return [input.scope.elementStepId];
  }
  return [];
}

function displayStepIdsFor(
  input: RequestedInput,
  allEvidence: CalculationInputEvidence[],
): StepId[] {
  if (input.scope.scopeKind === "layer_occurrence") {
    return [input.scope.elementStepId];
  }
  if (input.scope.scopeKind === "element_type") {
    const elementClass = input.scope.elementClass;
    return allEvidence
      .filter((evidence) => evidence.elementClass === elementClass)
      .map((evidence) => evidence.elementStepId);
  }
  if (input.scope.scopeKind === "material_decision") {
    return unique(input.scope.affectedLayers.map((layer) => layer.elementStepId));
  }
  const grouped = allEvidence
    .filter((evidence) => assemblyGroupIdForEvidence(evidence) === input.assemblyGroupId)
    .map((evidence) => evidence.elementStepId);
  return grouped.length > 0 ? grouped : unique(input.evidenceReferences.flatMap((ref) => ref.sourceStepIds));
}

function highlightModeFor(input: RequestedInput): ReviewHighlightMode {
  if (input.scope.scopeKind === "element_type") {
    return "element_type";
  }
  if (input.scope.scopeKind === "material_decision") {
    return "material_decision";
  }
  if (input.scope.scopeKind === "assembly_group") {
    return "assembly_group";
  }
  return "element";
}

function layerLabelFor(
  input: RequestedInput,
  evidence: CalculationInputEvidence | undefined,
): string | null {
  if (input.scope.scopeKind === "material_decision") {
    return `${input.scope.affectedLayers.length} layer occurrences`;
  }
  const layerIndex = input.scope.scopeKind === "layer_occurrence" ? input.scope.layerIndex : null;
  if (layerIndex === null || layerIndex === undefined) {
    return null;
  }
  const layerOrder = evidence?.fixedInputs.find((fixed) => fixed.field === "layer_order")?.value;
  const layerStepId = Array.isArray(layerOrder) ? layerOrder[layerIndex] : undefined;
  const materialName = materialLabelFor(input, evidence);
  if (materialName) {
    return `Layer ${layerIndex + 1}: ${materialName}`;
  }
  if (typeof layerStepId === "number") {
    return `Layer ${layerIndex + 1} (IFC #${layerStepId})`;
  }
  return `Layer ${layerIndex + 1}`;
}

function materialLabelFor(
  input: RequestedInput,
  evidence: CalculationInputEvidence | undefined,
): string | null {
  if (input.scope.scopeKind === "material_decision") {
    return input.scope.materialName;
  }
  const layerIndex = input.scope.scopeKind === "layer_occurrence" ? input.scope.layerIndex : null;
  const material = evidence?.fixedInputs.find(
    (fixed) =>
      fixed.field === "layer_material_name" &&
      (layerIndex === null || fixed.layer?.layerIndex === layerIndex),
  )?.value
    ?? evidence?.candidateInputs.find(
      (candidate) =>
        candidate.field === "layer_material_name" &&
        (layerIndex === null || candidate.layer?.layerIndex === layerIndex),
    )?.value
    ?? evidence?.fixedInputs.find((fixed) => fixed.field === "layer_material_name")?.value
    ?? evidence?.candidateInputs.find((candidate) => candidate.field === "layer_material_name")?.value;
  return typeof material === "string" && material.trim() ? material : null;
}

function missingValueLabelFor(field: CalculationInputField): string {
  if (field === "layer_lambda") {
    return "Thermal conductivity";
  }
  if (field === "layer_thickness") {
    return "Layer thickness";
  }
  if (field === "layer_material_name") {
    return "Layer material name";
  }
  if (field === "assembly_thickness") {
    return "Assembly thickness";
  }
  if (field === "calculation_basis_evidence") {
    return "Calculation basis evidence";
  }
  return field.replaceAll("_", " ");
}

function humanElementClass(elementClass: ElementClass): string {
  if (elementClass === "IfcWall" || elementClass === "IfcCurtainWall") {
    return "Wall";
  }
  if (elementClass === "IfcSlab") {
    return "Slab";
  }
  if (elementClass === "IfcRoof") {
    return "Roof";
  }
  return "Building element";
}

function groupPrimaryLabel(first: ReviewQuestionViewModel): string {
  if (first.scopeKind === "material_decision" && first.evidenceSummary.materialLabel) {
    return `${first.evidenceSummary.materialLabel} requiring thermal conductivity`;
  }
  return `${first.evidenceSummary.elementLabel} requiring ${first.missingValueLabel.toLowerCase()}`;
}

function evidencePathLabelFor(references: EvidenceReference[]): string {
  const firstPath = references[0]?.evidencePath;
  return firstPath && firstPath.trim() ? firstPath : "No direct evidence path";
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
