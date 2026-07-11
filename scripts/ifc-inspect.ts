import { runIfcInspectWorkflow } from "../src/application/ifc/runIfcInspectWorkflow.js";

async function main() {
  const sourceFilePath = process.argv[2];

  if (!sourceFilePath) {
    throw new Error('Usage: npm run ifc:inspect -- "<ifc path>"');
  }

  const result = await runIfcInspectWorkflow({
    sourceFilePath,
    repoRoot: process.cwd(),
  });

  if (!result.ok) {
    throw new Error(`${result.failureType}: ${result.message}`);
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  console.log(`IFC smoke artifact written: ${result.smokeArtifactPath}`);
  console.log(`File hash: ${result.fileHash}`);
  console.log(
    `Pure IFC evidence extracted: ${result.elementCount} elements, ${result.typeEvidenceCount} types`,
  );
  console.log(`Assembly candidates built: ${result.assemblyCandidateCount}`);
  console.log(`IFC evidence artifacts written: ${result.evidenceDirectoryPath}`);
  console.log(
    `Architect diagnostics written: ${result.diagnosticsMarkdownPath}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IFC smoke inspection failed: ${message}`);
  process.exitCode = 1;
});
