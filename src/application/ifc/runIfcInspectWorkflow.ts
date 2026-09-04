import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inspectIfcSmoke } from "../../domain/evidence/smoke/inspectIfcSmoke.js";
import type { IfcModelReader } from "../../domain/evidence/evidenceTypes.js";
import { WebIfcEvidenceExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcEvidenceExtractor.js";
import { WebIfcModelReader } from "../../infrastructure/ifc/web-ifc/WebIfcModelReader.js";
import { writeDiagnosticsMarkdown } from "../../infrastructure/storage/local-files/writeDiagnosticsMarkdown.js";
import { writeIfcEvidenceArtifacts } from "../../infrastructure/storage/local-files/writeIfcEvidenceArtifacts.js";
import { createMilestone1ArtifactPackage } from "./createMilestone1ArtifactPackage.js";

export type RunIfcInspectWorkflowCommand = {
  sourceFilePath: string;
  repoRoot: string;
  outputRoot?: string;
  createReader?: (sourceFilePath: string) => Promise<IfcModelReader>;
};

export type RunIfcInspectWorkflowResult =
  | {
      ok: true;
      fileHash: string;
      smokeArtifactPath: string;
      evidenceDirectoryPath: string;
      diagnosticsMarkdownPath: string;
      elementCount: number;
      typeEvidenceCount: number;
      assemblyCandidateCount: number;
      warnings: string[];
      artifactPaths: string[];
    }
  | {
      ok: false;
      failureType: "file_read_error" | "parse_error" | "internal_error";
      message: string;
    };

export async function runIfcInspectWorkflow(
  command: RunIfcInspectWorkflowCommand,
): Promise<RunIfcInspectWorkflowResult> {
  const outputRoot = resolve(command.outputRoot ?? "outputs");

  let smokeResult;
  try {
    smokeResult = await inspectIfcSmoke({
      sourceFilePath: command.sourceFilePath,
      repoRoot: command.repoRoot,
      outputRoot,
      createReader:
        command.createReader ??
        (async (path) => {
          const sourceFileBytes = await readFile(path);
          return await WebIfcModelReader.open(sourceFileBytes);
        }),
    });
  } catch (error) {
    return {
      ok: false,
      failureType: classifySmokeFailure(error),
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const evidenceExtractor = new WebIfcEvidenceExtractor();
  const evidenceResult = await evidenceExtractor.extract({
    sourceFilePath: command.sourceFilePath,
    fileHash: smokeResult.fileHash,
  });

  if (!evidenceResult.ok) {
    return {
      ok: false,
      failureType: evidenceResult.failureType,
      message: evidenceResult.message,
    };
  }

  const artifactPackage = createMilestone1ArtifactPackage({
    ifcEvidence: evidenceResult.ifcEvidence,
  });
  const artifactResult = await writeIfcEvidenceArtifacts({
    outputRoot,
    ifcEvidence: artifactPackage.ifcEvidence,
    assemblyCandidates: artifactPackage.assemblyCandidates,
    calculationInputEvidence: artifactPackage.calculationInputEvidence,
    missingDatapoints: artifactPackage.missingDatapoints,
    readinessDiagnostics: artifactPackage.readinessDiagnostics,
  });
  const diagnosticsMarkdownResult = await writeDiagnosticsMarkdown({
    outputRoot,
    ifcEvidence: artifactPackage.ifcEvidence,
    manifest: artifactResult.manifest,
    assemblyCandidates: artifactPackage.assemblyCandidates,
    missingDatapoints: artifactPackage.missingDatapoints,
    readinessDiagnostics: artifactPackage.readinessDiagnostics,
    writtenArtifactPaths: artifactResult.writtenArtifactPaths,
  });

  return {
    ok: true,
    fileHash: smokeResult.fileHash,
    smokeArtifactPath: smokeResult.smokeArtifactPath,
    evidenceDirectoryPath: artifactResult.evidenceDirectoryPath,
    diagnosticsMarkdownPath: diagnosticsMarkdownResult.diagnosticsMarkdownPath,
    elementCount: evidenceResult.ifcEvidence.elementEvidence.length,
    typeEvidenceCount: evidenceResult.ifcEvidence.typeEvidence.length,
    assemblyCandidateCount: artifactPackage.assemblyCandidates.length,
    warnings: smokeResult.warnings,
    artifactPaths: [
      smokeResult.smokeArtifactPath,
      ...artifactResult.writtenArtifactPaths,
      diagnosticsMarkdownResult.diagnosticsMarkdownPath,
    ],
  };
}

function classifySmokeFailure(
  error: unknown,
): "file_read_error" | "parse_error" | "internal_error" {
  const nodeError = error as { code?: unknown };
  return nodeError.code === "ENOENT" ? "file_read_error" : "parse_error";
}
