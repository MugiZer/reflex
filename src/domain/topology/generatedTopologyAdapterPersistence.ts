import type { GeneratedTopologyAdapter, GeneratedTopologyQualificationReceipt } from "./generatedTopologyAdapter.js";

export type GeneratedTopologyAdapterManifest = Readonly<{
  schema: "generated-topology-adapter-manifest/v1";
  adapterHash: string;
  adapter: GeneratedTopologyAdapter;
  qualificationReceipt: GeneratedTopologyQualificationReceipt;
  sourceDataset: GeneratedTopologyAdapter["provenance"];
  dependencyIdentities: GeneratedTopologyAdapter["dependencies"];
  contentHash: string;
}>;
export type ManifestScanEntry = Readonly<{ path: string; manifest: GeneratedTopologyAdapterManifest | null; error: string | null }>;
export interface GeneratedTopologyAdapterManifestStore {
  persist(adapter: GeneratedTopologyAdapter, receipt: GeneratedTopologyQualificationReceipt): Promise<"stored" | "duplicate">;
  scan(): Promise<readonly ManifestScanEntry[]>;
  isDisabled(adapterHash: string): Promise<boolean>;
  recordDiagnostic(diagnostic: Readonly<{ outcome: string; path: string; message: string }>): Promise<void>;
}
export class ImmutableAdapterIdentityConflict extends Error { constructor() { super("An immutable adapter identity already exists with different semantic content."); } }
