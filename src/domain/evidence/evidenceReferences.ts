import type { EvidenceReference, StepId } from "./evidenceTypes.js";

export function entityEvidenceReference(
  entityClass: string,
  stepId: StepId,
): EvidenceReference {
  return {
    evidencePath: `${entityClass}#${stepId}`,
    sourceStepIds: [stepId],
    pathParts: [
      {
        stepId,
        entityClass,
      },
    ],
  };
}

export function attributeEvidenceReference(
  entityClass: string,
  stepId: StepId,
  attribute: string,
): EvidenceReference {
  return {
    evidencePath: `${entityClass}#${stepId} -> ${attribute}`,
    sourceStepIds: [stepId],
    pathParts: [
      {
        stepId,
        entityClass,
        attribute,
      },
    ],
  };
}
