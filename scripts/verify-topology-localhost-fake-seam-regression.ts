import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalTopologyArtifactStore } from "../src/infrastructure/topology/localTopologyArtifactStore.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = await mkdtemp(join(tmpdir(), "topology-localhost-regression-"));
try {
  const recipe = JSON.parse(await readFile(resolve(".scratch/component-topology-kernel/recipe-contract/valid-timber-framing.json"), "utf8"));
  const worker = createProvenPythonTopologyWorker({ pythonExecutable: resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe") });
  const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(root), worker });
  const result = await service.submit({ sourceRevisionId: "rev-localhost", sourceAssemblyGroupId: "ag-localhost", correlationId: "00000000-0000-4000-8000-000000000003", idempotencyKey: createHash("sha256").update("topology-localhost-regression").digest("hex"), recipe, recipeHash: "e00809f597515819067752e159f8f396e38e673d1ac36705136c01062ef00654", bundle: PROVEN_TOPOLOGY_BUNDLE, layerOnlySnapshot: { uValueWPerM2K: 0.315 } });
  if (result.outcome !== "preliminary-unsafe" || !result.evidence) throw new Error(`Expected genuine worker evidence, got ${result.outcome}.`);
  console.log(`Topology worker regression passed: ${result.requestId}`);
} finally { await rm(root, { recursive: true, force: true }); }
