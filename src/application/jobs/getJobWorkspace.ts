import { buildArchitectActionViewModel } from "./buildArchitectActionViewModel.js";
import { buildThermalTreatmentCardModel } from "../thermal-treatment/buildThermalTreatmentCardModel.js";
import { detectThermalTreatmentOpportunities } from "../../domain/thermal-treatment/detectThermalTreatmentOpportunities.js";
import { continuousZGirtFamilyRegistry } from "../../domain/thermal-treatment/families/continuousZGirtFamily.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import { buildActionReadyReviewProjection, type ActionReadyReviewProjection } from "../review/buildActionReadyReviewProjection.js";
import type { JobRecord, JobReviewState } from "../../domain/jobs/jobTypes.js";
import { buildReviewContextViewModel, type ReviewContextViewModel } from "../review/buildReviewContextViewModel.js";
import type { JobWorkspaceEvidenceLoader, TopologyResultIntegrityVerifier } from "./jobWorkspaceEvidence.js";
import { detectIfcTopologyOpportunities, type IfcTopologyOpportunity } from "../../domain/topology/ifcTopologyOpportunity.js";

export type JobTopologyOpportunityView = IfcTopologyOpportunity & { sourceAssemblyGroupIds: string[] };
export type JobWorkspaceViewModel = { job: JobRecord; topologyReviews: ReturnType<JobRepository["listTopologyReviews"]>; topologyOpportunities: JobTopologyOpportunityView[]; review: (JobReviewState & { context: ReviewContextViewModel; projection: ActionReadyReviewProjection }) | null; architectActions: ReturnType<typeof buildArchitectActionViewModel>; materialLibrary: typeof defaultMaterialLibraryV1; thermalTreatmentCards: ReturnType<typeof buildThermalTreatmentCardModel> };
export async function getJobWorkspace(command: { jobs: JobRepository; evidence: JobWorkspaceEvidenceLoader; topologyIntegrity: TopologyResultIntegrityVerifier; jobId: string; targetUValueWPerM2K: number | null }): Promise<JobWorkspaceViewModel | null> {
  const job = command.jobs.getJob(command.jobId); if (!job) return null;
  const topologyReviews = command.jobs.listTopologyReviews(command.jobId);
  await Promise.all(topologyReviews.flatMap((review) => review.topologyResult === null ? [] : [command.topologyIntegrity.verifyPersistedResult(review.topologyResult)]));
  if (job.jobStatus === "queued" || job.jobStatus === "processing") return { job, topologyReviews, topologyOpportunities: [], review: null, architectActions: buildArchitectActionViewModel({ jobId: command.jobId, jobStatus: job.jobStatus, calculationInputEvidence: [], requestedInputs: [], activeRevision: null, target: command.targetUValueWPerM2K === null ? null : { maxUValueWPerM2K: command.targetUValueWPerM2K, label: "Working project target" }, materialLibrary: defaultMaterialLibraryV1 }), materialLibrary: defaultMaterialLibraryV1, thermalTreatmentCards: [] };
  const reviewState = command.jobs.getReviewState(command.jobId);
  const loaded = await command.evidence.load(command.jobId, job.activeRevisionId);
  if (reviewState && loaded === null) throw new Error("Calculation input evidence artifact is missing for this Review.");
  const evidence = loaded?.calculationInputEvidence ?? [];
  const activeRevision = loaded?.activeRevision ?? null;
  const reviewContext = reviewState ? buildReviewContextViewModel({ jobId: command.jobId, requestedInputs: reviewState.requestedInputs, calculationInputEvidence: evidence }) : null;
  const review = reviewState && reviewContext ? { ...reviewState, context: reviewContext, projection: buildActionReadyReviewProjection({ jobId: command.jobId, requestedInputs: reviewState.requestedInputs, calculationInputEvidence: evidence, materialLibrary: defaultMaterialLibraryV1, context: reviewContext, resolvedRequestedInputIds: new Set(activeRevision?.userInputs.map((input) => input.requestedInputId) ?? []) }) } : null;
  const topologyOpportunities = detectIfcTopologyOpportunities({ calculationInputEvidence: evidence }).map((opportunity) => ({ ...opportunity, sourceAssemblyGroupIds: [...new Set(evidence.filter((item) => opportunity.affectedElementStepIds.includes(item.elementStepId)).map(assemblyGroupIdForEvidence))] }));
  return { job, topologyReviews, topologyOpportunities, review, architectActions: buildArchitectActionViewModel({ jobId: command.jobId, jobStatus: job.jobStatus, calculationInputEvidence: evidence, requestedInputs: reviewState?.requestedInputs ?? [], activeRevision, target: command.targetUValueWPerM2K === null ? null : { maxUValueWPerM2K: command.targetUValueWPerM2K, label: "Working project target" }, materialLibrary: defaultMaterialLibraryV1 }), materialLibrary: defaultMaterialLibraryV1, thermalTreatmentCards: buildThermalTreatmentCardModel({ suggestions: detectThermalTreatmentOpportunities({ calculationInputEvidence: evidence, registry: continuousZGirtFamilyRegistry }).suggestions, registry: continuousZGirtFamilyRegistry, activeRevision, assemblyGroupIdsForSuggestion: (suggestion) => [...new Set(evidence.filter((item) => suggestion.affectedElementStepIds.includes(item.elementStepId)).map(assemblyGroupIdForEvidence))] }) };
}
