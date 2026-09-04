import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateHtmlReport } from "../src/application/reports/generateHtmlReport.js";
import type { CalculationSnapshot } from "../src/domain/calculations/calculationTypes.js";
import type { Revision } from "../src/domain/revisions/revisionTypes.js";

describe("Ubakus-style HTML report", () => {
  it("renders each assembly as a selectable focused workspace", async () => {
    const outputRoot = join(tmpdir(), `conformity-report-ui-${Date.now()}`);
    const snapshots = [
      snapshot({
        calculationSnapshotId: "snap_wall",
        assemblyGroupId: "ag_wall",
        materialName: "Mineral wool",
        uValueWPerM2K: 0.315,
      }),
      snapshot({
        calculationSnapshotId: "snap_estimate",
        assemblyGroupId: "ag_estimate",
        materialName: "Dense concrete",
        uValueWPerM2K: null,
        uValueRangeWPerM2K: { min: 0.2, max: 0.3 },
      }),
    ];
    snapshots[0].layers.push({
      layerOccurrenceId: "snap_wall_layer_1",
      materialName: "Timber studs",
      thicknessM: 0.08,
      lambdaWPerMK: 0.13,
      datapointSources: ["ifc_extracted"],
      provenance: ["Timber studs#2"],
      rValueM2KPerW: 2,
    });
    const revision: Revision = {
      revisionId: "rev_ui",
      parentRevisionId: null,
      createdAt: "2026-07-18T12:00:00.000Z",
      reason: "report UI test",
      userInputs: [],
      overrides: [],
      calculationSnapshots: snapshots,
      diagnostics: [],
    };

    try {
      const report = await generateHtmlReport({
        outputRoot,
        fileHash: "job_ui",
        revision,
        calculationSnapshots: snapshots,
      });
      const html = await readFile(report.reportFilePath, "utf8");

      expect(html).toContain("Thermal Calculation Report");
      expect(html).toContain('id="assembly-picker"');
      expect(html.match(/class="assembly-view/g)).toHaveLength(2);
      expect(html).toContain('data-assembly-index="0"');
      expect(html).toContain('data-assembly-index="1"');
      expect(html).toContain("Mineral wool");
      expect(html).toContain("Dense concrete");
      expect(html).toContain("0.200-0.300 W/m2K");
      expect(html).toContain("<h2>Temperature Profile</h2>");
      expect(html).toContain("Provenance");
      expect(html).toContain("<summary>Evidence details</summary>");
      expect(html).toContain("<svg");
      expect(html).toContain("Assembly composition");
      expect(html).toContain("data-composition-segment");
      expect(html).toContain("Assembly share");
      expect(html).toContain("R contribution");
      expect(html).toContain("Calculated values");
      expect(html).toContain('style="width:60.0000%"');
      expect(html).toContain('style="width:40.0000%"');
      expect(html).toContain("<li>Mineral wool#1</li>");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

function snapshot(command: {
  calculationSnapshotId: string;
  assemblyGroupId: string;
  materialName: string;
  uValueWPerM2K: number | null;
  uValueRangeWPerM2K?: { min: number; max: number } | null;
}): CalculationSnapshot {
  const rValue = 3;
  return {
    calculationSnapshotId: command.calculationSnapshotId,
    assemblyGroupId: command.assemblyGroupId,
    readinessState: command.uValueWPerM2K === null ? "estimated" : "ready",
    confidence: command.uValueWPerM2K === null ? "low" : "medium",
    calculationBasis: command.uValueWPerM2K === null
      ? "estimated_from_non_layered"
      : "user_completed_layered",
    layers: [{
      layerOccurrenceId: `${command.calculationSnapshotId}_layer_0`,
      materialName: command.materialName,
      thicknessM: 0.12,
      lambdaWPerMK: 0.04,
      datapointSources: ["ifc_extracted", "user_input"],
      provenance: [`${command.materialName}#1`],
      rValueM2KPerW: rValue,
    }],
    surfaceResistanceProfile: {
      profileId: "external_wall_vertical",
      rsi: 0.13,
      rse: 0.04,
      sourceLabel: "test profile",
      assumptions: ["External wall profile."],
    },
    totalRValueM2KPerW: 3.17,
    uValueWPerM2K: command.uValueWPerM2K,
    uValueRangeWPerM2K: command.uValueRangeWPerM2K ?? null,
    temperatureProfile: {
      indoorTemperatureC: 20,
      outdoorTemperatureC: -5,
      points: [
        { label: "Indoor air", temperatureC: 20, cumulativeRValueM2KPerW: 0 },
        { label: `After layer 1: ${command.materialName}`, temperatureC: -4, cumulativeRValueM2KPerW: 3.13 },
        { label: "Outdoor air", temperatureC: -5, cumulativeRValueM2KPerW: 3.17 },
      ],
      assumptions: ["Test temperature profile."],
    },
    assumptions: ["External wall profile.", "Test temperature profile."],
    warnings: [],
    provenance: [`${command.materialName}#1`],
  };
}
