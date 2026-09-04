import type {
  CalculationSnapshot,
  DatapointSource,
} from "../../domain/calculations/calculationTypes.js";
import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Confidence, ElementClass, StepId } from "../../domain/evidence/evidenceTypes.js";
import type { JobStatus } from "../../domain/jobs/jobTypes.js";
import { specialPhysicsIssuesForEvidence } from "../../domain/materials/materialResolution.js";
import type { MaterialLibrary, MaterialMatchBasis, MaterialResolution, SpecialPhysicsIssue } from "../../domain/materials/materialTypes.js";
import { deriveEvidenceReadinessState } from "../../domain/assemblies/deriveEvidenceReadiness.js";
import {
  assemblyGroupIdForEvidence,
  groupCalculationInputEvidenceByAssembly,
} from "../../domain/review/reviewGrouping.js";
import type { RequestedInput } from "../../domain/review/reviewTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";

export type ArchitectTarget = {
  maxUValueWPerM2K: number;
  label: string;
};

export type ArchitectActionViewModel = {
  jobId: string;
  jobStatus: JobStatus;
  target: ArchitectTarget | null;
  summary: {
    assemblyCount: number;
    needsActionCount: number;
    needsReviewCount: number;
    blockedCount: number;
    failingTargetCount: number;
    passingTargetCount: number;
    unassessedCount: number;
  };
  assemblies: ArchitectAssemblyAction[];
};

export type ArchitectAssemblyAction = {
  assemblyGroupId: string;
  label: string;
  elementClass: ElementClass;
  locationLabel: string;
  sourceElementCount: number;
  sourceElements: Array<{
    stepId: StepId;
    globalId: string | null;
    locationLabel: string;
  }>;
  displayStepIds: StepId[];
  readinessState: "ready" | "needs_review" | "estimated" | "blocked";
  calculationConfidence: Confidence | null;
  evidenceState: {
    status: "incomplete" | "ifc_extracted" | "library_assisted" | "user_completed" | "estimated";
    datapointSources: DatapointSource[];
    unresolvedInputCount: number;
  };
  specialIssues: SpecialPhysicsIssue[];
  optionalOverrides: Array<{
    requestedInputId: string;
    rawMaterialName: string;
    matchedMaterialName: string;
    matchBasis: string | null;
  }>;
  performance: {
    result:
      | { kind: "value"; uValueWPerM2K: number }
      | { kind: "range"; min: number; max: number }
      | { kind: "unavailable" };
    target: ArchitectTarget | null;
    verdict: "meets_target" | "misses_target" | "indeterminate" | "not_assessed";
    marginWPerM2K: number | null;
  };
  problem: string;
  nextAction: {
    kind: "resolve_input" | "fix_ifc" | "set_target" | "improve_performance" | "verify_assumptions" | "calculate" | "none";
    label: string;
    requestedInputIds: string[];
  };
  layers: Array<{
    materialName: string;
    thicknessMm: number;
    thicknessSharePercent: number;
    lambdaWPerMK: number;
    rValueM2KPerW: number;
    datapointSources: DatapointSource[];
    rawMaterialName?: string | null;
    materialLibraryKey?: string;
    materialLibraryName?: string;
    matchBasis?: MaterialMatchBasis | null;
    evidenceState?: MaterialResolution["evidenceState"];
  }>;
  warnings: string[];
  priorityRank: number;
};

export function buildArchitectActionViewModel(command: {
  jobId: string;
  jobStatus: JobStatus;
  calculationInputEvidence: CalculationInputEvidence[];
  requestedInputs: RequestedInput[];
  activeRevision: Revision | null;
  target: ArchitectTarget | null;
  materialLibrary?: MaterialLibrary;
}): ArchitectActionViewModel {
  const evidenceGroups = groupCalculationInputEvidenceByAssembly(command.calculationInputEvidence);
  const snapshots = new Map(
    (command.activeRevision?.calculationSnapshots ?? []).map((snapshot) => [
      snapshot.assemblyGroupId,
      snapshot,
    ]),
  );
  const requestedInputsByAssembly = mapRequestedInputsToAssemblies(command.requestedInputs);
  const resolvedInputIds = new Set(
    (command.activeRevision?.userInputs ?? []).map((input) => input.requestedInputId),
  );
  const assemblyGroupIds = unique([
    ...evidenceGroups.keys(),
    ...snapshots.keys(),
    ...requestedInputsByAssembly.keys(),
  ]);

  const assemblies = assemblyGroupIds.map((assemblyGroupId) => {
    const evidence = evidenceGroups.get(assemblyGroupId) ?? [];
    const snapshot = snapshots.get(assemblyGroupId) ?? null;
    const requestedInputs = requestedInputsByAssembly.get(assemblyGroupId) ?? [];
    const unresolvedInputs = requestedInputs.filter(
      (requested) => requested.required !== false && !resolvedInputIds.has(requested.requestedInputId),
    );
    return assemblyAction({
      assemblyGroupId,
      evidence,
      snapshot,
      requestedInputs,
      unresolvedInputs,
      target: command.target,
      jobStatus: command.jobStatus,
      materialLibrary: command.materialLibrary,
    });
  }).sort((left, right) =>
    left.priorityRank - right.priorityRank || left.label.localeCompare(right.label)
  );

  return {
    jobId: command.jobId,
    jobStatus: command.jobStatus,
    target: command.target,
    summary: {
      assemblyCount: assemblies.length,
      needsActionCount: assemblies.filter((assembly) => assembly.nextAction.kind !== "none").length,
      needsReviewCount: assemblies.filter((assembly) => assembly.readinessState === "needs_review").length,
      blockedCount: assemblies.filter((assembly) => assembly.readinessState === "blocked").length,
      failingTargetCount: assemblies.filter((assembly) =>
        assembly.performance.verdict === "misses_target"
      ).length,
      passingTargetCount: assemblies.filter((assembly) =>
        assembly.performance.verdict === "meets_target"
      ).length,
      unassessedCount: assemblies.filter((assembly) =>
        assembly.performance.verdict === "not_assessed"
      ).length,
    },
    assemblies,
  };
}

function assemblyAction(command: {
  assemblyGroupId: string;
  evidence: CalculationInputEvidence[];
  snapshot: CalculationSnapshot | null;
  requestedInputs: RequestedInput[];
  unresolvedInputs: RequestedInput[];
  target: ArchitectTarget | null;
  jobStatus: JobStatus;
  materialLibrary?: MaterialLibrary;
}): ArchitectAssemblyAction {
  const elementClass = command.evidence[0]?.elementClass ?? "IfcBuildingElementProxy";
  const materialLibrary = command.materialLibrary ?? { version: "materials.library.v1" as const, entries: [] };
  const specialIssues = command.evidence.flatMap((evidence) => specialPhysicsIssuesForEvidence({ evidence, materialLibrary }));
  const sourceElements = command.evidence.map((evidence) => ({
    stepId: evidence.elementStepId,
    globalId: evidence.elementGlobalId,
    locationLabel: `${humanElementClass(evidence.elementClass)} | IFC #${evidence.elementStepId}`,
  }));
  const label = assemblyLabel(elementClass, command.evidence, command.snapshot);
  const hasBlockingInput = command.unresolvedInputs.some((input) =>
    input.datapoint === "calculation_basis_evidence"
  );
  const isSpecialBlocked = specialIssues.length > 0;
  const readinessState = isSpecialBlocked || hasBlockingInput
    ? "blocked"
    : command.unresolvedInputs.length > 0
      ? "needs_review"
      : command.snapshot?.readinessState ?? deriveEvidenceReadinessState(command.evidence);
  const performance = performanceFor(command.snapshot, command.target);
  const evidenceState = evidenceStateFor(
    command.snapshot,
    command.unresolvedInputs.length,
    command.requestedInputs.filter((input) => input.required !== false).length - command.unresolvedInputs.length,
  );
  const specialNextAction = specialIssues[0]
    ? { kind: "fix_ifc" as const, label: specialIssues[0].nextAction }
    : null;
  const nextAction = nextActionFor({
    label,
    readinessState,
    unresolvedInputs: command.unresolvedInputs,
    performance,
    confidence: command.snapshot?.confidence ?? null,
    hasCalculation: command.snapshot !== null,
    jobStatus: command.jobStatus,
  });

  return {
    assemblyGroupId: command.assemblyGroupId,
    label,
    elementClass,
    locationLabel: locationLabel(sourceElements, elementClass),
    sourceElementCount: sourceElements.length,
    sourceElements,
    displayStepIds: sourceElements.map((element) => element.stepId),
    readinessState,
    calculationConfidence: command.snapshot?.confidence ?? null,
    evidenceState,
    specialIssues,
    optionalOverrides: command.requestedInputs
      .filter((input) => input.required === false && affectedAssemblyGroupIds(input).includes(command.assemblyGroupId))
      .map((input) => ({
        requestedInputId: input.requestedInputId,
        rawMaterialName: input.scope.scopeKind === "material_decision" ? input.scope.materialName : "Unknown IFC material",
        matchedMaterialName: input.materialResolution?.matchedMaterialName ?? "Material Library value",
        matchBasis: input.materialResolution?.matchBasis ?? null,
      })),
    performance,
    problem: specialIssues[0]?.message ?? problemFor(readinessState, performance, command.unresolvedInputs.length, command.snapshot),
    nextAction: {
      ...(specialNextAction ?? nextAction),
      requestedInputIds: unique(command.unresolvedInputs.map((input) => input.requestedInputId)),
    },
    layers: layerViewModels(command.snapshot),
    warnings: command.snapshot?.warnings ?? [],
    priorityRank: priorityFor(readinessState, performance.verdict, command.snapshot?.confidence ?? null),
  };
}

function mapRequestedInputsToAssemblies(requestedInputs: RequestedInput[]) {
  const byAssembly = new Map<string, RequestedInput[]>();
  for (const requestedInput of requestedInputs) {
    for (const assemblyGroupId of affectedAssemblyGroupIds(requestedInput)) {
      const existing = byAssembly.get(assemblyGroupId) ?? [];
      if (!existing.some((input) => input.requestedInputId === requestedInput.requestedInputId)) {
        byAssembly.set(assemblyGroupId, [...existing, requestedInput]);
      }
    }
  }
  return byAssembly;
}

function affectedAssemblyGroupIds(input: RequestedInput): string[] {
  if (input.scope.scopeKind === "material_decision") {
    return unique(input.scope.affectedLayers.map((layer) => layer.assemblyGroupId));
  }
  return [input.assemblyGroupId];
}

function performanceFor(
  snapshot: CalculationSnapshot | null,
  target: ArchitectTarget | null,
): ArchitectAssemblyAction["performance"] {
  if (snapshot?.thermalTreatment && snapshot.thermalTreatment.trustState !== "verified") {
    const result = snapshot.uValueWPerM2K === null || snapshot.uValueWPerM2K === undefined ? { kind: "unavailable" as const } : { kind: "value" as const, uValueWPerM2K: snapshot.uValueWPerM2K };
    return { result, target: null, verdict: "not_assessed", marginWPerM2K: null };
  }
  const result: ArchitectAssemblyAction["performance"]["result"] = snapshot?.uValueWPerM2K !== null &&
    snapshot?.uValueWPerM2K !== undefined
    ? { kind: "value", uValueWPerM2K: snapshot.uValueWPerM2K }
    : snapshot?.uValueRangeWPerM2K
      ? {
          kind: "range",
          min: snapshot.uValueRangeWPerM2K.min,
          max: snapshot.uValueRangeWPerM2K.max,
        }
      : { kind: "unavailable" };
  if (target === null || result.kind === "unavailable") {
    return { result, target, verdict: "not_assessed", marginWPerM2K: null };
  }
  if (result.kind === "value") {
    return {
      result,
      target,
      verdict: result.uValueWPerM2K <= target.maxUValueWPerM2K
        ? "meets_target"
        : "misses_target",
      marginWPerM2K: target.maxUValueWPerM2K - result.uValueWPerM2K,
    };
  }
  if (result.max <= target.maxUValueWPerM2K) {
    return {
      result,
      target,
      verdict: "meets_target",
      marginWPerM2K: target.maxUValueWPerM2K - result.max,
    };
  }
  if (result.min > target.maxUValueWPerM2K) {
    return {
      result,
      target,
      verdict: "misses_target",
      marginWPerM2K: target.maxUValueWPerM2K - result.min,
    };
  }
  return { result, target, verdict: "indeterminate", marginWPerM2K: null };
}

function evidenceStateFor(
  snapshot: CalculationSnapshot | null,
  unresolvedInputCount: number,
  resolvedReviewInputCount: number,
): ArchitectAssemblyAction["evidenceState"] {
  const datapointSources = unique(snapshot?.layers.flatMap((layer) => layer.datapointSources) ?? []);
  if (unresolvedInputCount > 0) {
    return { status: "incomplete", datapointSources, unresolvedInputCount };
  }
  if (datapointSources.includes("material_library")) {
    return { status: "library_assisted", datapointSources, unresolvedInputCount };
  }
  if (resolvedReviewInputCount > 0) {
    return { status: "user_completed", datapointSources, unresolvedInputCount };
  }
  if (snapshot?.readinessState === "estimated" || snapshot?.calculationBasis === "estimated_from_non_layered") {
    return { status: "estimated", datapointSources, unresolvedInputCount };
  }
  if (datapointSources.includes("user_input") || snapshot?.calculationBasis.startsWith("user_completed")) {
    return { status: "user_completed", datapointSources, unresolvedInputCount };
  }
  return { status: "ifc_extracted", datapointSources, unresolvedInputCount };
}

function problemFor(
  readinessState: ArchitectAssemblyAction["readinessState"],
  performance: ArchitectAssemblyAction["performance"],
  unresolvedInputCount: number,
  snapshot: CalculationSnapshot | null,
): string {
  if (readinessState === "blocked") {
    return snapshot?.warnings[0] ?? "The IFC does not contain enough reliable assembly evidence to calculate.";
  }
  if (unresolvedInputCount > 0) {
    return `${unresolvedInputCount} required input${unresolvedInputCount === 1 ? " is" : "s are"} still missing.`;
  }
  if (performance.verdict === "misses_target" && performance.marginWPerM2K !== null) {
    return `The result is ${Math.abs(performance.marginWPerM2K).toFixed(3)} W/m2K above the working target.`;
  }
  if (performance.verdict === "indeterminate") {
    return "The estimated U-value range crosses the working target.";
  }
  if (performance.verdict === "meets_target" && performance.marginWPerM2K !== null) {
    return `The result is ${performance.marginWPerM2K.toFixed(3)} W/m2K below the working target.`;
  }
  if (performance.result.kind === "unavailable") {
    return "A thermal result is not available yet.";
  }
  return "The result has not been assessed against a project target.";
}
function nextActionFor(command: {
  label: string;
  readinessState: ArchitectAssemblyAction["readinessState"];
  unresolvedInputs: RequestedInput[];
  performance: ArchitectAssemblyAction["performance"];
  confidence: Confidence | null;
  hasCalculation: boolean;
  jobStatus: JobStatus;
}): Omit<ArchitectAssemblyAction["nextAction"], "requestedInputIds"> {
  if (command.readinessState === "blocked") {
    return {
      kind: "fix_ifc",
      label: "Repair or supplement the IFC assembly evidence before calculation.",
    };
  }
  if (command.unresolvedInputs.length > 0) {
    const missing = unique(command.unresolvedInputs.map((input) => missingValueLabel(input))).join(" and ");
    return { kind: "resolve_input", label: `Provide ${missing} for ${command.label}.` };
  }
  if (command.performance.verdict === "misses_target") {
    return {
      kind: "improve_performance",
      label: "Review insulation thickness or material selection to reach the project target.",
    };
  }
  if (command.performance.verdict === "indeterminate" || command.confidence === "low") {
    return {
      kind: "verify_assumptions",
      label: "Confirm estimated inputs before design sign-off.",
    };
  }
  if (!command.hasCalculation) {
    return {
      kind: "calculate",
      label: command.jobStatus === "needs_review"
        ? "Complete the remaining Review decisions, then run the thermal calculation."
        : "Run the thermal calculation for this assembly.",
    };
  }
  if (command.performance.target === null) {
    return { kind: "set_target", label: "Set the project U-value target to assess this result." };
  }
  return { kind: "none", label: "No thermal change required; retain this assembly." };
}

function priorityFor(
  readinessState: ArchitectAssemblyAction["readinessState"],
  verdict: ArchitectAssemblyAction["performance"]["verdict"],
  confidence: Confidence | null,
): number {
  if (readinessState === "blocked") return 0;
  if (readinessState === "needs_review") return 10;
  if (verdict === "misses_target") return 20;
  if (verdict === "indeterminate") return 30;
  if (readinessState === "estimated" || confidence === "low") return 40;
  if (verdict === "not_assessed") return 50;
  return 60;
}

function layerViewModels(snapshot: CalculationSnapshot | null): ArchitectAssemblyAction["layers"] {
  const totalThicknessM = snapshot?.layers.reduce((sum, layer) => sum + layer.thicknessM, 0) ?? 0;
  return (snapshot?.layers ?? []).map((layer) => ({
    materialName: layer.materialName,
    rawMaterialName: layer.rawMaterialName ?? layer.materialName,
    materialLibraryKey: layer.materialLibraryKey,
    materialLibraryName: layer.materialLibraryName,
    matchBasis: layer.materialResolution?.matchBasis ?? null,
    evidenceState: layer.evidenceState,
    thicknessMm: round(layer.thicknessM * 1000, 1),
    thicknessSharePercent: totalThicknessM > 0
      ? round((layer.thicknessM / totalThicknessM) * 100, 1)
      : 0,
    lambdaWPerMK: layer.lambdaWPerMK,
    rValueM2KPerW: layer.rValueM2KPerW,
    datapointSources: layer.datapointSources,
  }));
}

function assemblyLabel(
  elementClass: ElementClass,
  evidence: CalculationInputEvidence[],
  snapshot: CalculationSnapshot | null,
): string {
  const materialNames = unique([
    ...evidence.flatMap((item) => item.fixedInputs
      .filter((input) => input.field === "layer_material_name" && typeof input.value === "string")
      .map((input) => String(input.value))),
    ...(snapshot?.layers.map((layer) => layer.materialName) ?? []),
  ]).filter(Boolean);
  const materialLabel = materialNames.length > 0
    ? materialNames.slice(0, 3).join(" + ") + (materialNames.length > 3 ? ` +${materialNames.length - 3}` : "")
    : "assembly";
  return `${humanElementClass(elementClass)} | ${materialLabel}`;
}

function locationLabel(
  sourceElements: ArchitectAssemblyAction["sourceElements"],
  elementClass: ElementClass,
): string {
  if (sourceElements.length === 0) return `${humanElementClass(elementClass)} | IFC location unavailable`;
  if (sourceElements.length === 1) return sourceElements[0].locationLabel;
  return `${sourceElements.length} ${humanElementClass(elementClass).toLowerCase()} elements in the IFC model`;
}

function humanElementClass(elementClass: ElementClass): string {
  if (elementClass === "IfcWall") return "Wall";
  if (elementClass === "IfcCurtainWall") return "Curtain wall";
  if (elementClass === "IfcSlab") return "Slab";
  if (elementClass === "IfcRoof") return "Roof";
  return "Building element";
}

function missingValueLabel(input: RequestedInput): string {
  if (input.datapoint === "layer_lambda") return "thermal conductivity";
  if (input.datapoint === "layer_thickness") return "layer thickness";
  if (input.datapoint === "layer_material_name") return "material identity";
  if (input.datapoint === "assembly_thickness") return "assembly thickness";
  return "calculation basis evidence";
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}
