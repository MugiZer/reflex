import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { calculateThermalPerformance } from "../src/domain/calculations/calculateThermalPerformance.js";
import { buildPhysicsAssemblies } from "../src/domain/calculations/buildPhysicsAssemblies.js";
import { resolveLayerLambda } from "../src/domain/materials/resolveLayerLambda.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";
import { runCoreReviewCalculationReport } from "../src/application/review/runCoreReviewCalculationReport.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";
import type { MaterialLibrary } from "../src/domain/materials/materialTypes.js";
import type { UserInput } from "../src/domain/review/reviewTypes.js";

describe("Milestone 3 core", () => {
  it("plans requested inputs from missing calculation inputs", () => {
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [calculationInputEvidence()],
    }).requestedInputs;

    expect(requestedInputs).toEqual([
      expect.objectContaining({
        datapoint: "layer_lambda",
        inputType: "number",
        unit: "W/mK",
        scope: expect.objectContaining({ scopeKind: "layer_occurrence" }),
      }),
    ]);
  });

  it("groups known-material missing lambdas into one material decision", () => {
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [
        calculationInputEvidence({
          elementStepId: 10,
          fixedInputs: [
            input("layer_order", [301], "ifc_fixed"),
            input("layer_thickness", 0.12, "ifc_fixed", 0, 301, "Mineral wool"),
            input("layer_material_name", "Mineral wool", "ifc_fixed", 0, 301, "Mineral wool"),
          ],
          missingInputs: [input("layer_lambda", null, "missing", 0, 301, "Mineral wool")],
        }),
        calculationInputEvidence({
          elementStepId: 11,
          fixedInputs: [
            input("layer_order", [401], "ifc_fixed"),
            input("layer_thickness", 0.08, "ifc_fixed", 0, 401, "Mineral wool"),
            input("layer_material_name", "Mineral wool", "ifc_fixed", 0, 401, "Mineral wool"),
          ],
          missingInputs: [input("layer_lambda", null, "missing", 0, 401, "Mineral wool")],
        }),
      ],
    }).requestedInputs;

    expect(requestedInputs).toHaveLength(1);
    expect(requestedInputs[0]).toEqual(expect.objectContaining({
      datapoint: "layer_lambda",
      reviewGroupKind: "material_decision",
      scope: expect.objectContaining({
        scopeKind: "material_decision",
        materialName: "Mineral wool",
        affectedLayers: [
          expect.objectContaining({ elementStepId: 10, layerIndex: 0 }),
          expect.objectContaining({ elementStepId: 11, layerIndex: 0 }),
        ],
      }),
    }));
  });

  it("applies lambda precedence without mutating evidence", () => {
    const evidence = calculationInputEvidence({
      fixedInputs: [
        input("layer_material_name", "Mineral wool", "ifc_fixed"),
        input("layer_lambda", 0.045, "ifc_fixed"),
      ],
    });
    const userInput: UserInput = {
      userInputId: "ui_1",
      requestedInputId: "ri_1",
      datapoint: "layer_lambda",
      value: 0.037,
      unit: "W/mK",
    };

    const result = resolveLayerLambda({
      calculationInputEvidence: evidence,
      materialName: "Mineral wool",
      materialLibrary: library(),
      userInput,
    });

    expect(result.lambda?.value).toBe(0.037);
    expect(evidence.fixedInputs.find((fixed) => fixed.field === "layer_lambda")?.value)
      .toBe(0.045);
  });

  it("calculates layered R-value and U-value", () => {
    const result = calculateThermalPerformance({
      physicsAssembly: {
        assemblyGroupId: "ag_1",
        elementClass: "IfcWall",
        calculationBasis: "user_completed_layered",
        confidence: "medium",
        surfaceResistanceProfile: {
          profileId: "external_wall_vertical",
          rsi: 0.13,
          rse: 0.04,
          sourceLabel: "test",
          assumptions: ["vertical external wall profile"],
        },
        layers: [
          {
            layerOccurrenceId: "layer_1",
            materialName: "Mineral wool",
            thicknessM: 0.12,
            lambdaWPerMK: 0.04,
            datapointSources: ["ifc_extracted", "user_input"],
            provenance: ["IfcMaterialLayer#301"],
          },
        ],
      },
    });

    expect(result.calculationSnapshot.readinessState).toBe("ready");
    expect(result.calculationSnapshot.totalRValueM2KPerW).toBeCloseTo(3.17);
    expect(result.calculationSnapshot.uValueWPerM2K).toBeCloseTo(0.315);
    expect(result.calculationSnapshot.temperatureProfile).toEqual(
      expect.objectContaining({
        indoorTemperatureC: 20,
        outdoorTemperatureC: -5,
        points: expect.arrayContaining([
          expect.objectContaining({ label: "Indoor air", temperatureC: 20 }),
          expect.objectContaining({ label: "Outdoor air", temperatureC: -5 }),
        ]),
      }),
    );
    expect(result.calculationSnapshot.assumptions).toContain(
      "Temperature profile assumes 20 C indoor air and -5 C outdoor air until user climate inputs are supplied.",
    );
  });

  it("builds physics assemblies with every explicit layer", () => {
    const result = runBuildPhysicsAssembliesFixture();

    expect(result.physicsAssemblies).toEqual([
      expect.objectContaining({
        layers: [
          expect.objectContaining({
            layerOccurrenceId: "layer_10_0",
            materialName: "Gypsum",
            thicknessM: 0.013,
            lambdaWPerMK: 0.25,
          }),
          expect.objectContaining({
            layerOccurrenceId: "layer_10_1",
            materialName: "Mineral wool",
            thicknessM: 0.12,
            lambdaWPerMK: 0.04,
          }),
        ],
      }),
    ]);
  });

  it("applies one material decision lambda to matching layer occurrences", () => {
    const evidence = calculationInputEvidence({
      fixedInputs: [
        input("layer_order", [301, 302], "ifc_fixed"),
        input("layer_thickness", 0.013, "ifc_fixed", 0, 301, "Gypsum"),
        input("layer_material_name", "Gypsum", "ifc_fixed", 0, 301, "Gypsum"),
        input("layer_thickness", 0.12, "ifc_fixed", 1, 302, "Mineral wool"),
        input("layer_material_name", "Mineral wool", "ifc_fixed", 1, 302, "Mineral wool"),
      ],
      missingInputs: [
        input("layer_lambda", null, "missing", 0, 301, "Gypsum"),
        input("layer_lambda", null, "missing", 1, 302, "Mineral wool"),
      ],
    });
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [evidence],
    }).requestedInputs;
    const gypsumInput = requestedInputs.find((requested) =>
      requested.scope.scopeKind === "material_decision" &&
      requested.scope.materialName === "Gypsum"
    );
    const woolInput = requestedInputs.find((requested) =>
      requested.scope.scopeKind === "material_decision" &&
      requested.scope.materialName === "Mineral wool"
    );

    const result = buildPhysicsAssemblies({
      calculationInputEvidence: [evidence],
      materialLibrary: { version: "materials.library.v1", entries: [] },
      userInputs: [
        {
          userInputId: "ui_gypsum",
          requestedInputId: gypsumInput?.requestedInputId ?? "",
          datapoint: "layer_lambda",
          value: 0.25,
          unit: "W/mK",
          overrideScope: "material_decision",
        },
        {
          userInputId: "ui_wool",
          requestedInputId: woolInput?.requestedInputId ?? "",
          datapoint: "layer_lambda",
          value: 0.04,
          unit: "W/mK",
          overrideScope: "material_decision",
        },
      ],
    });

    expect(result.physicsAssemblies[0]?.layers.map((layer) => layer.lambdaWPerMK))
      .toEqual([0.25, 0.04]);
  });

  it("applies user-entered layer thickness only to its requested layer", () => {
    const evidence = calculationInputEvidence({
      elementStepId: 15,
      fixedInputs: [
        input("layer_order", [351], "ifc_fixed"),
        input("layer_material_name", "Mineral wool", "ifc_fixed", 0, 351, "Mineral wool"),
        input("layer_lambda", 0.04, "ifc_fixed", 0, 351, "Mineral wool"),
      ],
      missingInputs: [input("layer_thickness", null, "missing", 0, 351, "Mineral wool")],
    });
    const requested = planRequestedInputs({ calculationInputEvidence: [evidence] }).requestedInputs[0];

    const result = buildPhysicsAssemblies({
      calculationInputEvidence: [evidence],
      materialLibrary: { version: "materials.library.v1", entries: [] },
      userInputs: [{
        userInputId: "ui_thickness",
        requestedInputId: requested.requestedInputId,
        datapoint: "layer_thickness",
        value: 0.16,
        unit: "m",
        overrideScope: "layer_occurrence",
      }],
    });

    expect(result.physicsAssemblies[0]?.layers[0]).toEqual(expect.objectContaining({
      thicknessM: 0.16,
      datapointSources: expect.arrayContaining(["user_input", "ifc_extracted"]),
    }));
  });
  it("never applies a Review value to an unrelated single-layer assembly", () => {
    const first = calculationInputEvidence({
      elementStepId: 10,
      fixedInputs: [
        input("layer_order", [301], "ifc_fixed"),
        input("layer_thickness", 0.12, "ifc_fixed", 0, 301, "Material A"),
        input("layer_material_name", "Material A", "ifc_fixed", 0, 301, "Material A"),
      ],
      missingInputs: [input("layer_lambda", null, "missing", 0, 301, "Material A")],
    });
    const second = calculationInputEvidence({
      elementStepId: 20,
      elementGlobalId: "wall-b",
      fixedInputs: [
        input("layer_order", [401], "ifc_fixed"),
        input("layer_thickness", 0.08, "ifc_fixed", 0, 401, "Material B"),
        input("layer_material_name", "Material B", "ifc_fixed", 0, 401, "Material B"),
      ],
      missingInputs: [input("layer_lambda", null, "missing", 0, 401, "Material B")],
    });
    const firstRequest = planRequestedInputs({ calculationInputEvidence: [first, second] })
      .requestedInputs.find((requested) =>
        requested.scope.scopeKind === "material_decision" && requested.scope.materialName === "Material A"
      );

    const result = buildPhysicsAssemblies({
      calculationInputEvidence: [first, second],
      materialLibrary: { version: "materials.library.v1", entries: [] },
      userInputs: [{
        userInputId: "ui_material_a",
        requestedInputId: firstRequest?.requestedInputId ?? "",
        datapoint: "layer_lambda",
        value: 0.04,
        unit: "W/mK",
        overrideScope: "material_decision",
      }],
    });

    expect(result.physicsAssemblies).toHaveLength(1);
    expect(result.physicsAssemblies[0]?.layers[0].materialName).toBe("Material A");
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "physics_assembly_blocked", stepIds: [20] }),
    ]));
  });
  it("uses one assembly group for identical explicit layer stacks", () => {
    const result = buildPhysicsAssemblies({
      calculationInputEvidence: [
        calculationInputEvidence({
          elementStepId: 10,
          fixedInputs: [
            input("layer_order", [301], "ifc_fixed"),
            input("layer_thickness", 0.12, "ifc_fixed", 0, 301, "Mineral wool"),
            input("layer_material_name", "Mineral wool", "ifc_fixed", 0, 301, "Mineral wool"),
          ],
          missingInputs: [input("layer_lambda", null, "missing", 0, 301, "Mineral wool")],
        }),
        calculationInputEvidence({
          elementStepId: 11,
          fixedInputs: [
            input("layer_order", [401], "ifc_fixed"),
            input("layer_thickness", 0.12, "ifc_fixed", 0, 401, "Mineral wool"),
            input("layer_material_name", "Mineral wool", "ifc_fixed", 0, 401, "Mineral wool"),
          ],
          missingInputs: [input("layer_lambda", null, "missing", 0, 401, "Mineral wool")],
        }),
      ],
      materialLibrary: library(),
      userInputs: [],
    });

    expect(result.physicsAssemblies).toHaveLength(1);
    expect(result.physicsAssemblies[0]?.assemblyGroupId).toMatch(/^ag_stack_/);
  });

  it("runs core workflow and writes revision plus report", async () => {
    const outputRoot = join(tmpdir(), `m3-core-${Date.now()}`);
    await mkdir(outputRoot, { recursive: true });

    const result = await runCoreReviewCalculationReport({
      fileHash: "fixture-hash",
      outputRoot,
      calculationInputEvidence: [calculationInputEvidence()],
      materialLibrary: library(),
      userInputs: [
        {
          userInputId: "ui_lambda",
          requestedInputId: "ri_fixture",
          datapoint: "layer_lambda",
          value: 0.04,
          unit: "W/mK",
        },
      ],
    });

    expect(result.calculationSnapshots).toHaveLength(1);
    expect(result.revision.revisionId).toMatch(/^rev_/);
    await expect(readFile(result.revisionFilePath, "utf8")).resolves.toContain(
      result.revision.revisionId,
    );
    await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain(
      "<summary>Evidence details</summary>",
    );
    await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain(
      "<h2>Temperature Profile</h2>",
    );

    await rm(outputRoot, { recursive: true, force: true });
  });
});

function calculationInputEvidence(
  overrides: Partial<CalculationInputEvidence> = {},
): CalculationInputEvidence {
  return {
    elementStepId: 10,
    elementGlobalId: "wall-a",
    elementClass: "IfcWall",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      input("layer_order", [301], "ifc_fixed"),
      input("layer_thickness", 0.12, "ifc_fixed"),
      input("layer_material_name", "Mineral wool", "ifc_fixed"),
    ],
    candidateInputs: [],
    missingInputs: [input("layer_lambda", null, "missing")],
    diagnostics: [],
    ...overrides,
  };
}

function runBuildPhysicsAssembliesFixture() {
  return buildPhysicsAssemblies({
    calculationInputEvidence: [
      calculationInputEvidence({
        fixedInputs: [
          input("layer_order", [301, 302], "ifc_fixed"),
          input("layer_thickness", 0.013, "ifc_fixed", 0, 301, "Gypsum"),
          input("layer_material_name", "Gypsum", "ifc_fixed", 0, 301, "Gypsum"),
          input("layer_thickness", 0.12, "ifc_fixed", 1, 302, "Mineral wool"),
          input("layer_material_name", "Mineral wool", "ifc_fixed", 1, 302, "Mineral wool"),
        ],
        missingInputs: [
          input("layer_lambda", null, "missing", 0, 301, "Gypsum"),
          input("layer_lambda", null, "missing", 1, 302, "Mineral wool"),
        ],
      }),
    ],
    materialLibrary: {
      version: "materials.library.v1",
      entries: [
        {
          materialKey: "gypsum",
          displayName: "Gypsum",
          aliases: ["gypsum"],
          lambdaWPerMK: 0.25,
          sourceLabel: "fixture",
          confidence: "high",
        },
        {
          materialKey: "mineral_wool",
          displayName: "Mineral wool",
          aliases: ["mineral wool"],
          lambdaWPerMK: 0.04,
          sourceLabel: "fixture",
          confidence: "high",
        },
      ],
    },
    userInputs: [],
  });
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  source: "ifc_fixed" | "ifc_candidate" | "missing",
  layerIndex?: number,
  layerStepId?: number,
  materialName?: string | null,
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: "high",
    evidenceReferences: [
      {
        evidencePath: "IfcMaterialLayer#301",
        sourceStepIds: [301],
        pathParts: [{ stepId: 301, entityClass: "IfcMaterialLayer" }],
      },
    ],
    reason: "test input",
    layer: layerIndex === undefined || layerStepId === undefined
      ? undefined
      : { layerIndex, layerStepId, materialName: materialName ?? null },
  };
}

function library(): MaterialLibrary {
  return {
    version: "materials.library.v1",
    entries: [
      {
        materialKey: "mineral_wool",
        displayName: "Mineral wool",
        aliases: ["mineral wool"],
        lambdaWPerMK: 0.041,
        sourceLabel: "fixture",
        confidence: "high",
      },
    ],
  };
}
