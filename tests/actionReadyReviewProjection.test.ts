import { buildActionReadyReviewProjection } from "../src/application/review/buildActionReadyReviewProjection.js";
import { buildReviewContextViewModel } from "../src/application/review/buildReviewContextViewModel.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { defaultMaterialLibraryV1 } from "../src/domain/materials/library.v1.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";

describe("Action-ready Review projection", () => {
  it("joins architect labels, library defaults, provenance, constraints, affected assemblies, and submission identity", () => {
    const calculationInputEvidence = [syntheticMilestone4CalculationInputEvidence()];
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence,
      materialLibrary: defaultMaterialLibraryV1,
      deferResolvedMaterialsToReview: true,
    }).requestedInputs;
    const resolvedInputs = requestedInputs.map((input) => ({
      ...input,
      materialResolution: {
        rawMaterialName: "Mineral wool", normalizedMaterialName: "mineral wool", status: "resolved" as const,
        matchedMaterialKey: "mineral_wool", matchedMaterialName: "Mineral wool", matchBasis: "exact_alias" as const,
        candidateMaterialKeys: ["mineral_wool"], reason: "Exact library match.", evidenceState: "library_assisted" as const,
      },
    }));
    const projection = buildActionReadyReviewProjection({
      jobId: "job_1",
      requestedInputs: resolvedInputs,
      calculationInputEvidence,
      materialLibrary: defaultMaterialLibraryV1,
      context: buildReviewContextViewModel({ jobId: "job_1", requestedInputs: resolvedInputs, calculationInputEvidence }),
    });

    expect(projection.decisions).toEqual([expect.objectContaining({
      label: "What thermal conductivity should be used for this layer?",
      affectedAssemblyGroupIds: ["ag_element_40"],
      status: "pending",
      evidence: expect.objectContaining({ materialLabel: "Mineral wool" }),
      defaultValue: expect.objectContaining({
        value: 0.04,
        source: "material_library",
        materialLibraryKey: "mineral_wool",
        sourceLabel: "Milestone 3 seed library",
      }),
      constraints: expect.objectContaining({
        minimumExclusive: 0,
        materialOptions: expect.arrayContaining([expect.objectContaining({ materialLibraryKey: "mineral_wool" })]),
      }),
      submission: expect.objectContaining({
        requestedInputId: requestedInputs[0].requestedInputId,
        unit: "W/mK",
        overrideScope: "layer_occurrence",
      }),
    })]);
  });
});