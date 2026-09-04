import type { IfcModelReader } from "../evidenceTypes.js";

export type IfcClassCount = {
  total: number;
  sampleStepIds: number[];
};

export type ProjectLengthUnitSignal = {
  ifcProjectCount: number;
  unitsInContextAvailable: boolean;
  lengthUnitAppearsAvailable: boolean;
};

export type IfcSmokeArtifact = {
  artifactKind: "ifc_smoke_risk_scan";
  canonical: false;
  nonCanonicalMarker: string;
  fileHash: string;
  schema: string | null;
  projectLengthUnitSignal: ProjectLengthUnitSignal;
  counts: Record<string, IfcClassCount>;
  warnings: string[];
};

export type IfcSmokeModelReader = IfcModelReader;
