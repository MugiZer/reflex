import type { GeneratedTopologyAdapter } from "./generatedTopologyAdapter.js";

/** Process-local projection of durably qualified adapters. */
export class GeneratedTopologyAdapterRegistry {
  private adapters = new Map<string, GeneratedTopologyAdapter>();

  available(): readonly GeneratedTopologyAdapter[] { return Object.freeze([...this.adapters.values()]); }
  get(adapterHash: string): GeneratedTopologyAdapter | null { return this.adapters.get(adapterHash) ?? null; }

  /** Replaces the projection in one synchronous publication step. */
  replace(adapters: readonly Readonly<{ adapterHash: string; adapter: GeneratedTopologyAdapter }>[]): void {
    this.adapters = new Map(adapters.map((item) => [item.adapterHash, item.adapter]));
  }

  add(adapterHash: string, adapter: GeneratedTopologyAdapter): "added" | "duplicate" {
    const existing = this.adapters.get(adapterHash);
    if (existing) return "duplicate";
    this.adapters = new Map(this.adapters).set(adapterHash, adapter);
    return "added";
  }
}
