import type {
  Confidence,
  Diagnostic,
  ElementClass,
  EvidenceReference,
  StepId,
} from "./evidenceTypes.js";

export type CalculationInputBasis =
  | "layered_ifc_complete"
  | "layered_needs_material_resolution"
  | "non_layered_estimate_possible"
  | "blocked_missing_evidence";

export type CalculationInputField =
  | "layer_order"
  | "layer_thickness"
  | "layer_material_name"
  | "layer_lambda"
  | "assembly_thickness"
  | "layer_stack"
  | "calculation_basis_evidence";

export type CalculationInput = {
  field: CalculationInputField;
  value: unknown;
  source: "ifc_fixed" | "ifc_candidate" | "missing";
  confidence: Confidence;
  evidenceReferences: EvidenceReference[];
  reason: string;
  layer?: {
    layerIndex: number;
    layerStepId: StepId;
    materialName: string | null;
  };
};

export type CalculationInputEvidence = {
  elementStepId: StepId;
  elementGlobalId: string | null;
  elementName?: string | null;
  elementObjectType?: string | null;
  elementClass: ElementClass;
  calculationInputBasis: CalculationInputBasis;
  fixedInputs: CalculationInput[];
  candidateInputs: CalculationInput[];
  missingInputs: CalculationInput[];
  diagnostics: Diagnostic[];
};
