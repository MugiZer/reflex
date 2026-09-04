import type { AssemblyCandidate } from "../../domain/assemblies/assemblyTypes.js";
import type { AssemblyReadinessDiagnostic } from "../../domain/evidence/evidenceArtifactTypes.js";
import { buildDiagnosticsReviewModel } from "./buildDiagnosticsReviewModel.js";
import type { MissingDatapoint } from "../../domain/diagnostics/missingDatapointTypes.js";
import type {
  Diagnostic,
  ElementEvidence,
  EvidenceArtifactManifest,
  FileEvidence,
  TypeEvidence,
} from "../../domain/evidence/evidenceTypes.js";

export type GenerateDiagnosticsMarkdownCommand = {
  manifest: EvidenceArtifactManifest;
  fileEvidence: FileEvidence;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  diagnostics: Diagnostic[];
  assemblyCandidates: AssemblyCandidate[];
  missingDatapoints: MissingDatapoint[];
  readinessDiagnostics: AssemblyReadinessDiagnostic[];
  artifactIndex: string[];
};

export function generateDiagnosticsMarkdown(
  command: GenerateDiagnosticsMarkdownCommand,
): string {
  const model = buildDiagnosticsReviewModel(command);
  const sections = [
    "# IFC Evidence Review",
    fileSummary(model),
    whatWeCouldVerify(model),
    criticalEvidenceGaps(model),
    whatNeedsReview(model),
    whatToFixInBim(model),
    assemblyEvidenceSummary(model),
    conformityEvidence(model),
    artifactIndex(model),
  ];

  return `${sections.join("\n\n")}\n`;
}

type DiagnosticsReviewModel = ReturnType<typeof buildDiagnosticsReviewModel>;

function fileSummary(model: DiagnosticsReviewModel): string {
  return [
    "## File Summary",
    bullet("File hash", model.fileSummary.fileHash),
    bullet("Schema", model.fileSummary.schema),
    bullet("Artifact completeness", model.fileSummary.artifactCompleteness),
    bullet("Relevant elements", String(model.fileSummary.relevantElementCount)),
    bullet("Type Evidence records", String(model.fileSummary.typeEvidenceCount)),
    bullet("Skipped scope", model.fileSummary.skippedScopeSummary),
  ].join("\n");
}

function whatWeCouldVerify(model: DiagnosticsReviewModel): string {
  return [
    "## What We Could Verify",
    bullet("Assembly Candidates", String(model.verified.assemblyCandidateCount)),
    bullet("Layer stacks found", String(model.verified.layerStackCount)),
    bullet("Thicknesses found", String(model.verified.thicknessCount)),
    bullet("Material names found", String(model.verified.materialNameCount)),
    bullet("Evidence paths", model.verified.evidencePaths),
  ].join("\n");
}

function criticalEvidenceGaps(model: DiagnosticsReviewModel): string {
  const gaps = model.review.criticalEvidenceGaps;
  return [
    "## Critical BIM Evidence Gaps",
    ...(gaps.length === 0
      ? ["- No critical BIM evidence gaps recorded."]
      : gaps.map((gap) => `- ${gap}`)),
  ].join("\n");
}

function whatNeedsReview(model: DiagnosticsReviewModel): string {
  const reviewItems = model.review.userFixableMissingDatapoints;
  return [
    "## What Needs Review",
    bullet("Readiness State counts", model.review.readinessStateCounts),
    ...reviewItems.map(
      (datapoint) =>
        [
          `- Missing Datapoint: ${datapoint.field} (${datapoint.severity}) - ${datapoint.reason}`,
          datapoint.evidenceChecked.length > 0
            ? `  Evidence checked: ${datapoint.evidenceChecked.map((evidence) => evidence.evidencePath).join(", ")}`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
    ),
    ...(reviewItems.length === 0 ? ["- No user-fixable Missing Datapoints recorded."] : []),
  ].join("\n");
}

function whatToFixInBim(model: DiagnosticsReviewModel): string {
  const fixes = model.bimFixes;
  const visibleFixes = fixes.slice(0, 20);
  const omittedCount = fixes.length - visibleFixes.length;
  return [
    "## What To Fix In BIM",
    ...visibleFixes.map((datapoint) =>
      [
        `- ${datapoint.field}: ${datapoint.reason}`,
        datapoint.bimSourceFixHint
          ? `  BIM source fix: ${datapoint.bimSourceFixHint}`
          : null,
        `  Affected elements: ${datapoint.affectedElementIds.join(", ") || "unknown"}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    ),
    ...(omittedCount > 0 ? [`- ${omittedCount} more BIM source fixes omitted.`] : []),
    ...(fixes.length === 0 ? ["- No BIM source fixes recorded."] : []),
  ].join("\n");
}

function assemblyEvidenceSummary(model: DiagnosticsReviewModel): string {
  const visibleAssemblies = model.assemblies.slice(0, 20);
  const omittedCount = model.assemblies.length - visibleAssemblies.length;
  return [
    "## Assembly Evidence Summary",
    ...visibleAssemblies.map((assembly) => {
      const candidate = assembly.candidate;
      return [
        `### Assembly Candidate ${candidate.assemblyCandidateId}`,
        bullet("Source elements", candidate.sourceElementGlobalIds.join(", ") || candidate.sourceElementStepIds.join(", ")),
        bullet("Grouping basis", candidate.groupingBasis.basisKind),
        bullet("Readiness State", assembly.readinessState),
        bullet("Layer count", String(candidate.evidenceSummary.layerCount)),
        bullet("Missing Datapoints", assembly.missingDatapoints.map((item) => item.field).join(", ") || "none"),
        bullet("Evidence paths", assembly.evidencePaths),
      ].join("\n");
    }),
    ...(omittedCount > 0
      ? [`${omittedCount} more Assembly Candidates omitted.`]
      : []),
  ].join("\n\n");
}

function conformityEvidence(model: DiagnosticsReviewModel): string {
  return [
    "## Conformity Evidence",
    bullet("Artifact rules", model.conformity.artifactRules),
    ...model.conformity.diagnostics.map(
      (diagnostic) =>
        `- ${diagnostic.severity}: ${diagnostic.code} - ${diagnostic.message}`,
    ),
    ...(model.conformity.diagnostics.length === 0 ? ["- No extraction diagnostics recorded."] : []),
  ].join("\n");
}

function artifactIndex(model: DiagnosticsReviewModel): string {
  return [
    "## Artifact Index",
    ...model.artifactIndex.map((path) => `- ${path}`),
  ].join("\n");
}

function bullet(label: string, value: string): string {
  return `- ${label}: ${value}`;
}
