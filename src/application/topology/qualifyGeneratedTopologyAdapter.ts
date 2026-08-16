import { createHash, randomUUID } from "node:crypto";

import { adapterDependenciesMatchBundle, assertGeneratedTopologyAdapter, bindGeneratedTopologyRecipe, generatedTopologyAdapterHash, type AdapterQualificationGate, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { JsonValue, TopologyResult } from "../../domain/topology/topologyTypes.js";
import { createTopologyAnalysisRequestService } from "./createTopologyAnalysisRequestService.js";
import { PROVEN_TOPOLOGY_BUNDLE, createProvenPythonTopologyWorker } from "../../infrastructure/topology/createProvenPythonTopologyWorker.js";
import { oracleForGeneratedTopologyAdapter, type IndependentTopologyQualificationOracle } from "../../infrastructure/topology/generatedTopologyQualificationOracle.js";
import { LocalGeneratedTopologyQualificationReceiptStore } from "../../infrastructure/topology/localGeneratedTopologyQualificationReceiptStore.js";
import { LocalTopologyArtifactStore } from "../../infrastructure/topology/localTopologyArtifactStore.js";

export type GeneratedTopologyAdapterQualificationCommand = Readonly<{
  /** Candidate data only. Runtime, worker, bundle, and oracle are production-owned below. */
  adapter: unknown;
  outputRoot: string;
  pythonExecutable: string;
  testedRevision: string;
  now?: Date;
}>;

/**
 * Production earning route for a generated adapter.
 *
 * There is intentionally no runner, worker identity, bundle, or oracle seam in
 * this public command. The only execution route is the release-pinned Recipe
 * request service and worker composition below.
 */
export async function qualifyGeneratedTopologyAdapter(command: GeneratedTopologyAdapterQualificationCommand): Promise<GeneratedTopologyQualificationReceipt> {
  const startedAt = Date.now();
  const adapterHash = safeHash(command.adapter);
  const dependencies = safeDependencies(command.adapter);
  const caseIds = safeCaseIds(command.adapter);
  let adapter: GeneratedTopologyAdapter | null = null;
  let recipe: JsonValue | null = null;
  let contractError: string | null = null;
  let oracle: IndependentTopologyQualificationOracle | null = null;

  try {
    assertGeneratedTopologyAdapter(command.adapter);
    adapter = command.adapter;
    if (!adapterDependenciesMatchBundle(adapter, PROVEN_TOPOLOGY_BUNDLE)) throw new Error("Adapter dependencies are incompatible with the pinned production bundle.");
    recipe = bindGeneratedTopologyRecipe(adapter, adapter.qualificationCases.reference.parameters);
    oracle = oracleForGeneratedTopologyAdapter(adapter);
  } catch (error) {
    contractError = error instanceof Error ? error.message : "Invalid adapter contract.";
  }

  if (contractError || !adapter || recipe === null) {
    const receipt = createReceipt(command, adapterHash, dependencies, safeWorkerIdentity(command.pythonExecutable), null, [
      gate(command, adapterHash, "P3-contract-geometry", ["adapter-contract-and-geometry"], [], ["adapter-contract-and-geometry"], [], "adapter-schema-and-recipe/v1", null, "validate strict Recipe schema, SI units, bounds, and geometry-ready structure", startedAt, dependencies),
      gate(command, adapterHash, "P6-worker", ["pinned-worker"], [], [], ["pinned-worker"], "production-recipe-compiler", null, "submit Recipe through pinned 2D worker", Date.now(), dependencies),
      gate(command, adapterHash, "P3-independent-reference", [caseIds.reference], [], [], [caseIds.reference], `fixture:${caseIds.reference}`, null, "compare worker output to the production-owned reference oracle", Date.now(), dependencies),
      gate(command, adapterHash, "P6-envelope-sensitivity", [caseIds.sensitivity], [], [], [caseIds.sensitivity], `fixture:${caseIds.sensitivity}`, null, "submit directional sensitivity Recipe through pinned 2D worker", Date.now(), dependencies),
    ]);
    return persistReceipt(command.outputRoot, receipt);
  }

  let worker: ReturnType<typeof createProvenPythonTopologyWorker>;
  try {
    worker = createProvenPythonTopologyWorker({ pythonExecutable: command.pythonExecutable });
  } catch (error) {
    const receipt = createReceipt(command, adapterHash, dependencies, safeWorkerIdentity(command.pythonExecutable), null, [
      gate(command, adapterHash, "P3-contract-geometry", ["adapter-contract-and-geometry"], [], ["adapter-contract-and-geometry"], ["adapter-contract-and-geometry"], "adapter-schema-and-recipe/v1", null, "validate strict Recipe schema, SI units, bounds, and geometry-ready structure", startedAt, dependencies),
      gate(command, adapterHash, "P6-worker", ["pinned-worker"], [], ["pinned-worker"], [], "production-recipe-compiler", null, error instanceof Error ? error.message : "create pinned worker", Date.now(), dependencies),
      gate(command, adapterHash, "P3-independent-reference", [caseIds.reference], [], [], [caseIds.reference], `fixture:${caseIds.reference}`, null, "compare worker output to the production-owned reference oracle", Date.now(), dependencies),
      gate(command, adapterHash, "P6-envelope-sensitivity", [caseIds.sensitivity], [], [], [caseIds.sensitivity], `fixture:${caseIds.sensitivity}`, null, "submit directional sensitivity Recipe through pinned 2D worker", Date.now(), dependencies),
    ]);
    return persistReceipt(command.outputRoot, receipt);
  }

  const requests = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(command.outputRoot), worker });
  const runTopology = (candidateRecipe: JsonValue, purpose: string): Promise<TopologyResult> => requests.submit({
    sourceRevisionId: command.testedRevision,
    sourceAssemblyGroupId: adapter!.family.familyId,
    correlationId: randomUUID(),
    idempotencyKey: sha256(canonicalTopologyJson({ adapterHash, purpose, recipe: candidateRecipe })),
    recipe: candidateRecipe,
    recipeHash: sha256(canonicalTopologyJson(candidateRecipe)),
    bundle: PROVEN_TOPOLOGY_BUNDLE,
    layerOnlySnapshot: { schema: "generated-topology-adapter-qualification/v1", adapterHash },
  });

  const baseStarted = Date.now();
  let base: TopologyResult | null = null;
  try { base = await runTopology(recipe, "worker-validity"); } catch { base = null; }
  const validBase = validWorkerResult(base) ? base : null;
  const workerPass = validBase !== null;
  const geometryPass = validBase !== null && validGeometryEvidence(validBase);
  const gates: AdapterQualificationGate[] = [
    gate(command, adapterHash, "P3-contract-geometry", ["adapter-contract-and-geometry"], geometryPass ? ["adapter-contract-and-geometry"] : [], geometryPass ? [] : ["adapter-contract-and-geometry"], [], "adapter-schema-and-recipe/v1", null, "validate strict Recipe schema, SI units, bounds, and compiled geometry", baseStarted, dependencies),
    gate(command, adapterHash, "P6-worker", ["pinned-worker"], workerPass ? ["pinned-worker"] : [], workerPass ? [] : ["pinned-worker"], [], "production-recipe-compiler", null, "submit Recipe through pinned 2D worker", baseStarted, dependencies),
  ];

  const reference = adapter.qualificationCases.reference;
  const referenceStarted = Date.now();
  const oracleMatchesCase = oracle !== null && oracle.caseId === reference.caseId && canonicalTopologyJson(oracle.parameters as never) === canonicalTopologyJson(reference.parameters as never);
  const referencePass = oracleMatchesCase && validBase !== null && validBase.effectiveUValueWPerM2K !== null && Math.abs(validBase.effectiveUValueWPerM2K - oracle!.expectedEffectiveUValueWPerM2K) <= oracle!.toleranceWPerM2K;
  gates.push(gate(command, adapterHash, "P3-independent-reference", [reference.caseId], referencePass ? [reference.caseId] : [], referencePass ? [] : [reference.caseId], workerPass ? [] : [reference.caseId], `fixture:${reference.caseId}`, oracle ? `independent-reference:${oracle.oracleId}@${oracle.oracleVersion}:${oracle.contentHash}` : null, "compare worker output to the production-owned reference oracle", referenceStarted, dependencies));

  const sensitivity = adapter.qualificationCases.sensitivity;
  const sensitivityStarted = Date.now();
  let sensitivityPass = false;
  if (workerPass && geometryPass) {
    try {
      const changed = await runTopology(bindGeneratedTopologyRecipe(adapter, sensitivity.parameters), "envelope-sensitivity");
      sensitivityPass = validWorkerResult(changed) && changed.effectiveUValueWPerM2K !== null && validBase !== null && validBase.effectiveUValueWPerM2K !== null && (sensitivity.direction === "increases" ? changed.effectiveUValueWPerM2K > validBase.effectiveUValueWPerM2K : changed.effectiveUValueWPerM2K < validBase.effectiveUValueWPerM2K);
    } catch { sensitivityPass = false; }
  }
  gates.push(gate(command, adapterHash, "P6-envelope-sensitivity", [sensitivity.caseId], sensitivityPass ? [sensitivity.caseId] : [], sensitivityPass ? [] : [sensitivity.caseId], workerPass ? [] : [sensitivity.caseId], `fixture:${sensitivity.caseId}`, null, "submit directional sensitivity Recipe through pinned 2D worker", sensitivityStarted, dependencies));
  const receipt = createReceipt(command, adapterHash, dependencies, worker.runtimeIdentity, sha256(canonicalTopologyJson(recipe)), gates);
  return persistReceipt(command.outputRoot, receipt);
}

async function persistReceipt(outputRoot: string, receipt: GeneratedTopologyQualificationReceipt): Promise<GeneratedTopologyQualificationReceipt> {
  try {
    await new LocalGeneratedTopologyQualificationReceiptStore(outputRoot).write(receipt);
    return receipt;
  } catch {
    // A result that cannot be durably published cannot authorize qualification.
    return Object.freeze({ ...receipt, decision: "NO-GO" });
  }
}

function createReceipt(command: GeneratedTopologyAdapterQualificationCommand, adapterHash: string, dependencies: GeneratedTopologyAdapter["dependencies"], worker: { executable: string; runtimeHash: string }, recipeHash: string | null, gates: readonly AdapterQualificationGate[]): GeneratedTopologyQualificationReceipt {
  return Object.freeze({ schema: "generated-topology-adapter-qualification-receipt/v1", decision: gates.every((item) => item.failedCases.length === 0 && item.unexecutedCases.length === 0) ? "GO" : "NO-GO", adapterHash, recipeHash, worker: Object.freeze({ executable: worker.executable, runtimeHash: worker.runtimeHash }), compilerVersion: dependencies.compilerVersion, primitiveRegistryHash: dependencies.primitiveRegistryHash, materialPackHash: dependencies.materialPackHash, boundaryVersion: dependencies.boundaryVersion, gates: Object.freeze(gates.map((item) => Object.freeze({ ...item, dependencyIdentities: Object.freeze({ ...item.dependencyIdentities }), selectedCases: Object.freeze([...item.selectedCases]), passedCases: Object.freeze([...item.passedCases]), failedCases: Object.freeze([...item.failedCases]), unexecutedCases: Object.freeze([...item.unexecutedCases]) }))), qualifiedAt: safeDate(command.now) });
}

function validWorkerResult(result: TopologyResult | null): result is TopologyResult { const gates = result?.evidence?.numericalProof.gates; return result !== null && result.outcome === "preliminary-unsafe" && result.effectiveUValueWPerM2K !== null && Number.isFinite(result.effectiveUValueWPerM2K) && result.evidence !== null && gates !== undefined && [gates.topology_audit, gates.mesh_convergence, gates.solver_residual, gates.hot_cold_balance, gates.periodic_balance, gates.repeat_cell_stability].every(Boolean); }
function validGeometryEvidence(result: TopologyResult): boolean { const audit = result.evidence?.topologyAudit; return audit !== undefined && [audit.gap_area_m2, audit.overlap_area_m2, audit.area_residual_m2, audit.out_of_host_area_m2].every((value) => Number.isFinite(value) && Math.abs(value) <= 1e-11) && audit.sliver_count === 0 && result.evidence?.canonicalAnalysisGeometry.schemaVersion === "canonical-analysis-geometry/v1"; }
function gate(command: GeneratedTopologyAdapterQualificationCommand, adapterHash: string, gateId: AdapterQualificationGate["gateId"], selectedCases: readonly string[], passedCases: readonly string[], failedCases: readonly string[], unexecutedCases: readonly string[], fixtureIdentity: string, oracleIdentity: string | null, text: string, startedAt: number, dependencies: GeneratedTopologyAdapter["dependencies"]): AdapterQualificationGate { return { gateId, selectedCases, passedCases, failedCases, unexecutedCases, fixtureIdentity, oracleIdentity, adapterHash, dependencyIdentities: Object.freeze({ ...dependencies }), command: text, durationMs: Math.max(0, Date.now() - startedAt), testedRevision: command.testedRevision }; }
function safeHash(adapter: unknown): string { try { assertGeneratedTopologyAdapter(adapter); return generatedTopologyAdapterHash(adapter); } catch { return "unqualified-invalid-adapter"; } }
function safeCaseIds(adapter: unknown): { reference: string; sensitivity: string } { const cases = isRecord(adapter) ? adapter.qualificationCases : undefined; return { reference: isRecord(cases) && isRecord(cases.reference) && typeof cases.reference.caseId === "string" ? cases.reference.caseId : "unavailable-reference", sensitivity: isRecord(cases) && isRecord(cases.sensitivity) && typeof cases.sensitivity.caseId === "string" ? cases.sensitivity.caseId : "unavailable-sensitivity" }; }
function safeDependencies(adapter: unknown): GeneratedTopologyAdapter["dependencies"] { const candidate = isRecord(adapter) ? adapter.dependencies : undefined; return { compilerVersion: stringOrUnavailable(candidate, "compilerVersion"), primitiveRegistryHash: stringOrUnavailable(candidate, "primitiveRegistryHash"), materialPackHash: stringOrUnavailable(candidate, "materialPackHash"), runtimeHash: stringOrUnavailable(candidate, "runtimeHash"), boundaryVersion: stringOrUnavailable(candidate, "boundaryVersion") }; }
function safeWorkerIdentity(pythonExecutable: unknown): { executable: string; runtimeHash: string } { return { executable: typeof pythonExecutable === "string" && pythonExecutable.trim() !== "" ? pythonExecutable : "unavailable-release-topology-runtime", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }; }
function stringOrUnavailable(value: unknown, key: string): string { return isRecord(value) && typeof value[key] === "string" ? value[key] as string : "unavailable"; }
function safeDate(value: Date | undefined): string { return value && Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
