import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createTopologyOperationalPilot } from "./support/topologyOperationalPilotReference.js";
import type { SubmitTopologyAnalysisRequest, TopologyResult } from "../src/domain/topology/topologyTypes.js";

const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) };
const request: SubmitTopologyAnalysisRequest = { sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "00000000-0000-4000-8000-000000000001", idempotencyKey: createHash("sha256").update("pilot").digest("hex"), recipe: { recipe: "confirmed" }, recipeHash: "d".repeat(64), bundle, layerOnlySnapshot: { uValueWPerM2K: 0.315 } };

describe("Topology operational pilot seam", () => {
  it("limits work to the selected cohort, records safe correlation telemetry, and kills topology without changing layer-only state", async () => {
    const submitted: SubmitTopologyAnalysisRequest[] = [];
    const pilot = createTopologyOperationalPilot({ enabled: true, selectedOwnerIds: ["owner_a"], requests: { async submit(value) { submitted.push(value); return result(value); } } });
    await expect(pilot.submit({ ownerId: "owner_b", request })).resolves.toMatchObject({ disposition: "cohort-excluded", layerOnlySnapshot: request.layerOnlySnapshot });
    const completed = await pilot.submit({ ownerId: "owner_a", request });
    expect(completed).toMatchObject({ disposition: "completed", result: { outcome: "preliminary-unsafe", correlationId: request.correlationId } });
    expect(submitted).toHaveLength(1);
    expect(pilot.events()).toContainEqual(expect.objectContaining({ event: "topology.completed", correlationId: request.correlationId, outcome: "preliminary-unsafe" }));
    expect(JSON.stringify(pilot.events())).not.toContain("owner_a");
    pilot.kill("operational drill");
    await expect(pilot.submit({ ownerId: "owner_a", request: { ...request, idempotencyKey: createHash("sha256").update("killed").digest("hex") } })).resolves.toMatchObject({ disposition: "killed", layerOnlySnapshot: request.layerOnlySnapshot });
    expect(pilot.health()).toMatchObject({ available: false, reason: "kill-switch" });
    expect(pilot.metrics()).toMatchObject({ "topology.cohort_excluded": 1, "topology.preliminary_unsafe": 1, "topology.kill_switch": 1 });
  });

  it("keeps the retired pilot behind a test-only reference seam", () => {
    const productionRoot = resolve("src");
    const productionSource = collectTypeScriptFiles(productionRoot).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(existsSync(resolve("src/application/topology/createTopologyOperationalPilot.ts"))).toBe(false);
    expect(productionSource).not.toContain("createTopologyOperationalPilot");
    for (const forbiddenControl of ["selectedOwnerIds", "topology.kill_switch", "topology.cohort_excluded", "setEnabled"]) expect(productionSource).not.toContain(forbiddenControl);
  });
});

function result(value: SubmitTopologyAnalysisRequest): TopologyResult {
  return { requestId: "request_1", sourceRevisionId: value.sourceRevisionId, sourceAssemblyGroupId: value.sourceAssemblyGroupId, correlationId: value.correlationId, idempotencyKey: value.idempotencyKey, recipeHash: value.recipeHash, outcome: "preliminary-unsafe", bundle: value.bundle, layerOnlySnapshot: value.layerOnlySnapshot, effectiveUValueWPerM2K: 0.42, evidence: null, artifactDirectory: "artifacts/topology/request_1", errorCode: null, diagnostics: null };
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collectTypeScriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}
