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
  return identity(input as unknown as JsonValue);
}

export function evidenceSnapshotIdentity(canonicalEvidence: JsonValue): string { return identity(canonicalEvidence); }
export function annotationIdentity(input: Readonly<{ evidenceSnapshotId: string; authority: string; payload: JsonValue }>): string { return identity(input as unknown as JsonValue); }
export function requestIdentity(input: Readonly<{ recipeId: string; sourceRevisionId: string; sourceAssemblyGroupId: string }>): string { return identity(input as unknown as JsonValue); }
export function resultArtifactIdentity(input: Readonly<{ requestId: string; outcome: TopologyAnalysisOutcome; payload: JsonValue; artifactSha256: string | null }>): string { return identity(input as unknown as JsonValue); }
export function evaluationIdentity(input: Readonly<{ occurrenceId: string; matchId: string; recipeIds: readonly string[] }>): string { return identity(input as unknown as JsonValue); }

function identity(value: JsonValue): string {
  return createHash("sha256").update(canonicalTopologyJson(value)).digest("hex");
}
