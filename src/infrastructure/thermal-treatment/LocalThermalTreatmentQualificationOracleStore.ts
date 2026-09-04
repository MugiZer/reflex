import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ThermalTreatmentQualificationOracleIdentity } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";

export type StoredThermalTreatmentQualificationOracle = ThermalTreatmentQualificationOracleIdentity & { referenceCases: readonly { caseId: string; expectedEffectiveUValueWPerM2K: number; toleranceWPerM2K: number }[] };

/** Immutable, independently authored numerical expectations for founder-approved generated families. */
export class LocalThermalTreatmentQualificationOracleStore {
  constructor(private readonly options: { rootDirectory: string }) {}

  async store(command: Omit<StoredThermalTreatmentQualificationOracle, "contentHash">): Promise<StoredThermalTreatmentQualificationOracle> {
    const record: StoredThermalTreatmentQualificationOracle = { ...command, contentHash: sha256(canonicalJson({ ...command, contentHash: undefined })) };
    const path = this.pathFor(record);
    await mkdir(this.options.rootDirectory, { recursive: true });
    try {
      const existing = await this.load(record);
      if (canonicalJson(existing) !== canonicalJson(record)) throw new Error(`Qualification oracle '${record.oracleId}' version '${record.oracleVersion}' is immutable and already exists with different content.`);
      return existing;
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(path, canonicalJson(record), "utf8");
    return record;
  }

  async load(identity: Pick<ThermalTreatmentQualificationOracleIdentity, "oracleId" | "oracleVersion">): Promise<StoredThermalTreatmentQualificationOracle> {
    const value: unknown = JSON.parse(await readFile(this.pathFor(identity), "utf8"));
    if (!isOracle(value) || sha256(canonicalJson({ ...value, contentHash: undefined })) !== value.contentHash) throw new Error(`Stored Thermal Treatment qualification oracle '${identity.oracleId}' v${identity.oracleVersion} is invalid.`);
    return value;
  }

  private pathFor(identity: Pick<ThermalTreatmentQualificationOracleIdentity, "oracleId" | "oracleVersion">): string {
    if (!safeSegment(identity.oracleId) || !safeSegment(identity.oracleVersion)) throw new Error("Thermal Treatment qualification oracle identity must use safe non-empty path segments.");
    return join(this.options.rootDirectory, `${identity.oracleId}@${identity.oracleVersion}.json`);
  }
}

function isOracle(value: unknown): value is StoredThermalTreatmentQualificationOracle {
  if (!isRecord(value)) return false;
  return ["oracleId", "oracleVersion", "contentHash", "sourceCitation", "acquiredAt", "licensingUsageStatus"].every((key) => typeof value[key] === "string" && value[key].trim() !== "") && Array.isArray(value.referenceCases) && value.referenceCases.length > 0 && value.referenceCases.every((item) => isRecord(item) && typeof item.caseId === "string" && typeof item.expectedEffectiveUValueWPerM2K === "number" && item.expectedEffectiveUValueWPerM2K > 0 && typeof item.toleranceWPerM2K === "number" && item.toleranceWPerM2K > 0);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeSegment(value: string): boolean { return /^[A-Za-z0-9._-]+$/.test(value); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("Thermal Treatment qualification oracles must contain JSON values only.");
}
