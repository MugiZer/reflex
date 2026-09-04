import { attributeEvidenceReference, entityEvidenceReference } from "../evidenceReferences.js";
import type {
  CandidatePropertyEvidence,
  Diagnostic,
  IfcModelReader,
  PropertyEvidence,
  PropertySetEvidence,
  QuantityEvidence,
  QuantitySetEvidence,
  StepId,
} from "../evidenceTypes.js";
import {
  candidatePropertiesFromPropertySet,
  candidatePropertiesFromQuantitySet,
} from "./candidatePropertyClassifier.js";
import {
  normalizeNumericEvidence,
  numericEvidenceForProperty,
  type ProjectLengthUnit,
  unitFromStep,
} from "./numericEvidenceNormalizer.js";

export function extractPropertyAndQuantityEvidence(command: {
  reader: IfcModelReader;
  propertyDefinitionLinks: Array<{
    relationshipStepId: StepId;
    relatingPropertyDefinitionStepId: StepId;
  }>;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}) {
  const propertySets: PropertySetEvidence[] = [];
  const quantitySets: QuantitySetEvidence[] = [];
  const candidatePropertyEvidence: CandidatePropertyEvidence[] = [];

  for (const link of command.propertyDefinitionLinks) {
    const definitionClass = command.reader.getEntityClass(
      link.relatingPropertyDefinitionStepId,
    );
    command.citedStepIds.push(
      link.relationshipStepId,
      link.relatingPropertyDefinitionStepId,
    );
    if (definitionClass === "IfcPropertySet") {
      const propertySet = extractPropertySet({
        reader: command.reader,
        propertySetStepId: link.relatingPropertyDefinitionStepId,
        relationshipStepId: link.relationshipStepId,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics: command.diagnostics,
        citedStepIds: command.citedStepIds,
      });
      propertySets.push(propertySet);
      candidatePropertyEvidence.push(...candidatePropertiesFromPropertySet(propertySet));
    }
    if (definitionClass === "IfcElementQuantity") {
      const quantitySet = extractQuantitySet({
        reader: command.reader,
        quantitySetStepId: link.relatingPropertyDefinitionStepId,
        relationshipStepId: link.relationshipStepId,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics: command.diagnostics,
        citedStepIds: command.citedStepIds,
      });
      quantitySets.push(quantitySet);
      candidatePropertyEvidence.push(...candidatePropertiesFromQuantitySet(quantitySet));
    }
  }

  return { propertySets, quantitySets, candidatePropertyEvidence };
}

export function extractTypePropertyEvidence(command: {
  reader: IfcModelReader;
  propertySetStepIds: StepId[];
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}) {
  const propertySets: PropertySetEvidence[] = [];
  const quantitySets: QuantitySetEvidence[] = [];

  for (const stepId of command.propertySetStepIds) {
    const entityClass = command.reader.getEntityClass(stepId);
    if (entityClass === "IfcPropertySet") {
      propertySets.push(
        extractPropertySet({
          reader: command.reader,
          propertySetStepId: stepId,
          relationshipStepId: null,
          projectLengthUnit: command.projectLengthUnit,
          diagnostics: command.diagnostics,
          citedStepIds: command.citedStepIds,
        }),
      );
    }
    if (entityClass === "IfcElementQuantity") {
      quantitySets.push(
        extractQuantitySet({
          reader: command.reader,
          quantitySetStepId: stepId,
          relationshipStepId: null,
          projectLengthUnit: command.projectLengthUnit,
          diagnostics: command.diagnostics,
          citedStepIds: command.citedStepIds,
        }),
      );
    }
  }

  return {
    propertySets,
    quantitySets,
    candidatePropertyEvidence: [
      ...propertySets.flatMap(candidatePropertiesFromPropertySet),
      ...quantitySets.flatMap(candidatePropertiesFromQuantitySet),
    ],
  };
}

function extractPropertySet(command: {
  reader: IfcModelReader;
  propertySetStepId: StepId;
  relationshipStepId: StepId | null;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): PropertySetEvidence {
  const propertyStepIds = command.reader.getEntityReferenceList(
    command.propertySetStepId,
    "HasProperties",
  );
  command.citedStepIds.push(command.propertySetStepId, ...propertyStepIds);
  return {
    relationshipStepId: command.relationshipStepId,
    propertySetStepId: command.propertySetStepId,
    name: command.reader.getStringAttribute(command.propertySetStepId, "Name"),
    properties: propertyStepIds.map((propertyStepId) =>
      extractProperty({
        reader: command.reader,
        propertyStepId,
        propertySetStepId: command.propertySetStepId,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics: command.diagnostics,
      }),
    ),
    evidenceReference: entityEvidenceReference(
      "IfcPropertySet",
      command.propertySetStepId,
    ),
  };
}

function extractProperty(command: {
  reader: IfcModelReader;
  propertyStepId: StepId;
  propertySetStepId: StepId;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
}): PropertyEvidence {
  const rawValue = command.reader.getEntity(command.propertyStepId)?.attributes[
    "NominalValue"
  ];
  const name = command.reader.getStringAttribute(command.propertyStepId, "Name");
  const unitStepId = command.reader.getEntityReference(command.propertyStepId, "Unit");
  const propertyUnit = unitStepId === null ? null : unitFromStep(command.reader, unitStepId);
  const valueType = command.reader.getStringAttribute(
    command.propertyStepId,
    "ValueType",
  );
  const numericEvidence =
    typeof rawValue === "number"
      ? numericEvidenceForProperty({
          rawValue,
          propertyStepId: command.propertyStepId,
          propertyName: name,
          valueType,
          propertyUnit,
          projectLengthUnit: command.projectLengthUnit,
          diagnostics: command.diagnostics,
        })
      : null;

  return {
    propertyStepId: command.propertyStepId,
    name,
    rawValue,
    rawUnit: propertyUnit?.rawUnit ?? numericEvidence?.rawUnit ?? null,
    numericEvidence,
    evidenceReference: attributeEvidenceReference(
      "IfcPropertySingleValue",
      command.propertyStepId,
      "NominalValue",
    ),
  };
}

function extractQuantitySet(command: {
  reader: IfcModelReader;
  quantitySetStepId: StepId;
  relationshipStepId: StepId | null;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): QuantitySetEvidence {
  const quantityStepIds = command.reader.getEntityReferenceList(
    command.quantitySetStepId,
    "Quantities",
  );
  command.citedStepIds.push(command.quantitySetStepId, ...quantityStepIds);
  return {
    relationshipStepId: command.relationshipStepId,
    quantitySetStepId: command.quantitySetStepId,
    name: command.reader.getStringAttribute(command.quantitySetStepId, "Name"),
    quantities: quantityStepIds.map((quantityStepId) =>
      extractQuantity({
        reader: command.reader,
        quantityStepId,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics: command.diagnostics,
      }),
    ),
    evidenceReference: entityEvidenceReference(
      "IfcElementQuantity",
      command.quantitySetStepId,
    ),
  };
}

function extractQuantity(command: {
  reader: IfcModelReader;
  quantityStepId: StepId;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
}): QuantityEvidence {
  const quantityClass = command.reader.getEntityClass(command.quantityStepId);
  const valueAttribute =
    quantityClass === "IfcQuantityLength" ? "LengthValue" : "NominalValue";
  const rawValue = command.reader.getNumberAttribute(
    command.quantityStepId,
    valueAttribute,
  );
  const evidenceReference = attributeEvidenceReference(
    quantityClass ?? "IfcPhysicalSimpleQuantity",
    command.quantityStepId,
    valueAttribute,
  );

  return {
    quantityStepId: command.quantityStepId,
    name: command.reader.getStringAttribute(command.quantityStepId, "Name"),
    rawValue,
    rawUnit: command.projectLengthUnit?.rawUnit ?? null,
    numericEvidence:
      rawValue === null
        ? null
        : normalizeNumericEvidence({
            rawValue,
            rawUnit: command.projectLengthUnit?.rawUnit ?? null,
            normalizedUnit: "m",
            factor: command.projectLengthUnit?.factorToMeters ?? null,
            unitSource:
              quantityClass === "IfcQuantityLength"
                ? "ifc_measure_type"
                : "unknown",
            evidenceReference,
            diagnostics: command.diagnostics,
          }),
    evidenceReference,
  };
}
