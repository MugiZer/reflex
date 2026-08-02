import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import { LocalTopologyArtifactStore } from "../src/infrastructure/topology/localTopologyArtifactStore.js";
import { createProvenPythonTopologyWorker } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import type { JsonValue, TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";

const recipe = { schema: "declarative-construction-recipe.v1", layers: [{ material: "mineral-wool", thicknessM: 0.12 }] };
const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) };
const recipeHash = sha256(recipe);

describe("topology hardening seam", () => {
  it("rejects non-absolute runtime paths and invalid deadlines deterministically", async () => {
    expect(() => createProvenPythonTopologyWorker({ pythonExecutable: "relative/python.exe" }))
      .toThrow("Python executable must be an explicit pinned filesystem path.");

    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-deadline-"));
    let launched = false;
    try {
      const worker = delayedWorker();
      worker.runJsonl = async () => { launched = true; return ""; };
      const result = await createTopologyAnalysisRequestService({
        artifactStore: new LocalTopologyArtifactStore(artifactRoot),
        worker,
      }).submit({ ...request("invalid-deadline"), deadlineAt: "not-a-deadline" });

      expect(result.outcome).toBe("rejected");
      expect(result.errorCode).toBe("invalid_deadline");
      expect(result.effectiveUValueWPerM2K).toBeNull();
      expect(result.evidence).toBeNull();
      expect(launched).toBe(false);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("shares one durable outcome across independent service instances", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-"));
    let invocations = 0;
    try {
      const worker = delayedWorker(() => { invocations += 1; });
      const first = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
      const second = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
      const command = request("durable-concurrent");

      const [firstResult, secondResult] = await Promise.all([
        first.submit(command),
        second.submit({ ...command, correlationId: uuid(2) }),
      ]);

      expect(firstResult.requestId).toBe(secondResult.requestId);
      expect(invocations).toBe(1);
      expect(await readFile(join(firstResult.artifactDirectory, "manifest.json"), "utf8")).toContain("manifestSha256");
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("does not delete another invocation's temporary directory", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-"));
    try {
      const key = idempotencyKey("active-temp");
      const active = join(artifactRoot, "topology", `${key}.tmp-other-process`);
      await mkdir(active, { recursive: true });
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: delayedWorker() });
      await service.submit(request("active-temp"));
      await expect(access(active)).resolves.toBeUndefined();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("publishes a durable integrity failure when a persisted artifact is corrupted", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-"));
    try {
      let invocations = 0;
      const worker = delayedWorker(() => { invocations += 1; });
      worker.runJsonl = async () => {
        invocations += 1;
        throw new Error("worker unavailable");
      };
      const command = request("corrupt-replay");
      const first = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker }).submit(command);
      expect(first.outcome).toBe("failed");
      await writeFile(join(first.artifactDirectory, "error.json"), "tampered\n", "utf8");

      const restartedWorker = delayedWorker(() => { invocations += 1; });
      const replay = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: restartedWorker }).submit({ ...command, correlationId: uuid(3) });

      expect(replay.outcome).toBe("failed");
      expect(replay.errorCode).toBe("artifact_hash_mismatch");
      expect(replay.effectiveUValueWPerM2K).toBeNull();
      expect(replay.evidence).toBeNull();
      expect(replay.artifactDirectory).toContain(".replay-");
      expect(invocations).toBe(1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("refuses changed request, error, manifest, and path-unsafe artifacts on replay", async () => {
    const corruptions = [
      ["request.json", "tampered\n", "artifact_hash_mismatch"],
      ["error.json", "tampered\n", "artifact_hash_mismatch"],
      ["manifest.json", "{\"broken\":true}\n", "artifact_integrity_failure"],
    ] as const;
    for (const [filename, contents, expectedCode] of corruptions) {
      const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-corruption-"));
      try {
        const command = request(`corruption-${filename}`);
        const first = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: rawWorker("") }).submit(command);
        await writeFile(join(first.artifactDirectory, filename), contents, "utf8");
        const replay = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: rawWorker("") }).submit({ ...command, correlationId: uuid(4) });
        expect(replay.outcome, filename).toBe("failed");
        expect(replay.errorCode, filename).toBe(expectedCode);
        expect(replay.effectiveUValueWPerM2K, filename).toBeNull();
        expect(replay.evidence, filename).toBeNull();
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    }

    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-unsafe-"));
    try {
      const command = request("corruption-unsafe-path");
      const first = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: rawWorker("") }).submit(command);
      const manifest = JSON.parse(await readFile(join(first.artifactDirectory, "manifest.json"), "utf8")) as Record<string, unknown>;
      const files = manifest.files as Array<Record<string, unknown>>;
      files[0]!.path = "../outside.json";
      const { manifestSha256: _ignored, ...payload } = manifest;
      manifest.manifestSha256 = sha256(payload);
      await writeFile(join(first.artifactDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const replay = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: rawWorker("") }).submit({ ...command, correlationId: uuid(5) });
      expect(replay.outcome).toBe("failed");
      expect(replay.errorCode).toBe("unsafe_artifact_path");
      expect(replay.effectiveUValueWPerM2K).toBeNull();
      expect(replay.evidence).toBeNull();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("classifies empty, multiple, and oversized worker output as failed", async () => {
    const outputs = [
      ["empty", "", "malformed_output"],
      ["multiple", "{}\n{}\n", "malformed_output"],
      ["oversized", "x".repeat(32 * 1024 * 1024 + 1), "worker_output_limit"],
    ] as const;
    for (const [name, output, code] of outputs) {
      const artifactRoot = await mkdtemp(join(tmpdir(), `topology-hardening-${name}-`));
      try {
        const result = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: rawWorker(output) }).submit(request(`output-${name}`));
        expect(result.outcome, name).toBe("failed");
        expect(result.errorCode, name).toBe(code);
        expect(result.effectiveUValueWPerM2K, name).toBeNull();
        expect(result.evidence, name).toBeNull();
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    }
  });

  it("persists stable failures for spawn, crash, and malformed protocol output", async () => {
    const cases = [
      ["spawn", async () => { throw Object.assign(new Error("spawn failed"), { outcome: "failed", code: "worker_start_failed" }); }, "worker_start_failed"],
      ["crash", async () => { throw Object.assign(new Error("worker crashed"), { outcome: "failed", code: "worker_process_failed" }); }, "worker_process_failed"],
      ["schema", async () => "{\"schema\":\"topology-analysis.unknown.v9\"}\n", "malformed_output"],
    ] as const;
    for (const [name, run, expectedCode] of cases) {
      const artifactRoot = await mkdtemp(join(tmpdir(), `topology-hardening-${name}-`));
      try {
        const worker: TopologyWorkerRuntime = {
          runtimeIdentity: { executable: "C:/release/python.exe", runtimeHash: bundle.runtimeHash },
          async verifyArtifacts() {},
          async runJsonl(message, options) {
            void message;
            void options;
            return await run();
          },
        };
        const result = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker }).submit(request(`failure-${name}`));
        expect(result.outcome, name).toBe("failed");
        expect(result.errorCode, name).toBe(expectedCode);
        expect(result.effectiveUValueWPerM2K, name).toBeNull();
        expect(result.evidence, name).toBeNull();
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    }
  });

  it("fails before launch when the release runtime preflight is incompatible", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-preflight-"));
    let launched = false;
    try {
      const worker: TopologyWorkerRuntime = {
        runtimeIdentity: { executable: "C:/release/python.exe", runtimeHash: bundle.runtimeHash },
        async preflight() { throw new Error("pinned Python executable is unavailable"); },
        async verifyArtifacts() {},
        async runJsonl() { launched = true; return ""; },
      };
      const result = await createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker }).submit(request("preflight"));
      expect(result.outcome).toBe("failed");
      expect(result.errorCode).toBe("topology_runtime_preflight_failed");
      expect(launched).toBe(false);
      expect(result.effectiveUValueWPerM2K).toBeNull();
      expect(result.evidence).toBeNull();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("reclaims a stale claim without sweeping unrelated temporary artifacts", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-hardening-claim-"));
    try {
      const store = new LocalTopologyArtifactStore(artifactRoot);
      const workspace = store.workspaceFor(idempotencyKey("stale-claim"), uuid(9));
      await mkdir(workspace.claimDirectory, { recursive: true });
      await writeFile(join(workspace.claimDirectory, "owner.json"), JSON.stringify({ claimedAt: "2000-01-01T00:00:00.000Z" }), "utf8");
      const claim = await store.claim(workspace);
      expect(claim.acquired).toBe(true);
      await store.release(workspace);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});

function request(seed: string) {
  return {
    sourceRevisionId: "rev-hardening",
    sourceAssemblyGroupId: "ag-hardening",
    correlationId: uuid(1),
    idempotencyKey: idempotencyKey(seed),
    recipe: recipe as JsonValue,
    recipeHash,
    bundle,
    layerOnlySnapshot: { uValueWPerM2K: 0.315 } as JsonValue,
  } as const;
}

function delayedWorker(onRun?: () => void): TopologyWorkerRuntime {
  return {
    runtimeIdentity: { executable: "C:/release/python.exe", runtimeHash: bundle.runtimeHash },
    async verifyArtifacts() {},
    async runJsonl(message) {
      onRun?.();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const request = JSON.parse(message) as { requestId: string; correlationId: string; idempotencyKey: string; bundle: typeof bundle; recipeHash: string; artifactDestination: string };
      return JSON.stringify({
        schema: "topology-analysis.error.v1",
        requestId: request.requestId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        bundle: request.bundle,
        outcome: "failed",
        code: "test_failure",
        message: "test failure",
      }) + "\n";
    },
  };
}

function rawWorker(output: string): TopologyWorkerRuntime {
  return {
    runtimeIdentity: { executable: "C:/release/python.exe", runtimeHash: bundle.runtimeHash },
    async verifyArtifacts() {},
    async runJsonl() { return output; },
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(value: string): string { return sha256(value); }
function uuid(index: number): string { return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`; }
