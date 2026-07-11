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
};

export type ResolvedLambda = {
  value: number;
  unit: "W/mK";
  source: "user_input" | "ifc_fixed" | "material_library";
  confidence: Confidence;
  sourceLabel: string;
  evidenceReferences: EvidenceReference[];
  userInput?: UserInput;
};
