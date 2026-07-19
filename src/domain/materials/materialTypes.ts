import type { Confidence, EvidenceReference } from "../evidence/evidenceTypes.js";
import type { UserInput } from "../review/reviewTypes.js";

export type MaterialLibrary = {
  version: "materials.library.v1";
  entries: MaterialLibraryEntry[];
};

export type MaterialLibraryEntry = {
  materialKey: string;
  displayName: string;
  aliases: string[];
  lambdaWPerMK: number;
  sourceLabel: string;
  confidence: Confidence;
  autoResolve?: boolean;
  familyKind?: "generic" | "product_sensitive" | "special_physics";
};

export type MaterialMatchBasis =
  | "exact_alias"
  | "normalized_alias"
  | "naming_noise_removed"
  | "mojibake_repaired";

export type MaterialResolution = {
  rawMaterialName: string | null;
  normalizedMaterialName: string;
  status: "resolved" | "ambiguous" | "unresolved" | "special_physics";
  matchedMaterialKey: string | null;
  matchedMaterialName: string | null;
  matchBasis: MaterialMatchBasis | null;
  candidateMaterialKeys: string[];
  reason: string;
  evidenceState: "ifc_extracted" | "library_assisted" | "user_override" | "unresolved";
};

export type SpecialPhysicsIssue = {
  code:
    | "air_cavity"
    | "metal_path"
    | "product_sensitive"
    | "curtain_wall"
    | "unnamed_layer"
    | "non_layered_assembly"
    | "uncertain_slab_role";
  label: string;
  message: string;
  nextAction: string;
};

export type ResolvedLambda = {
  value: number;
  unit: "W/mK";
  source: "user_input" | "ifc_fixed" | "material_library";
  confidence: Confidence;
  sourceLabel: string;
  evidenceReferences: EvidenceReference[];
  userInput?: UserInput;
  materialResolution?: MaterialResolution;
  materialLibraryKey?: string;
  materialLibraryName?: string;
};
