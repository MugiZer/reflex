import type {
  Diagnostic,
  ElementEvidence,
  IfcEvidence,
  IfcModelReader,
  SkippedScopeSummary,
  StepId,
  TypeEvidence,
} from "./evidenceTypes.js";
import { extractProjectLengthUnitSignal } from "./extractProjectLengthUnitSignal.js";

export function composeIfcEvidence(command: {
  reader: IfcModelReader;
  fileHash?: string;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  skippedScopeSummaries: SkippedScopeSummary[];
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): IfcEvidence {
  const citedStepIds = [...new Set(command.citedStepIds)];

  return {
    fileEvidence: {
      fileHash: command.fileHash ?? null,
      schema: command.reader.getSchema(),
      projectLengthUnitSignal: extractProjectLengthUnitSignal(command.reader),
      skippedScopeSummaries: command.skippedScopeSummaries,
    },
    elementEvidence: command.elementEvidence,
    typeEvidence: command.typeEvidence,
    citedIfcEntities: citedStepIds.map((stepId) =>
      command.reader.getCompactEntitySnapshot(stepId),
    ),
    skippedScopeSummaries: command.skippedScopeSummaries,
    diagnostics: command.diagnostics,
  };
}
