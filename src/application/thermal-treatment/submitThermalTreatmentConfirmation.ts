import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { buildReportInventory } from "../reports/buildReportInventory.js";
import { generateHtmlReport } from "../reports/generateHtmlReport.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import { createRevision } from "../../domain/revisions/createRevision.js";
import { confirmThermalTreatmentOpportunity, detectThermalTreatmentOpportunities } from "../../domain/thermal-treatment/detectThermalTreatmentOpportunities.js";
import { runThermalTreatment } from "../../domain/thermal-treatment/runThermalTreatment.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamilyRegistry, ThermalTreatmentInputValue } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import type { ProcessIfcJobDeps } from "../jobs/processIfcJob.js";
import { readActiveRevisionArtifact, readCalculationInputEvidenceArtifact } from "../../infrastructure/storage/local-files/jobReviewArtifactStore.js";
import { writeRevisionArtifacts } from "../../infrastructure/storage/local-files/writeRevisionArtifacts.js";

export async function submitThermalTreatmentConfirmation(command: { jobId: string; body: unknown; jobs: JobRepository; deps: ProcessIfcJobDeps; registry: ThermalTreatmentFamilyRegistry; worker: ThermalTreatmentCalculationWorker }) {
  const job = command.jobs.getJob(command.jobId);
  if (!job) throw new Error("Job not found.");
  if (job.jobStatus !== "completed") throw new Error("Thermal Treatment can be confirmed after the Assembly Group has an active calculation.");
  const submission = parseSubmission(command.body);
  const evidence = await readCalculationInputEvidenceArtifact({ artifactStore: command.deps.artifactStore, outputRoot: command.deps.outputRoot, jobId: command.jobId });
  const activeRevision = await readActiveRevisionArtifact({ artifactStore: command.deps.artifactStore, outputRoot: command.deps.outputRoot, jobId: command.jobId, activeRevisionId: job.activeRevisionId });
  if (!evidence || !activeRevision) throw new Error("Stored calculation evidence or active Revision is missing.");
  const suggestions = detectThermalTreatmentOpportunities({ calculationInputEvidence: evidence, registry: command.registry }).suggestions;
  const suggestion = suggestions.find((item) => item.suggestionId === submission.suggestionId && item.thermalConstructionSignature === submission.thermalConstructionSignature && item.family.familyId === submission.familyId && item.family.familyVersion === submission.familyVersion);
  if (!suggestion) throw new Error("Thermal Treatment suggestion is stale, unknown, or no longer matches the stored IFC evidence. Refresh the Review and try again.");
  const affectedAssemblyGroupIds = [...new Set(evidence.filter((item) => suggestion.affectedElementStepIds.includes(item.elementStepId)).map(assemblyGroupIdForEvidence))];
  if (!affectedAssemblyGroupIds.includes(submission.assemblyGroupId)) throw new Error("The selected Assembly Group is outside the unchanged Thermal Construction Signature.");
  const family = command.registry.findByIdentity(suggestion.family);
  if (!family) throw new Error("The selected Thermal Treatment family is not registered.");
  const allowed = new Set(family.packs.knowledgePack.parameters.map((input) => input.key));
  if (Object.keys(submission.inputs).some((key) => !allowed.has(key))) throw new Error("The confirmation includes an unknown Thermal Treatment parameter.");
  const confirmation = confirmThermalTreatmentOpportunity({ suggestion, confirmedInputs: submission.inputs });
  const validationIssues = family.validateConfirmedInputs({ confirmedInputs: confirmation.selection.confirmedInputs });
  if (validationIssues.length) throw new Error(validationIssues.map((issue) => issue.message).join(" "));
  validateEnvelope(family.packs.validationPack.supportedParameterEnvelope, confirmation.selection.confirmedInputs);
  const affectedSnapshots = activeRevision.calculationSnapshots.filter((snapshot) => affectedAssemblyGroupIds.includes(snapshot.assemblyGroupId));
  if (!affectedSnapshots.length) throw new Error("No active calculation snapshot exists for the selected Assembly Group.");
  if (affectedSnapshots.some((snapshot) => snapshot.thermalTreatment?.selection.familyId === suggestion.family.familyId && snapshot.thermalTreatment?.selection.familyVersion === suggestion.family.familyVersion)) throw new Error("This Thermal Treatment has already been confirmed for the active Revision.");
  const calculated = new Map<string, Awaited<ReturnType<typeof runThermalTreatment>>>();
  for (const snapshot of affectedSnapshots) calculated.set(snapshot.assemblyGroupId, await runThermalTreatment({ assemblyGroupId: snapshot.assemblyGroupId, selection: confirmation.selection, registry: command.registry, worker: command.worker }));
  const calculationSnapshots = activeRevision.calculationSnapshots.map((snapshot) => {
    const treatment = calculated.get(snapshot.assemblyGroupId);
    if (!treatment) return snapshot;
    const record = { ...treatment.record, baselineUValueWPerM2K: snapshot.uValueWPerM2K ?? 0 };
    return { ...snapshot, calculationSnapshotId: `snapshot_${randomUUID()}`, uValueWPerM2K: treatment.result.effectiveUValueWPerM2K, uValueRangeWPerM2K: null, assumptions: [...snapshot.assumptions, ...record.assumptions], provenance: [...snapshot.provenance, ...record.provenance], thermalTreatment: record };
  });
  const revision = createRevision({ revisionId: `rev_${randomUUID()}`, parentRevisionId: activeRevision.revisionId, reason: "Thermal Treatment confirmation", userInputs: activeRevision.userInputs, overrides: activeRevision.overrides, calculationSnapshots, diagnostics: activeRevision.diagnostics });
  const artifactStore = command.deps.artifactStore!;
  await writeRevisionArtifacts({ artifactStore, jobId: command.jobId, fileHash: job.fileHash ?? job.jobId, revision });
  const report = await generateHtmlReport({ artifactStore, outputRoot: command.deps.outputRoot, jobId: command.jobId, fileHash: job.fileHash ?? job.jobId, revision, calculationSnapshots, reportInventory: buildReportInventory({ calculationInputEvidence: evidence, calculationSnapshots, materialLibrary: command.deps.materialLibrary!, userInputs: activeRevision.userInputs }) });
  command.jobs.updateJob(command.jobId, { activeRevisionId: revision.revisionId, reportPath: report.reportFilePath, jobStatus: "completed", errorMessage: null });
  return { jobId: command.jobId, revisionId: revision.revisionId, affectedAssemblyGroupIds, reportPath: report.reportFilePath };
}

function parseSubmission(body: unknown): { suggestionId: string; thermalConstructionSignature: string; familyId: string; familyVersion: string; assemblyGroupId: string; inputs: Record<string, ThermalTreatmentInputValue> } {
  if (!isRecord(body)) throw new Error("Expected a Thermal Treatment confirmation object.");
  for (const key of ["suggestionId", "thermalConstructionSignature", "familyId", "familyVersion", "assemblyGroupId"]) if (typeof body[key] !== "string" || body[key].trim() === "") throw new Error(`${key} is required.`);
  if (!isRecord(body.inputs)) throw new Error("inputs must be an object of architect-owned values.");
  for (const value of Object.values(body.inputs)) if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) throw new Error("Thermal Treatment input values must be strings, numbers, booleans, or null.");
  return { suggestionId: body.suggestionId as string, thermalConstructionSignature: body.thermalConstructionSignature as string, familyId: body.familyId as string, familyVersion: body.familyVersion as string, assemblyGroupId: body.assemblyGroupId as string, inputs: body.inputs as Record<string, ThermalTreatmentInputValue> };
}
function validateEnvelope(envelope: Readonly<Record<string, { minimum?: number; maximum?: number; allowedValues?: readonly ThermalTreatmentInputValue[] }>>, values: Record<string, ThermalTreatmentInputValue>) {
  for (const [key, value] of Object.entries(values)) { const bounds = envelope[key]; if (!bounds) continue; if (typeof value === "number" && ((bounds.minimum !== undefined && value < bounds.minimum) || (bounds.maximum !== undefined && value > bounds.maximum))) throw new Error(`${key} is outside the supported validation envelope.`); if (bounds.allowedValues && !bounds.allowedValues.includes(value)) throw new Error(`${key} is outside the supported validation envelope.`); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }