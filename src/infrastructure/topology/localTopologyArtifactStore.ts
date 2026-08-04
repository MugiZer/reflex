import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { TopologyArtifactFile, TopologyArtifactStore, TopologyArtifactWorkspace } from "../../application/topology/topologyArtifactStore.js";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const CLAIM_STALE_AFTER_MS = 10 * 60 * 1000;
const CLAIM_WAIT_MS = 120 * 1000;

/** Local immutable publication adapter for topology request/result artifacts. */
export class LocalTopologyArtifactStore implements TopologyArtifactStore {
  constructor(private readonly artifactRoot: string) {}

  workspaceFor(idempotencyKey: string, requestId: string, variant?: string): TopologyArtifactWorkspace {
    assertSafeSegment(idempotencyKey, "idempotency key");
    assertSafeSegment(requestId, "request id");
    if (variant !== undefined) assertSafeSegment(variant, "artifact variant");
    const finalDirectory = join(this.artifactRoot, "topology", variant ? `${idempotencyKey}.${variant}` : idempotencyKey);
    const temporaryDirectory = `${finalDirectory}.tmp-${requestId}`;
    return {
      temporaryDirectory,
      finalDirectory,
      workerArtifactDirectory: join(temporaryDirectory, "worker"),
      claimDirectory: `${finalDirectory}.lock`,
    };
  }

  createTemporaryDirectory(directory: string): Promise<void> {
    return mkdir(directory, { recursive: true }).then(() => undefined);
  }

  workerArtifactDirectory(finalDirectory: string): string {
    return join(finalDirectory, "worker");
  }

  removeTemporaryDirectory(directory: string): Promise<void> {
    return rm(directory, { recursive: true, force: true });
  }

  async readManifest(finalDirectory: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(join(finalDirectory, "manifest.json"), "utf8")) as unknown;
    } catch (error) {
      if (isNodeNotFound(error)) return null;
      throw error;
    }
  }

  async claim(workspace: TopologyArtifactWorkspace): Promise<{ acquired: boolean; manifest: unknown | null }> {
    const claimDeadline = Date.now() + CLAIM_WAIT_MS;
    await mkdir(dirname(workspace.finalDirectory), { recursive: true });
    while (Date.now() < claimDeadline) {
      const published = await existingPublication(this, workspace.finalDirectory);
      if (published.exists) return { acquired: false, manifest: published.manifest };
      try {
        await mkdir(workspace.claimDirectory);
        await writeFile(join(workspace.claimDirectory, "owner.json"), `${JSON.stringify({ claimedAt: new Date().toISOString(), processId: process.pid })}\n`, "utf8");
        return { acquired: true, manifest: null };
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const winner = await existingPublication(this, workspace.finalDirectory);
        if (winner.exists) return { acquired: false, manifest: winner.manifest };
        if (await staleClaim(workspace.claimDirectory)) {
          await rm(workspace.claimDirectory, { recursive: true, force: true });
          continue;
        }
        await delay(25);
      }
    }
    throw Object.assign(new Error("Topology artifact claim timed out while another invocation was active."), { code: "artifact_claim_timeout" });
  }

  release(workspace: TopologyArtifactWorkspace): Promise<void> {
    return rm(workspace.claimDirectory, { recursive: true, force: true });
  }

  async writeJson(directory: string, filename: string, value: unknown): Promise<TopologyArtifactFile> {
    assertSafeSegment(filename, "artifact filename");
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await writeFile(join(directory, filename), bytes);
    return { path: filename, sha256: sha256(bytes), sizeBytes: bytes.length };
  }

  async verifyFiles(directory: string, files: readonly TopologyArtifactFile[]): Promise<void> {
    const root = resolve(directory);
    const realRoot = await realpath(root).catch(() => root);
    for (const file of files) {
      if (file.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file.path) || file.path.split(/[\\/]/).some((segment) => segment === "" || segment === "." || segment === "..")) {
        throw integrityFailure("unsafe_artifact_path", `Topology artifact path is unsafe: ${file.path}.`);
      }
      const target = resolve(root, file.path);
      const relativePath = relative(root, target);
      if (!relativePath || relativePath.startsWith("..") || relativePath.includes(".." + "\\") || relativePath.includes(".." + "/")) {
        throw integrityFailure("unsafe_artifact_path", `Topology artifact path is unsafe: ${file.path}.`);
      }
      let bytes: Buffer;
      try {
        const realTarget = await realpath(target);
        const realRelativePath = relative(realRoot, realTarget);
        if (!realRelativePath || realRelativePath.startsWith("..") || realRelativePath.includes(".." + "\\") || realRelativePath.includes(".." + "/") || (await lstat(target)).isSymbolicLink()) {
          throw integrityFailure("unsafe_artifact_path", `Topology artifact path is unsafe: ${file.path}.`);
        }
        bytes = await readFile(target);
      } catch (error) {
        if (isIntegrityFailure(error)) throw error;
        throw integrityFailure("missing_artifact", `Topology artifact is missing: ${file.path}.`);
      }
      if (bytes.length !== file.sizeBytes || sha256(bytes) !== file.sha256) {
        throw integrityFailure("artifact_hash_mismatch", `Topology artifact failed integrity verification: ${file.path}.`);
      }
    }
  }

  async publish(workspace: TopologyArtifactWorkspace): Promise<void> {
    await mkdir(dirname(workspace.finalDirectory), { recursive: true });
    await rename(workspace.temporaryDirectory, workspace.finalDirectory);
  }
}

/** Removes only abandoned in-flight topology material; published directories are never touched. */
export async function cleanupLocalTopologyArtifacts(artifactRoot: string): Promise<void> {
  const topologyRoot = join(artifactRoot, "topology");
  let entries;
  try { entries = await readdir(topologyRoot, { withFileTypes: true }); } catch (error) { if (isNodeNotFound(error)) return; throw error; }
  await Promise.all(entries.filter((entry) => entry.isDirectory() && (entry.name.includes(".tmp-") || entry.name.endsWith(".lock"))).map((entry) => rm(join(topologyRoot, entry.name), { recursive: true, force: true })));
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid topology ${label}.`);
}

function isNodeNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function existingPublication(store: LocalTopologyArtifactStore, directory: string): Promise<{ exists: boolean; manifest: unknown | null }> {
  try {
    const manifest = await store.readManifest(directory);
    return { exists: manifest !== null, manifest };
  } catch (error) {
    if (await pathExists(directory)) return { exists: true, manifest: null };
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function staleClaim(directory: string): Promise<boolean> {
  try {
    const owner = JSON.parse(await readFile(join(directory, "owner.json"), "utf8")) as { claimedAt?: unknown; processId?: unknown };
    if (typeof owner.processId === "number" && Number.isInteger(owner.processId) && owner.processId > 0) {
      try {
        process.kill(owner.processId, 0);
        return false;
      } catch {
        return true;
      }
    }
    return typeof owner.claimedAt === "string" && Date.parse(owner.claimedAt) < Date.now() - CLAIM_STALE_AFTER_MS;
  } catch {
    return false;
  }
}

function integrityFailure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function isIntegrityFailure(error: unknown): error is Error & { code: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && ["unsafe_artifact_path", "missing_artifact", "artifact_hash_mismatch"].includes(error.code);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
