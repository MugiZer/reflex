import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AssemblyCandidate } from "../../../domain/assemblies/assemblyTypes.js";
import type { AssemblyReadinessDiagnostic } from "../../../domain/evidence/evidenceArtifactTypes.js";
import { ASSEMBLY_READINESS_RULES_VERSION } from "../../../domain/assemblies/evaluateAssemblyReadiness.js";
import { MISSING_DATAPOINT_RULES_VERSION } from "../../../domain/diagnostics/detectMissingDatapoints.js";
import type { MissingDatapoint } from "../../../domain/diagnostics/missingDatapointTypes.js";
import type {
  CalculationInputEvidence,
} from "../../../domain/evidence/calculationInputEvidenceTypes.js";
import type {
  ElementClass,
  ElementEvidence,
  EvidenceArtifactManifest,
  IfcEvidence,
} from "../../../domain/evidence/evidenceTypes.js";

const ELEMENT_COUNT_SPLIT_THRESHOLD = 2000;
const ELEMENT_JSON_SIZE_SPLIT_THRESHOLD_BYTES = 25 * 1024 * 1024;

type WriteIfcEvidenceArtifactsCommand = {
  outputRoot: string;
  ifcEvidence: IfcEvidence;
  assemblyCandidates?: AssemblyCandidate[];
  missingDatapoints?: MissingDatapoint[];
  readinessDiagnostics?: AssemblyReadinessDiagnostic[];
  calculationInputEvidence?: CalculationInputEvidence[];
  splitThresholds?: {
    elementCount?: number;
    elementsJsonBytes?: number;
  };
};

type WriteIfcEvidenceArtifactsResult = {
  evidenceDirectoryPath: string;
  manifest: EvidenceArtifactManifest;
  writtenArtifactPaths: string[];
  missingDatapoints?: MissingDatapoint[];
  readinessDiagnostics?: AssemblyReadinessDiagnostic[];
  calculationInputEvidence?: CalculationInputEvidence[];
};

const splitFileNames: Record<ElementClass, string> = {
  IfcWall: "walls.json",
  IfcSlab: "slabs.json",
  IfcRoof: "roofs.json",
  IfcCurtainWall: "curtain-walls.json",
  IfcBuildingElementProxy: "proxies.json",
};

const splitElementClassOrder: ElementClass[] = [
  "IfcWall",
  "IfcSlab",
  "IfcRoof",
  "IfcCurtainWall",
  "IfcBuildingElementProxy",
];

export async function writeIfcEvidenceArtifacts(
  command: WriteIfcEvidenceArtifactsCommand,
): Promise<WriteIfcEvidenceArtifactsResult> {
  const fileHash = command.ifcEvidence.fileEvidence.fileHash;
  if (!fileHash) {
    throw new Error("Cannot write evidence artifacts without fileEvidence.fileHash.");
  }

  const evidenceDirectoryPath = join(command.outputRoot, fileHash, "evidence");
  await mkdir(evidenceDirectoryPath, { recursive: true });

  const elementArtifactPlan = getElementArtifactPlan(command.ifcEvidence, {
    elementCount:
      command.splitThresholds?.elementCount ?? ELEMENT_COUNT_SPLIT_THRESHOLD,
    elementsJsonBytes:
      command.splitThresholds?.elementsJsonBytes ??
      ELEMENT_JSON_SIZE_SPLIT_THRESHOLD_BYTES,
  });

  const hasAssemblyCandidates = command.assemblyCandidates !== undefined;
  const missingDatapoints = command.missingDatapoints;
  const readinessDiagnostics = command.readinessDiagnostics;
  const calculationInputEvidence = command.calculationInputEvidence;
  const hasMissingDatapoints = missingDatapoints !== undefined;
  const hasReadinessDiagnostics = readinessDiagnostics !== undefined;
  const hasCalculationInputEvidence = calculationInputEvidence !== undefined;
  const manifest: EvidenceArtifactManifest = {
    artifactSchemaVersion: "ifc-evidence-artifacts.v1",
    extractorVersion: "web-ifc-evidence-extractor.v1",
    ifcModelReaderVersion: "web-ifc-model-reader.v1",
    extractionIndexVersion: "ifc-extraction-index.v1",
    relevantElementRulesVersion: "relevant-element-rules.v1",
    groupingPolicyVersion: hasAssemblyCandidates
      ? "conservative-material-association.v1"
      : "not-produced.partial-evidence-only",
    missingDatapointRulesVersion: hasMissingDatapoints
      ? MISSING_DATAPOINT_RULES_VERSION
      : "not-produced.partial-evidence-only",
    readinessRulesVersion: hasReadinessDiagnostics
      ? ASSEMBLY_READINESS_RULES_VERSION
      : "not-produced.partial-evidence-only",
    artifactCompleteness:
      hasAssemblyCandidates && hasMissingDatapoints && hasReadinessDiagnostics
        ? "complete_milestone_1"
        : hasAssemblyCandidates
          ? "partial_evidence_with_assembly_candidates"
          : "partial_evidence_only",
    elementArtifactLayout: elementArtifactPlan.layout,
  };

  const writtenArtifactPaths: string[] = [];

  await writeJson(join(evidenceDirectoryPath, "manifest.json"), manifest);
  writtenArtifactPaths.push(join(evidenceDirectoryPath, "manifest.json"));

  await writeJson(join(evidenceDirectoryPath, "file.json"), command.ifcEvidence.fileEvidence);
  writtenArtifactPaths.push(join(evidenceDirectoryPath, "file.json"));

  if (elementArtifactPlan.kind === "single_file") {
    await writeJson(
      join(evidenceDirectoryPath, "elements.json"),
      command.ifcEvidence.elementEvidence,
    );
    writtenArtifactPaths.push(join(evidenceDirectoryPath, "elements.json"));
  } else {
    const elementsDirectoryPath = join(evidenceDirectoryPath, "elements");
    await mkdir(elementsDirectoryPath, { recursive: true });
    for (const file of elementArtifactPlan.files) {
      await writeJson(join(evidenceDirectoryPath, file.path), file.elements);
      writtenArtifactPaths.push(join(evidenceDirectoryPath, file.path));
    }
  }

  await writeJson(
    join(evidenceDirectoryPath, "type-evidence.json"),
    command.ifcEvidence.typeEvidence,
  );
  writtenArtifactPaths.push(join(evidenceDirectoryPath, "type-evidence.json"));

  if (hasAssemblyCandidates) {
    await writeJson(
      join(evidenceDirectoryPath, "assembly-candidates.json"),
      command.assemblyCandidates,
    );
    writtenArtifactPaths.push(
      join(evidenceDirectoryPath, "assembly-candidates.json"),
    );
  }

  if (hasCalculationInputEvidence) {
    await writeJson(
      join(evidenceDirectoryPath, "calculation-input-evidence.json"),
      calculationInputEvidence,
    );
    writtenArtifactPaths.push(
      join(evidenceDirectoryPath, "calculation-input-evidence.json"),
    );
  }

  if (hasMissingDatapoints) {
    await writeJson(
      join(evidenceDirectoryPath, "missing-datapoints.json"),
      missingDatapoints,
    );
    writtenArtifactPaths.push(
      join(evidenceDirectoryPath, "missing-datapoints.json"),
    );
  }

  if (hasReadinessDiagnostics) {
    await writeJson(
      join(evidenceDirectoryPath, "readiness-diagnostics.json"),
      readinessDiagnostics,
    );
    writtenArtifactPaths.push(
      join(evidenceDirectoryPath, "readiness-diagnostics.json"),
    );
  }

  await writeJson(
    join(evidenceDirectoryPath, "cited-ifc-entities.json"),
    command.ifcEvidence.citedIfcEntities,
  );
  writtenArtifactPaths.push(join(evidenceDirectoryPath, "cited-ifc-entities.json"));

  await writeJson(
    join(evidenceDirectoryPath, "diagnostics.json"),
    command.ifcEvidence.diagnostics,
  );
  writtenArtifactPaths.push(join(evidenceDirectoryPath, "diagnostics.json"));

  return {
    evidenceDirectoryPath,
    manifest,
    writtenArtifactPaths,
    missingDatapoints,
    readinessDiagnostics,
    calculationInputEvidence,
  };
}

function getElementArtifactPlan(
  ifcEvidence: IfcEvidence,
  splitThresholds: { elementCount: number; elementsJsonBytes: number },
):
  | {
      kind: "single_file";
      layout: EvidenceArtifactManifest["elementArtifactLayout"];
    }
  | {
      kind: "split_by_element_class";
      layout: EvidenceArtifactManifest["elementArtifactLayout"];
      files: Array<{
        path: string;
        elements: ElementEvidence[];
      }>;
    } {
  const elementsJsonBytes = Buffer.byteLength(
    stableStringify(ifcEvidence.elementEvidence),
    "utf8",
  );
  const shouldSplit =
    ifcEvidence.elementEvidence.length > splitThresholds.elementCount ||
    elementsJsonBytes > splitThresholds.elementsJsonBytes;

  if (!shouldSplit) {
    return {
      kind: "single_file",
      layout: {
        kind: "single_file",
        path: "elements.json",
        elementCount: ifcEvidence.elementEvidence.length,
      },
    };
  }

  const files = splitElementClassOrder
    .map((elementClass) => {
      const elements = ifcEvidence.elementEvidence.filter(
        (element) => element.identity.elementClass === elementClass,
      );
      return {
        elementClass,
        path: `elements/${splitFileNames[elementClass]}`,
        elements,
      };
    })
    .filter((file) => file.elements.length > 0);

  return {
    kind: "split_by_element_class",
    layout: {
      kind: "split_by_element_class",
      directory: "elements",
      files: files.map((file) => ({
        elementClass: file.elementClass,
        path: file.path,
        elementCount: file.elements.length,
      })),
      elementCount: ifcEvidence.elementEvidence.length,
    },
    files,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${stableStringify(value)}\n`, "utf8");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}
