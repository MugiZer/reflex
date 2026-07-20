import { describe, expect, it } from "vitest";

import { buildArchitectActionViewModel } from "../src/application/jobs/buildArchitectActionViewModel.js";
import { buildPhysicsAssemblies } from "../src/domain/calculations/buildPhysicsAssemblies.js";
import { defaultMaterialLibraryV1 } from "../src/domain/materials/library.v1.js";
import { resolveMaterialName } from "../src/domain/materials/materialResolution.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";

describe("automatic bilingual material resolution", () => {
  it("resolves supplied French, English, noisy, and mojibake names with provenance", () => {
    const cases = [
      ["LMA_Montant bois porteuse", "softwood"],
      ["Plaque de mur de gypse", "gypsum_board"],
      ["B\u00c3\u00a9ton, coul\u00c3\u00a9 sur place", "concrete"],
      ["Isolant rigide", "rigid_insulation"],
      ["Contreplaqu\u00e9 trait\u00e9", "plywood"],
      ["Project_06_Contreplaqu\u00e9 trait\u00e9_18mm", "plywood"],
      ["concrete block", "concrete_block"],
      ["brick", "masonry_brick"],
    ] as const;

    for (const [name, key] of cases) {
      const result = resolveMaterialName(name, defaultMaterialLibraryV1);
      expect(result).toEqual(expect.objectContaining({
        status: "resolved",
        matchedMaterialKey: key,
        rawMaterialName: name,
      }));
    }

    expect(resolveMaterialName("B\u00c3\u00a9ton, coul\u00c3\u00a9 sur place", defaultMaterialLibraryV1).matchBasis)
      .toBe("mojibake_repaired");
  });

  it("removes a known material lambda question while retaining an optional override", () => {
    const evidence = layeredEvidence("Plaque de mur de gypse", "IfcWall");
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [evidence],
      materialLibrary: defaultMaterialLibraryV1,
    }).requestedInputs;

    expect(requestedInputs.filter((input) => input.required !== false)).toHaveLength(0);
    expect(requestedInputs).toEqual([
      expect.objectContaining({
        required: false,
        purpose: "optional_override",
        datapoint: "layer_lambda",
        materialResolution: expect.objectContaining({
          matchedMaterialKey: "gypsum_board",
        }),
      }),
    ]);

    const built = buildPhysicsAssemblies({
      calculationInputEvidence: [evidence],
      materialLibrary: defaultMaterialLibraryV1,
      userInputs: [],
    });
    expect(built.physicsAssemblies[0]?.layers[0]).toEqual(expect.objectContaining({
      materialName: "Plaque de mur de gypse",
      materialLibraryKey: "gypsum_board",
      evidenceState: "library_assisted",
    }));
    expect(built.physicsAssemblies[0]?.assumptions?.[0]).toContain("Library-assisted / assumed");
  });

  it("keeps a recognized material as a prefillable Review decision when startup mode must choose the source", () => {
    const evidence = layeredEvidence("Project_06_Contreplaqu\u00e9 trait\u00e9_18mm", "IfcWall");
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [evidence],
      materialLibrary: defaultMaterialLibraryV1,
      deferResolvedMaterialsToReview: true,
    }).requestedInputs;

    expect(requestedInputs.filter((input) => input.required !== false)).toEqual([
      expect.objectContaining({
        datapoint: "layer_lambda",
        scope: expect.objectContaining({ scopeKind: "material_decision" }),
        materialResolution: expect.objectContaining({
          status: "resolved",
          matchedMaterialKey: "plywood",
        }),
      }),
    ]);
  });

  it("keeps ambiguous families unresolved and routes special physics honestly", () => {
    const ambiguous = layeredEvidence("insulation", "IfcWall");
    const requested = planRequestedInputs({
      calculationInputEvidence: [ambiguous],
      materialLibrary: defaultMaterialLibraryV1,
    }).requestedInputs;
    expect(requested.filter((input) => input.required !== false)).toHaveLength(1);
    expect(requested[0]?.question).toContain("thermal conductivity");

    const cavity = layeredEvidence("Air cavity", "IfcWall");
    const cavityPlan = planRequestedInputs({
      calculationInputEvidence: [cavity],
      materialLibrary: defaultMaterialLibraryV1,
    }).requestedInputs;
    expect(cavityPlan).toHaveLength(0);

    const actions = buildArchitectActionViewModel({
      jobId: "job_special",
      jobStatus: "needs_review",
      calculationInputEvidence: [cavity],
      requestedInputs: cavityPlan,
      activeRevision: null,
      target: null,
      materialLibrary: defaultMaterialLibraryV1,
    });
    expect(actions.assemblies[0]).toEqual(expect.objectContaining({
      readinessState: "blocked",
      specialIssues: expect.arrayContaining([
        expect.objectContaining({ code: "air_cavity" }),
      ]),
      nextAction: expect.objectContaining({ kind: "fix_ifc" }),
    }));
  });

  it("classifies mojibake French product-sensitive materials with actionable guidance", () => {
    const names = [
      "07 MEMBRANE FINITION TOITURE",
      "LMA_PANNEAU B\u00c3\u0089TON L\u00c3\u0089GER - Fb1",
      "LMA_PANNEAU B\u00c3\u0089TON L\u00c3\u0089GER - Fb2",
      "LMA_PanneauSupport Haute Densit\u00c3\u00a9",
    ];

    for (const name of names) {
      const resolution = resolveMaterialName(name, defaultMaterialLibraryV1);
      expect(resolution).toEqual(expect.objectContaining({
        status: "unresolved",
        reason: expect.stringContaining("product performance"),
      }));

      const evidence = layeredEvidence(name, "IfcRoof");
      const actions = buildArchitectActionViewModel({
        jobId: "job_product_sensitive",
        jobStatus: "needs_review",
        calculationInputEvidence: [evidence],
        requestedInputs: planRequestedInputs({
          calculationInputEvidence: [evidence],
          materialLibrary: defaultMaterialLibraryV1,
        }).requestedInputs,
        activeRevision: null,
        target: null,
        materialLibrary: defaultMaterialLibraryV1,
      });
      expect(actions.assemblies[0]?.specialIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "product_sensitive" }),
      ]));
    }
  });
});

function layeredEvidence(materialName: string, elementClass: CalculationInputEvidence["elementClass"]): CalculationInputEvidence {
  const layer = {
    layerIndex: 0,
    layerStepId: 301,
    materialName,
  };
  return {
    elementStepId: 10,
    elementGlobalId: "wall-10",
    elementClass,
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      input("layer_order", [301], layer),
      input("layer_thickness", 0.12, layer),
      input("layer_material_name", materialName, layer),
    ],
    candidateInputs: [],
    missingInputs: [input("layer_lambda", null, layer, "missing")],
    diagnostics: [],
  };
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  layer: { layerIndex: number; layerStepId: number; materialName: string },
  source: "ifc_fixed" | "missing" = "ifc_fixed",
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: source === "missing" ? "low" : "high",
    evidenceReferences: [{
      evidencePath: "IfcMaterialLayer#301",
      sourceStepIds: [301],
      pathParts: [{ stepId: 301, entityClass: "IfcMaterialLayer" }],
    }],
    reason: "test input",
    layer,
  };
}
