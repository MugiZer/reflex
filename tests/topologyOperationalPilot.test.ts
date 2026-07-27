import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createTopologyOperationalPilot } from "../src/application/topology/createTopologyOperationalPilot.js";
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
});

function result(value: SubmitTopologyAnalysisRequest): TopologyResult {
  return { requestId: "request_1", sourceRevisionId: value.sourceRevisionId, sourceAssemblyGroupId: value.sourceAssemblyGroupId, correlationId: value.correlationId, idempotencyKey: value.idempotencyKey, outcome: "preliminary-unsafe", bundle: value.bundle, layerOnlySnapshot: value.layerOnlySnapshot, effectiveUValueWPerM2K: 0.42, evidence: null, artifactDirectory: "artifacts/topology/request_1", errorCode: null, diagnostics: null };
}
