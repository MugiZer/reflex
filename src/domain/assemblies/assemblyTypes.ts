import type { Confidence, Diagnostic, EvidenceReference, StepId } from "../evidence/evidenceTypes.js";
import type { ThermalTreatmentSelection } from "../thermal-treatment/thermalTreatmentTypes.js";

export type AssemblyGroup = {
  assemblyGroupId: string;
  thermalTreatmentSelection?: ThermalTreatmentSelection;
};

export type AssemblyEvidenceSummary = {
  hasLayeredMaterialEvidence: boolean;
  hasOrderedLayers: boolean;
  layerCount: number;
  hasAllLayerThicknesses: boolean;
  missingLayerThicknessCount: number;
  hasAllMaterialNames: boolean;
  missingMaterialNameCount: number;
  hasAnyLambdaCandidates: boolean;
  hasAllLambdaCandidates: boolean;
  missingLambdaCandidateCount: number;
  hasNonLayeredMaterialEvidence: boolean;
  hasAssemblyThicknessCandidate: boolean;
  hasClassificationUncertainty: boolean;
};

export type EvidenceSignatureComponent = {
  key: string;
  value: string | number | boolean | null;
  evidenceReference?: EvidenceReference;
};

export type EvidenceSignature = {
  signatureKind: "material_association";
  signatureVersion: 1;
  hash: string;
  components: EvidenceSignatureComponent[];
};

export type GroupingBasis =
  | {
      basisKind: "single_element";
      reasons: string[];
    }
  | {
      basisKind: "shared_type_and_material_signature";
      typeObjectStepId: StepId;
      materialSignatureHash: string;
    };

export type AssemblyCandidate = {
  assemblyCandidateId: string;
  sourceElementStepIds: StepId[];
  sourceElementGlobalIds: string[];
  groupingKey: string;
  groupingBasis: GroupingBasis;
  groupingConfidence: Confidence;
  groupingSignatures: EvidenceSignature[];
  groupingDiagnostics: Diagnostic[];
  evidenceSummary: AssemblyEvidenceSummary;
};
