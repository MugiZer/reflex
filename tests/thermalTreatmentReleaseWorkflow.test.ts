import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createThermalTreatmentReportWorkflow } from "../src/application/thermal-treatment/runThermalTreatmentCalculationReport.js";
import { calculateThermalPerformance } from "../src/domain/calculations/calculateThermalPerformance.js";
import { detectThermalTreatmentOpportunities } from "../src/domain/thermal-treatment/detectThermalTreatmentOpportunities.js";
import { continuousZGirtFamilyRegistry, referenceConfirmedInputs } from "../src/domain/thermal-treatment/families/continuousZGirtFamily.js";
import { OpenSource2dCalculationWorker } from "../src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.js";

describe("real-IFC product verification release slice", () => {
  it("turns Barclay-style layer evidence into one safely reviewable Z-girt opportunity and splits changed constructions", () => {
    const opportunities = detectThermalTreatmentOpportunities({
      calculationInputEvidence: [barclayStyleWall(101), barclayStyleWall(102), barclayStyleWall(103, 0.16)],
      registry: continuousZGirtFamilyRegistry,
    }).suggestions;

    expect(opportunities).toHaveLength(2);
    expect(opportunities[0]).toMatchObject({
      affectedElementStepIds: [101, 102],
      family: { familyId: "continuous-z-girt" },
    });
    expect(opportunities[0]?.proposedInputEvidence.zDepthMm).toMatchObject({ status: "estimated" });
    expect(opportunities[0]?.proposedInputEvidence.repeatSpacingMm).toMatchObject({ status: "estimated" });
    expect(opportunities[0]?.proposedInputEvidence.wallLayerStackJson).toMatchObject({ status: "missing" });
    expect(detectThermalTreatmentOpportunities({
      calculationInputEvidence: [barclayStyleWall(104, 0.14, "Aluminium, insulation, plywood")],
      registry: continuousZGirtFamilyRegistry,
    }).suggestions).toEqual([]);
  });

  it("keeps estimated fabrication inputs preliminary and publishes verified, reproducible confirmed results", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "conformity-real-ifc-release-"));
    try {
      const [suggestion] = detectThermalTreatmentOpportunities({
        calculationInputEvidence: [barclayStyleWall(201)],
        registry: continuousZGirtFamilyRegistry,
      }).suggestions;
      const preliminarySelection = { ...suggestion!.family, confirmedInputs: referenceConfirmedInputs, inputEvidence: suggestion!.proposedInputEvidence };
      const workflow = createThermalTreatmentReportWorkflow({
        outputRoot,
        registry: continuousZGirtFamilyRegistry,
        worker: new OpenSource2dCalculationWorker({ artifactRoot: join(outputRoot, "worker") }),
        now: new Date("2026-07-22T12:00:00.000Z"),
      });
      const preliminary = await workflow.run({
        fileHash: "barclay-fixture",
        jobId: "job_barclay",
        assemblyGroup: { assemblyGroupId: "barclay-wall", thermalTreatmentSelection: preliminarySelection },
        baselineSnapshot: baselineSnapshot(),
      });

      expect(preliminary.calculationSnapshot.thermalTreatment).toMatchObject({
        trustState: "preliminary_unsafe_estimate",
        packVersions: { codeAdapterVersion: "1.0.0", knowledgePackVersion: "1.0.0", validationPackVersion: "1.0.0" },
      });
      const preliminaryHtml = await readFile(preliminary.reportFilePath, "utf8");
      expect(preliminaryHtml).toContain("Preliminary calculations — not verified");
      expect(preliminaryHtml).not.toMatch(/pass\/?fail|compliance/i);

      const verified = await workflow.run({
        fileHash: "barclay-fixture",
        jobId: "job_barclay",
        assemblyGroup: {
          assemblyGroupId: "barclay-wall",
          thermalTreatmentSelection: {
            ...preliminarySelection,
            inputEvidence: Object.fromEntries(Object.keys(referenceConfirmedInputs).map((key) => [key, { status: "confirmed" as const, detail: "Confirmed by architect." }])),
          },
        },
        baselineSnapshot: baselineSnapshot(),
        parentRevisionId: preliminary.revision.revisionId,
      });

      expect(verified.calculationSnapshot.thermalTreatment).toMatchObject({ trustState: "verified" });
      const verifiedHtml = await readFile(verified.reportFilePath, "utf8");
      expect(verifiedHtml).toContain("Verified results");
      expect(verifiedHtml).toContain("Convergence evidence");
      expect(verifiedHtml).toContain("Solver artifacts");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

function barclayStyleWall(id: number, insulationThicknessM = 0.14, materials = "Aluminium, Z fixation, insulation, plywood") {
  const layerNames = materials.split(", ");
  const thicknesses = [0.001, 0.0015, insulationThicknessM, 0.012];
  return {
    elementStepId: id,
    elementGlobalId: `barclay-${id}`,
    elementName: "Barclay exterior wall",
    elementObjectType: "Exterior wall",
    elementClass: "IfcWall" as const,
    calculationInputBasis: "layered_needs_material_resolution" as const,
    fixedInputs: layerNames.flatMap((materialName, layerIndex) => [
      { field: "layer_material_name" as const, value: materialName, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [], reason: "Recovered Barclay layer", layer: { layerIndex, layerStepId: id * 10 + layerIndex, materialName } },
      { field: "layer_thickness" as const, value: thicknesses[layerIndex]!, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [], reason: "Recovered Barclay thickness", layer: { layerIndex, layerStepId: id * 10 + layerIndex, materialName } },
    ]),
    candidateInputs: [],
    missingInputs: [],
    diagnostics: [],
  };
}

function baselineSnapshot() {
  return calculateThermalPerformance({
    physicsAssembly: {
      assemblyGroupId: "barclay-wall",
      elementClass: "IfcWall",
      calculationBasis: "extracted_layered",
      confidence: "high",
      surfaceResistanceProfile: { profileId: "external_wall_vertical", rsi: 0.13, rse: 0.04, sourceLabel: "test", assumptions: [] },
      layers: [{ layerOccurrenceId: "insulation", materialName: "Insulation", thicknessM: 0.14, lambdaWPerMK: 0.04, datapointSources: ["ifc_extracted"], provenance: ["IfcMaterialLayer#1"] }],
    },
  }).calculationSnapshot;
}
