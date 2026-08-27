import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { generateDiagnosticsMarkdown } from "../../../application/reports/generateDiagnosticsMarkdown.js";
import type { AssemblyReadinessDiagnostic } from "../../../domain/evidence/evidenceArtifactTypes.js";
import type { AssemblyCandidate } from "../../../domain/assemblies/assemblyTypes.js";
import type { MissingDatapoint } from "../../../domain/diagnostics/missingDatapointTypes.js";
import type {
  EvidenceArtifactManifest,
  IfcEvidence,
} from "../../../domain/evidence/evidenceTypes.js";

export type WriteDiagnosticsMarkdownCommand = {
  outputRoot: string;
  ifcEvidence: IfcEvidence;
  manifest: EvidenceArtifactManifest;
  assemblyCandidates: AssemblyCandidate[];
  missingDatapoints: MissingDatapoint[];
  readinessDiagnostics: AssemblyReadinessDiagnostic[];
  writtenArtifactPaths: string[];
};

export async function writeDiagnosticsMarkdown(
  command: WriteDiagnosticsMarkdownCommand,
): Promise<{ diagnosticsMarkdownPath: string }> {
  const fileHash = command.ifcEvidence.fileEvidence.fileHash;
  if (!fileHash) {
    throw new Error("Cannot write diagnostics markdown without fileEvidence.fileHash.");
  }

  const diagnosticsMarkdownPath = join(command.outputRoot, fileHash, "diagnostics.md");
  await mkdir(dirname(diagnosticsMarkdownPath), { recursive: true });

  const markdown = generateDiagnosticsMarkdown({
    manifest: command.manifest,
    fileEvidence: command.ifcEvidence.fileEvidence,
    elementEvidence: command.ifcEvidence.elementEvidence,
    typeEvidence: command.ifcEvidence.typeEvidence,
    diagnostics: command.ifcEvidence.diagnostics,
    assemblyCandidates: command.assemblyCandidates,
    missingDatapoints: command.missingDatapoints,
    readinessDiagnostics: command.readinessDiagnostics,
    artifactIndex: command.writtenArtifactPaths.map((path) =>
      relative(join(command.outputRoot, fileHash), path).replaceAll("\\", "/"),
    ),
  });

  await writeFile(diagnosticsMarkdownPath, markdown, "utf8");
  return { diagnosticsMarkdownPath };
}
