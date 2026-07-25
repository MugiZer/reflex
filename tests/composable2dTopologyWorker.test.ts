import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import { Composable2dTopologyWorker, createStandardPrimitiveRegistry, type PrimitiveRegistration } from "../src/infrastructure/topology/Composable2dTopologyWorker.js";

const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "standard-primitives-1", packHash: "topology-pack-1", runtimeHash: "composable-2d-worker-1" };
const recipe = (kind = "standard.rectangle") => ({
  schemaVersion: "1.0.0-draft", topologyModule: { id: bundle.moduleId, version: "1.0.0-draft" },
  periodicity: { value: 0.6 }, projectedArea: { value: 0.6 },
  layers: [{ id: "board", thickness: { value: 0.0125 }, material: { value: "gypsum" } }, { id: "zone", thickness: { value: 0.14 }, material: { value: "mineral-wool" } }],
  rows: [{ id: "row", offsetX: { value: 0 }, originY: { value: 0.0125 }, member: { placementMode: "continuous-parallel", primitive: { kind, version: "1.0.0", parameters: kind === "standard.rectangle" || kind === "vendor.block" ? { width: 0.045, depth: 0.14 } : kind === "standard.hat" ? { depth: 0.14, topFlangeWidth: 0.045, baseFlangeWidth: 0.055, gauge: 0.0015 } : { depth: 0.14, flangeWidth: 0.045, gauge: 0.0015, lipWidth: 0.01 } }, material: { value: "softwood" } } }],
  cavities: [], thermalBreaks: [], boundaries: { exterior: { value: "external-wall" }, interior: { value: "internal" }, left: "periodic", right: "periodic" },
});

describe("Composable2dTopologyWorker", () => {
  it("returns canonical geometry, audit, numerical proof and a preliminary result through the topology request seam", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-composition-"));
    try {
      const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash });
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker });
      const result = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "cor_1", idempotencyKey: "composition-1", recipe: recipe() as any, recipeHash: "recipe-1", bundle, layerOnlySnapshot: { uValueWPerM2K: 0.31 } });
      expect(result).toMatchObject({ outcome: "preliminary-unsafe", effectiveUValueWPerM2K: expect.any(Number), layerOnlySnapshot: { uValueWPerM2K: 0.31 } });
      expect(result.workerEvidence).toMatchObject({ canonicalGeometry: { materialRegions: expect.any(Array) }, topologyAudit: { gapAreaM2: 0, overlapAreaM2: 0, periodicPairCount: 1 }, numericalEvidence: { refinementLevels: 3, converged: true } });
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it.each(["standard.rectangle", "standard.c", "standard.z", "standard.hat"])("uses the generic composition path for %s", async (kind) => {
    const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash });
    const output = JSON.parse(await worker.runJsonl(JSON.stringify({ schema: "topology-analysis.request.v1", requestId: kind, correlationId: "cor", idempotencyKey: kind.replaceAll(".", "-"), sourceRevisionId: "rev", sourceAssemblyGroupId: "ag", recipe: recipe(kind), recipeHash: "hash", bundle, artifactDestination: "unused" }) + "\n", { deadlineAt: null }));
    expect(output).toMatchObject({ outcome: "preliminary-unsafe", canonicalGeometry: { primitiveManifest: expect.any(Object) } });
  });

  it("registers a local block primitive without changing generic composition", async () => {
    const block: PrimitiveRegistration = { kind: "vendor.block", version: "1.0.0", parameterNames: ["width", "depth"], compile(parameters) { return [{ x: -Number(parameters.width) / 2, y: 0, width: Number(parameters.width), height: Number(parameters.depth) }]; } };
    const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry().registered(block), runtimeHash: bundle.runtimeHash });
    const output = JSON.parse(await worker.runJsonl(JSON.stringify({ schema: "topology-analysis.request.v1", requestId: "block", correlationId: "cor", idempotencyKey: "block", sourceRevisionId: "rev", sourceAssemblyGroupId: "ag", recipe: recipe("vendor.block"), recipeHash: "hash", bundle, artifactDestination: "unused" }) + "\n", { deadlineAt: null }));
    expect(output.outcome).toBe("preliminary-unsafe");
  });

  it("rejects a request for a different pinned Primitive Registry bundle", async () => {
    const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash, registryHash: bundle.registryHash });
    const output = JSON.parse(await worker.runJsonl(JSON.stringify({ schema: "topology-analysis.request.v1", requestId: "wrong-registry", correlationId: "cor", idempotencyKey: "wrong-registry", sourceRevisionId: "rev", sourceAssemblyGroupId: "ag", recipe: recipe(), recipeHash: "hash", bundle: { ...bundle, registryHash: "different" }, artifactDestination: "unused" }) + "\n", { deadlineAt: null }));
    expect(output).toMatchObject({ outcome: "rejected", errorCode: "incompatible_registry" });
  });

  it.each([0, 0.3])("composes two C rows with %sm relative phase", async (secondOffset) => {
    const input = recipe("standard.c");
    input.rows.push({ ...input.rows[0], id: "second-row", offsetX: { value: secondOffset }, originY: { value: 0.0125 } });
    const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash });
    const output = JSON.parse(await worker.runJsonl(JSON.stringify({ schema: "topology-analysis.request.v1", requestId: `two-${secondOffset}`, correlationId: "cor", idempotencyKey: `two-${secondOffset}`, sourceRevisionId: "rev", sourceAssemblyGroupId: "ag", recipe: input, recipeHash: "hash", bundle, artifactDestination: "unused" }) + "\n", { deadlineAt: null }));
    expect(output).toMatchObject({ outcome: "preliminary-unsafe", topologyAudit: { periodicPairCount: 1 } });
  });

  it.each([
    ["unknown primitive", (value: any) => { value.rows[0].member.primitive.kind = "unknown"; }, "unknown_primitive"],
    ["crossed framing", (value: any) => { value.rows[0].member.orientation = "orthogonal-to-section"; }, "crossed_framing"],
    ["point fixing", (value: any) => { value.rows[0].member.placementMode = "discrete-point"; }, "point_fixing"],
    ["invalid periodicity", (value: any) => { value.boundaries.right = "open"; }, "incompatible_periodicity"],
  ])("rejects %s without numerical evidence", async (_name, mutate, code) => {
    const input = recipe(); mutate(input);
    const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash });
    const output = JSON.parse(await worker.runJsonl(JSON.stringify({ schema: "topology-analysis.request.v1", requestId: code, correlationId: "cor", idempotencyKey: code, sourceRevisionId: "rev", sourceAssemblyGroupId: "ag", recipe: input, recipeHash: "hash", bundle, artifactDestination: "unused" }) + "\n", { deadlineAt: null }));
    expect(output).toMatchObject({ outcome: "rejected", errorCode: code });
    expect(output.effectiveUValueWPerM2K).toBeUndefined();
  });

  it("publishes worker rejection diagnostics without changing the layer-only snapshot", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-rejection-"));
    try {
      const worker = new Composable2dTopologyWorker({ registry: createStandardPrimitiveRegistry(), runtimeHash: bundle.runtimeHash });
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker });
      const input = recipe(); input.rows[0].member.primitive.kind = "unknown";
      const result = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "cor_1", idempotencyKey: "rejected-composition", recipe: input as any, recipeHash: "recipe-rejected", bundle, layerOnlySnapshot: { uValueWPerM2K: 0.31 } });
      expect(result).toMatchObject({ outcome: "rejected", errorCode: "unknown_primitive", effectiveUValueWPerM2K: null, layerOnlySnapshot: { uValueWPerM2K: 0.31 } });
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });
});
