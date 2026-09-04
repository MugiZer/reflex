import { randomUUID } from "node:crypto";
import type { AssemblyGroup } from "../../domain/assemblies/assemblyTypes.js";
import type { CalculationSnapshot } from "../../domain/calculations/calculationTypes.js";
import { createRevision } from "../../domain/revisions/createRevision.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import { runThermalTreatment } from "../../domain/thermal-treatment/runThermalTreatment.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamilyRegistry, ThermalTreatmentSelection } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import { writeRevisionArtifacts } from "../../infrastructure/storage/local-files/writeRevisionArtifacts.js";
import { generateHtmlReport } from "../reports/generateHtmlReport.js";

export type ThermalTreatmentReportWorkflowDependencies = {
  outputRoot: string;
  registry: ThermalTreatmentFamilyRegistry;
  worker: ThermalTreatmentCalculationWorker;
  now?: Date;
};

export type RunThermalTreatmentReportCommand = {
  fileHash: string;
  jobId: string;
  assemblyGroup: AssemblyGroup & { thermalTreatmentSelection: ThermalTreatmentSelection };
  baselineSnapshot: CalculationSnapshot;
  parentRevisionId?: string | null;
};

export type RunThermalTreatmentReportResult = {
  revision: Revision;
  calculationSnapshot: CalculationSnapshot;
  reportFilePath: string;
  revisionFilePath: string;
};

/**
 * Application module for applying a confirmed Thermal Treatment and publishing
 * its immutable Revision and Report. Infrastructure adapters are fixed at this
 * seam; callers supply only facts unique to a calculation.
 */
export function createThermalTreatmentReportWorkflow(dependencies: ThermalTreatmentReportWorkflowDependencies): {
  run(command: RunThermalTreatmentReportCommand): Promise<RunThermalTreatmentReportResult>;
} {
  const artifactStore = new LocalJobArtifactStore(dependencies.outputRoot);

  return {
    async run(command) {
      const treatment = await runThermalTreatment({
        assemblyGroupId: command.assemblyGroup.assemblyGroupId,
        selection: command.assemblyGroup.thermalTreatmentSelection,
        registry: dependencies.registry,
        worker: dependencies.worker,
        now: dependencies.now,
      });
      const thermalTreatment = {
        ...treatment.record,
        baselineUValueWPerM2K: command.baselineSnapshot.uValueWPerM2K ?? 0,
      };
      const calculationSnapshot: CalculationSnapshot = {
        ...command.baselineSnapshot,
        calculationSnapshotId: `snapshot_${randomUUID()}`,
        assemblyGroupId: command.assemblyGroup.assemblyGroupId,
        uValueWPerM2K: treatment.result.effectiveUValueWPerM2K,
        uValueRangeWPerM2K: null,
        assumptions: [...command.baselineSnapshot.assumptions, ...thermalTreatment.assumptions],
        provenance: [...command.baselineSnapshot.provenance, ...thermalTreatment.provenance],
        thermalTreatment,
      };
      const revision = createRevision({
        revisionId: `rev_${randomUUID()}`,
        parentRevisionId: command.parentRevisionId ?? null,
        reason: "Thermal Treatment calculation",
        userInputs: [],
        overrides: [],
        calculationSnapshots: [calculationSnapshot],
        diagnostics: [],
        now: dependencies.now,
      });
      const artifacts = await writeRevisionArtifacts({
        artifactStore,
        jobId: command.jobId,
        fileHash: command.fileHash,
        revision,
      });
      const report = await generateHtmlReport({
        artifactStore,
        outputRoot: dependencies.outputRoot,
        jobId: command.jobId,
        fileHash: command.fileHash,
        revision,
        calculationSnapshots: [calculationSnapshot],
      });
      return {
        revision,
        calculationSnapshot,
        reportFilePath: report.reportFilePath,
        revisionFilePath: artifacts.revisionFilePath,
      };
    },
  };
}
