import { runMilestone1Verifier } from "../src/verifier/runMilestone1Verifier.js";

const fixtureIfcPath = process.argv[2];

if (!fixtureIfcPath) {
  throw new Error('Usage: npm run verify:milestone-1 -- "<ifc path>"');
}

const result = await runMilestone1Verifier({ fixtureIfcPath });

for (const diagnostic of result.diagnostics) {
  const prefix = diagnostic.severity.toUpperCase();
  console.log(`${prefix}: ${diagnostic.code} - ${diagnostic.message}`);
}

if (result.artifactPaths.length > 0) {
  console.log("Artifacts:");
  for (const path of result.artifactPaths) {
    console.log(`- ${path}`);
  }
}

process.exitCode = result.passed ? 0 : 1;
