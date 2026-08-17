import { GeneratedTopologyAdapterRegistry } from "../../domain/topology/generatedTopologyAdapterRegistry.js";
import { adapterDependenciesMatchBundle, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";
import { ImmutableAdapterIdentityConflict, type GeneratedTopologyAdapterManifest, type GeneratedTopologyAdapterManifestStore } from "../../domain/topology/generatedTopologyAdapterPersistence.js";
import type { TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";

export type GeneratedTopologyAdapterLifecycleOutcome = "activated" | "duplicate" | "persistence-failure" | "identity-conflict" | "ineligible" | "corruption" | "incompatibility" | "disabled" | "restart";
export type DurableAdapterDiagnostic = Readonly<{ outcome: Exclude<GeneratedTopologyAdapterLifecycleOutcome, "activated" | "duplicate" | "restart">; path: string; message: string }>;

export async function activateQualifiedGeneratedTopologyAdapter(command: { adapter: GeneratedTopologyAdapter; qualificationReceipt: GeneratedTopologyQualificationReceipt; manifests: GeneratedTopologyAdapterManifestStore; registry: GeneratedTopologyAdapterRegistry }): Promise<GeneratedTopologyAdapterLifecycleOutcome> {
  if (command.qualificationReceipt.decision !== "GO" || command.qualificationReceipt.gates.some((gate) => gate.failedCases.length > 0 || gate.unexecutedCases.length > 0)) return "ineligible";
  try {
    const persisted = await command.manifests.persist(command.adapter, command.qualificationReceipt);
    const published = command.registry.add(command.qualificationReceipt.adapterHash, command.adapter);
    return persisted === "duplicate" || published === "duplicate" ? "duplicate" : "activated";
  } catch (error) {
    if (error instanceof ImmutableAdapterIdentityConflict) return "identity-conflict";
    return "persistence-failure";
  }
}

export async function rehydrateGeneratedTopologyAdapterRegistry(command: { manifests: GeneratedTopologyAdapterManifestStore; registry: GeneratedTopologyAdapterRegistry; bundle: TopologyBundleIdentity; onDiagnostic?: (diagnostic: DurableAdapterDiagnostic) => Promise<void> | void }): Promise<Readonly<{ outcome: "restart" | "persistence-failure"; loaded: number; diagnostics: readonly DurableAdapterDiagnostic[] }>> {
  const diagnostics: DurableAdapterDiagnostic[] = [];
  const eligible: { adapterHash: string; adapter: GeneratedTopologyAdapter }[] = [];
  const rejectedAdapterHashes: string[] = [];
  for (const entry of await command.manifests.scan()) {
    if (!entry.manifest) { diagnostics.push({ outcome: "corruption", path: entry.path, message: entry.error ?? "Unreadable adapter manifest." }); continue; }
    let disabled = false;
    try { disabled = await command.manifests.isDisabled(entry.manifest.adapterHash); } catch (error) { diagnostics.push({ outcome: "corruption", path: entry.path, message: error instanceof Error ? error.message : "Cannot read adapter disable record." }); continue; }
    if (disabled) { rejectedAdapterHashes.push(entry.manifest.adapterHash); diagnostics.push({ outcome: "disabled", path: entry.path, message: "Adapter is disabled." }); continue; }
    if (!manifestEligible(entry.manifest, command.bundle)) { rejectedAdapterHashes.push(entry.manifest.adapterHash); diagnostics.push({ outcome: "incompatibility", path: entry.path, message: "Adapter receipt or dependencies are not eligible for this production bundle." }); continue; }
    eligible.push({ adapterHash: entry.manifest.adapterHash, adapter: entry.manifest.adapter });
  }
  for (const diagnostic of diagnostics) {
    try { await command.manifests.recordDiagnostic(diagnostic); }
    catch { return Object.freeze({ outcome: "persistence-failure", loaded: 0, diagnostics: Object.freeze(diagnostics) }); }
    await command.onDiagnostic?.(diagnostic);
  }
  command.registry.applyRehydration(eligible, rejectedAdapterHashes);
  return Object.freeze({ outcome: "restart", loaded: eligible.length, diagnostics: Object.freeze(diagnostics) });
}

function manifestEligible(manifest: GeneratedTopologyAdapterManifest, bundle: TopologyBundleIdentity): boolean {
  return manifest.qualificationReceipt.decision === "GO" && manifest.qualificationReceipt.adapterHash === manifest.adapterHash && manifest.qualificationReceipt.gates.every((gate) => gate.failedCases.length === 0 && gate.unexecutedCases.length === 0) && adapterDependenciesMatchBundle(manifest.adapter, bundle);
}
