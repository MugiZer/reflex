import type {
  EvidenceReference,
  IfcModelReader,
  ProjectLengthUnitSignal,
} from "./evidenceTypes.js";
import { attributeEvidenceReference } from "./evidenceReferences.js";

export function extractProjectLengthUnitSignal(
  reader: IfcModelReader,
): ProjectLengthUnitSignal {
  const projects = reader.getEntitiesByClass("IfcProject");
  const evidenceReferences: EvidenceReference[] = projects.map((project) =>
    attributeEvidenceReference("IfcProject", project.stepId, "UnitsInContext"),
  );
  let unitsInContextAvailable = false;
  let lengthUnitAppearsAvailable = false;

  for (const project of projects) {
    const unitsInContextStepId = reader.getEntityReference(
      project.stepId,
      "UnitsInContext",
    );

    if (unitsInContextStepId === null) {
      continue;
    }

    unitsInContextAvailable = true;
    evidenceReferences.push(
      attributeEvidenceReference(
        reader.getEntityClass(unitsInContextStepId) ?? "IfcUnitAssignment",
        unitsInContextStepId,
        "Units",
      ),
    );

    for (const unitStepId of reader.getEntityReferenceList(
      unitsInContextStepId,
      "Units",
    )) {
      if (isLengthUnit(reader, unitStepId)) {
        lengthUnitAppearsAvailable = true;
        evidenceReferences.push(
          attributeEvidenceReference("IfcSIUnit", unitStepId, "UnitType"),
        );
      }
    }
  }

  return {
    ifcProjectCount: projects.length,
    unitsInContextAvailable,
    lengthUnitAppearsAvailable,
    evidenceReferences,
  };
}

function isLengthUnit(reader: IfcModelReader, stepId: number) {
  return (
    reader.getEntityClass(stepId) === "IfcSIUnit" &&
    reader.getStringAttribute(stepId, "UnitType") === "LENGTHUNIT"
  );
}
