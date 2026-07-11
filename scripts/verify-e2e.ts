import { runE2eVerifier, printVerifierResult } from "../src/verifier/e2eVerifier.js";

const result = await runE2eVerifier({ outputRoot: "outputs" });
printVerifierResult(result);

if (!result.passed) {
  process.exitCode = 1;
}
