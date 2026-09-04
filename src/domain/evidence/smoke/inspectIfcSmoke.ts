import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { COUNTED_IFC_CLASSES } from "./ifcSmokeClasses.js";
import type {
  IfcSmokeArtifact,
  IfcSmokeModelReader,
  ProjectLengthUnitSignal,
} from "./ifcSmokeTypes.js";

const REPO_LOCAL_IFC_WARNING =
  "Source IFC appears to be inside the repository. Keep private IFC files outside the repo and do not commit them.";

export type InspectIfcSmokeCommand = {
  sourceFilePath: string;
  outputRoot?: string;
  repoRoot?: string;
  createReader: (sourceFilePath: string) => Promise<IfcSmokeModelReader>;
};

export type InspectIfcSmokeResult = {
  fileHash: string;
  smokeArtifactPath: string;
  warnings: string[];
};

export async function inspectIfcSmoke(
  command: InspectIfcSmokeCommand,
): Promise<InspectIfcSmokeResult> {
  const sourceFilePath = resolve(command.sourceFilePath);
  const outputRoot = resolve(command.outputRoot ?? "outputs");
  const repoRoot = resolve(command.repoRoot ?? process.cwd());

  const fileBytes = await readFile(sourceFilePath);
  const fileHash = createHash("sha256").update(fileBytes).digest("hex");
  const warnings = getPrivacyWarnings(sourceFilePath, repoRoot);

  let reader: IfcSmokeModelReader | null = null;
  try {
    reader = await command.createReader(sourceFilePath);
    const artifact = buildSmokeArtifact({ fileHash, reader, warnings });
    const smokeArtifactPath = resolve(outputRoot, fileHash, "smoke.json");
    await mkdir(dirname(smokeArtifactPath), { recursive: true });
    await writeFile(smokeArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

    return {
      fileHash,
      smokeArtifactPath,
      warnings,
    };
  } finally {
    reader?.close();
  }
}

function buildSmokeArtifact(input: {
  fileHash: string;
  reader: IfcSmokeModelReader;
  warnings: string[];
}): IfcSmokeArtifact {
  const counts = Object.fromEntries(
    COUNTED_IFC_CLASSES.map((entityClass) => [
      entityClass,
      countEntityClass(input.reader, entityClass),
    ]),
  );

  return {
    artifactKind: "ifc_smoke_risk_scan",
    canonical: false,
    nonCanonicalMarker:
      "non-canonical smoke risk scan; not Milestone 1 IFC Evidence",
    fileHash: input.fileHash,
    schema: input.reader.getSchema(),
    projectLengthUnitSignal: getProjectLengthUnitSignal(input.reader),
    counts,
    warnings: input.warnings,
  };
}

function countEntityClass(reader: IfcSmokeModelReader, entityClass: string) {
  const stepIds = reader
    .getEntitiesByClass(entityClass)
    .map((entity) => entity.stepId);

  return {
    total: stepIds.length,
    sampleStepIds: stepIds.slice(0, 5),
  };
}

function getProjectLengthUnitSignal(
  reader: IfcSmokeModelReader,
): ProjectLengthUnitSignal {
  const projects = reader.getEntitiesByClass("IfcProject");
  let unitsInContextAvailable = false;
  let lengthUnitAppearsAvailable = false;

  for (const project of projects) {
    const unitsInContextStepId = reader.getEntityReference(
      project.stepId,
      "UnitsInContext",
    );

    if (unitsInContextStepId === null) {
      continue;
    }

    unitsInContextAvailable = true;
    for (const unitStepId of reader.getEntityReferenceList(
      unitsInContextStepId,
      "Units",
    )) {
      if (isLengthUnit(reader, unitStepId)) {
        lengthUnitAppearsAvailable = true;
      }
    }
  }

  return {
    ifcProjectCount: projects.length,
    unitsInContextAvailable,
    lengthUnitAppearsAvailable,
  };
}

function isLengthUnit(reader: IfcSmokeModelReader, stepId: number) {
  return (
    reader.getEntityClass(stepId) === "IfcSIUnit" &&
    reader.getStringAttribute(stepId, "UnitType") === "LENGTHUNIT"
  );
}

function getPrivacyWarnings(sourceFilePath: string, repoRoot: string) {
  const pathFromRepo = relative(repoRoot, sourceFilePath);
  const isInsideRepo =
    pathFromRepo !== "" &&
    !pathFromRepo.startsWith("..") &&
    !isAbsolute(pathFromRepo);

  return isInsideRepo ? [REPO_LOCAL_IFC_WARNING] : [];
}
