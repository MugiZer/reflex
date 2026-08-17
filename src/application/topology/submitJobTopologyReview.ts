import { createHash, randomUUID } from "node:crypto";

import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobTopologyReview, TopologyPilotEvent, TopologyPilotRun } from "../../domain/jobs/jobTypes.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import { detectIfcTopologyOpportunities, topologyMaterialId, type TopologyReviewAnswer } from "../../domain/topology/ifcTopologyOpportunity.js";
import type { JsonValue, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";
import { decideTopologyPilotPolicy, defaultTopologyPilotPolicy, type TopologyPilotDecision, type TopologyPilotPolicy } from "../../domain/topology/topologyPilotPolicy.js";
import { submitIfcTopologyConfirmation, type TopologyAnalysisRequestService } from "./submitIfcTopologyConfirmation.js";
import type { TopologyReviewEvidenceLoader } from "./topologyReviewEvidence.js";
import { requireCompleteTopologyResult } from "../../domain/topology/topologyResultValidation.js";
import { interpretComponentPattern, type ComponentPattern } from "../../domain/topology/componentPatternInterpreter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../../domain/topology/patterns/repeatingCProfilePattern.js";
import { componentEvaluationIdentities, type ComponentEvaluationGraph, type ComponentEvaluationRepository } from "../../domain/topology/componentEvaluationRecords.js";
import { deriveComponentEvaluationAggregate } from "../../domain/topology/componentEvaluationAggregate.js";
import type { GeneratedTopologyAdapterRegistry } from "../../domain/topology/generatedTopologyAdapterRegistry.js";
import { findExactGeneratedTopologyFamilyMatch } from "../../domain/topology/exactGeneratedTopologyFamilyMatch.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter } from "../../domain/topology/generatedTopologyAdapter.js";

/** Loads immutable Job evidence, validates ownership, and persists optional topology enrichment. */
export async function submitJobTopologyReview(command: {
  jobId: string;
  body: unknown;
  jobs: JobRepository;
  componentEvaluations: ComponentEvaluationRepository;
  evidence: TopologyReviewEvidenceLoader;
  requests: TopologyAnalysisRequestService;
  bundle: TopologyBundleIdentity;
  deadlineAt?: string;
  cancellationSignal?: AbortSignal;
  componentPatterns?: readonly ComponentPattern[];
  generatedTopologyAdapters?: GeneratedTopologyAdapterRegistry;
  screeningThresholdWPerM2K?: number | null;
  topologyPilotEnabled?: boolean;
  topologyPilotPolicy?: TopologyPilotPolicy;
}): Promise<JobTopologyReview | TopologyPilotRun | ComponentEvaluationGraph> {
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
  const policy = command.topologyPilotPolicy ?? { ...defaultTopologyPilotPolicy(command.bundle), enabled: command.topologyPilotEnabled ?? true };
  const decision = decideTopologyPilotPolicy({ policy, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId });
  if (decision.disposition !== "eligible") return savePilotRun(command, submission, opportunity, decision as PolicyExclusionDecision, decision.disposition as PolicyExclusionDecision["disposition"], decision.decisionCode);
  const executionCommand = { ...command, bundle: policy.bundle, deadlineAt: boundedDeadlineAt(command.deadlineAt, policy.limits.deadlineMs) };
  const component = recordComponentInterpretation({ command: executionCommand, job, submission, evidence, opportunity, revisionCreatedAt: revision.createdAt });
  if (component?.interpretation.outcome === "matched") {
    const plan = bindIfcLayers(component.interpretation.plan, opportunity, layerOnlySnapshot);
    if (!Number.isInteger(policy.limits.maxScenarioCount) || policy.limits.maxScenarioCount < 1 || plan.scenarios.length > policy.limits.maxScenarioCount) {
      return savePilotRun(command, submission, opportunity, decision, "failed", "scenario_count_exceeds_policy_limit");
    }
    const evaluation = await executeComponentScenarios({ command: executionCommand, graph: component.graph, plan, layerOnlySnapshot, retryPolicy: policy.retry });
    const failed = evaluation.results.find((result) => result.outcome !== "preliminary-unsafe");
    if (failed) savePilotRun(command, submission, opportunity, decision, failed.outcome === "cancelled" ? "cancelled" : "failed", resultErrorCode(failed.resultPayload), evaluation);
    else savePilotRun(command, submission, opportunity, decision, "completed", null, evaluation);
    return evaluation;
  }
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId, signature: opportunity.thermalConstructionSignature, answers: submission.answers }));
  const existing = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) return existing;
  const response = await submitIfcTopologyConfirmation({ opportunity, answers: submission.answers, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, correlationId: randomUUID(), idempotencyKey, layerOnlySnapshot, bundle: executionCommand.bundle, requests: executionCommand.requests, deadlineAt: executionCommand.deadlineAt, cancellationSignal: executionCommand.cancellationSignal });
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

function savePilotRun(command: { jobId: string; jobs: JobRepository }, submission: TopologyReviewSubmission, opportunity: ReturnType<typeof detectIfcTopologyOpportunities>[number], policy: TopologyPilotDecision, disposition: TopologyPilotRun["disposition"], errorCode: string | null, evaluation: ComponentEvaluationGraph | null = null): TopologyPilotRun {
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId, signature: opportunity.thermalConstructionSignature, answers: submission.answers, decisionId: policy.decisionId }));
  const existing = command.jobs.getTopologyPilotRunByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) {
    ensurePilotEvent(command.jobs, existing);
    return existing;
  }
  const run: TopologyPilotRun = { pilotRunId: `toprun_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId, disposition, policy, evaluationId: evaluation?.evaluation.evaluationId ?? null, aggregateId: evaluation?.aggregate?.aggregateId ?? null, resultIdsHash: evaluation ? componentEvaluationResultIdsHash(evaluation) : null, errorCode, createdAt: new Date().toISOString() };
  try {
    command.jobs.saveTopologyPilotRun(run);
    ensurePilotEvent(command.jobs, run);
    return run;
  } catch {
    const replay = command.jobs.getTopologyPilotRunByIdempotencyKey(command.jobId, idempotencyKey);
    if (replay) {
      ensurePilotEvent(command.jobs, replay);
      return replay;
    }
    throw new Error("Unable to persist topology pilot disposition.");
  }
}

function ensurePilotEvent(jobs: JobRepository, run: TopologyPilotRun): void {
  if (!jobs.saveTopologyPilotEvent) throw new Error("Topology pilot event persistence is unavailable.");
  const eventPayload = { disposition: run.disposition, errorCode: run.errorCode, policyHash: run.policy.policyHash, evaluationId: run.evaluationId, aggregateId: run.aggregateId, resultIdsHash: run.resultIdsHash };
  const event: TopologyPilotEvent = { eventId: sha256(canonicalTopologyJson({ runId: run.pilotRunId, eventType: "pilot.run.persisted", eventPayload })), eventType: "pilot.run.persisted", runId: run.pilotRunId, jobId: run.jobId, sourceRevisionId: run.sourceRevisionId, sourceAssemblyGroupId: run.sourceAssemblyGroupId, correlationId: run.policy.decisionId, code: run.errorCode ?? run.policy.decisionCode, payloadHash: sha256(canonicalTopologyJson(eventPayload)), createdAt: run.createdAt };
  jobs.saveTopologyPilotEvent(event);
}

function recordComponentInterpretation(input: { command: Parameters<typeof submitJobTopologyReview>[0]; job: NonNullable<ReturnType<JobRepository["getJob"]>>; submission: TopologyReviewSubmission; evidence: readonly unknown[]; opportunity: ReturnType<typeof detectIfcTopologyOpportunities>[number]; revisionCreatedAt: string }): { graph: ComponentEvaluationGraph; interpretation: ReturnType<typeof interpretComponentPattern> } | null {
  const at = input.revisionCreatedAt;
  const evidencePayload = { fileHash: input.job.fileHash, calculationInputEvidence: input.evidence } as unknown as JsonValue;
  const ifcImportId = componentEvaluationIdentities.ifcImport({ jobId: input.job.jobId, sourceRevisionId: input.job.activeRevisionId!, contentSha256: input.job.fileHash!, parserVersion: "web-ifc-0.0.77" });
  const evidenceSha256 = componentEvaluationIdentities.evidenceSnapshot({ sourceRevisionId: input.job.activeRevisionId!, ifcContentSha256: input.job.fileHash!, parserVersion: "web-ifc-0.0.77", canonicalEvidence: evidencePayload });
  const occurrenceId = componentEvaluationIdentities.occurrence({ evidenceSnapshotId: evidenceSha256, opportunityId: input.opportunity.opportunityId, elementStepIds: input.opportunity.affectedElementStepIds });
  const annotationPayload = { answers: input.submission.answers } as unknown as JsonValue;
  const annotationId = componentEvaluationIdentities.annotation({ evidenceSnapshotId: evidenceSha256, occurrenceId, payload: annotationPayload, authority: "user-confirmed" });
  const memberKind = typeof input.submission.answers.memberKind === "string" ? input.submission.answers.memberKind : "";
  const memberMaterial = typeof input.submission.answers.memberMaterial === "string" ? input.submission.answers.memberMaterial : "";
  const authoritativeKeys = [memberKind && input.submission.answers.memberKindAuthority !== "missing" ? "profileKind" : "", memberMaterial && input.submission.answers.memberMaterialAuthority !== "missing" ? "memberMaterial" : ""].filter(Boolean);
  const conflictingKeys = input.submission.answers.memberWidthConflict === true ? ["memberWidthM"] : [];
  const exact = input.command.generatedTopologyAdapters ? findExactGeneratedTopologyFamilyMatch({ answers: input.submission.answers, bundle: input.command.bundle, registry: input.command.generatedTopologyAdapters }) : null;
  const patternEvidence = { evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), profileKind: exact?.adapter.family.profileKind ?? memberKind, materialLabel: exact?.adapter.family.materialIdentity ?? memberMaterial, values: { memberWidthM: input.submission.answers.memberWidthM as JsonValue | "i-dont-know" }, authoritativeKeys, conflictingKeys };
  const patterns = exact ? [generatedAdapterPattern(exact.adapter)] : (input.command.componentPatterns ?? [REPEATING_C_PROFILE_PATTERN]);
  const interpreted = interpretComponentPattern({ evidence: patternEvidence, patterns });
  const interpretation = exact && interpreted.outcome === "matched"
    ? { ...interpreted, reasons: [...interpreted.reasons, `exact-family:${exact.familySignature}`], plan: { pack: { packId: exact.adapter.family.familyId, version: exact.adapter.family.familyVersion, immaterialityGateWPerM2K: 0 }, scenarios: [{ scenarioId: sha256(canonicalTopologyJson(exact.recipe)), parameters: {}, recipe: exact.recipe }] } }
    : interpreted;
  const selected = interpretation.outcome === "matched" ? patterns.find((item) => item.patternId === interpretation.patternId && item.version === interpretation.patternVersion) ?? null : null;
  const matchOutcome = interpretation.outcome;
  const matchId = componentEvaluationIdentities.patternMatch({ occurrenceId, annotationId, outcome: matchOutcome, patternId: selected?.patternId ?? null, patternVersion: selected?.version ?? null });
  const evaluationId = componentEvaluationIdentities.evaluationRun({ occurrenceId, matchId, sourceRevisionId: input.job.activeRevisionId!, recipeIds: [matchId] });
  const graph: ComponentEvaluationGraph = {
    schemaVersion: "component-evaluation-sqlite/v1", jobId: input.job.jobId, sourceRevisionId: input.job.activeRevisionId!, sourceAssemblyGroupId: input.submission.sourceAssemblyGroupId,
    ifcImport: { ifcImportId, jobId: input.job.jobId, revisionId: input.job.activeRevisionId!, contentSha256: input.job.fileHash!, parserVersion: "web-ifc-0.0.77", createdAt: at },
    evidence: { evidenceSnapshotId: evidenceSha256, ifcImportId, canonicalEvidence: evidencePayload, evidenceSha256, createdAt: at },
    occurrence: { occurrenceId, evidenceSnapshotId: evidenceSha256, elementStepId: input.opportunity.affectedElementStepIds[0]!, opportunityId: input.opportunity.opportunityId, evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), createdAt: at },
    annotations: [{ annotationId, occurrenceId, payload: annotationPayload, authority: "user-confirmed", createdAt: at }],
    pattern: selected ? { patternId: selected.patternId, version: selected.version, lifecycle: selected.lifecycle, canonicalPattern: selected as unknown as JsonValue, patternSha256: componentEvaluationIdentities.patternVersion({ patternId: selected.patternId, version: selected.version, canonicalPattern: selected as unknown as JsonValue }), createdAt: at } : null,
    match: { matchId, occurrenceId, annotationId, patternId: selected?.patternId ?? null, patternVersion: selected?.version ?? null, outcome: matchOutcome, reasons: interpretation.outcome === "matched" ? interpretation.reasons : [interpretation.outcome], createdAt: at },
    recipes: [], requests: [], results: [], evaluation: { evaluationId, occurrenceId, matchId, scenarioRequestIds: [], createdAt: at }, aggregate: null,
    unresolvedGroups: interpretation.outcome === "unmatched" ? [{ unresolvedGroupId: componentEvaluationIdentities.unresolvedGroup({ evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), occurrenceIds: [occurrenceId] }), evidenceSignature: sha256(input.opportunity.thermalConstructionSignature), occurrenceIds: [occurrenceId], createdAt: at }] : [], state: "recoverable",
  };
  if (interpretation.outcome !== "matched") input.command.componentEvaluations.append(graph);
  return { graph, interpretation };
}

function generatedAdapterPattern(adapter: GeneratedTopologyAdapter): ComponentPattern {
  return {
    patternId: adapter.family.familyId,
    version: adapter.family.familyVersion,
    adapterHash: generatedTopologyAdapterHash(adapter),
    lifecycle: "promoted",
    recognition: adapter.recognition,
    requiredAuthorities: adapter.requiredAuthorities,
    permittedUnknowns: [],
    maxScenarioCount: 1,
    immaterialityGateWPerM2K: 0,
    recipeTemplate: adapter.recipeTemplate,
  };
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

async function executeComponentScenarios(input: { command: Parameters<typeof submitJobTopologyReview>[0]; graph: ComponentEvaluationGraph; plan: import("../../domain/topology/componentKnowledgeBase.js").TopologyScenarioPlan; layerOnlySnapshot: JsonValue; retryPolicy: TopologyPilotPolicy["retry"] }): Promise<ComponentEvaluationGraph> {
  const at = input.graph.evaluation.createdAt;
  const workerBundleIdentity = sha256(canonicalTopologyJson(input.command.bundle as unknown as JsonValue));
  const recipes = input.plan.scenarios.map((scenario) => ({ recipeId: componentEvaluationIdentities.exactRecipe({ recipe: scenario.recipe, patternId: input.graph.pattern!.patternId, patternVersion: input.graph.pattern!.version, compilerVersion: input.command.bundle.moduleVersion, primitiveRegistryHash: input.command.bundle.registryHash, materialPackHash: input.command.bundle.packHash, runtimeHash: input.command.bundle.runtimeHash, boundaryVersion: "component-evaluation/v1" }), matchId: input.graph.match.matchId, canonicalRecipe: scenario.recipe, recipeSha256: sha256(canonicalTopologyJson(scenario.recipe)), createdAt: at }));
  const evaluationId = componentEvaluationIdentities.evaluationRun({ occurrenceId: input.graph.occurrence.occurrenceId, matchId: input.graph.match.matchId, sourceRevisionId: input.graph.sourceRevisionId, recipeIds: recipes.map((recipe) => recipe.recipeId) });
  const graph = { ...input.graph, evaluation: { ...input.graph.evaluation, evaluationId } };
  const requests = recipes.map((recipe) => { const scenarioRequestId = componentEvaluationIdentities.scenarioRequest({ recipeId: recipe.recipeId, sourceRevisionId: graph.sourceRevisionId, sourceAssemblyGroupId: graph.sourceAssemblyGroupId, workerBundleIdentity, purpose: "component-scenario" }); return { scenarioRequestId, evaluationId, recipeId: recipe.recipeId, idempotencyKey: scenarioRequestId, createdAt: at }; });
  const planned: ComponentEvaluationGraph = { ...graph, recipes, requests, evaluation: { ...graph.evaluation, scenarioRequestIds: requests.map((item) => item.scenarioRequestId) } };
  input.command.componentEvaluations.append(planned);
  const results = [];
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index]!, request = requests[index]!;
    const outcome = await input.command.requests.submit({ sourceRevisionId: input.graph.sourceRevisionId, sourceAssemblyGroupId: input.graph.sourceAssemblyGroupId, correlationId: randomUUID(), idempotencyKey: request.idempotencyKey, recipe: recipe.canonicalRecipe, recipeHash: recipe.recipeSha256, bundle: input.command.bundle, layerOnlySnapshot: input.layerOnlySnapshot, deadlineAt: input.command.deadlineAt, cancellationSignal: input.command.cancellationSignal, retryPolicy: input.retryPolicy });
    const payload = outcome as unknown as JsonValue;
    const durablePayload: JsonValue = { recipeHash: outcome.recipeHash ?? null, effectiveUValueWPerM2K: outcome.effectiveUValueWPerM2K ?? null, evidence: (outcome.evidence ?? null) as JsonValue, errorCode: outcome.errorCode ?? null };
    const artifactContentSha256 = outcome.evidence ? sha256(canonicalTopologyJson(outcome.evidence.artifactIndex as unknown as JsonValue)) : sha256(canonicalTopologyJson(durablePayload));
    const artifactIdentity = componentEvaluationIdentities.scenarioResultArtifact({ scenarioRequestId: request.scenarioRequestId, workerRequestId: outcome.requestId, outcome: outcome.outcome, payload: durablePayload, artifactSha256: artifactContentSha256 });
    results.push({ scenarioResultId: artifactIdentity, scenarioRequestId: request.scenarioRequestId, outcome: outcome.outcome, resultPayload: payload, artifactIdentity, createdAt: at });
    input.command.componentEvaluations.append({ ...planned, results: [...results] });
  }
  const completed: ComponentEvaluationGraph = { ...planned, results };
  const persisted = input.command.componentEvaluations.getByEvaluationId(completed.evaluation.evaluationId);
  if (!persisted) throw new Error("Persisted component evaluation is unavailable for aggregation.");
  const aggregate = deriveComponentEvaluationAggregate(persisted, { screeningThresholdWPerM2K: input.command.screeningThresholdWPerM2K ?? null, immaterialityGateWPerM2K: input.plan.pack.immaterialityGateWPerM2K });
  const published: ComponentEvaluationGraph = { ...persisted, aggregate, state: "published" };
  input.command.componentEvaluations.append(published);
  return published;
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
type PolicyExclusionDecision = TopologyPilotDecision & { disposition: "disabled" | "cohort-excluded" | "killed" };
function resultErrorCode(value: JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "worker_failure";
  const errorCode = (value as { readonly errorCode?: JsonValue }).errorCode;
  return typeof errorCode === "string" && errorCode ? errorCode : "worker_failure";
}
function componentEvaluationResultIdsHash(graph: ComponentEvaluationGraph): string { return sha256(canonicalTopologyJson(graph.results.map((result) => ({ scenarioResultId: result.scenarioResultId, scenarioRequestId: result.scenarioRequestId, outcome: result.outcome, artifactIdentity: result.artifactIdentity })))); }
function boundedDeadlineAt(requestedDeadlineAt: string | undefined, limitMs: number): string {
  const now = Date.now();
  const policyDeadline = Number.isFinite(limitMs) && limitMs > 0 ? now + limitMs : now;
  const requested = requestedDeadlineAt ? Date.parse(requestedDeadlineAt) : Number.POSITIVE_INFINITY;
  return new Date(Math.min(policyDeadline, Number.isFinite(requested) ? requested : policyDeadline)).toISOString();
}
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
