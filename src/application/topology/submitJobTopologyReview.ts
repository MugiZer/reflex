import { createHash, randomUUID } from "node:crypto";

import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobTopologyReview } from "../../domain/jobs/jobTypes.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import { detectIfcTopologyOpportunities, topologyMaterialId, type TopologyReviewAnswer } from "../../domain/topology/ifcTopologyOpportunity.js";
import type { JsonValue, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";
import { submitIfcTopologyConfirmation, type TopologyAnalysisRequestService } from "./submitIfcTopologyConfirmation.js";
import type { TopologyReviewEvidenceLoader } from "./topologyReviewEvidence.js";
import { requireCompleteTopologyResult } from "../../domain/topology/topologyResultValidation.js";
import { interpretComponentPattern } from "../../domain/topology/componentPatternInterpreter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../../domain/topology/patterns/repeatingCProfilePattern.js";
import type { ComponentEvaluationGraph } from "../../domain/topology/componentEvaluationRecords.js";

/** Loads immutable Job evidence, validates ownership, and persists optional topology enrichment. */
export async function submitJobTopologyReview(command: {
  jobId: string;
  body: unknown;
  jobs: JobRepository;
  evidence: TopologyReviewEvidenceLoader;
  requests: TopologyAnalysisRequestService;
  bundle: TopologyBundleIdentity;
  deadlineAt?: string;
  cancellationSignal?: AbortSignal;
}): Promise<JobTopologyReview | ComponentEvaluationGraph> {
  const job = command.jobs.getJob(command.jobId);
  if (!job) throw new Error("Job not found.");
  const parsed = parseSubmission(command.body);
  if (!parsed.ok) {
    if (!parsed.submission) throw new Error(parsed.message);
    return saveRejected(command, parsed.submission, "invalid_answer_shape");
  }
  const submission = parsed.submission;
  if (!job.activeRevisionId) return saveRejected(command, submission, "missing_active_revision");
  if (submission.sourceRevisionId !== job.activeRevisionId) return saveRejected(command, submission, "stale_source_revision");
  const loaded = await command.evidence.load(command.jobId, job.activeRevisionId);
  if (!loaded) return saveRejected(command, submission, "missing_review_evidence");
  const { calculationInputEvidence: evidence, activeRevision: revision } = loaded;
  if (!revision || revision.revisionId !== job.activeRevisionId) return saveRejected(command, submission, "active_revision_identity_mismatch");
  const opportunity = detectIfcTopologyOpportunities({ calculationInputEvidence: evidence }).find((item) =>
    item.opportunityId === submission.opportunityId && item.thermalConstructionSignature === submission.thermalConstructionSignature,
  );
  if (!opportunity) return saveRejected(command, submission, "unknown_or_stale_opportunity");
  const groupIds = new Set(evidence.filter((item) => opportunity.affectedElementStepIds.includes(item.elementStepId)).map(assemblyGroupIdForEvidence));
  if (!groupIds.has(submission.sourceAssemblyGroupId)) return saveRejected(command, submission, "wrong_assembly_group");
  const snapshot = revision.calculationSnapshots.find((item) => item.assemblyGroupId === submission.sourceAssemblyGroupId);
  if (!snapshot) return saveRejected(command, submission, "missing_layer_only_snapshot");
  const layerOnlySnapshot = JSON.parse(JSON.stringify(snapshot)) as JsonValue;
  const component = recordComponentInterpretation({ command, job, submission, evidence, opportunity });
  if (component?.interpretation.outcome === "matched") return await executeComponentScenarios({ command, graph: component.graph, plan: bindIfcLayers(component.interpretation.plan, opportunity, layerOnlySnapshot), layerOnlySnapshot });
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId, signature: opportunity.thermalConstructionSignature, answers: submission.answers }));
  const existing = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) return existing;
  const response = await submitIfcTopologyConfirmation({ opportunity, answers: submission.answers, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, correlationId: randomUUID(), idempotencyKey, layerOnlySnapshot, bundle: command.bundle, requests: command.requests, deadlineAt: command.deadlineAt, cancellationSignal: command.cancellationSignal });
  const review: JobTopologyReview = response.outcome === "blocked"
    ? { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "blocked", missingKeys: (response as { missingKeys?: string[] }).missingKeys ?? [], decisiveNextInput: (response as { missingKeys?: string[] }).missingKeys?.[0] ?? null, errorCode: null, topologyResult: null, createdAt: new Date().toISOString() }
    : response.outcome === "rejected"
      ? { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "rejected", missingKeys: [], decisiveNextInput: null, errorCode: (response as { errorCode?: string }).errorCode ?? null, topologyResult: null, createdAt: new Date().toISOString() }
      : { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: response.recipeHash, outcome: response.outcome, missingKeys: [], decisiveNextInput: null, errorCode: response.topologyRequest.errorCode ?? null, topologyResult: completeTopologyResult(response.topologyRequest), createdAt: new Date().toISOString() };
  try {
    command.jobs.saveTopologyReview(review);
    return review;
  } catch (error) {
    const replay = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
    if (replay) return replay;
    throw error;
  }
}

function recordComponentInterpretation(input: { command: Parameters<typeof submitJobTopologyReview>[0]; job: NonNullable<ReturnType<JobRepository["getJob"]>>; submission: TopologyReviewSubmission; evidence: readonly unknown[]; opportunity: ReturnType<typeof detectIfcTopologyOpportunities>[number] }): { graph: ComponentEvaluationGraph; interpretation: ReturnType<typeof interpretComponentPattern> } | null {
  if (!input.command.jobs.appendComponentEvaluation) return null;
  const at = new Date().toISOString();
  const evidencePayload = { fileHash: input.job.fileHash, calculationInputEvidence: input.evidence } as unknown as JsonValue;
  const evidenceSha256 = sha256(canonicalTopologyJson(evidencePayload));
  const occurrenceId = sha256(canonicalTopologyJson({ evidenceSha256, opportunityId: input.opportunity.opportunityId, elementStepIds: input.opportunity.affectedElementStepIds }));
  const annotationPayload = { answers: input.submission.answers } as unknown as JsonValue;
  const annotationId = sha256(canonicalTopologyJson({ occurrenceId, annotationPayload, authority: "user-confirmed" }));
  const memberKind = typeof input.submission.answers.memberKind === "string" ? input.submission.answers.memberKind : "";
  const memberMaterial = typeof input.submission.answers.memberMaterial === "string" ? input.submission.answers.memberMaterial : "";
  const interpretation = interpretComponentPattern({ evidence: { evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), profileKind: memberKind, materialLabel: memberMaterial, values: { memberWidthM: input.submission.answers.memberWidthM as JsonValue | "i-dont-know" }, authoritativeKeys: [memberKind ? "profileKind" : "", memberMaterial ? "memberMaterial" : ""].filter(Boolean), conflictingKeys: [] }, patterns: [REPEATING_C_PROFILE_PATTERN] });
  const selected = interpretation.outcome === "matched" ? REPEATING_C_PROFILE_PATTERN : null;
  const matchOutcome = interpretation.outcome;
  const matchId = sha256(canonicalTopologyJson({ occurrenceId, annotationId, outcome: matchOutcome, patternId: selected?.patternId ?? null, patternVersion: selected?.version ?? null }));
  const evaluationId = sha256(canonicalTopologyJson({ occurrenceId, matchId, jobId: input.job.jobId, revisionId: input.job.activeRevisionId }));
  const graph: ComponentEvaluationGraph = {
    schemaVersion: "component-evaluation-sqlite/v1", jobId: input.job.jobId, sourceRevisionId: input.job.activeRevisionId!, sourceAssemblyGroupId: input.submission.sourceAssemblyGroupId,
    ifcImport: { ifcImportId: `ifc_${input.job.fileHash}`, jobId: input.job.jobId, revisionId: input.job.activeRevisionId!, contentSha256: input.job.fileHash!, parserVersion: "web-ifc-0.0.77", createdAt: at },
    evidence: { evidenceSnapshotId: evidenceSha256, ifcImportId: `ifc_${input.job.fileHash}`, canonicalEvidence: evidencePayload, evidenceSha256, createdAt: at },
    occurrence: { occurrenceId, evidenceSnapshotId: evidenceSha256, elementStepId: input.opportunity.affectedElementStepIds[0]!, opportunityId: input.opportunity.opportunityId, evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), createdAt: at },
    annotations: [{ annotationId, occurrenceId, payload: annotationPayload, authority: "user-confirmed", createdAt: at }],
    pattern: selected ? { patternId: selected.patternId, version: selected.version, lifecycle: selected.lifecycle, canonicalPattern: selected as unknown as JsonValue, patternSha256: sha256(canonicalTopologyJson(selected as unknown as JsonValue)), createdAt: at } : null,
    match: { matchId, occurrenceId, annotationId, patternId: selected?.patternId ?? null, patternVersion: selected?.version ?? null, outcome: matchOutcome, reasons: interpretation.outcome === "matched" ? interpretation.reasons : [interpretation.outcome], createdAt: at },
    recipes: [], requests: [], results: [], evaluation: { evaluationId, occurrenceId, matchId, scenarioRequestIds: [], createdAt: at }, aggregate: null,
    unresolvedGroups: interpretation.outcome === "unmatched" ? [{ unresolvedGroupId: sha256(`unresolved:${input.opportunity.thermalConstructionSignature}`), evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), occurrenceIds: [occurrenceId], createdAt: at }] : [], state: "recoverable",
  };
  if (interpretation.outcome !== "matched") input.command.jobs.appendComponentEvaluation(graph);
  return { graph, interpretation };
}

function bindIfcLayers(plan: import("../../domain/topology/componentKnowledgeBase.js").TopologyScenarioPlan, opportunity: ReturnType<typeof detectIfcTopologyOpportunities>[number], layerOnlySnapshot: JsonValue): import("../../domain/topology/componentKnowledgeBase.js").TopologyScenarioPlan {
  const snapshotRecord = typeof layerOnlySnapshot === "object" && layerOnlySnapshot !== null && !Array.isArray(layerOnlySnapshot) ? layerOnlySnapshot as Record<string, JsonValue> : null;
  const snapshotLayers = Array.isArray(snapshotRecord?.layers) ? snapshotRecord.layers : [];
  const thickness = snapshotLayers.reduce((sum: number, layer: unknown) => sum + (typeof layer === "object" && layer !== null && "thicknessM" in layer && typeof layer.thicknessM === "number" ? layer.thicknessM : 0), 0);
  if (!(thickness > 0)) throw new Error("Component scenario requires a positive authoritative layer-only thickness.");
  const material = topologyMaterialId(opportunity.layers[0]?.material.value ?? null).value;
  if (!material) throw new Error("Component scenario requires a registered authoritative host material.");
  const sourceRefs = opportunity.layers.flatMap((layer) => layer.thicknessM.authority.sourceRefs);
  return { ...plan, scenarios: plan.scenarios.map((scenario) => {
    const recipe = JSON.parse(canonicalTopologyJson(scenario.recipe)) as any;
    if (Array.isArray(recipe.layers) && recipe.layers[0]) {
      recipe.layers[0].thickness = { value: thickness, authority: { state: "ifc-derived", sourceRefs } };
      recipe.layers[0].material = { value: material, authority: { state: "ifc-derived", sourceRefs: opportunity.layers.flatMap((layer) => layer.material.authority.sourceRefs) } };
    }
    return { ...scenario, recipe };
  }) };
}

async function executeComponentScenarios(input: { command: Parameters<typeof submitJobTopologyReview>[0]; graph: ComponentEvaluationGraph; plan: import("../../domain/topology/componentKnowledgeBase.js").TopologyScenarioPlan; layerOnlySnapshot: JsonValue }): Promise<ComponentEvaluationGraph> {
  if (!input.command.jobs.appendComponentEvaluation) throw new Error("Component evaluation repository is not composed.");
  const at = input.graph.evaluation.createdAt;
  const recipes = input.plan.scenarios.map((scenario) => ({ recipeId: sha256(canonicalTopologyJson(scenario.recipe)), matchId: input.graph.match.matchId, canonicalRecipe: scenario.recipe, recipeSha256: sha256(canonicalTopologyJson(scenario.recipe)), createdAt: at }));
  const requests = recipes.map((recipe) => ({ scenarioRequestId: sha256(canonicalTopologyJson({ evaluationId: input.graph.evaluation.evaluationId, recipeId: recipe.recipeId })), evaluationId: input.graph.evaluation.evaluationId, recipeId: recipe.recipeId, idempotencyKey: sha256(canonicalTopologyJson({ evaluationId: input.graph.evaluation.evaluationId, recipeId: recipe.recipeId, purpose: "component-scenario" })), createdAt: at }));
  const planned: ComponentEvaluationGraph = { ...input.graph, recipes, requests, evaluation: { ...input.graph.evaluation, scenarioRequestIds: requests.map((item) => item.scenarioRequestId) } };
  input.command.jobs.appendComponentEvaluation(planned);
  const results = [];
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index]!, request = requests[index]!;
    const outcome = await input.command.requests.submit({ sourceRevisionId: input.graph.sourceRevisionId, sourceAssemblyGroupId: input.graph.sourceAssemblyGroupId, correlationId: randomUUID(), idempotencyKey: request.idempotencyKey, recipe: recipe.canonicalRecipe, recipeHash: recipe.recipeSha256, bundle: input.command.bundle, layerOnlySnapshot: input.layerOnlySnapshot, deadlineAt: input.command.deadlineAt, cancellationSignal: input.command.cancellationSignal });
    const payload = outcome as unknown as JsonValue;
    const artifactDescriptor: JsonValue = {
      artifactDirectory: outcome.artifactDirectory ?? null,
      evidence: (outcome.evidence ?? null) as JsonValue,
    };
    results.push({ scenarioResultId: sha256(canonicalTopologyJson({ scenarioRequestId: request.scenarioRequestId, requestId: outcome.requestId, outcome: outcome.outcome })), scenarioRequestId: request.scenarioRequestId, outcome: outcome.outcome, resultPayload: payload, artifactIdentity: outcome.artifactDirectory ? sha256(canonicalTopologyJson(artifactDescriptor)) : null, createdAt: at });
    input.command.jobs.appendComponentEvaluation({ ...planned, results: [...results] });
  }
  const completed: ComponentEvaluationGraph = { ...planned, results };
  return completed;
}

function saveRejected(command: { jobId: string; jobs: JobRepository }, submission: { opportunityId: string; thermalConstructionSignature: string; sourceRevisionId: string; sourceAssemblyGroupId: string; answers: Record<string, TopologyReviewAnswer> }, errorCode: string): JobTopologyReview {
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: submission.opportunityId, signature: submission.thermalConstructionSignature, answers: submission.answers }));
  const existing = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) return existing;
  const review: JobTopologyReview = { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity: null, opportunityId: submission.opportunityId, thermalConstructionSignature: submission.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "rejected", missingKeys: [], decisiveNextInput: null, errorCode, topologyResult: null, createdAt: new Date().toISOString() };
  try {
    command.jobs.saveTopologyReview(review);
    return review;
  } catch {
    const replay = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
    if (replay) return replay;
    throw new Error("Unable to persist topology review rejection.");
  }
}

function completeTopologyResult(value: unknown) {
  return requireCompleteTopologyResult(value);
}

type TopologyReviewSubmission = { opportunityId: string; thermalConstructionSignature: string; sourceRevisionId: string; sourceAssemblyGroupId: string; answers: Record<string, TopologyReviewAnswer> };
function parseSubmission(body: unknown): { ok: true; submission: TopologyReviewSubmission } | { ok: false; submission: TopologyReviewSubmission | null; message: string } {
  if (!isRecord(body)) return { ok: false, submission: null, message: "Expected a topology review confirmation object." };
  for (const key of ["opportunityId", "thermalConstructionSignature", "sourceRevisionId", "sourceAssemblyGroupId"] as const) if (typeof body[key] !== "string" || !body[key].trim()) return { ok: false, submission: null, message: `${key} is required.` };
  const identity = { opportunityId: body.opportunityId as string, thermalConstructionSignature: body.thermalConstructionSignature as string, sourceRevisionId: body.sourceRevisionId as string, sourceAssemblyGroupId: body.sourceAssemblyGroupId as string };
  if (!isRecord(body.answers)) return { ok: false, submission: { ...identity, answers: {} }, message: "answers must be an object of reviewer values." };
  const safeAnswers = Object.fromEntries(Object.entries(body.answers).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) as Record<string, TopologyReviewAnswer>;
  if (Object.keys(safeAnswers).length !== Object.keys(body.answers).length) return { ok: false, submission: { ...identity, answers: safeAnswers }, message: "Topology review answers must be strings, numbers, booleans, or null." };
  return { ok: true, submission: { ...identity, answers: safeAnswers } };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
