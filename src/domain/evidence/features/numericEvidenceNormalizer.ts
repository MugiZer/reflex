import { attributeEvidenceReference } from "../evidenceReferences.js";
import type {
  Diagnostic,
  EvidenceReference,
  IfcModelReader,
  NumericEvidence,
  StepId,
} from "../evidenceTypes.js";

export type ProjectLengthUnit = {
  rawUnit: string;
  factorToMeters: number;
} | null;

const LAMBDA_NAME_PATTERNS = [
  "thermalconductivity",
  "thermal conductivity",
  "conductivity",
  "lambda",
  "k-value",
  "k value",
];

export function findProjectLengthUnit(
  reader: IfcModelReader,
): ProjectLengthUnit {
  for (const project of reader.getEntitiesByClass("IfcProject")) {
    const unitAssignmentStepId = reader.getEntityReference(
      project.stepId,
      "UnitsInContext",
    );
    if (unitAssignmentStepId === null) {
      continue;
    }

    for (const unitStepId of reader.getEntityReferenceList(
      unitAssignmentStepId,
      "Units",
    )) {
      const unit = unitFromStep(reader, unitStepId);
      if (unit !== null) {
        return unit;
      }
    }
  }

  return null;
}

export function unitFromStep(
  reader: IfcModelReader,
  unitStepId: StepId,
): ProjectLengthUnit {
  const unitType = reader.getStringAttribute(unitStepId, "UnitType");
  const name = reader.getStringAttribute(unitStepId, "Name");
  const prefix = reader.getStringAttribute(unitStepId, "Prefix");

  if (unitType === "LENGTHUNIT" && name === "METRE") {
    return {
      rawUnit: prefix === null ? "METRE" : `${prefix} METRE`,
      factorToMeters: prefixFactor(prefix),
    };
  }

  if (name === "WATT_PER_METRE_KELVIN") {
    return {
      rawUnit: "W/mK",
      factorToMeters: 1,
    };
  }

  return null;
}

export function numberAttributeEvidence(command: {
  reader: IfcModelReader;
  stepId: StepId;
  entityClass: string;
  attributeName: string;
  normalizedUnit: string;
  projectLengthUnit: ProjectLengthUnit;
  unitSource: NumericEvidence["unitSource"];
  diagnostics: Diagnostic[];
}) {
  const rawValue = command.reader.getNumberAttribute(
    command.stepId,
    command.attributeName,
  );
  if (rawValue === null) {
    return null;
  }

  return normalizeNumericEvidence({
    rawValue,
    rawUnit: command.projectLengthUnit?.rawUnit ?? null,
    normalizedUnit: command.normalizedUnit,
    factor: command.projectLengthUnit?.factorToMeters ?? null,
    unitSource:
      command.projectLengthUnit === null ? "unknown" : command.unitSource,
    evidenceReference: attributeEvidenceReference(
      command.entityClass,
      command.stepId,
      command.attributeName,
    ),
    diagnostics: command.diagnostics,
  });
}

export function numericEvidenceForProperty(command: {
  rawValue: number;
  propertyStepId: StepId;
  propertyName: string | null;
  valueType: string | null;
  propertyUnit: ProjectLengthUnit;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
}): NumericEvidence {
  const evidenceReference = attributeEvidenceReference(
    "IfcPropertySingleValue",
    command.propertyStepId,
    "NominalValue",
  );
  const normalizedName = normalizeName(command.propertyName ?? "");

  if (command.propertyUnit !== null) {
    const isLambda = LAMBDA_NAME_PATTERNS.some((pattern) =>
      normalizedName.includes(pattern),
    );
    return normalizeNumericEvidence({
      rawValue: command.rawValue,
      rawUnit: command.propertyUnit.rawUnit,
      normalizedUnit: isLambda ? "W/mK" : "m",
      factor: isLambda ? 1 : command.propertyUnit.factorToMeters,
      unitSource: "ifc_property_unit",
      evidenceReference,
      diagnostics: command.diagnostics,
    });
  }

  if (command.valueType === "IfcLengthMeasure") {
    return normalizeNumericEvidence({
      rawValue: command.rawValue,
      rawUnit: command.projectLengthUnit?.rawUnit ?? null,
      normalizedUnit: "m",
      factor: command.projectLengthUnit?.factorToMeters ?? null,
      unitSource:
        command.projectLengthUnit === null ? "unknown" : "ifc_measure_type",
      evidenceReference,
      diagnostics: command.diagnostics,
    });
  }

  return normalizeNumericEvidence({
    rawValue: command.rawValue,
    rawUnit: null,
    normalizedUnit: LAMBDA_NAME_PATTERNS.some((pattern) =>
      normalizedName.includes(pattern),
    )
      ? "W/mK"
      : "m",
    factor: null,
    unitSource: "unknown",
    evidenceReference,
    diagnostics: command.diagnostics,
  });
}

export function normalizeNumericEvidence(command: {
  rawValue: number;
  rawUnit: string | null;
  normalizedUnit: string;
  factor: number | null;
  unitSource: NumericEvidence["unitSource"];
  evidenceReference: EvidenceReference;
  diagnostics: Diagnostic[];
}): NumericEvidence {
  const normalizedValue =
    command.factor === null ? null : command.rawValue * command.factor;
  const diagnostics =
    normalizedValue === null
      ? [
          {
            code: "numeric_unit_unknown",
            severity: "warning" as const,
            message: `Numeric evidence at ${command.evidenceReference.evidencePath} has no directly knowable unit; normalized value is null.`,
            stepIds: command.evidenceReference.sourceStepIds,
          },
        ]
      : [];

  command.diagnostics.push(...diagnostics);

  return {
    rawValue: command.rawValue,
    rawUnit: command.rawUnit,
    normalizedValue,
    normalizedUnit: command.normalizedUnit,
    unitSource: command.unitSource,
    confidence: normalizedValue === null ? "low" : "high",
    evidenceReference: command.evidenceReference,
    diagnostics,
  };
}

function prefixFactor(prefix: string | null) {
  if (prefix === "MILLI") {
    return 0.001;
  }
  if (prefix === "CENTI") {
    return 0.01;
  }
  if (prefix === "DECI") {
    return 0.1;
  }
  return 1;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}
