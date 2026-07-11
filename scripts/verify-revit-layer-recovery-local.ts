import { stat } from "node:fs/promises";

import { createMilestone1ArtifactPackage } from "../src/application/ifc/createMilestone1ArtifactPackage.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";
import { WebIfcEvidenceExtractor } from "../src/infrastructure/ifc/web-ifc/WebIfcEvidenceExtractor.js";

const sourceFilePath = process.argv[2];
if (!sourceFilePath) {
  console.error('Usage: npm run verify:revit-layer-recovery:local -- "<private ifc path>"');
  process.exit(1);
}

await stat(sourceFilePath);

const result = await new WebIfcEvidenceExtractor().extract({ sourceFilePath });
if (!result.ok) {
  throw new Error(`${result.failureType}: ${result.message}`);
}

const recoveredLayeredEvidence = result.ifcEvidence.elementEvidence.flatMap(
  (element) =>
    element.directMaterialEvidence.filter(
      (evidence) =>
        evidence.materialEvidenceSource === "recovered_layer_set_name_match" &&
        (evidence.materialStructureKind === "layer_set" ||
          evidence.materialStructureKind === "layer_set_usage"),
    ),
);

const multiLayerRecovered = recoveredLayeredEvidence.filter(
  (evidence) =>
    (evidence.materialStructureKind === "layer_set" ||
      evidence.materialStructureKind === "layer_set_usage") &&
    evidence.layers.length > 1,
);

const artifactPackage = createMilestone1ArtifactPackage({
  ifcEvidence: result.ifcEvidence,
});
const recoveredCalculationInputs =
  artifactPackage.calculationInputEvidence.filter((evidence) =>
    evidence.fixedInputs.some((input) => input.field === "layer_thickness") &&
    evidence.missingInputs.some((input) => input.field === "layer_lambda"),
  );
const requestedInputs = planRequestedInputs({
  calculationInputEvidence: artifactPackage.calculationInputEvidence,
}).requestedInputs;
const materialDecisionInputs = requestedInputs.filter(
  (input) => input.scope.scopeKind === "material_decision",
);
const affectedLayerOccurrences = materialDecisionInputs.reduce(
  (sum, input) =>
    sum + (input.scope.scopeKind === "material_decision" ? input.scope.affectedLayers.length : 0),
  0,
);

assertNonZero(
  recoveredLayeredEvidence.length,
  "Expected at least one recovered layer-set name match.",
);
assertNonZero(
  multiLayerRecovered.length,
  "Expected at least one recovered multi-layer stack.",
);
assertNonZero(
  recoveredCalculationInputs.length,
  "Expected recovered layers to become calculation inputs with missing lambda.",
);
assertNonZero(
  materialDecisionInputs.length,
  "Expected recovered missing lambda inputs to collapse into material decisions.",
);
assertNonZero(
  affectedLayerOccurrences,
  "Expected material decisions to retain affected layer occurrences.",
);

console.log(`PASS recovered layer-set matches: ${recoveredLayeredEvidence.length}`);
console.log(`PASS recovered multi-layer stacks: ${multiLayerRecovered.length}`);
console.log(`PASS elements requiring lambda resolution: ${recoveredCalculationInputs.length}`);
console.log(`PASS user-facing requested inputs: ${requestedInputs.length}`);
console.log(`PASS material decisions: ${materialDecisionInputs.length}`);
console.log(`PASS affected layer occurrences: ${affectedLayerOccurrences}`);
console.log(`PASS relevant elements: ${result.ifcEvidence.elementEvidence.length}`);

function assertNonZero(value: number, message: string): void {
  if (value <= 0) {
    throw new Error(message);
  }
}
