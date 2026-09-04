import type { EvidenceReference, StepId } from "../evidence/evidenceTypes.js";

export type SourceElementId = string;

export type MissingDatapointField =
  | "material_association"
  | "type_link"
  | "calculation_basis_evidence"
  | "project_length_unit"
  | "layer_thickness"
  | "layer_material_name"
  | "layer_lambda"
  | "proxy_classification"
  | "layer_stack";

export type MissingDatapointSeverity =
  | "required_for_layered_calculation"
  | "required_for_estimate"
  | "required_for_precision"
  | "required_for_provenance"
  | "optional_for_report";

export type MissingDatapoint = {
  field: MissingDatapointField;
  severity: MissingDatapointSeverity;
  reason: string;
  userFixable: boolean;
  userQuestionLevel?:
    | "project"
    | "assembly"
    | "layer"
    | "material"
    | "property_group";
  suggestedUserQuestion?: string;
  bimSourceFixRecommended: boolean;
  bimSourceFixHint?: string;
  evidenceChecked: EvidenceReference[];
  affectedElementIds: SourceElementId[];
  affectedElementStepIds: StepId[];
};
