import type { AssemblyCandidate } from "../assemblies/assemblyTypes.js";
import type {
  Diagnostic,
  EvidenceReference,
  ProjectLengthUnitSignal,
} from "../evidence/evidenceTypes.js";
import type { MissingDatapoint } from "./missingDatapointTypes.js";

export const MISSING_DATAPOINT_RULES_VERSION = "missing-datapoint-rules.v1";

type DetectMissingDatapointsCommand = {
  assemblyCandidate: AssemblyCandidate;
  projectLengthUnitSignal?: ProjectLengthUnitSignal;
};

type DetectMissingDatapointsResult = {
  missingDatapoints: MissingDatapoint[];
  diagnostics: Diagnostic[];
};

type MissingDatapointRule = {
  code: string;
  detect(command: DetectMissingDatapointsCommand): MissingDatapoint[];
};

const orderedRules: MissingDatapointRule[] = [
  { code: "missing_type_link", detect: detectMissingTypeLink },
  { code: "missing_material_association", detect: detectMissingMaterialAssociation },
  {
    code: "missing_calculation_basis_evidence",
    detect: detectMissingCalculationBasisEvidence,
  },
  { code: "missing_project_length_unit", detect: detectMissingProjectLengthUnit },
  { code: "missing_layer_thickness", detect: detectMissingLayerThickness },
  { code: "missing_layer_material_name", detect: detectMissingLayerMaterialName },
  { code: "missing_layer_lambda", detect: detectMissingLayerLambda },
  {
    code: "uncertain_proxy_classification",
    detect: detectUncertainProxyClassification,
  },
  {
    code: "missing_layer_stack_for_non_layered_evidence",
    detect: detectMissingLayerStackForNonLayeredEvidence,
  },
];

export function detectMissingDatapoints(
  command: DetectMissingDatapointsCommand,
): DetectMissingDatapointsResult {
  const missingDatapoints = orderedRules.flatMap((rule) =>
    rule.detect(command),
  );

  return {
    missingDatapoints,
    diagnostics: missingDatapoints.map((datapoint) => ({
      code: `missing_datapoint_${datapoint.field}`,
      severity:
        datapoint.severity === "optional_for_report" ? "info" : "warning",
      message: datapoint.reason,
      stepIds: command.assemblyCandidate.sourceElementStepIds,
    })),
  };
}

function detectMissingTypeLink({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const missingTypeLink =
    assemblyCandidate.groupingBasis.basisKind === "single_element" &&
    assemblyCandidate.groupingBasis.reasons.some((reason) =>
      ["Missing ifcTypeObjectStepId.", "Referenced Type Evidence was not extracted."].includes(reason),
    );

  if (!missingTypeLink) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "type_link",
      severity: "required_for_provenance",
      reason:
        "Official IFC type link evidence was not found for this Assembly Candidate, so type-level provenance cannot be proven.",
      userFixable: false,
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Connect relevant elements to their IFC type objects with IfcRelDefinesByType.",
      evidenceChecked: groupingDiagnosticEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingMaterialAssociation({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (
    assemblyCandidate.groupingSignatures.length > 0 ||
    summary.hasLayeredMaterialEvidence ||
    summary.hasNonLayeredMaterialEvidence
  ) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "material_association",
      severity: "required_for_layered_calculation",
      reason:
        "Official IFC material association evidence was not found for this Assembly Candidate, so material layers cannot be proven.",
      userFixable: false,
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Associate relevant elements or their IFC type objects with materials using IfcRelAssociatesMaterial.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingCalculationBasisEvidence({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (
    summary.hasLayeredMaterialEvidence ||
    summary.hasNonLayeredMaterialEvidence ||
    summary.hasAssemblyThicknessCandidate
  ) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "calculation_basis_evidence",
      severity: "required_for_estimate",
      reason:
        "No layered material, non-layered material, or assembly thickness evidence was found, so the Assembly Candidate has no calculation or estimate basis.",
      userFixable: false,
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Add material layer sets, material associations, or reliable assembly thickness evidence to the BIM source.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingProjectLengthUnit({
  assemblyCandidate,
  projectLengthUnitSignal,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  const unitSensitive =
    summary.hasLayeredMaterialEvidence ||
    summary.hasAssemblyThicknessCandidate ||
    summary.hasNonLayeredMaterialEvidence;

  if (
    !unitSensitive ||
    assemblyCandidateIsCoveredByLengthUnit(projectLengthUnitSignal)
  ) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "project_length_unit",
      severity: "required_for_precision",
      reason:
        "Project length unit was not proven in the Assembly Candidate artifact, so thickness values cannot be trusted for precision.",
      userFixable: true,
      userQuestionLevel: "project",
      suggestedUserQuestion:
        "What length unit should be used for this IFC model's thickness values?",
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Set or correct the IFC project unit assignment for length units.",
      evidenceChecked: projectLengthUnitSignal?.evidenceReferences ?? [],
    }),
  ];
}

function assemblyCandidateIsCoveredByLengthUnit(
  projectLengthUnitSignal: ProjectLengthUnitSignal | undefined,
): boolean {
  return projectLengthUnitSignal?.lengthUnitAppearsAvailable === true;
}

function detectMissingLayerThickness({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (!summary.hasLayeredMaterialEvidence || summary.missingLayerThicknessCount === 0) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "layer_thickness",
      severity: "required_for_layered_calculation",
      reason: `${summary.missingLayerThicknessCount} layer thickness value(s) are missing from the Assembly Candidate evidence summary.`,
      userFixable: true,
      userQuestionLevel: "layer",
      suggestedUserQuestion:
        "What thickness should be used for each layer missing thickness?",
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Add layer thickness values to the IFC material layer set.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingLayerMaterialName({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (!summary.hasLayeredMaterialEvidence || summary.missingMaterialNameCount === 0) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "layer_material_name",
      severity: "required_for_provenance",
      reason: `${summary.missingMaterialNameCount} layer material name(s) are missing from the Assembly Candidate evidence summary.`,
      userFixable: true,
      userQuestionLevel: "layer",
      suggestedUserQuestion:
        "What material name should be used for each unnamed layer?",
      bimSourceFixRecommended: true,
      bimSourceFixHint: "Name each IFC material assigned to the layer set.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingLayerLambda({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (!summary.hasLayeredMaterialEvidence || summary.missingLambdaCandidateCount === 0) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "layer_lambda",
      severity: "required_for_layered_calculation",
      reason: `${summary.missingLambdaCandidateCount} layer lambda candidate(s) are missing from the Assembly Candidate evidence summary.`,
      userFixable: true,
      userQuestionLevel: "material",
      suggestedUserQuestion:
        "What thermal conductivity should be used for each material without lambda evidence?",
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Add thermal conductivity properties to the relevant IFC material or type property set.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectUncertainProxyClassification({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  if (!assemblyCandidate.evidenceSummary.hasClassificationUncertainty) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "proxy_classification",
      severity: "required_for_provenance",
      reason:
        "At least one source element has uncertain proxy classification and needs confirmation before provenance is reliable.",
      userFixable: true,
      userQuestionLevel: "assembly",
      suggestedUserQuestion:
        "Should this proxy element be treated as part of this thermal assembly?",
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Classify proxy elements with a more specific IFC class, object type, or predefined type.",
      evidenceChecked: groupingDiagnosticEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function detectMissingLayerStackForNonLayeredEvidence({
  assemblyCandidate,
}: DetectMissingDatapointsCommand): MissingDatapoint[] {
  const summary = assemblyCandidate.evidenceSummary;
  if (!summary.hasNonLayeredMaterialEvidence || summary.hasLayeredMaterialEvidence) {
    return [];
  }

  return [
    baseDatapoint(assemblyCandidate, {
      field: "layer_stack",
      severity: "required_for_estimate",
      reason:
        "Material evidence is non-layered, so the Assembly Candidate cannot prove ordered layer stack for thermal calculation.",
      userFixable: false,
      bimSourceFixRecommended: true,
      bimSourceFixHint:
        "Model the assembly as an IFC material layer set with ordered layers.",
      evidenceChecked: signatureEvidenceReferences(assemblyCandidate),
    }),
  ];
}

function baseDatapoint(
  assemblyCandidate: AssemblyCandidate,
  datapoint: Omit<
    MissingDatapoint,
    "affectedElementIds" | "affectedElementStepIds"
  >,
): MissingDatapoint {
  return {
    ...datapoint,
    affectedElementIds:
      assemblyCandidate.sourceElementGlobalIds.length > 0
        ? assemblyCandidate.sourceElementGlobalIds
        : assemblyCandidate.sourceElementStepIds.map((stepId) => `#${stepId}`),
    affectedElementStepIds: assemblyCandidate.sourceElementStepIds,
  };
}

function signatureEvidenceReferences(
  assemblyCandidate: AssemblyCandidate,
): EvidenceReference[] {
  return assemblyCandidate.groupingSignatures.flatMap((signature) =>
    signature.components.flatMap((component) =>
      component.evidenceReference ? [component.evidenceReference] : [],
    ),
  );
}

function groupingDiagnosticEvidenceReferences(
  assemblyCandidate: AssemblyCandidate,
): EvidenceReference[] {
  return assemblyCandidate.groupingSignatures.length > 0
    ? signatureEvidenceReferences(assemblyCandidate)
    : [];
}
