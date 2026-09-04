import type { AssemblyCandidate } from "../assemblies/assemblyTypes.js";
import type { ReadinessState } from "../assemblies/evaluateAssemblyReadiness.js";
import type { MissingDatapoint } from "../diagnostics/missingDatapointTypes.js";
import type { CalculationInputEvidence } from "./calculationInputEvidenceTypes.js";
import type { Confidence, Diagnostic, IfcEvidence } from "./evidenceTypes.js";

export type AssemblyReadinessDiagnostic = {
  assemblyCandidateId: string;
  sourceElementStepIds: number[];
  sourceElementGlobalIds: string[];
  readinessState: ReadinessState;
  confidence: Confidence;
  reasons: Diagnostic[];
};

export type Milestone1ArtifactPackage = {
  ifcEvidence: IfcEvidence;
  calculationInputEvidence: CalculationInputEvidence[];
  assemblyCandidates: AssemblyCandidate[];
  missingDatapoints: MissingDatapoint[];
  readinessDiagnostics: AssemblyReadinessDiagnostic[];
};
