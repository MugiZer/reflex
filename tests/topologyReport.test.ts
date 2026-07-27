import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateHtmlReport } from "../src/application/reports/generateHtmlReport.js";
import type { CalculationSnapshot } from "../src/domain/calculations/calculationTypes.js";
import type { Revision } from "../src/domain/revisions/revisionTypes.js";
import type { TopologyResult } from "../src/domain/topology/topologyTypes.js";

describe("Topology result report seam", () => {
  it("keeps the layer-only snapshot and preliminary topology result visibly separate", async () => {
    const outputRoot = join(tmpdir(), `topology-report-${Date.now()}`);
    const layerOnly = snapshot();
    const revision: Revision = { revisionId: "rev_topology", parentRevisionId: null, createdAt: "2026-07-25T12:00:00.000Z", reason: "topology report", userInputs: [], overrides: [], calculationSnapshots: [layerOnly], diagnostics: [] };
    const topology: TopologyResult = { requestId: "request_1", sourceRevisionId: revision.revisionId, sourceAssemblyGroupId: layerOnly.assemblyGroupId, correlationId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "a".repeat(64), outcome: "preliminary-unsafe", bundle: { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "b".repeat(64), packHash: "c".repeat(64), runtimeHash: "d".repeat(64) }, layerOnlySnapshot: { uValueWPerM2K: 0.315 }, effectiveUValueWPerM2K: 0.42, evidence: null, artifactDirectory: "artifacts/topology/request_1", errorCode: null, diagnostics: null };
    try {
      const report = await generateHtmlReport({ outputRoot, fileHash: "job_topology", revision, calculationSnapshots: [layerOnly], topologyResults: [topology] });
      const html = await readFile(report.reportFilePath, "utf8");
      expect(html).toContain("Layer-only Calculation Snapshot");
      expect(html).toContain("Preliminary topology result — not verified");
      expect(html).toContain("0.420 W/m2K");
      expect(html).toContain("Correlation Identifier");
      expect(html).toContain("repeating-parallel-profile-wall-2d v1.0.0");
      expect(html).not.toContain("Topology result verified");
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  });
});

function snapshot(): CalculationSnapshot {
  return { calculationSnapshotId: "snap_layer", assemblyGroupId: "ag_wall", readinessState: "ready", confidence: "high", calculationBasis: "extracted_layered", layers: [], surfaceResistanceProfile: { profileId: "external_wall_vertical", rsi: 0.13, rse: 0.04, sourceLabel: "test", assumptions: [] }, totalRValueM2KPerW: 3.17, uValueWPerM2K: 0.315, uValueRangeWPerM2K: null, temperatureProfile: null, assumptions: [], warnings: [], provenance: [] };
}
