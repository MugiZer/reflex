import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import { assertGeneratedTopologyAdapter, generatedTopologyAdapterHash, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";
import { ImmutableAdapterIdentityConflict, type GeneratedTopologyAdapterManifest, type GeneratedTopologyAdapterManifestStore, type ManifestScanEntry } from "../../domain/topology/generatedTopologyAdapterPersistence.js";

export type { GeneratedTopologyAdapterManifest, ManifestScanEntry } from "../../domain/topology/generatedTopologyAdapterPersistence.js";

/** Separate create-once store: source data remains in the dataset store. */
export class LocalGeneratedTopologyAdapterManifestStore implements GeneratedTopologyAdapterManifestStore {
  constructor(private readonly rootDirectory: string) {}

  async persist(adapter: GeneratedTopologyAdapter, qualificationReceipt: GeneratedTopologyQualificationReceipt): Promise<"stored" | "duplicate"> {
    const manifest = createManifest(adapter, qualificationReceipt);
    const directory = join(this.rootDirectory, "generated-topology-adapter-manifests");
    const path = join(directory, `${manifest.adapterHash}.json`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      return "stored";
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const existing = await this.read(manifest.adapterHash);
      if (!existing || canonicalTopologyJson(existing as never) !== canonicalTopologyJson(manifest as never)) throw new ImmutableAdapterIdentityConflict();
      return "duplicate";
    }
  }

  async read(adapterHash: string): Promise<GeneratedTopologyAdapterManifest | null> {
    try { return validateManifest(JSON.parse(await readFile(this.path(adapterHash), "utf8"))); }
    catch (error) { if (isNotFound(error)) return null; throw error; }
  }

  async scan(): Promise<readonly ManifestScanEntry[]> {
    const directory = join(this.rootDirectory, "generated-topology-adapter-manifests");
    let names: readonly string[];
    try { names = await readdir(directory); } catch (error) { if (isNotFound(error)) return []; throw error; }
    return Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => {
      const path = join(directory, name);
      try { return { path, manifest: validateManifest(JSON.parse(await readFile(path, "utf8"))), error: null }; }
      catch (error) { return { path, manifest: null, error: error instanceof Error ? error.message : "Unreadable adapter manifest." }; }
    }));
  }

  async disable(adapterHash: string, reason: string): Promise<void> {
    const directory = join(this.rootDirectory, "generated-topology-adapter-disabled");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${adapterHash}.json`);
    const record = { schema: "generated-topology-adapter-disable/v1", adapterHash, reason, contentHash: sha256(canonicalTopologyJson({ schema: "generated-topology-adapter-disable/v1", adapterHash, reason })) };
    try { await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
    catch (error) { if (!isAlreadyExists(error)) throw error; }
  }
  async isDisabled(adapterHash: string): Promise<boolean> { try { await readFile(join(this.rootDirectory, "generated-topology-adapter-disabled", `${adapterHash}.json`), "utf8"); return true; } catch (error) { if (isNotFound(error)) return false; throw error; } }
  async recordDiagnostic(diagnostic: Readonly<{ outcome: string; path: string; message: string }>): Promise<void> {
    const directory = join(this.rootDirectory, "generated-topology-adapter-diagnostics");
    await mkdir(directory, { recursive: true });
    const record = { schema: "generated-topology-adapter-diagnostic/v1", ...diagnostic };
    const path = join(directory, `${sha256(canonicalTopologyJson(record as never))}.json`);
    try { await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
    catch (error) { if (!isAlreadyExists(error)) throw error; }
  }
  private path(adapterHash: string): string { return join(this.rootDirectory, "generated-topology-adapter-manifests", `${adapterHash}.json`); }
}

function createManifest(adapter: GeneratedTopologyAdapter, receipt: GeneratedTopologyQualificationReceipt): GeneratedTopologyAdapterManifest {
  assertGeneratedTopologyAdapter(adapter);
  const adapterHash = generatedTopologyAdapterHash(adapter);
  if (receipt.decision !== "GO" || receipt.adapterHash !== adapterHash || receipt.gates.some((gate) => gate.failedCases.length > 0 || gate.unexecutedCases.length > 0)) throw new Error("Only a qualified adapter with its matching successful receipt can be persisted.");
  const immutable = { schema: "generated-topology-adapter-manifest/v1" as const, adapterHash, adapter, qualificationReceipt: receipt, sourceDataset: adapter.provenance, dependencyIdentities: adapter.dependencies };
  return Object.freeze({ ...immutable, contentHash: sha256(canonicalTopologyJson(immutable as never)) });
}
function validateManifest(value: unknown): GeneratedTopologyAdapterManifest {
  if (!isRecord(value) || value.schema !== "generated-topology-adapter-manifest/v1" || typeof value.adapterHash !== "string" || !isRecord(value.adapter) || !isRecord(value.qualificationReceipt) || !validReceiptShape(value.qualificationReceipt) || !isRecord(value.sourceDataset) || !isRecord(value.dependencyIdentities) || typeof value.contentHash !== "string") throw new Error("Invalid adapter manifest.");
  const manifest = value as GeneratedTopologyAdapterManifest;
  assertGeneratedTopologyAdapter(manifest.adapter);
  if (!validReceiptForAdapter(manifest.qualificationReceipt, manifest.adapter)) throw new Error("Adapter qualification receipt is incomplete or inconsistent with the adapter.");
  const immutable = { schema: manifest.schema, adapterHash: manifest.adapterHash, adapter: manifest.adapter, qualificationReceipt: manifest.qualificationReceipt, sourceDataset: manifest.sourceDataset, dependencyIdentities: manifest.dependencyIdentities };
  if (manifest.adapterHash !== generatedTopologyAdapterHash(manifest.adapter) || canonicalTopologyJson(manifest.sourceDataset as never) !== canonicalTopologyJson(manifest.adapter.provenance as never) || canonicalTopologyJson(manifest.dependencyIdentities as never) !== canonicalTopologyJson(manifest.adapter.dependencies as never) || manifest.contentHash !== sha256(canonicalTopologyJson(immutable as never))) throw new Error("Adapter manifest integrity check failed.");
  return Object.freeze(manifest);
}
function validReceiptShape(value: Record<string, unknown>): boolean {
  if (value.schema !== "generated-topology-adapter-qualification-receipt/v1" || value.decision !== "GO" || typeof value.adapterHash !== "string" || typeof value.compilerVersion !== "string" || typeof value.primitiveRegistryHash !== "string" || typeof value.materialPackHash !== "string" || typeof value.boundaryVersion !== "string" || !isRecord(value.worker) || typeof value.worker.executable !== "string" || typeof value.worker.runtimeHash !== "string" || typeof value.qualifiedAt !== "string" || !Array.isArray(value.gates)) return false;
  const required = ["P3-contract-geometry", "P6-worker", "P3-independent-reference", "P6-envelope-sensitivity"];
  const gateIds = value.gates.map((gate) => isRecord(gate) ? gate.gateId : undefined);
  return value.gates.length === required.length && required.every((gateId) => gateIds.includes(gateId)) && new Set(gateIds).size === required.length && value.gates.every((gate) => isRecord(gate) && Array.isArray(gate.selectedCases) && gate.selectedCases.length > 0 && Array.isArray(gate.passedCases) && gate.passedCases.length > 0 && Array.isArray(gate.failedCases) && gate.failedCases.length === 0 && Array.isArray(gate.unexecutedCases) && gate.unexecutedCases.length === 0 && typeof gate.adapterHash === "string" && isRecord(gate.dependencyIdentities) && typeof gate.fixtureIdentity === "string" && typeof gate.command === "string" && gate.command.trim() !== "" && typeof gate.testedRevision === "string" && gate.testedRevision.trim() !== "" && typeof gate.durationMs === "number" && Number.isFinite(gate.durationMs) && gate.durationMs >= 0 && (gate.oracleIdentity === null || typeof gate.oracleIdentity === "string"));
}
function validReceiptForAdapter(value: Record<string, unknown>, adapter: GeneratedTopologyAdapter): value is GeneratedTopologyQualificationReceipt {
  const dependencies = adapter.dependencies;
  if (!validReceiptShape(value)) return false;
  const worker = value.worker as Record<string, unknown>;
  const gates = value.gates as readonly unknown[];
  if (value.adapterHash !== generatedTopologyAdapterHash(adapter) || value.compilerVersion !== dependencies.compilerVersion || value.primitiveRegistryHash !== dependencies.primitiveRegistryHash || value.materialPackHash !== dependencies.materialPackHash || value.boundaryVersion !== dependencies.boundaryVersion || worker.runtimeHash !== dependencies.runtimeHash) return false;
  return gates.every((rawGate: unknown) => {
    if (!isRecord(rawGate)) return false;
    return rawGate.adapterHash === value.adapterHash && canonicalTopologyJson(rawGate.dependencyIdentities as never) === canonicalTopologyJson(dependencies as never) && arraySubset(rawGate.passedCases, rawGate.selectedCases);
  });
}
function arraySubset(values: unknown, selected: unknown): boolean { return Array.isArray(values) && Array.isArray(selected) && values.every((value) => selected.includes(value)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function isAlreadyExists(error: unknown): boolean { return isNodeError(error) && error.code === "EEXIST"; }
function isNotFound(error: unknown): boolean { return isNodeError(error) && error.code === "ENOENT"; }
function isNodeError(error: unknown): error is NodeJS.ErrnoException { return typeof error === "object" && error !== null && "code" in error; }
