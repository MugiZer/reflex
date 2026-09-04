import type { AssemblyCandidate } from "./assemblyTypes.js";
import type { Confidence, Diagnostic } from "../evidence/evidenceTypes.js";
import type { MissingDatapoint } from "../diagnostics/missingDatapointTypes.js";

export const ASSEMBLY_READINESS_RULES_VERSION = "assembly-readiness-rules.v1";

export type ReadinessState =
  | "ready"
  | "needs_review"
  | "estimated"
  | "blocked"
  | "superseded";

type EvaluateAssemblyReadinessCommand = {
  assemblyCandidate: AssemblyCandidate;
  missingDatapoints: MissingDatapoint[];
};

type EvaluateAssemblyReadinessResult = {
  readinessState: ReadinessState;
  confidence: Confidence;
  reasons: Diagnostic[];
};

export function evaluateAssemblyReadiness(
  command: EvaluateAssemblyReadinessCommand,
): EvaluateAssemblyReadinessResult {
  const requiredMissing = command.missingDatapoints.filter(
    (datapoint) => datapoint.severity !== "optional_for_report",
  );
  const nonUserFixableRequired = requiredMissing.filter(
    (datapoint) => !datapoint.userFixable,
  );

  if (nonUserFixableRequired.length > 0) {
    return {
      readinessState: "blocked",
      confidence: "high",
      reasons: [
        reason(command.assemblyCandidate, {
          code: "assembly_blocked_by_bim_source_datapoints",
          severity: "error",
          message:
            "Assembly Candidate has required missing datapoints that need BIM source fixes.",
        }),
      ],
    };
  }

  if (requiredMissing.length > 0) {
    return {
      readinessState: "needs_review",
      confidence: "medium",
      reasons: [
        reason(command.assemblyCandidate, {
          code: "assembly_needs_review_for_missing_datapoints",
          severity: "warning",
          message:
            "Assembly Candidate has user-fixable missing datapoints before calculation readiness.",
        }),
      ],
    };
  }

  if (
    command.assemblyCandidate.evidenceSummary.hasLayeredMaterialEvidence &&
    command.assemblyCandidate.evidenceSummary.hasOrderedLayers &&
    command.assemblyCandidate.evidenceSummary.hasAllLayerThicknesses &&
    command.assemblyCandidate.evidenceSummary.hasAllMaterialNames &&
    command.assemblyCandidate.evidenceSummary.hasAllLambdaCandidates
  ) {
    return {
      readinessState: "ready",
      confidence: "high",
      reasons: [
        reason(command.assemblyCandidate, {
          code: "assembly_ready_for_layered_calculation",
          severity: "info",
          message:
            "Assembly Candidate has ordered layers, thicknesses, material names, and lambda candidates.",
        }),
      ],
    };
  }

  return {
    readinessState: "estimated",
    confidence: "low",
    reasons: [
      reason(command.assemblyCandidate, {
        code: "assembly_estimated_from_partial_evidence",
        severity: "warning",
        message:
          "Assembly Candidate has no required missing datapoints, but evidence summary is not complete enough for direct layered calculation.",
      }),
    ],
  };
}

function reason(
  assemblyCandidate: AssemblyCandidate,
  diagnostic: Omit<Diagnostic, "stepIds">,
): Diagnostic {
  return {
    ...diagnostic,
    stepIds: assemblyCandidate.sourceElementStepIds,
  };
}
