export type StepId = number;

export type Confidence = "low" | "medium" | "high";

export type ElementClass =
  | "IfcWall"
  | "IfcSlab"
  | "IfcRoof"
  | "IfcCurtainWall"
  | "IfcBuildingElementProxy";

export type Diagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  stepIds?: StepId[];
};

export type IfcHeaderEvidence = {
  schema: string | null;
};

export type IfcEntityRecord = {
  stepId: StepId;
  entityClass: string;
  attributes: Record<string, unknown>;
};

export type CitedIfcEntity = {
  stepId: StepId;
  entityClass: string | null;
  attributes: Record<string, unknown>;
};

export type EvidenceReference = {
  evidencePath: string;
  sourceStepIds: StepId[];
  pathParts: EvidencePathPart[];
};

export type EvidencePathPart = {
  stepId: StepId;
  entityClass: string;
  attribute?: string;
  index?: number;
};

export type FileEvidence = {
  fileHash: string | null;
  schema: string | null;
  projectLengthUnitSignal: ProjectLengthUnitSignal;
  skippedScopeSummaries: SkippedScopeSummary[];
};

export type ProjectLengthUnitSignal = {
  ifcProjectCount: number;
  unitsInContextAvailable: boolean;
  lengthUnitAppearsAvailable: boolean;
  evidenceReferences: EvidenceReference[];
};

export type ElementIdentityEvidence = {
  stepId: StepId;
  globalId: string | null;
  rawEntityClass: string;
  elementClass: ElementClass;
  name: string | null;
  objectType: string | null;
  predefinedType: string | null;
  tag: string | null;
  description: string | null;
  ifcTypeObjectStepId: StepId | null;
  classification: {
    classificationConfidence: Confidence;
    inclusionReason: string;
    matchedHints: string[];
    needsUserConfirmation: boolean;
  };
  sourceContext: {
    containerStepId: StepId | null;
    storeyName: string | null;
  };
  evidenceReference: EvidenceReference;
  rawAttributeSnapshot: {
    GlobalId?: unknown;
    Name?: unknown;
    ObjectType?: unknown;
    PredefinedType?: unknown;
    Tag?: unknown;
    Description?: unknown;
  };
};

export type ElementEvidence = {
  identity: ElementIdentityEvidence;
  directMaterialEvidence: MaterialEvidence[];
  directPropertySets: PropertySetEvidence[];
  directQuantitySets: QuantitySetEvidence[];
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  evidenceReferences: EvidenceReference[];
  diagnostics: Diagnostic[];
};

export type TypeIdentityEvidence = {
  stepId: StepId;
  globalId: string | null;
  rawEntityClass: string;
  name: string | null;
  predefinedType: string | null;
  tag: string | null;
  description: string | null;
  rawAttributeSnapshot: {
    GlobalId?: unknown;
    Name?: unknown;
    PredefinedType?: unknown;
    Tag?: unknown;
    Description?: unknown;
    ElementType?: unknown;
  };
  evidenceReference: EvidenceReference;
};

export type TypeEvidence = {
  identity: TypeIdentityEvidence;
  materialEvidence: MaterialEvidence[];
  propertySets: PropertySetEvidence[];
  quantitySets: QuantitySetEvidence[];
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  diagnostics: Diagnostic[];
};

export type NumericEvidence = {
  rawValue: number;
  rawUnit: string | null;
  normalizedValue: number | null;
  normalizedUnit: string;
  unitSource:
    | "ifc_project_units"
    | "ifc_property_unit"
    | "ifc_measure_type"
    | "assumed"
    | "unknown";
  confidence: Confidence;
  evidenceReference: EvidenceReference;
  diagnostics: Diagnostic[];
};

export type MaterialStructureKind =
  | "single_material"
  | "layer_set_usage"
  | "layer_set"
  | "constituent_set"
  | "material_list"
  | "profile_set_usage"
  | "profile_set"
  | "unknown";

export type IfcMaterialEvidenceSource =
  | "official_rel_associates_material"
  | "recovered_layer_set_name_match";

export type LayerSetRecoveryEvidence = {
  strategy: "revit_layer_set_name_match";
  matchedSourceAttribute: "ObjectType" | "Name" | "TypeName";
  matchedSourceValue: string;
  matchedLayerSetName: string;
  matchKind: "exact_normalized";
  confidence: "medium";
  needsUserConfirmation: boolean;
  contextLayerSetUsageStepIds: StepId[];
};

export type BaseMaterialEvidence = {
  materialEvidenceId: string;
  materialEvidenceSource: IfcMaterialEvidenceSource;
  associationScope: "occurrence" | "type";
  associationStepId: StepId;
  relatingMaterialStepId: StepId;
  materialStructureKind: MaterialStructureKind;
  evidenceReference: EvidenceReference;
  diagnostics: Diagnostic[];
  recovery?: LayerSetRecoveryEvidence;
};

export type SingleMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "single_material";
  materialStepId: StepId;
  materialName: string | null;
  materialCategory: string | null;
};

export type LayeredMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "layer_set_usage" | "layer_set";
  layerSetUsage: {
    stepId: StepId;
    forLayerSetStepId: StepId;
    layerSetDirection: string | null;
    directionSense: string | null;
    offsetFromReferenceLine: NumericEvidence | null;
    referenceExtent: NumericEvidence | null;
    rawAttributeSnapshot: Record<string, unknown>;
    evidenceReference: EvidenceReference;
  } | null;
  layerSet: {
    stepId: StepId;
    layerSetName: string | null;
    description: string | null;
    materialLayerStepIds: StepId[];
    rawAttributeSnapshot: Record<string, unknown>;
    evidenceReference: EvidenceReference;
  };
  layers: LayerEvidence[];
  layerOrderSource: "IfcMaterialLayerSet.MaterialLayers" | "unknown";
  totalLayerThickness: NumericEvidence | null;
};

export type LayerEvidence = {
  layerIndex: number;
  layerStepId: StepId;
  materialStepId: StepId | null;
  materialName: string | null;
  materialCategory: string | null;
  layerName: string | null;
  layerDescription: string | null;
  layerCategory: string | null;
  thickness: NumericEvidence | null;
  isVentilated: boolean | "unknown" | null;
  priority: number | null;
  rawAttributeSnapshot: Record<string, unknown>;
  evidenceReference: EvidenceReference;
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  diagnostics: Diagnostic[];
};

export type ConstituentMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "constituent_set";
  name: string | null;
  constituents: Array<{
    constituentStepId: StepId;
    name: string | null;
    materialStepId: StepId | null;
    materialName: string | null;
    evidenceReference: EvidenceReference;
  }>;
};

export type MaterialListEvidence = BaseMaterialEvidence & {
  materialStructureKind: "material_list";
  materialStepIds: StepId[];
  materialNames: Array<string | null>;
};

export type ProfileSetUsageMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "profile_set_usage";
  profileSetStepId: StepId | null;
};

export type ProfileMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "profile_set";
  profileStepIds: StepId[];
};

export type UnknownMaterialDefinitionEvidence = BaseMaterialEvidence & {
  materialStructureKind: "unknown";
  rawEntityClass: string | null;
};

export type MaterialEvidence =
  | SingleMaterialEvidence
  | LayeredMaterialEvidence
  | ConstituentMaterialEvidence
  | MaterialListEvidence
  | ProfileSetUsageMaterialEvidence
  | ProfileMaterialEvidence
  | UnknownMaterialDefinitionEvidence;

export type PropertyEvidence = {
  propertyStepId: StepId;
  name: string | null;
  rawValue: unknown;
  rawUnit: string | null;
  numericEvidence: NumericEvidence | null;
  evidenceReference: EvidenceReference;
};

export type PropertySetEvidence = {
  relationshipStepId: StepId | null;
  propertySetStepId: StepId;
  name: string | null;
  properties: PropertyEvidence[];
  evidenceReference: EvidenceReference;
};

export type QuantityEvidence = {
  quantityStepId: StepId;
  name: string | null;
  rawValue: unknown;
  rawUnit: string | null;
  numericEvidence: NumericEvidence | null;
  evidenceReference: EvidenceReference;
};

export type QuantitySetEvidence = {
  relationshipStepId: StepId | null;
  quantitySetStepId: StepId;
  name: string | null;
  quantities: QuantityEvidence[];
  evidenceReference: EvidenceReference;
};

export type CandidatePropertyEvidence = {
  candidateKind:
    | "lambda"
    | "layer_thickness"
    | "assembly_thickness"
    | "material_name"
    | "classification"
    | "unit"
    | "specific_heat_capacity"
    | "mass_density"
    | "vapor_resistance_factor"
    | "vapor_permeability"
    | "moisture_diffusivity"
    | "isothermal_moisture_capacity"
    | "indoor_temperature"
    | "outdoor_temperature"
    | "indoor_relative_humidity"
    | "outdoor_relative_humidity";
  propertySetName: string | null;
  propertyName: string;
  rawValue: unknown;
  rawUnit: string | null;
  normalizedValue?: number | null;
  normalizedUnit?: string;
  confidence: Confidence;
  evidenceReference: EvidenceReference;
  reason: string;
  lambdaClassification?:
    | "confirmed_lambda"
    | "candidate_lambda"
    | "rejected_lambda";
};

export type IfcEvidence = {
  fileEvidence: FileEvidence;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  citedIfcEntities: CitedIfcEntity[];
  skippedScopeSummaries: SkippedScopeSummary[];
  diagnostics: Diagnostic[];
};

export type EvidenceArtifactCompleteness =
  | "partial_evidence_only"
  | "partial_evidence_with_assembly_candidates"
  | "complete_milestone_1";

export type EvidenceElementArtifactLayout =
  | {
      kind: "single_file";
      path: "elements.json";
      elementCount: number;
    }
  | {
      kind: "split_by_element_class";
      directory: "elements";
      files: Array<{
        elementClass: ElementClass;
        path: string;
        elementCount: number;
      }>;
      elementCount: number;
    };

export type EvidenceArtifactManifest = {
  artifactSchemaVersion: "ifc-evidence-artifacts.v1";
  extractorVersion: "web-ifc-evidence-extractor.v1";
  ifcModelReaderVersion: "web-ifc-model-reader.v1";
  extractionIndexVersion: "ifc-extraction-index.v1";
  relevantElementRulesVersion: "relevant-element-rules.v1";
  groupingPolicyVersion:
    | "conservative-material-association.v1"
    | "not-produced.partial-evidence-only";
  missingDatapointRulesVersion:
    | "missing-datapoint-rules.v1"
    | "not-produced.partial-evidence-only";
  readinessRulesVersion:
    | "assembly-readiness-rules.v1"
    | "not-produced.partial-evidence-only";
  artifactCompleteness: EvidenceArtifactCompleteness;
  elementArtifactLayout: EvidenceElementArtifactLayout;
};

export type SkippedScopeSummary = {
  rawEntityClass: string;
  count: number;
  reason: string;
};

export type EvidenceFeatureContext = {
  reader: IfcModelReader;
};

export type FeatureExtractionResult<TFeatureEvidence> = {
  featureKey: string;
  evidence: TFeatureEvidence[];
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
};

export type ExtractIfcEvidenceCommand = {
  sourceFilePath: string;
  fileHash?: string;
};

export type ExtractIfcEvidenceResult =
  | {
      ok: true;
      ifcEvidence: IfcEvidence;
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      failureType: "file_read_error" | "parse_error" | "internal_error";
      message: string;
      diagnostics: Diagnostic[];
    };

export interface IfcEvidenceExtractor {
  extract(command: ExtractIfcEvidenceCommand): Promise<ExtractIfcEvidenceResult>;
}

export interface IfcModelReader {
  getHeader(): IfcHeaderEvidence;
  getSchema(): string | null;
  hasEntityClass(entityClass: string): boolean;
  getEntitiesByClass(entityClass: string): IfcEntityRecord[];
  getEntity(stepId: StepId): IfcEntityRecord | null;
  getEntityClass(stepId: StepId): string | null;
  getStringAttribute(stepId: StepId, attributeName: string): string | null;
  getNumberAttribute(stepId: StepId, attributeName: string): number | null;
  getBooleanAttribute(stepId: StepId, attributeName: string): boolean | null;
  getEntityReference(stepId: StepId, attributeName: string): StepId | null;
  getEntityReferenceList(stepId: StepId, attributeName: string): StepId[];
  getCompactEntitySnapshot(stepId: StepId): CitedIfcEntity;
  close(): void;
}
