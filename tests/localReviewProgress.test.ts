import { projectLocalReviewProgress } from "../src/app/http/frontend/projectLocalReviewProgress.js";

describe("local Review progress", () => {
  it("counts unresolved decisions instead of every affected assembly after defaults are seeded", () => {
    const decisions = [
      decision("library-concrete", "layer_lambda", ["wall-1", "wall-2"]),
      decision("library-gypsum", "layer_lambda", ["wall-2", "wall-3"]),
      decision("manual-product", "layer_lambda", ["wall-4", "wall-5"]),
      decision("assembly-evidence", "calculation_basis_evidence", ["slab-1"]),
    ];

    const progress = projectLocalReviewProgress(decisions, {
      "library-concrete": "1.7",
      "library-gypsum": "0.25",
    });

    expect(progress).toEqual({
      totalDecisionCount: 4,
      readyDecisionCount: 2,
      remainingDecisionCount: 2,
      remainingMaterialDecisionCount: 1,
      remainingEvidenceDecisionCount: 1,
      affectedAssemblyGroupIds: ["slab-1", "wall-4", "wall-5"],
    });
  });
});

function decision(
  requestedInputId: string,
  datapoint: string,
  affectedAssemblyGroupIds: string[],
) {
  return {
    requestedInputId,
    datapoint,
    inputType: datapoint === "layer_lambda" ? "number" : "text",
    affectedAssemblyGroupIds,
  };
}
