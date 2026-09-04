import type {
  CandidatePropertyEvidence,
  Diagnostic,
  ElementClass,
  EvidenceReference,
  MaterialEvidence,
  StepId,
} from "./evidenceTypes.js";

export type EffectiveMaterialEvidenceSource =
  | "occurrence"
  | "type"
  | "none";

export type EffectiveElementEvidence = {
  elementStepId: StepId;
  elementGlobalId: string | null;
  elementName?: string | null;
  elementObjectType?: string | null;
  elementClass: ElementClass;
  ifcTypeObjectStepId: StepId | null;
  materialEvidenceSource: EffectiveMaterialEvidenceSource;
  effectiveMaterialEvidence: MaterialEvidence[];
  occurrenceMaterialEvidence: MaterialEvidence[];
  typeMaterialEvidence: MaterialEvidence[];
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  evidenceReferences: EvidenceReference[];
  conflictDiagnostics: Diagnostic[];
};
