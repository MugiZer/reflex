import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ThermalTreatmentDatasetIdentity } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";

export type StoredThermalTreatmentDataset = ThermalTreatmentDatasetIdentity & { content: unknown };

/** Founder-operated immutable dataset storage for generated Thermal Treatment families. */
export class LocalThermalTreatmentDatasetStore {
  constructor(private readonly options: { rootDirectory: string }) {}

  async store(command: Omit<StoredThermalTreatmentDataset, "contentHash">): Promise<StoredThermalTreatmentDataset> {
    const contentHash = sha256(canonicalJson(command.content));
    const record: StoredThermalTreatmentDataset = { ...command, contentHash };
    const path = this.pathFor(record);
    await mkdir(this.options.rootDirectory, { recursive: true });
    try {
      const existing = await this.readPath(path);
      if (canonicalJson(existing) !== canonicalJson(record)) throw new Error(`Dataset '${record.datasetId}' version '${record.datasetVersion}' is immutable and already exists with different content.`);
      return existing;
    } catch (error) {
      if (!(error instanceof Error) || !isMissingFile(error)) throw error;
    }
    await writeFile(path, canonicalJson(record), "utf8");
    return record;
  }

  async load(identity: Pick<ThermalTreatmentDatasetIdentity, "datasetId" | "datasetVersion">): Promise<StoredThermalTreatmentDataset> {
    return this.readPath(this.pathFor(identity));
  }

  private async readPath(path: string): Promise<StoredThermalTreatmentDataset> {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isDataset(value)) throw new Error(`Stored Thermal Treatment dataset '${path}' is invalid.`);
    if (sha256(canonicalJson(value.content)) !== value.contentHash) throw new Error(`Stored Thermal Treatment dataset '${path}' failed its content-hash check.`);
    return value;
  }

  private pathFor(identity: Pick<ThermalTreatmentDatasetIdentity, "datasetId" | "datasetVersion">): string {
    if (!safeSegment(identity.datasetId) || !safeSegment(identity.datasetVersion)) throw new Error("Thermal Treatment dataset identity must use safe non-empty path segments.");
    return join(this.options.rootDirectory, `${identity.datasetId}@${identity.datasetVersion}.json`);
  }
}

function isDataset(value: unknown): value is StoredThermalTreatmentDataset {
  if (!isRecord(value)) return false;
  return ["datasetId", "datasetVersion", "contentHash", "sourceCitation", "acquiredAt", "licensingUsageStatus"].every((key) => typeof value[key] === "string" && value[key].trim() !== "") && "content" in value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeSegment(value: string): boolean { return /^[A-Za-z0-9._-]+$/.test(value); }
function isMissingFile(error: Error): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("Thermal Treatment datasets must contain JSON values only.");
}
