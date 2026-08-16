import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";

/** Durable, create-once publication for qualification receipts. */
export class LocalGeneratedTopologyQualificationReceiptStore {
  constructor(private readonly outputRoot: string) {}

  async write(receipt: GeneratedTopologyQualificationReceipt): Promise<void> {
    const directory = join(this.outputRoot, "topology-adapter-qualification");
    const path = join(directory, `${receipt.adapterHash}.json`);
    await mkdir(directory, { recursive: true });
    const payload = `${JSON.stringify(receipt, null, 2)}\n`;
    try {
      await writeFile(path, payload, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const existing = await this.read(receipt.adapterHash);
      if (!existing || canonicalTopologyJson(existing as never) !== canonicalTopologyJson(receipt as never)) throw new Error("A qualification receipt already exists for this adapter hash with different evidence.");
    }
  }

  async read(adapterHash: string): Promise<GeneratedTopologyQualificationReceipt | null> {
    try {
      return JSON.parse(await readFile(join(this.outputRoot, "topology-adapter-qualification", `${adapterHash}.json`), "utf8")) as GeneratedTopologyQualificationReceipt;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}

function isAlreadyExists(error: unknown): boolean { return isNodeError(error) && error.code === "EEXIST"; }
function isNotFound(error: unknown): boolean { return isNodeError(error) && error.code === "ENOENT"; }
function isNodeError(error: unknown): error is NodeJS.ErrnoException { return typeof error === "object" && error !== null && "code" in error; }
