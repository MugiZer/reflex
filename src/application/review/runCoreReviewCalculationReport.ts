import { randomUUID } from "node:crypto";

import { calculateThermalPerformance } from "../../domain/calculations/calculateThermalPerformance.js";
import { buildPhysicsAssemblies } from "../../domain/calculations/buildPhysicsAssemblies.js";
import type { CalculationSnapshot } from "../../domain/calculations/calculationTypes.js";
import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Diagnostic } from "../../domain/evidence/evidenceTypes.js";
import type { MaterialLibrary } from "../../domain/materials/materialTypes.js";
import { planRequestedInputs } from "../../domain/review/planRequestedInputs.js";
import type { Override, UserInput } from "../../domain/review/reviewTypes.js";
import { createRevision } from "../../domain/revisions/createRevision.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import { writeRevisionArtifacts } from "../../infrastructure/storage/local-files/writeRevisionArtifacts.js";
import { generateHtmlReport } from "../reports/generateHtmlReport.js";
import { buildReportInventory } from "../reports/buildReportInventory.js";

export type RunCoreReviewCalculationReportResult = {
  requestedInputs: ReturnType<typeof planRequestedInputs>["requestedInputs"];
  overrides: Override[];
  calculationSnapshots: CalculationSnapshot[];
  revision: Revision;
  revisionFilePath: string;
  revisionIndexFilePath: string;
  reportFilePath: string;
  diagnostics: Diagnostic[];
};

export async function runCoreReviewCalculationReport(command: {
  fileHash: string;
  jobId?: string;
  artifactStore?: LocalJobArtifactStore;
  outputRoot: string;
  calculationInputEvidence: CalculationInputEvidence[];
  materialLibrary: MaterialLibrary;
  userInputs: UserInput[];
  parentRevisionId?: string | null;
}): Promise<RunCoreReviewCalculationReportResult> {
  const requestedInputs = planRequestedInputs({
    calculationInputEvidence: command.calculationInputEvidence,
    materialLibrary: command.materialLibrary,
  }).requestedInputs;
  const overrides = command.userInputs.map((userInput): Override => ({
    overrideId: `ov_${userInput.userInputId}`,
    userInputId: userInput.userInputId,
    datapoint: userInput.datapoint,
    value: userInput.value,
    unit: userInput.unit,
    scopeKind: userInput.overrideScope ?? "layer_occurrence",
    targetId: targetIdForOverride(userInput, requestedInputs),
  }));
  const diagnostics: Diagnostic[] = [];
  const physicsAssemblyResult = buildPhysicsAssemblies({
      calculationInputEvidence: command.calculationInputEvidence,
      materialLibrary: command.materialLibrary,
      userInputs: command.userInputs,
    });
  diagnostics.push(...physicsAssemblyResult.diagnostics);
  const calculationSnapshots = physicsAssemblyResult.physicsAssemblies.map((physicsAssembly) => {
    const result = calculateThermalPerformance({ physicsAssembly });
    diagnostics.push(...result.diagnostics);
    return result.calculationSnapshot;
  });

  const revision = createRevision({
    revisionId: `rev_${randomUUID()}`,
    parentRevisionId: command.parentRevisionId ?? null,
    reason: "Milestone 3 scripted review calculation",
    userInputs: command.userInputs,
    overrides,
    calculationSnapshots,
    diagnostics,
  });
  const artifactStore = command.artifactStore ?? new LocalJobArtifactStore(command.outputRoot);
  const jobId = command.jobId ?? legacyJobId(command.fileHash);
  const revisionArtifacts = await writeRevisionArtifacts({
    artifactStore,
    jobId,
    fileHash: command.fileHash,
    revision,
  });
  const reportInventory = buildReportInventory({
    calculationInputEvidence: command.calculationInputEvidence,
    calculationSnapshots,
    materialLibrary: command.materialLibrary,
    userInputs: command.userInputs,
  });
  const report = await generateHtmlReport({
    artifactStore,
    outputRoot: command.outputRoot,
    jobId,
    fileHash: command.fileHash,
    revision,
    calculationSnapshots,
    reportInventory,
  });

  return {
    requestedInputs,
    overrides,
    calculationSnapshots,
    revision,
    ...revisionArtifacts,
    reportFilePath: report.reportFilePath,
    diagnostics,
  };
}

function legacyJobId(fileHash: string): string {
  return fileHash.startsWith("job_") ? fileHash : `job_${fileHash.replace(/[^A-Za-z0-9]/g, "")}`;
}

function targetIdForOverride(
  userInput: UserInput,
  requestedInputs: ReturnType<typeof planRequestedInputs>["requestedInputs"],
): string {
  const requestedInput = requestedInputs.find((input) =>
    input.requestedInputId === userInput.requestedInputId
  );
  if (!requestedInput) {
    return userInput.requestedInputId;
  }
  if (userInput.overrideScope === "material_decision" && requestedInput.scope.scopeKind === "material_decision") {
    return requestedInput.scope.materialDecisionId;
  }
  if (userInput.overrideScope === "assembly_group") {
    return requestedInput.assemblyGroupId;
  }
  if (userInput.overrideScope === "element_type" && "elementClass" in requestedInput.scope) {
    return requestedInput.scope.elementClass;
  }
  return requestedInput.requestedInputId;
}
