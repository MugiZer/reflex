import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { generateHtmlReport } from "../src/application/reports/generateHtmlReport.js";
import { buildPhysicsAssemblies } from "../src/domain/calculations/buildPhysicsAssemblies.js";
import { calculateThermalPerformance } from "../src/domain/calculations/calculateThermalPerformance.js";
import { deriveCalculationInputEvidence } from "../src/domain/evidence/deriveCalculationInputEvidence.js";
import type { EffectiveElementEvidence } from "../src/domain/evidence/effectiveElementEvidenceTypes.js";
import type {
  CandidatePropertyEvidence,
  LayeredMaterialEvidence,
  MaterialEvidence,
  NumericEvidence,
} from "../src/domain/evidence/evidenceTypes.js";
import type { MaterialLibrary } from "../src/domain/materials/materialTypes.js";
import { createRevision } from "../src/domain/revisions/createRevision.js";
import { candidatePropertiesFromPropertySet } from "../src/domain/evidence/features/candidatePropertyClassifier.js";
import type { PropertySetEvidence } from "../src/domain/evidence/evidenceTypes.js";

describe("Milestone 5 regression harness", () => {
  it("keeps candidate lambda evidence out of fixed inputs until confirmed", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({
          effectiveMaterialEvidence: [
            layeredMaterial({ lambdaCandidates: [candidateLambda()] }),
          ],
        }),
      ],
    });

    const evidence = result.calculationInputEvidence[0];
    expect(evidence.candidateInputs).toEqual([
      expect.objectContaining({ field: "layer_lambda", source: "ifc_candidate" }),
    ]);
    expect(evidence.fixedInputs.some((input) => input.field === "layer_lambda")).toBe(false);
  });

  it("uses normalized SI thickness for calculation", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({
          effectiveMaterialEvidence: [
            layeredMaterial({
              thickness: numeric(120, "mm", 0.12, "m"),
              lambdaCandidates: [],
            }),
          ],
        }),
      ],
    });

    expect(result.calculationInputEvidence[0].fixedInputs).toContainEqual(
      expect.objectContaining({ field: "layer_thickness", value: 0.12 }),
    );
  });

  it("does not create fake calculations for blocked assemblies", () => {
    const result = buildPhysicsAssemblies({
      calculationInputEvidence: [
        {
          elementStepId: 10,
          elementGlobalId: "wall-a",
          elementClass: "IfcWall",
          calculationInputBasis: "blocked_missing_evidence",
          fixedInputs: [],
          candidateInputs: [],
          missingInputs: [],
          diagnostics: [],
        },
      ],
      materialLibrary: library(),
      userInputs: [],
    });

    expect(result.physicsAssemblies).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "physics_assembly_blocked" }),
    ]);
  });

  it("keeps low-confidence calculations as ranges, not false precision", () => {
    const result = calculateThermalPerformance({
      physicsAssembly: {
        assemblyGroupId: "ag_low",
        elementClass: "IfcWall",
        calculationBasis: "estimated_from_non_layered",
        confidence: "low",
        surfaceResistanceProfile: {
          profileId: "external_wall_vertical",
          rsi: 0.13,
          rse: 0.04,
          sourceLabel: "test",
          assumptions: ["low-confidence estimate"],
        },
        layers: [
          {
            layerOccurrenceId: "layer_low_0",
            materialName: "Unknown insulation",
            thicknessM: 0.12,
            lambdaWPerMK: 0.04,
            datapointSources: ["system_estimate"],
            provenance: ["Fixture#low"],
          },
        ],
      },
    });

    expect(result.calculationSnapshot.readinessState).toBe("estimated");
    expect(result.calculationSnapshot.uValueWPerM2K).toBeNull();
    expect(result.calculationSnapshot.uValueRangeWPerM2K).toEqual({
      min: expect.any(Number),
      max: expect.any(Number),
    });
  });

  it("renders low-confidence U-value ranges in reports", async () => {
    const outputRoot = join(tmpdir(), `m5-report-range-${Date.now()}`);
    const calculationSnapshot = calculateThermalPerformance({
      physicsAssembly: {
        assemblyGroupId: "ag_low",
        elementClass: "IfcWall",
        calculationBasis: "estimated_from_non_layered",
        confidence: "low",
        surfaceResistanceProfile: {
          profileId: "external_wall_vertical",
          rsi: 0.13,
          rse: 0.04,
          sourceLabel: "test",
          assumptions: ["low-confidence estimate"],
        },
        layers: [
          {
            layerOccurrenceId: "layer_low_0",
            materialName: "Unknown insulation",
            thicknessM: 0.12,
            lambdaWPerMK: 0.04,
            datapointSources: ["system_estimate"],
            provenance: ["Fixture#low"],
          },
        ],
      },
    }).calculationSnapshot;
    const report = await generateHtmlReport({
      outputRoot,
      fileHash: "range-fixture",
      revision: createRevision({
        reason: "range regression",
        userInputs: [],
        overrides: [],
        calculationSnapshots: [calculationSnapshot],
        diagnostics: [],
      }),
      calculationSnapshots: [calculationSnapshot],
    });

    const html = await readFile(report.reportFilePath, "utf8");
    expect(html).toContain("-");
    expect(html).toContain("W/m2K");
    expect(html).not.toContain("<td>Blocked</td>");

    await rm(outputRoot, { recursive: true, force: true });
  });

  it("classifies Milestone 6 material datapoint aliases as candidates", () => {
    const candidates = candidatePropertiesFromPropertySet(propertySet([
      ["SpecificHeatCapacity", 840],
      ["MassDensity", 35],
      ["VapourResistanceFactor", 1],
      ["OutdoorRH", 80],
    ]));

    expect(candidates).toEqual([
      expect.objectContaining({ candidateKind: "specific_heat_capacity" }),
      expect.objectContaining({ candidateKind: "mass_density" }),
      expect.objectContaining({ candidateKind: "vapor_resistance_factor" }),
      expect.objectContaining({ candidateKind: "outdoor_relative_humidity" }),
    ]);
  });
});

function effectiveElement(
  overrides: Partial<EffectiveElementEvidence> = {},
): EffectiveElementEvidence {
  return {
    elementStepId: 10,
    elementGlobalId: "wall-a",
    elementClass: "IfcWall",
    ifcTypeObjectStepId: null,
    materialEvidenceSource: "occurrence",
    effectiveMaterialEvidence: [],
    occurrenceMaterialEvidence: [],
    typeMaterialEvidence: [],
    candidatePropertyEvidence: [],
    evidenceReferences: [evidenceRef("IfcWall", 10)],
    conflictDiagnostics: [],
    ...overrides,
  };
}

function layeredMaterial(command: {
  thickness?: NumericEvidence;
  lambdaCandidates: CandidatePropertyEvidence[];
}): LayeredMaterialEvidence {
  return {
    materialEvidenceId: "mat_200_300",
    materialEvidenceSource: "official_rel_associates_material",
    associationScope: "occurrence",
    associationStepId: 200,
    relatingMaterialStepId: 300,
    materialStructureKind: "layer_set",
    evidenceReference: evidenceRef("IfcMaterialLayerSet", 300),
    diagnostics: [],
    layerSetUsage: null,
    layerSet: {
      stepId: 300,
      layerSetName: "Wall Build-up",
      description: null,
      materialLayerStepIds: [301],
      rawAttributeSnapshot: {},
      evidenceReference: evidenceRef("IfcMaterialLayerSet", 300),
    },
    layers: [
      {
        layerIndex: 0,
        layerStepId: 301,
        materialStepId: 401,
        materialName: "Insulation",
        materialCategory: null,
        layerName: null,
        layerDescription: null,
        layerCategory: null,
        thickness: command.thickness ?? numeric(0.12, "m", 0.12, "m"),
        isVentilated: "unknown",
        priority: null,
        rawAttributeSnapshot: {},
        evidenceReference: evidenceRef("IfcMaterialLayer", 301),
        candidatePropertyEvidence: command.lambdaCandidates,
        diagnostics: [],
      },
    ],
    layerOrderSource: "IfcMaterialLayerSet.MaterialLayers",
    totalLayerThickness: command.thickness ?? numeric(0.12, "m", 0.12, "m"),
  };
}

function candidateLambda(): CandidatePropertyEvidence {
  return {
    candidateKind: "lambda",
    propertySetName: "Pset",
    propertyName: "ThermalConductivity",
    rawValue: 0.04,
    rawUnit: "W/mK",
    normalizedValue: 0.04,
    normalizedUnit: "W/mK",
    confidence: "medium",
    lambdaClassification: "candidate_lambda",
    evidenceReference: evidenceRef("IfcPropertySingleValue", 500),
    reason: "candidate only",
  };
}

function numeric(
  rawValue: number,
  rawUnit: string,
  normalizedValue: number,
  normalizedUnit: string,
): NumericEvidence {
  return {
    rawValue,
    rawUnit,
    normalizedValue,
    normalizedUnit,
    unitSource: "ifc_project_units",
    confidence: "high",
    evidenceReference: evidenceRef("IfcMaterialLayer", 301),
    diagnostics: [],
  };
}

function library(): MaterialLibrary {
  return {
    version: "materials.library.v1",
    entries: [],
  };
}

function evidenceRef(entityClass: string, stepId: number) {
  return {
    evidencePath: `${entityClass}#${stepId}`,
    sourceStepIds: [stepId],
    pathParts: [{ stepId, entityClass }],
  };
}

function propertySet(properties: Array<[string, number]>): PropertySetEvidence {
  return {
    relationshipStepId: 1,
    propertySetStepId: 2,
    name: "CustomThermal",
    evidenceReference: evidenceRef("IfcPropertySet", 2),
    properties: properties.map(([name, value], index) => ({
      propertyStepId: 500 + index,
      name,
      rawValue: value,
      rawUnit: null,
      numericEvidence: numeric(value, "", value, ""),
      evidenceReference: evidenceRef("IfcPropertySingleValue", 500 + index),
    })),
  };
}
