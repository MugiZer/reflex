import { buildAssemblyCandidates } from "../../domain/assemblies/buildAssemblyCandidates.js";
import { evaluateAssemblyReadiness } from "../../domain/assemblies/evaluateAssemblyReadiness.js";
import { detectMissingDatapoints } from "../../domain/diagnostics/detectMissingDatapoints.js";
import type { IfcEvidence } from "../../domain/evidence/evidenceTypes.js";
import { deriveEffectiveElementEvidence } from "../../domain/evidence/deriveEffectiveElementEvidence.js";
import { deriveCalculationInputEvidence } from "../../domain/evidence/deriveCalculationInputEvidence.js";
import type { Milestone1ArtifactPackage } from "../../domain/evidence/evidenceArtifactTypes.js";

export function createMilestone1ArtifactPackage(command: {
  ifcEvidence: IfcEvidence;
}): Milestone1ArtifactPackage {
  const effectiveResult = deriveEffectiveElementEvidence({
    ifcEvidence: command.ifcEvidence,
  });
  const calculationInputResult = deriveCalculationInputEvidence({
    effectiveElementEvidence: effectiveResult.effectiveElementEvidence,
  });
  const assemblyResult = buildAssemblyCandidates({
    ifcEvidence: command.ifcEvidence,
  });
  const missingDatapoints = assemblyResult.assemblyCandidates.flatMap(
    (assemblyCandidate) =>
      detectMissingDatapoints({
        assemblyCandidate,
        projectLengthUnitSignal:
          command.ifcEvidence.fileEvidence.projectLengthUnitSignal,
      }).missingDatapoints,
  );
  const readinessDiagnostics = assemblyResult.assemblyCandidates.map(
    (assemblyCandidate) => {
      const readiness = evaluateAssemblyReadiness({
        assemblyCandidate,
        missingDatapoints: missingDatapoints.filter((datapoint) =>
          datapoint.affectedElementStepIds.some((stepId) =>
            assemblyCandidate.sourceElementStepIds.includes(stepId),
          ),
        ),
      });

      return {
        assemblyCandidateId: assemblyCandidate.assemblyCandidateId,
        sourceElementStepIds: assemblyCandidate.sourceElementStepIds,
        sourceElementGlobalIds: assemblyCandidate.sourceElementGlobalIds,
        readinessState: readiness.readinessState,
        confidence: readiness.confidence,
        reasons: readiness.reasons,
      };
    },
  );

  return {
    ifcEvidence: command.ifcEvidence,
    calculationInputEvidence: calculationInputResult.calculationInputEvidence,
    assemblyCandidates: assemblyResult.assemblyCandidates,
    missingDatapoints,
    readinessDiagnostics,
  };
}
