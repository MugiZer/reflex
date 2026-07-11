import { stat } from "node:fs/promises";

import { runE2eVerifier, printVerifierResult } from "../src/verifier/e2eVerifier.js";

const fixtureIfcPath = process.argv[2];
if (!fixtureIfcPath) {
  console.error('Usage: npm run verify:e2e:local -- "<private ifc path>"');
  process.exit(1);
}

await stat(fixtureIfcPath);
const result = await runE2eVerifier({ outputRoot: "outputs", fixtureIfcPath });
printVerifierResult(result);

if (!result.passed) {
  process.exitCode = 1;
}
