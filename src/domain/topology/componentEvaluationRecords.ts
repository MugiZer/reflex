import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue, TopologyAnalysisOutcome } from "./topologyTypes.js";
import type { TopologyPilotEvent, TopologyPilotRun } from "../jobs/jobTypes.js";

export type PatternLifecycle = "draft" | "candidate" | "promoted" | "rejected";

export type IfcImportRecord = Readonly<{ ifcImportId: string; jobId: string; revisionId: string; contentSha256: string; parserVersion: string; createdAt: string }>;
export type EvidenceSnapshotRecord = Readonly<{ evidenceSnapshotId: string; ifcImportId: string; canonicalEvidence: JsonValue; evidenceSha256: string; createdAt: string }>;
export type ComponentOccurrenceRecord = Readonly<{ occurrenceId: string; evidenceSnapshotId: string; elementStepId: number; opportunityId: string; evidenceSignature: string; createdAt: string }>;
export type ComponentAnnotationRecord = Readonly<{ annotationId: string; occurrenceId: string; payload: JsonValue; authority: string; createdAt: string }>;
export type PatternVersionRecord = Readonly<{ patternId: string; version: string; lifecycle: PatternLifecycle; canonicalPattern: JsonValue; patternSha256: string; createdAt: string }>;
export type PatternMatchRecord = Readonly<{ matchId: string; occurrenceId: string; annotationId: string | null; patternId: string | null; patternVersion: string | null; outcome: "matched" | "ambiguous" | "unmatched" | "blocked" | "rejected"; reasons: readonly string[]; createdAt: string }>;
export type ExactRecipeRecord = Readonly<{ recipeId: string; matchId: string; canonicalRecipe: JsonValue; recipeSha256: string; createdAt: string }>;
export type ScenarioRequestRecord = Readonly<{ scenarioRequestId: string; evaluationId: string; recipeId: string; idempotencyKey: string; createdAt: string }>;
export type ScenarioResultRecord = Readonly<{ scenarioResultId: string; scenarioRequestId: string; outcome: TopologyAnalysisOutcome; resultPayload: JsonValue; artifactIdentity: string | null; createdAt: string }>;
export type EvaluationRunRecord = Readonly<{ evaluationId: string; occurrenceId: string; matchId: string; scenarioRequestIds: readonly string[]; createdAt: string }>;
export type EvaluationAggregateRecord = Readonly<{ aggregateId: string; evaluationId: string; outcome: "exact" | "range" | "range-unavailable"; payload: JsonValue; createdAt: string }>;
export type UnresolvedOccurrenceGroupRecord = Readonly<{ unresolvedGroupId: string; evidenceSignature: string; occurrenceIds: readonly string[]; createdAt: string }>;

export type ComponentEvaluationGraph = Readonly<{
  schemaVersion: "component-evaluation-sqlite/v1";
  jobId: string;
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  ifcImport: IfcImportRecord;
  evidence: EvidenceSnapshotRecord;
  occurrence: ComponentOccurrenceRecord;
  annotations: readonly ComponentAnnotationRecord[];
  pattern: PatternVersionRecord | null;
  match: PatternMatchRecord;
  recipes: readonly ExactRecipeRecord[];
  requests: readonly ScenarioRequestRecord[];
  results: readonly ScenarioResultRecord[];
  evaluation: EvaluationRunRecord;
  aggregate: EvaluationAggregateRecord | null;
  unresolvedGroups: readonly UnresolvedOccurrenceGroupRecord[];
  state: "recoverable" | "published";
}>;

export interface ComponentEvaluationRepository {
  append(graph: ComponentEvaluationGraph, faultAfter?: "planned-scenarios" | "first-result"): void;
  getByEvaluationId(evaluationId: string): ComponentEvaluationGraph | null;
  listByJobId(jobId: string): readonly ComponentEvaluationGraph[];
  close(): void;
}

/** Publication requires the exact durable pilot disposition and event for this result graph. */
export function assertCompletedPilotPublicationLineage(graph: ComponentEvaluationGraph, pilotRuns: readonly TopologyPilotRun[], pilotEvents: readonly TopologyPilotEvent[]): void {
  const publishable = graph.state === "published" && (graph.aggregate?.outcome === "exact" || graph.aggregate?.outcome === "range");
  if (!publishable) return;
  const expectedResultIdsHash = componentEvaluationResultIdsHash(graph);
  const run = pilotRuns.find((item) => item.disposition === "completed" && item.evaluationId === graph.evaluation.evaluationId && item.aggregateId === graph.aggregate?.aggregateId && item.resultIdsHash === expectedResultIdsHash && item.sourceRevisionId === graph.sourceRevisionId && item.sourceAssemblyGroupId === graph.sourceAssemblyGroupId && item.opportunityId === graph.occurrence.opportunityId);
  if (!run) throw new Error("Published topology evaluation has no completed pilot disposition bound to its exact result graph.");
  const expectedPayload = { disposition: run.disposition, errorCode: run.errorCode, policyHash: run.policy.policyHash, evaluationId: run.evaluationId, aggregateId: run.aggregateId, resultIdsHash: run.resultIdsHash };
  const eventHash = hashCanonical(expectedPayload);
  if (!pilotEvents.some((event) => event.eventType === "pilot.run.persisted" && event.runId === run.pilotRunId && event.sourceRevisionId === graph.sourceRevisionId && event.sourceAssemblyGroupId === graph.sourceAssemblyGroupId && event.payloadHash === eventHash)) throw new Error("Published topology evaluation has no matching persisted pilot event.");
}

/** The sole deterministic identity authority for immutable component-evaluation records. */
export const componentEvaluationIdentities = Object.freeze({
  ifcImport: (input: Readonly<{ jobId: string; sourceRevisionId: string; contentSha256: string; parserVersion: string }>) => identityContract("ifc-import", input),
  evidenceSnapshot: (input: Readonly<{ sourceRevisionId: string; ifcContentSha256: string; parserVersion: string; canonicalEvidence: JsonValue }>) => identityContract("evidence-snapshot", input),
  occurrence: (input: Readonly<{ evidenceSnapshotId: string; opportunityId: string; elementStepIds: readonly number[] }>) => identityContract("component-occurrence", input),
  annotation: (input: Readonly<{ evidenceSnapshotId: string; occurrenceId: string; authority: string; payload: JsonValue }>) => identityContract("component-annotation", input),
  patternVersion: (input: Readonly<{ patternId: string; version: string; canonicalPattern: JsonValue }>) => identityContract("pattern-version", input),
  patternMatch: (input: Readonly<{ occurrenceId: string; annotationId: string | null; outcome: string; patternId: string | null; patternVersion: string | null }>) => identityContract("pattern-match", input),
  exactRecipe: (input: Readonly<{ recipe: JsonValue; patternId: string; patternVersion: string; compilerVersion: string; primitiveRegistryHash: string; materialPackHash: string; runtimeHash: string; boundaryVersion: string }>) => identityContract("exact-recipe", input),
  scenarioRequest: (input: Readonly<{ recipeId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; workerBundleIdentity: string; purpose: string }>) => identityContract("scenario-request", input),
  scenarioResultArtifact: (input: Readonly<{ scenarioRequestId: string; workerRequestId: string; outcome: TopologyAnalysisOutcome; payload: JsonValue; artifactSha256: string | null }>) => identityContract("scenario-result-artifact", input),
  evaluationRun: (input: Readonly<{ occurrenceId: string; matchId: string; sourceRevisionId: string; recipeIds: readonly string[] }>) => identityContract("evaluation-run", input),
  aggregate: (input: Readonly<{ evaluationId: string; outcome: string; payload: JsonValue }>) => identityContract("evaluation-aggregate", input),
  unresolvedGroup: (input: Readonly<{ evidenceSignature: string; occurrenceIds: readonly string[] }>) => identityContract("unresolved-occurrence-group", input),
});

/** Hash inputs are explicit: adding or changing any semantic version changes the exact Recipe identity. */
export function exactRecipeIdentity(input: Readonly<{
  recipe: JsonValue;
  patternId: string;
  patternVersion: string;
  compilerVersion: string;
  primitiveRegistryHash: string;
  materialPackHash: string;
  runtimeHash: string;
  boundaryVersion: string;
}>): string {
  return componentEvaluationIdentities.exactRecipe(input);
}

export function evidenceSnapshotIdentity(canonicalEvidence: JsonValue): string { return identityContract("legacy-evidence-snapshot", { value: canonicalEvidence }); }
export function annotationIdentity(input: Readonly<{ evidenceSnapshotId: string; occurrenceId: string; authority: string; payload: JsonValue }>): string { return componentEvaluationIdentities.annotation(input); }
export function requestIdentity(input: Readonly<{ recipeId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; workerBundleIdentity: string; purpose: string }>): string { return componentEvaluationIdentities.scenarioRequest(input); }
export function resultArtifactIdentity(input: Readonly<{ requestId: string; outcome: TopologyAnalysisOutcome; payload: JsonValue; artifactSha256: string | null }>): string { return componentEvaluationIdentities.scenarioResultArtifact({ scenarioRequestId: input.requestId, workerRequestId: input.requestId, outcome: input.outcome, payload: input.payload, artifactSha256: input.artifactSha256 }); }
export function evaluationIdentity(input: Readonly<{ occurrenceId: string; matchId: string; sourceRevisionId: string; recipeIds: readonly string[] }>): string { return componentEvaluationIdentities.evaluationRun(input); }

function identity(value: JsonValue): string {
  return createHash("sha256").update(canonicalTopologyJson(value)).digest("hex");
}

function componentEvaluationResultIdsHash(graph: ComponentEvaluationGraph): string { return hashCanonical(graph.results.map((result) => ({ scenarioResultId: result.scenarioResultId, scenarioRequestId: result.scenarioRequestId, outcome: result.outcome, artifactIdentity: result.artifactIdentity }))); }
function hashCanonical(value: unknown): string { return createHash("sha256").update(canonicalTopologyJson(value as JsonValue)).digest("hex"); }

function identityContract(kind: string, input: unknown): string {
  const required = requiredIdentityFields[kind];
  const nullable = nullableIdentityFields[kind] ?? [];
  const shapes = identityFieldShapes[kind];
  if (!isRecord(input) || !required || !shapes || required.some((field) => !(field in input) || !isIdentityFieldComplete(input[field], shapes[field], new Set(nullable))) || !isCompleteIdentityInput(input, new Set(nullable), true)) throw new Error("Component evaluation identity input is incomplete.");
  return identity({ kind, input } as JsonValue);
}

type IdentityFieldShape = "string" | "nullable-string" | "json" | "number-array" | "string-array";
function isIdentityFieldComplete(value: unknown, shape: IdentityFieldShape | undefined, nullableFields: ReadonlySet<string>): boolean {
  if (shape === "string") return typeof value === "string" && value.trim().length > 0;
  if (shape === "nullable-string") return value === null || (typeof value === "string" && value.trim().length > 0);
  if (shape === "number-array") return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isInteger(item) && Number.isFinite(item));
  if (shape === "string-array") return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
  return value !== null && isCompleteIdentityInput(value, nullableFields);
}

function isCompleteIdentityInput(value: unknown, nullableFields?: ReadonlySet<string>, root = false): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (value === null) return !root;
  if (Array.isArray(value)) return value.every((item) => item === null || isCompleteIdentityInput(item));
  return isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => item !== undefined && (item === null ? !root || Boolean(nullableFields?.has(key)) : isCompleteIdentityInput(item)));
}

const requiredIdentityFields: Readonly<Record<string, readonly string[]>> = {
  "ifc-import": ["jobId", "sourceRevisionId", "contentSha256", "parserVersion"],
  "evidence-snapshot": ["sourceRevisionId", "ifcContentSha256", "parserVersion", "canonicalEvidence"],
  "component-occurrence": ["evidenceSnapshotId", "opportunityId", "elementStepIds"],
  "component-annotation": ["evidenceSnapshotId", "occurrenceId", "authority", "payload"],
  "pattern-version": ["patternId", "version", "canonicalPattern"],
  "pattern-match": ["occurrenceId", "annotationId", "outcome", "patternId", "patternVersion"],
  "exact-recipe": ["recipe", "patternId", "patternVersion", "compilerVersion", "primitiveRegistryHash", "materialPackHash", "runtimeHash", "boundaryVersion"],
  "scenario-request": ["recipeId", "sourceRevisionId", "sourceAssemblyGroupId", "workerBundleIdentity", "purpose"],
  "scenario-result-artifact": ["scenarioRequestId", "workerRequestId", "outcome", "payload", "artifactSha256"],
  "evaluation-run": ["occurrenceId", "matchId", "sourceRevisionId", "recipeIds"],
  "evaluation-aggregate": ["evaluationId", "outcome", "payload"],
  "unresolved-occurrence-group": ["evidenceSignature", "occurrenceIds"],
  "legacy-evidence-snapshot": ["value"],
};

const nullableIdentityFields: Readonly<Record<string, readonly string[]>> = {
  "pattern-match": ["annotationId", "patternId", "patternVersion"],
  "scenario-result-artifact": ["artifactSha256"],
};

const identityFieldShapes: Readonly<Record<string, Readonly<Record<string, IdentityFieldShape>>>> = {
  "ifc-import": { jobId: "string", sourceRevisionId: "string", contentSha256: "string", parserVersion: "string" },
  "evidence-snapshot": { sourceRevisionId: "string", ifcContentSha256: "string", parserVersion: "string", canonicalEvidence: "json" },
  "component-occurrence": { evidenceSnapshotId: "string", opportunityId: "string", elementStepIds: "number-array" },
  "component-annotation": { evidenceSnapshotId: "string", occurrenceId: "string", authority: "string", payload: "json" },
  "pattern-version": { patternId: "string", version: "string", canonicalPattern: "json" },
  "pattern-match": { occurrenceId: "string", annotationId: "nullable-string", outcome: "string", patternId: "nullable-string", patternVersion: "nullable-string" },
  "exact-recipe": { recipe: "json", patternId: "string", patternVersion: "string", compilerVersion: "string", primitiveRegistryHash: "string", materialPackHash: "string", runtimeHash: "string", boundaryVersion: "string" },
  "scenario-request": { recipeId: "string", sourceRevisionId: "string", sourceAssemblyGroupId: "string", workerBundleIdentity: "string", purpose: "string" },
  "scenario-result-artifact": { scenarioRequestId: "string", workerRequestId: "string", outcome: "string", payload: "json", artifactSha256: "nullable-string" },
  "evaluation-run": { occurrenceId: "string", matchId: "string", sourceRevisionId: "string", recipeIds: "string-array" },
  "evaluation-aggregate": { evaluationId: "string", outcome: "string", payload: "json" },
  "unresolved-occurrence-group": { evidenceSignature: "string", occurrenceIds: "string-array" },
  "legacy-evidence-snapshot": { value: "json" },
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
