import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runCoreReviewCalculationReport } from "../src/application/review/runCoreReviewCalculationReport.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";
import { defaultMaterialLibraryV1 } from "../src/domain/materials/library.v1.js";
import type { UserInput } from "../src/domain/review/reviewTypes.js";

const sourceFilePath = process.argv[2] ?? "synthetic.ifc";
const reviewInputsPath = process.argv[3] ?? "review-inputs.json";

const userInputs = await readReviewInputs(reviewInputsPath);
const result = await runCoreReviewCalculationReport({
  fileHash: hashLike(sourceFilePath),
  outputRoot: "outputs",
  calculationInputEvidence: [syntheticCalculationInputEvidence()],
  materialLibrary: defaultMaterialLibraryV1,
  userInputs,
});

console.log(`Revision: ${result.revision.revisionId}`);
console.log(`Report: ${result.reportFilePath}`);
console.log(`Snapshots: ${result.calculationSnapshots.length}`);

async function readReviewInputs(path: string): Promise<UserInput[]> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as UserInput[];
  } catch {
    return [
      {
        userInputId: "ui_demo_lambda",
        requestedInputId: "ri_demo_lambda",
        datapoint: "layer_lambda",
        value: 0.04,
        unit: "W/mK",
      },
    ];
  }
}

function syntheticCalculationInputEvidence(): CalculationInputEvidence {
  return {
    elementStepId: 10,
    elementGlobalId: "synthetic-wall",
    elementClass: "IfcWall",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      input("layer_order", [301]),
      input("layer_thickness", 0.12),
      input("layer_material_name", "Mineral wool"),
    ],
    candidateInputs: [],
    missingInputs: [input("layer_lambda", null, "missing")],
    diagnostics: [],
  };
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  source: "ifc_fixed" | "missing" = "ifc_fixed",
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: "high",
    evidenceReferences: [
      {
        evidencePath: "SyntheticMilestone3Fixture#301",
        sourceStepIds: [301],
        pathParts: [{ stepId: 301, entityClass: "IfcMaterialLayer" }],
      },
    ],
    reason: "Synthetic Milestone 3 demo fixture.",
  };
}

function hashLike(value: string): string {
  return Buffer.from(join(value)).toString("hex").slice(0, 16) || "synthetic";
}
