import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue, TopologyAnalysisOutcome } from "./topologyTypes.js";

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

/** The sole deterministic identity authority for immutable component-evaluation records. */
export const componentEvaluationIdentities = Object.freeze({
  ifcImport: (input: Readonly<{ jobId: string; sourceRevisionId: string; contentSha256: string; parserVersion: string }>) => identityContract("ifc-import", input),
  evidenceSnapshot: (input: Readonly<{ sourceRevisionId: string; ifcContentSha256: string; parserVersion: string; canonicalEvidence: JsonValue }>) => identityContract("evidence-snapshot", input),
  occurrence: (input: Readonly<{ evidenceSnapshotId: string; opportunityId: string; elementStepIds: readonly number[] }>) => identityContract("component-occurrence", input),
  annotation: (input: Readonly<{ evidenceSnapshotId: string; occurrenceId?: string; authority: string; payload: JsonValue }>) => identityContract("component-annotation", input),
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
export function annotationIdentity(input: Readonly<{ evidenceSnapshotId: string; authority: string; payload: JsonValue }>): string { return componentEvaluationIdentities.annotation(input); }
export function requestIdentity(input: Readonly<{ recipeId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; workerBundleIdentity: string; purpose: string }>): string { return componentEvaluationIdentities.scenarioRequest(input); }
export function resultArtifactIdentity(input: Readonly<{ requestId: string; outcome: TopologyAnalysisOutcome; payload: JsonValue; artifactSha256: string | null }>): string { return componentEvaluationIdentities.scenarioResultArtifact({ scenarioRequestId: input.requestId, workerRequestId: input.requestId, outcome: input.outcome, payload: input.payload, artifactSha256: input.artifactSha256 }); }
export function evaluationIdentity(input: Readonly<{ occurrenceId: string; matchId: string; sourceRevisionId: string; recipeIds: readonly string[] }>): string { return componentEvaluationIdentities.evaluationRun(input); }

function identity(value: JsonValue): string {
  return createHash("sha256").update(canonicalTopologyJson(value)).digest("hex");
}

function identityContract(kind: string, input: unknown): string {
  const required = requiredIdentityFields[kind];
  const nullable = nullableIdentityFields[kind] ?? [];
  const nonEmptyArrays = nonEmptyArrayIdentityFields[kind] ?? [];
  if (!isRecord(input) || !required || required.some((field) => !(field in input)) || nonEmptyArrays.some((field) => Array.isArray(input[field]) && input[field].length === 0) || !isCompleteIdentityInput(input, new Set(nullable), true)) throw new Error("Component evaluation identity input is incomplete.");
  return identity({ kind, input } as JsonValue);
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
  "component-annotation": ["evidenceSnapshotId", "authority", "payload"],
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

const nonEmptyArrayIdentityFields: Readonly<Record<string, readonly string[]>> = {
  "component-occurrence": ["elementStepIds"],
  "evaluation-run": ["recipeIds"],
  "unresolved-occurrence-group": ["occurrenceIds"],
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
