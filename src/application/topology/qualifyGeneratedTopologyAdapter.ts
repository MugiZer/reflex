import { createHash, randomUUID } from "node:crypto";

import { adapterDependenciesMatchBundle, assertGeneratedTopologyAdapter, bindGeneratedTopologyRecipe, generatedTopologyAdapterHash, type AdapterQualificationGate, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../../domain/topology/generatedTopologyAdapter.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { JsonValue, TopologyResult, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";

export type TopologyQualificationRunner = (command: { recipe: JsonValue; recipeHash: string; purpose: string }) => Promise<TopologyResult>;
export type IndependentTopologyQualificationOracle = Readonly<{ oracleId: string; oracleVersion: string; contentHash: string; caseId: string; parameters: Readonly<Record<string, number>>; expectedEffectiveUValueWPerM2K: number; toleranceWPerM2K: number }>;

/** P3/P6 earning route: fixed code validates data, then runs the production Recipe/worker composition. */
export async function qualifyGeneratedTopologyAdapter(command: { adapter: GeneratedTopologyAdapter; bundle: TopologyBundleIdentity; worker: { executable: string; runtimeHash: string }; oracle: IndependentTopologyQualificationOracle; testedRevision: string; runTopology: TopologyQualificationRunner; now?: Date }): Promise<GeneratedTopologyQualificationReceipt> {
  const startedAt = Date.now();
  const hash = safeHash(command.adapter);
  const gates: AdapterQualificationGate[] = [];
  const contractCase = "adapter-contract-and-geometry";
  const caseIds = safeCaseIds(command.adapter);
  let baseRecipe: JsonValue | null = null;
  let contractError: string | null = null;
  try { assertGeneratedTopologyAdapter(command.adapter); if (!adapterDependenciesMatchBundle(command.adapter, command.bundle) || command.worker.runtimeHash !== command.bundle.runtimeHash) throw new Error("Adapter dependencies are incompatible with the pinned production bundle."); baseRecipe = bindGeneratedTopologyRecipe(command.adapter, command.adapter.qualificationCases.reference.parameters); } catch (error) { contractError = error instanceof Error ? error.message : "Invalid adapter contract."; }
  gates.push(gate(command, hash, "P3-contract-geometry", [contractCase], contractError ? [] : [contractCase], contractError ? [contractCase] : [], [], "adapter-schema-and-recipe/v1", null, "validate generated adapter contract and bind Recipe", startedAt));
  if (contractError || baseRecipe === null) {
    gates.push(
      gate(command, hash, "P6-worker", ["pinned-worker"], [], [], ["pinned-worker"], "production-recipe-compiler", null, "submit Recipe through pinned 2D worker", Date.now()),
      gate(command, hash, "P3-independent-reference", [caseIds.reference], [], [], [caseIds.reference], `fixture:${caseIds.reference}`, `independent-reference:${caseIds.reference}`, "compare worker output to independently authored reference tolerance", Date.now()),
      gate(command, hash, "P6-envelope-sensitivity", [caseIds.sensitivity], [], [], [caseIds.sensitivity], `fixture:${caseIds.sensitivity}`, null, "submit directional sensitivity Recipe through pinned 2D worker", Date.now()),
    );
    return receipt(command, hash, null, gates);
  }

  const workerStarted = Date.now();
  let base: TopologyResult | null = null;
  try { base = await run(command, baseRecipe, "worker-validity"); } catch { base = null; }
  const workerPass = validWorkerResult(base);
  gates.push(gate(command, hash, "P6-worker", ["pinned-worker"], workerPass ? ["pinned-worker"] : [], workerPass ? [] : ["pinned-worker"], [], "production-recipe-compiler", null, "submit Recipe through pinned 2D worker", workerStarted));

  const referenceStarted = Date.now();
  const reference = command.adapter.qualificationCases.reference;
  const oracleMatchesCase = command.oracle.caseId === reference.caseId && canonicalTopologyJson(command.oracle.parameters as JsonValue) === canonicalTopologyJson(reference.parameters as JsonValue);
  const referencePass = oracleMatchesCase && workerPass && base?.effectiveUValueWPerM2K !== null && base?.effectiveUValueWPerM2K !== undefined && Math.abs(base.effectiveUValueWPerM2K - command.oracle.expectedEffectiveUValueWPerM2K) <= command.oracle.toleranceWPerM2K;
  gates.push(gate(command, hash, "P3-independent-reference", [reference.caseId], referencePass ? [reference.caseId] : [], referencePass ? [] : [reference.caseId], workerPass ? [] : [reference.caseId], `fixture:${reference.caseId}`, `independent-reference:${command.oracle.oracleId}@${command.oracle.oracleVersion}:${command.oracle.contentHash}`, "compare worker output to independently authored reference tolerance", referenceStarted));

  const sensitivityStarted = Date.now();
  const sensitivity = command.adapter.qualificationCases.sensitivity;
  let sensitivityPass = false;
  if (workerPass) {
    try {
      const sensitivityRecipe = bindGeneratedTopologyRecipe(command.adapter, sensitivity.parameters);
      const changed = await run(command, sensitivityRecipe, "envelope-sensitivity");
      sensitivityPass = validWorkerResult(changed) && base?.effectiveUValueWPerM2K !== null && base?.effectiveUValueWPerM2K !== undefined && changed.effectiveUValueWPerM2K !== null && (sensitivity.direction === "increases" ? changed.effectiveUValueWPerM2K > base.effectiveUValueWPerM2K : changed.effectiveUValueWPerM2K < base.effectiveUValueWPerM2K);
    } catch { sensitivityPass = false; }
  }
  gates.push(gate(command, hash, "P6-envelope-sensitivity", [sensitivity.caseId], sensitivityPass ? [sensitivity.caseId] : [], sensitivityPass ? [] : [sensitivity.caseId], workerPass ? [] : [sensitivity.caseId], `fixture:${sensitivity.caseId}`, null, "submit directional sensitivity Recipe through pinned 2D worker", sensitivityStarted));
  return receipt(command, hash, sha256(canonicalTopologyJson(baseRecipe)), gates);
}

function safeHash(adapter: GeneratedTopologyAdapter): string { try { return generatedTopologyAdapterHash(adapter); } catch { return "unqualified-invalid-adapter"; } }
async function run(command: Parameters<typeof qualifyGeneratedTopologyAdapter>[0], recipe: JsonValue, purpose: string): Promise<TopologyResult> { return command.runTopology({ recipe, recipeHash: sha256(canonicalTopologyJson(recipe)), purpose: `${purpose}:${randomUUID()}` }); }
function validWorkerResult(result: TopologyResult | null): result is TopologyResult { return result !== null && result.outcome === "preliminary-unsafe" && result.effectiveUValueWPerM2K !== null && Number.isFinite(result.effectiveUValueWPerM2K) && result.evidence !== null && result.evidence.numericalProof.gates.mesh_convergence; }
function gate(command: Parameters<typeof qualifyGeneratedTopologyAdapter>[0], adapterHash: string, gateId: AdapterQualificationGate["gateId"], selectedCases: readonly string[], passedCases: readonly string[], failedCases: readonly string[], unexecutedCases: readonly string[], fixtureIdentity: string, oracleIdentity: string | null, text: string, startedAt: number): AdapterQualificationGate { return { gateId, selectedCases, passedCases, failedCases, unexecutedCases, fixtureIdentity, oracleIdentity, adapterHash, dependencyIdentities: safeDependencies(command.adapter), command: text, durationMs: Date.now() - startedAt, testedRevision: command.testedRevision }; }
function receipt(command: Parameters<typeof qualifyGeneratedTopologyAdapter>[0], adapterHash: string, recipeHash: string | null, gates: readonly AdapterQualificationGate[]): GeneratedTopologyQualificationReceipt { const dependencies = safeDependencies(command.adapter); return Object.freeze({ schema: "generated-topology-adapter-qualification-receipt/v1", decision: gates.every((gate) => gate.failedCases.length === 0 && gate.unexecutedCases.length === 0) ? "GO" : "NO-GO", adapterHash, recipeHash, worker: Object.freeze({ executable: command.worker.executable, runtimeHash: command.worker.runtimeHash }), compilerVersion: dependencies.compilerVersion, primitiveRegistryHash: dependencies.primitiveRegistryHash, materialPackHash: dependencies.materialPackHash, boundaryVersion: dependencies.boundaryVersion, gates: Object.freeze(gates.map((gate) => Object.freeze({ ...gate, dependencyIdentities: Object.freeze({ ...gate.dependencyIdentities }), selectedCases: Object.freeze([...gate.selectedCases]), passedCases: Object.freeze([...gate.passedCases]), failedCases: Object.freeze([...gate.failedCases]), unexecutedCases: Object.freeze([...gate.unexecutedCases]) }))), qualifiedAt: (command.now ?? new Date()).toISOString() }); }
function safeCaseIds(adapter: GeneratedTopologyAdapter): { reference: string; sensitivity: string } { const cases = (adapter as any).qualificationCases; return { reference: typeof cases?.reference?.caseId === "string" ? cases.reference.caseId : "unavailable-reference", sensitivity: typeof cases?.sensitivity?.caseId === "string" ? cases.sensitivity.caseId : "unavailable-sensitivity" }; }
function safeDependencies(adapter: GeneratedTopologyAdapter): GeneratedTopologyAdapter["dependencies"] { const candidate = (adapter as any).dependencies; return { compilerVersion: typeof candidate?.compilerVersion === "string" ? candidate.compilerVersion : "unavailable", primitiveRegistryHash: typeof candidate?.primitiveRegistryHash === "string" ? candidate.primitiveRegistryHash : "unavailable", materialPackHash: typeof candidate?.materialPackHash === "string" ? candidate.materialPackHash : "unavailable", runtimeHash: typeof candidate?.runtimeHash === "string" ? candidate.runtimeHash : "unavailable", boundaryVersion: typeof candidate?.boundaryVersion === "string" ? candidate.boundaryVersion : "unavailable" }; }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
