import type { GeneratedTopologyAdapter } from "./generatedTopologyAdapter.js";
import type { ComponentPattern } from "./componentPatternInterpreter.js";

/** Process-local projection of durably qualified adapters. */
export class GeneratedTopologyAdapterRegistry {
  private adapters = new Map<string, GeneratedTopologyAdapter>();

  available(): readonly GeneratedTopologyAdapter[] { return Object.freeze([...this.adapters.values()]); }
  get(adapterHash: string): GeneratedTopologyAdapter | null { return this.adapters.get(adapterHash) ?? null; }
  componentPatterns(): readonly ComponentPattern[] {
    return Object.freeze([...this.adapters.entries()].flatMap(([adapterHash, adapter]) => {
      const permittedUnknowns = adapter.parameterBindings.map((binding) => ({
        key: binding.key,
        values: [...new Set([adapter.qualificationCases.reference.parameters[binding.key], adapter.qualificationCases.sensitivity.parameters[binding.key]].filter((value): value is number => typeof value === "number" && Number.isFinite(value)))],
        label: binding.key,
        binding: binding.binding,
      }));
      if (permittedUnknowns.some((binding) => binding.values.length < 2)) return [];
      return [Object.freeze({
      patternId: adapter.family.familyId,
      version: adapter.family.familyVersion,
      adapterHash,
      lifecycle: "promoted" as const,
      recognition: adapter.recognition,
      requiredAuthorities: adapter.requiredAuthorities,
      permittedUnknowns,
      maxScenarioCount: 64,
      immaterialityGateWPerM2K: 0,
      recipeTemplate: adapter.recipeTemplate,
      })];
    }));
  }

  /** Replaces the projection in one synchronous publication step. */
  replace(adapters: readonly Readonly<{ adapterHash: string; adapter: GeneratedTopologyAdapter }>[]): void {
    this.adapters = new Map(adapters.map((item) => [item.adapterHash, item.adapter]));
  }

  /** Atomically publishes rehydrated adapters while preserving unrelated entries. */
  applyRehydration(loaded: readonly Readonly<{ adapterHash: string; adapter: GeneratedTopologyAdapter }>[], rejectedAdapterHashes: readonly string[] = []): void {
    const next = new Map(this.adapters);
    for (const adapterHash of rejectedAdapterHashes) next.delete(adapterHash);
    for (const item of loaded) next.set(item.adapterHash, item.adapter);
    this.adapters = next;
  }

  add(adapterHash: string, adapter: GeneratedTopologyAdapter): "added" | "duplicate" {
    const existing = this.adapters.get(adapterHash);
    if (existing) return "duplicate";
    this.adapters = new Map(this.adapters).set(adapterHash, adapter);
    return "added";
  }
}
