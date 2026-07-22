export type ThermalTreatmentInputValue = string | number | boolean | null;

export type ThermalTreatmentFamilyIdentity = { familyId: string; familyVersion: string };
export type ThermalTreatmentSelection = ThermalTreatmentFamilyIdentity & { confirmedInputs: Record<string, ThermalTreatmentInputValue> };
export type ThermalTreatmentInputDefinition = { key: string; label: string; required: boolean };
export type ThermalTreatmentValidationIssue = { inputKey: string | null; message: string };

/** Family-neutral payload passed from a family adapter to a calculation worker. */
export type ThermalTreatmentAnalysisModel = {
  assemblyGroupId: string;
  treatmentFamily: ThermalTreatmentFamilyIdentity;
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
  model: Record<string, ThermalTreatmentInputValue>;
  assumptions: string[];
  provenance: string[];
};
export type ThermalTreatmentTrustState = "preliminary" | "verified";
export type ThermalTreatmentWorkerResult = { effectiveUValueWPerM2K: number; assumptions: string[]; provenance: string[] };
export type ThermalTreatmentWorkerIdentity = { workerId: string; workerVersion: string };
export type ThermalTreatmentRecord = { trustState: ThermalTreatmentTrustState; baselineUValueWPerM2K: number; effectiveUValueWPerM2K: number; selection: ThermalTreatmentSelection; worker: ThermalTreatmentWorkerIdentity; calculatedAt: string; confirmedInputs: Record<string, ThermalTreatmentInputValue>; assumptions: string[]; provenance: string[] };
export interface ThermalTreatmentFamily {
  readonly identity: ThermalTreatmentFamilyIdentity;
  readonly trustState: ThermalTreatmentTrustState;
  requiredInputs(): ThermalTreatmentInputDefinition[];
  validateConfirmedInputs(command: { confirmedInputs: Record<string, ThermalTreatmentInputValue> }): ThermalTreatmentValidationIssue[];
  buildAnalysisModel(command: { assemblyGroupId: string; confirmedInputs: Record<string, ThermalTreatmentInputValue> }): ThermalTreatmentAnalysisModel;
}
export interface ThermalTreatmentCalculationWorker extends ThermalTreatmentWorkerIdentity {
  calculate(command: { analysisModel: ThermalTreatmentAnalysisModel }): Promise<ThermalTreatmentWorkerResult>;
}
