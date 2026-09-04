export type VerificationProfileId = "fast" | "integration" | "numerical" | "release";
export type WorkerMode = "none" | "deterministic" | "real-python";

export type VerificationProfile = Readonly<{
  id: VerificationProfileId;
  purpose: string;
  budgetMs: number;
  maxWorkers: number;
  includes: readonly Exclude<VerificationProfileId, "release">[];
}>;

export type TestInventoryEntry = Readonly<{
  file: string;
  profile: Exclude<VerificationProfileId, "release">;
  budgetMs: number;
  dependencies: readonly ("sqlite" | "filesystem" | "web-ifc" | "localhost")[];
  workerMode: WorkerMode;
  sharedResource: "none" | "isolated-workspace" | "real-worker";
}>;

export const VERIFICATION_PROFILES: Readonly<Record<VerificationProfileId, VerificationProfile>> = {
  fast: { id: "fast", purpose: "deterministic developer feedback; never starts the numerical worker", budgetMs: 90_000, maxWorkers: 4, includes: ["fast"] },
  integration: { id: "integration", purpose: "real local SQLite, filesystem, WebIFC, and localhost composition", budgetMs: 240_000, maxWorkers: 1, includes: ["integration"] },
  numerical: { id: "numerical", purpose: "real pinned Python topology-worker proof", budgetMs: 600_000, maxWorkers: 1, includes: ["numerical"] },
  release: { id: "release", purpose: "composition of every verification profile", budgetMs: 930_000, maxWorkers: 1, includes: ["fast", "integration", "numerical"] },
};

const fast = [
  "actionReadyReviewProjection", "architectActionViewModel", "assemblyCandidates", "automaticBilingualMaterialResolution", "calculationInputEvidence", "componentCompletionManifest", "componentEvaluationAggregate", "componentEvaluationIdentity", "componentEvaluationPublicSeam", "componentPatternInterpreter", "componentPatternPromotion", "continuousZGirtFamily", "diagnosticsMarkdown", "effectiveElementEvidence", "foundationGateVerifier", "htmlReportUi", "ifcTopologyOpportunity", "localReviewProgress", "milestone1Verifier", "milestone3Core", "milestone5RegressionHarness", "milestone5Verifier", "milestone6ProductHardening", "missingDatapointsAndReadiness", "openSource2dCalculationWorker", "preliminaryTopologyPilotEvidence", "preliminaryTopologyPilotPolicy", "preliminaryTopologyPilotVerifier", "productionReadinessVerifier", "referenceThermalTreatmentFamilies", "releaseVerificationGate", "reportInventory", "reviewContextViewModel", "thermalTreatmentOpportunityDetection", "thermalTreatmentReleaseWorkflow", "thermalTreatmentSpine", "thermalTreatmentTrust", "topologyAnalysisRequest", "topologyHardening", "topologyOperationalPilot", "topologyReport", "topologyScenarioEstimates", "verificationProfiles",
] as const;

const integration = [
  "componentEvaluationSqlite", "componentOccurrenceHttp", "generatedThermalTreatmentQualification", "ifcEvidenceArtifacts", "ifcEvidenceExtractor", "ifcReaderDomain", "ifcSmokeInspection", "ifcViewerContract", "jobArtifactStore", "localhostAppLifecycle", "milestone4JobApi", "paidPilotSafety", "preliminaryTopologyPilotSqlite", "reconcileJobReviewPlan", "reviewWorkflowRegression", "sqliteJobRepository", "submitJobTopologyReview", "topologyReviewHttpContract", "viewerGeometryCache", "webIfcModelReader",
] as const;

const numerical = [
  "componentScenarioHttpE2e", "preliminaryTopologyPilotHttp", "preliminaryTopologyPilotLifecycle", "preliminaryTopologyPilotOperational", "preliminaryTopologyPilotSensitivity", "provenPythonTopologyWorker.integration", "topologyReviewJobE2e",
] as const;

function file(name: string): string { return `tests/${name}.test.ts`; }

export const TEST_INVENTORY: readonly TestInventoryEntry[] = [
  ...fast.map((name) => ({ file: file(name), profile: "fast" as const, budgetMs: 90_000, dependencies: dependenciesForFast(name), workerMode: ["componentEvaluationPublicSeam", "topologyAnalysisRequest", "topologyHardening"].includes(name) ? "deterministic" as const : "none" as const, sharedResource: "none" as const })),
  ...integration.map((name) => ({ file: file(name), profile: "integration" as const, budgetMs: 240_000, dependencies: dependenciesForIntegration(name), workerMode: "none" as const, sharedResource: "isolated-workspace" as const })),
  ...numerical.map((name) => ({ file: file(name), profile: "numerical" as const, budgetMs: 600_000, dependencies: dependenciesForNumerical(name), workerMode: "real-python" as const, sharedResource: "real-worker" as const })),
];

function dependenciesForIntegration(name: string): TestInventoryEntry["dependencies"] {
  if (name === "generatedThermalTreatmentQualification") return ["filesystem"];
  if (["ifcReaderDomain", "ifcSmokeInspection", "ifcViewerContract", "webIfcModelReader"].includes(name)) return ["filesystem", "web-ifc"];
  if (["localhostAppLifecycle", "milestone4JobApi", "paidPilotSafety", "reconcileJobReviewPlan", "reviewWorkflowRegression", "submitJobTopologyReview", "topologyReviewHttpContract"].includes(name)) return ["sqlite", "filesystem", "localhost"];
  return ["sqlite", "filesystem"];
}

function dependenciesForFast(name: string): TestInventoryEntry["dependencies"] {
  if (name === "componentEvaluationPublicSeam") return ["sqlite", "filesystem", "localhost"];
  if (["topologyAnalysisRequest", "releaseVerificationGate"].includes(name)) return ["filesystem"];
  return [];
}

function dependenciesForNumerical(name: string): TestInventoryEntry["dependencies"] {
  if (name === "provenPythonTopologyWorker.integration") return ["filesystem"];
  return ["sqlite", "filesystem", "localhost"];
}

export function validateProfileInventory(entries: readonly TestInventoryEntry[], discoveredFiles: readonly string[]): void {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.file, (counts.get(entry.file) ?? 0) + 1);
    const profile = VERIFICATION_PROFILES[entry.profile];
    if (entry.budgetMs > profile.budgetMs) throw new Error(`${entry.file} exceeds the ${entry.profile} budget.`);
    if (entry.profile === "fast" && entry.workerMode === "real-python") throw new Error(`${entry.file} selects a real Python worker in fast feedback.`);
  }
  const unclassified = discoveredFiles.filter((file) => !counts.has(file));
  if (unclassified.length) throw new Error(`Verification inventory has unclassified tests: ${unclassified.join(", ")}.`);
  const absent = [...counts.keys()].filter((file) => !discoveredFiles.includes(file));
  if (absent.length) throw new Error(`Verification inventory contains tests that were not discovered: ${absent.join(", ")}.`);
  const duplicate = [...counts].filter(([, count]) => count !== 1).map(([file]) => file);
  if (duplicate.length) throw new Error(`Verification inventory assigns tests more than once: ${duplicate.join(", ")}.`);
}

export function selectVerificationProfile(profileId: VerificationProfileId, entries = TEST_INVENTORY): readonly TestInventoryEntry[] {
  const profile = VERIFICATION_PROFILES[profileId];
  const selectedProfiles = new Set(profile.includes);
  const selected = entries.filter((entry) => selectedProfiles.has(entry.profile));
  for (const entry of selected) {
    if (entry.budgetMs > VERIFICATION_PROFILES[entry.profile].budgetMs) throw new Error(`${entry.file} exceeds the ${entry.profile} budget.`);
    if (profileId === "fast" && entry.workerMode === "real-python") throw new Error(`${entry.file} selects a real Python worker in fast feedback.`);
  }
  return selected;
}
