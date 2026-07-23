import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { Confidence, EvidenceReference, StepId } from "../evidence/evidenceTypes.js";
export type ThermalTreatmentInputValue = string | number | boolean | null;
export type ThermalTreatmentAnalysisValue = ThermalTreatmentInputValue | ThermalTreatmentAnalysisValue[] | { [key: string]: ThermalTreatmentAnalysisValue };

export type ThermalTreatmentFamilyIdentity = { familyId: string; familyVersion: string };
export type ThermalTreatmentInputEvidenceStatus = "confirmed" | "estimated" | "missing" | "conflicting";
export type ThermalTreatmentSelection = ThermalTreatmentFamilyIdentity & {
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
  inputEvidence?: Record<string, { status: ThermalTreatmentInputEvidenceStatus; detail: string }>;
};
export type ThermalTreatmentInputDefinition = {
  key: string;
  label: string;
  unit: string;
  required: boolean;
  critical: boolean;
  evidenceRequirements: readonly string[];
  fallbackEstimate?: { value: ThermalTreatmentInputValue; basis: string };
};
export type ThermalTreatmentParameterBounds = { minimum?: number; maximum?: number; allowedValues?: readonly ThermalTreatmentInputValue[] };
export type ThermalTreatmentKnowledgePack = {
  version: string;
  parameters: readonly (ThermalTreatmentInputDefinition & { allowedValues?: readonly ThermalTreatmentInputValue[]; range?: ThermalTreatmentParameterBounds })[];
};
export type ThermalTreatmentValidationPack = {
  version: string;
  supportedParameterEnvelope: Readonly<Record<string, ThermalTreatmentParameterBounds>>;
  referenceCases: readonly { caseId: string; parameters: Record<string, ThermalTreatmentInputValue>; expectedEffectiveUValueWPerM2K: number; toleranceWPerM2K: number }[];
  compatibleCodeAdapterVersions: readonly string[];
  compatibleWorkers: readonly { workerId: string; workerVersion: string }[];
  approvedForVerification: boolean;
};
export type ThermalTreatmentPackSet = {
  codeAdapterVersion: string;
  knowledgePack: ThermalTreatmentKnowledgePack;
  validationPack: ThermalTreatmentValidationPack;
};
export type ThermalTreatmentValidationIssue = { inputKey: string | null; message: string };
export type ThermalTreatmentTrustReason = {
  code: "critical_input_estimated" | "critical_input_missing" | "critical_input_conflicting" | "outside_validation_envelope" | "worker_incompatible" | "worker_invalid" | "validation_pack_not_approved";
  inputKey: string | null;
  message: string;
};

/** Family-neutral payload passed from a family adapter to a calculation worker. */
export type ThermalTreatmentAnalysisModel = {
  assemblyGroupId: string;
  treatmentFamily: ThermalTreatmentFamilyIdentity;
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
  model: Record<string, ThermalTreatmentAnalysisValue>;
  assumptions: string[];
  provenance: string[];
};
export type ThermalTreatmentTrustState = "preliminary_unsafe_estimate" | "verified";
export type ThermalTreatmentWorkerResult = {
  effectiveUValueWPerM2K: number;
  assumptions: string[];
  provenance: string[];
  validity?: { isValid: boolean; diagnostics: string[] };
};
export type ThermalTreatmentWorkerIdentity = { workerId: string; workerVersion: string };
export type ThermalTreatmentRecord = {
  trustState: ThermalTreatmentTrustState;
  trustReasons: ThermalTreatmentTrustReason[];
  actionsRequiredForVerification: string[];
  packVersions: { codeAdapterVersion: string; knowledgePackVersion: string; validationPackVersion: string };
  baselineUValueWPerM2K: number;
  effectiveUValueWPerM2K: number;
  selection: ThermalTreatmentSelection;
  worker: ThermalTreatmentWorkerIdentity;
  calculatedAt: string;
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
  assumptions: string[];
  provenance: string[];
};
export type ThermalTreatmentEvidenceCandidate = {
  assemblyGroupId: string;
  calculationInputEvidence: readonly CalculationInputEvidence[];
  materialNames: readonly string[];
  evidenceReferences: readonly EvidenceReference[];
};
export type ThermalTreatmentFamilyMatch = {
  confidence: Confidence;
  reasonCodes: readonly string[];
  assumptions: readonly string[];
  boundaryConditions: Readonly<Record<string, string>>;
  proposedInputs: Record<string, ThermalTreatmentInputValue>;
  proposedInputEvidence: Record<string, { status: ThermalTreatmentInputEvidenceStatus; detail: string }>;
};
export interface ThermalTreatmentFamily {
  readonly identity: ThermalTreatmentFamilyIdentity;
  readonly packs: ThermalTreatmentPackSet;
  matchOpportunity(command: { evidence: ThermalTreatmentEvidenceCandidate }): ThermalTreatmentFamilyMatch | null;
  requiredInputs(): ThermalTreatmentInputDefinition[];
  validateConfirmedInputs(command: { confirmedInputs: Record<string, ThermalTreatmentInputValue> }): ThermalTreatmentValidationIssue[];
  buildAnalysisModel(command: { assemblyGroupId: string; confirmedInputs: Record<string, ThermalTreatmentInputValue> }): ThermalTreatmentAnalysisModel;
}
export interface ThermalTreatmentFamilyRegistry {
  availableFamilies(): readonly ThermalTreatmentFamily[];
  findByIdentity(identity: ThermalTreatmentFamilyIdentity): ThermalTreatmentFamily | null;
}
export interface ThermalTreatmentCalculationWorker extends ThermalTreatmentWorkerIdentity {
  calculate(command: { analysisModel: ThermalTreatmentAnalysisModel }): Promise<ThermalTreatmentWorkerResult>;
}