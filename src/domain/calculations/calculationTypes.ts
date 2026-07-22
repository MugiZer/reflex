import type { Confidence, ElementClass } from "../evidence/evidenceTypes.js";
import type { MaterialResolution } from "../materials/materialTypes.js";
import type { ThermalTreatmentRecord } from "../thermal-treatment/thermalTreatmentTypes.js";

export type DatapointSource =
  | "ifc_extracted"
  | "material_library"
  | "system_estimate"
  | "user_input";

export type CalculationBasis =
  | "extracted_layered"
  | "user_completed_layered"
  | "estimated_from_non_layered"
  | "user_completed_estimate";

export type SurfaceResistanceProfile = {
  profileId:
    | "external_wall_vertical"
    | "roof_upward"
    | "floor_downward"
    | "ground_floor_simple"
    | "unheated_space_boundary"
    | "custom";
  rsi: number;
  rse: number;
  sourceLabel: string;
  assumptions: string[];
};

export type PhysicsLayer = {
  layerOccurrenceId: string;
  materialName: string;
  thicknessM: number;
  lambdaWPerMK: number;
  datapointSources: DatapointSource[];
  provenance: string[];
  rawMaterialName?: string | null;
  materialLibraryKey?: string;
  materialLibraryName?: string;
  materialResolution?: MaterialResolution;
  evidenceState?: "ifc_extracted" | "library_assisted" | "user_override" | "unresolved";
};

export type PhysicsAssembly = {
  assemblyGroupId: string;
  elementClass: ElementClass;
  calculationBasis: CalculationBasis;
  confidence: Confidence;
  surfaceResistanceProfile: SurfaceResistanceProfile;
  layers: PhysicsLayer[];
  assumptions?: string[];
  provenance?: string[];
};

export type LayerCalculation = PhysicsLayer & {
  rValueM2KPerW: number;
};

export type TemperatureProfilePoint = {
  label: string;
  temperatureC: number;
  cumulativeRValueM2KPerW: number;
};

export type TemperatureProfile = {
  indoorTemperatureC: number;
  outdoorTemperatureC: number;
  points: TemperatureProfilePoint[];
  assumptions: string[];
};

export type CalculationSnapshot = {
  calculationSnapshotId: string;
  assemblyGroupId: string;
  readinessState: "ready" | "needs_review" | "estimated" | "blocked";
  confidence: Confidence;
  calculationBasis: CalculationBasis;
  layers: LayerCalculation[];
  surfaceResistanceProfile: SurfaceResistanceProfile;
  totalRValueM2KPerW: number | null;
  uValueWPerM2K: number | null;
  uValueRangeWPerM2K: { min: number; max: number } | null;
  temperatureProfile: TemperatureProfile | null;
  assumptions: string[];
  warnings: string[];
  provenance: string[];
  thermalTreatment?: ThermalTreatmentRecord;
};
