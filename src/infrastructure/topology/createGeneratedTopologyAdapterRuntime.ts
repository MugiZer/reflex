import { activateQualifiedGeneratedTopologyAdapter, rehydrateGeneratedTopologyAdapterRegistry } from "../../application/topology/generatedTopologyAdapterLifecycle.js";
import { GeneratedTopologyAdapterRegistry } from "../../domain/topology/generatedTopologyAdapterRegistry.js";
import type { GeneratedTopologyAdapter, GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "./createProvenPythonTopologyWorker.js";
import { LocalGeneratedTopologyAdapterManifestStore } from "./localGeneratedTopologyAdapterManifestStore.js";

/** Production composition: durable store first, then one hot registry projection. */
export async function createGeneratedTopologyAdapterRuntime(manifestRoot: string) {
  const manifests = new LocalGeneratedTopologyAdapterManifestStore(manifestRoot);
  const registry = new GeneratedTopologyAdapterRegistry();
  const restart = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry, bundle: PROVEN_TOPOLOGY_BUNDLE });
  if (restart.outcome !== "restart") throw new Error("Generated topology adapter restart rehydration failed closed: durable diagnostics could not be persisted.");
  return Object.freeze({
    registry,
    restart,
    activate: (adapter: GeneratedTopologyAdapter, qualificationReceipt: GeneratedTopologyQualificationReceipt) => activateQualifiedGeneratedTopologyAdapter({ adapter, qualificationReceipt, manifests, registry }),
  });
}
