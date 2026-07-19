import type { CalculationInputField } from "../evidence/calculationInputEvidenceTypes.js";
import type { ElementClass, EvidenceReference, StepId } from "../evidence/evidenceTypes.js";
import type { MaterialResolution } from "../materials/materialTypes.js";
import type { LayerOccurrenceReference } from "./reviewGrouping.js";

export type OverrideScopeKind =
  | "layer_occurrence"
  | "material_decision"
  | "assembly_group"
  | "element_type";

export type RequestedInput = {
  requestedInputId: string;
  reviewGroupId: string;
  reviewGroupKind:
    | "layer_occurrence"
    | "material_decision"
    | "assembly_group"
    | "element_type";
  assemblyGroupId: string;
  datapoint: CalculationInputField;
  question: string;
  inputType: "number" | "text" | "choice";
  unit: string | null;
  required?: boolean;
  purpose?: "required_input" | "optional_override";
  materialResolution?: MaterialResolution;
  affects: Array<"calculation" | "estimate" | "precision" | "provenance">;
  scope:
    | {
        scopeKind: "layer_occurrence";
        elementStepId: StepId;
        layerIndex: number | null;
      }
    | {
        scopeKind: "material_decision";
        materialDecisionId: string;
        normalizedMaterialKey: string;
        materialName: string;
        affectedLayers: LayerOccurrenceReference[];
      }
    | {
        scopeKind: "assembly_group";
        assemblyGroupId: string;
      }
    | {
        scopeKind: "element_type";
        elementClass: ElementClass;
      };
  evidenceReferences: EvidenceReference[];
};

export type UserInput = {
  userInputId: string;
  requestedInputId: string;
  datapoint: CalculationInputField;
  value: string | number | boolean;
  unit: string | null;
  overrideScope?: OverrideScopeKind;
  valueSource?: "manual" | "material_library";
  materialLibraryKey?: string;
};

export type Override = {
  overrideId: string;
  userInputId: string;
  datapoint: CalculationInputField;
  value: string | number | boolean;
  unit: string | null;
  scopeKind: OverrideScopeKind;
  targetId: string;
};
