import { randomUUID } from "node:crypto";
import type { AssemblyGroup } from "../../domain/assemblies/assemblyTypes.js";
import type { CalculationSnapshot } from "../../domain/calculations/calculationTypes.js";
import { createRevision } from "../../domain/revisions/createRevision.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import { runThermalTreatment } from "../../domain/thermal-treatment/runThermalTreatment.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamily, ThermalTreatmentSelection } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import { writeRevisionArtifacts } from "../../infrastructure/storage/local-files/writeRevisionArtifacts.js";
import { generateHtmlReport } from "../reports/generateHtmlReport.js";

export async function runThermalTreatmentCalculationReport(command: {
  fileHash: string; jobId: string; outputRoot: string; assemblyGroup: AssemblyGroup & { thermalTreatmentSelection: ThermalTreatmentSelection }; baselineSnapshot: CalculationSnapshot;
  families: readonly ThermalTreatmentFamily[]; worker: ThermalTreatmentCalculationWorker; parentRevisionId?: string | null; artifactStore?: LocalJobArtifactStore; now?: Date;
}): Promise<{ revision: Revision; calculationSnapshot: CalculationSnapshot; reportFilePath: string; revisionFilePath: string }> {
  const treatment = await runThermalTreatment({ assemblyGroupId: command.assemblyGroup.assemblyGroupId, selection: command.assemblyGroup.thermalTreatmentSelection, families: command.families, worker: command.worker, now: command.now });
  const thermalTreatment = { ...treatment.record, baselineUValueWPerM2K: command.baselineSnapshot.uValueWPerM2K ?? 0 };
  const calculationSnapshot = { ...command.baselineSnapshot, calculationSnapshotId: `snapshot_${randomUUID()}`, assemblyGroupId: command.assemblyGroup.assemblyGroupId, uValueWPerM2K: treatment.result.effectiveUValueWPerM2K, uValueRangeWPerM2K: null, assumptions: [...command.baselineSnapshot.assumptions, ...thermalTreatment.assumptions], provenance: [...command.baselineSnapshot.provenance, ...thermalTreatment.provenance], thermalTreatment };
  const revision = createRevision({ revisionId: `rev_${randomUUID()}`, parentRevisionId: command.parentRevisionId ?? null, reason: "Thermal Treatment calculation", userInputs: [], overrides: [], calculationSnapshots: [calculationSnapshot], diagnostics: [], now: command.now });
  const artifactStore = command.artifactStore ?? new LocalJobArtifactStore(command.outputRoot);
  const artifacts = await writeRevisionArtifacts({ artifactStore, jobId: command.jobId, fileHash: command.fileHash, revision });
  const report = await generateHtmlReport({ artifactStore, outputRoot: command.outputRoot, jobId: command.jobId, fileHash: command.fileHash, revision, calculationSnapshots: [calculationSnapshot] });
  return { revision, calculationSnapshot, reportFilePath: report.reportFilePath, revisionFilePath: artifacts.revisionFilePath };
}
