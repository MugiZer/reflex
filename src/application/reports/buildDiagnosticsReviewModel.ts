import type { AssemblyCandidate } from "../../domain/assemblies/assemblyTypes.js";
import type { MissingDatapoint } from "../../domain/diagnostics/missingDatapointTypes.js";
import type {
  Diagnostic,
  ElementEvidence,
  EvidenceArtifactManifest,
  FileEvidence,
  TypeEvidence,
} from "../../domain/evidence/evidenceTypes.js";
import type { AssemblyReadinessDiagnostic } from "../../domain/evidence/evidenceArtifactTypes.js";

export type DiagnosticsReviewModel = {
  fileSummary: {
    fileHash: string;
    schema: string;
    artifactCompleteness: string;
    relevantElementCount: number;
    typeEvidenceCount: number;
    skippedScopeSummary: string;
  };
  verified: {
    assemblyCandidateCount: number;
    layerStackCount: number;
    thicknessCount: number;
    materialNameCount: number;
    evidencePaths: string;
  };
  review: {
    readinessStateCounts: string;
    userFixableMissingDatapoints: MissingDatapoint[];
    criticalEvidenceGaps: string[];
  };
  bimFixes: MissingDatapoint[];
  assemblies: Array<{
    candidate: AssemblyCandidate;
    readinessState: string;
    missingDatapoints: MissingDatapoint[];
    evidencePaths: string;
  }>;
  conformity: {
    artifactRules: string;
    diagnostics: Diagnostic[];
  };
  artifactIndex: string[];
};

export function buildDiagnosticsReviewModel(command: {
  manifest: EvidenceArtifactManifest;
  fileEvidence: FileEvidence;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  diagnostics: Diagnostic[];
  assemblyCandidates: AssemblyCandidate[];
  missingDatapoints: MissingDatapoint[];
  readinessDiagnostics: AssemblyReadinessDiagnostic[];
  artifactIndex: string[];
}): DiagnosticsReviewModel {
  const readinessByCandidateId = new Map(
    command.readinessDiagnostics.map((diagnostic) => [
      diagnostic.assemblyCandidateId,
      diagnostic,
    ]),
  );

  return {
    fileSummary: {
      fileHash: command.fileEvidence.fileHash ?? "unknown",
      schema: command.fileEvidence.schema ?? "unknown",
      artifactCompleteness: command.manifest.artifactCompleteness,
      relevantElementCount: command.elementEvidence.length,
      typeEvidenceCount: command.typeEvidence.length,
      skippedScopeSummary:
        command.fileEvidence.skippedScopeSummaries.length === 0
          ? "none recorded"
          : command.fileEvidence.skippedScopeSummaries
              .map((summary) => `${summary.rawEntityClass}: ${summary.count}`)
              .join(", "),
    },
    verified: {
      assemblyCandidateCount: command.assemblyCandidates.length,
      layerStackCount: command.assemblyCandidates.filter(
        (candidate) => candidate.evidenceSummary.hasLayeredMaterialEvidence,
      ).length,
      thicknessCount: command.assemblyCandidates.filter(
        (candidate) => candidate.evidenceSummary.hasAllLayerThicknesses,
      ).length,
      materialNameCount: command.assemblyCandidates.filter(
        (candidate) => candidate.evidenceSummary.hasAllMaterialNames,
      ).length,
      evidencePaths: summarizeEvidencePaths(command.assemblyCandidates) || "none recorded",
    },
    review: {
      readinessStateCounts:
        summarizeCounts(
          command.readinessDiagnostics.map(
            (diagnostic) => diagnostic.readinessState,
          ),
        ) || "none",
      userFixableMissingDatapoints: command.missingDatapoints.filter(
        (datapoint) => datapoint.userFixable,
      ),
      criticalEvidenceGaps: summarizeCriticalEvidenceGaps({
        assemblyCandidates: command.assemblyCandidates,
        missingDatapoints: command.missingDatapoints,
      }),
    },
    bimFixes: command.missingDatapoints.filter(
      (datapoint) => datapoint.bimSourceFixRecommended,
    ),
    assemblies: command.assemblyCandidates.map((candidate) => ({
      candidate,
      readinessState:
        readinessByCandidateId.get(candidate.assemblyCandidateId)
          ?.readinessState ?? "unknown",
      missingDatapoints: command.missingDatapoints.filter((datapoint) =>
        datapoint.affectedElementStepIds.some((stepId) =>
          candidate.sourceElementStepIds.includes(stepId),
        ),
      ),
      evidencePaths: summarizeEvidencePaths([candidate]) || "none recorded",
    })),
    conformity: {
      artifactRules: [
        command.manifest.relevantElementRulesVersion,
        command.manifest.groupingPolicyVersion,
        command.manifest.missingDatapointRulesVersion,
        command.manifest.readinessRulesVersion,
      ].join(", "),
      diagnostics: command.diagnostics.slice(0, 10),
    },
    artifactIndex: command.artifactIndex,
  };
}

function summarizeCriticalEvidenceGaps(command: {
  assemblyCandidates: AssemblyCandidate[];
  missingDatapoints: MissingDatapoint[];
}): string[] {
  const missingFields = new Set(
    command.missingDatapoints.map((datapoint) => datapoint.field),
  );
  const gaps: string[] = [];

  if (missingFields.has("type_link")) {
    gaps.push("official type links absent");
  }
  if (missingFields.has("material_association")) {
    gaps.push("official material associations absent");
  }
  if (
    command.assemblyCandidates.length > 0 &&
    command.assemblyCandidates.every(
      (candidate) => !candidate.evidenceSummary.hasLayeredMaterialEvidence,
    )
  ) {
    gaps.push("no layer stacks found");
  }
  if (missingFields.has("calculation_basis_evidence")) {
    gaps.push("cannot prove thermal assembly");
  }

  return gaps;
}

function summarizeEvidencePaths(assemblyCandidates: AssemblyCandidate[]): string {
  const paths = assemblyCandidates.flatMap((candidate) =>
    candidate.groupingSignatures.flatMap((signature) =>
      signature.components.flatMap((component) =>
        component.evidenceReference ? [component.evidenceReference.evidencePath] : [],
      ),
    ),
  );

  return Array.from(new Set(paths)).slice(0, 8).join(", ");
}

function summarizeCounts(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => `${value}: ${count}`)
    .join(", ");
}
