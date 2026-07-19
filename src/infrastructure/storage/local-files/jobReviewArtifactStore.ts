import { readFile } from "node:fs/promises";

import type { CalculationInputEvidence } from "../../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Revision } from "../../../domain/revisions/revisionTypes.js";
import { LocalJobArtifactStore } from "./jobArtifactStore.js";

export async function readCalculationInputEvidenceArtifact(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot?: string;
  jobId: string;
}): Promise<CalculationInputEvidence[] | null> {
  const parsed = await readJsonArtifact<unknown>(
    artifactPaths(command).evidenceFile("calculation-input-evidence.json"),
    "calculation input evidence",
  );
  if (parsed === null) {
    return null;
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Calculation input evidence artifact is invalid.");
  }
  return parsed as CalculationInputEvidence[];
}

export async function readActiveRevisionArtifact(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot?: string;
  jobId: string;
  activeRevisionId: string | null;
}): Promise<Revision | null> {
  if (command.activeRevisionId === null) {
    return null;
  }
  const revision = await readJsonArtifact<unknown>(
    artifactPaths(command).revisionFile(command.activeRevisionId),
    "active revision",
  );
  if (revision === null) {
    throw new Error(`Active revision artifact is missing: ${command.activeRevisionId}.`);
  }
  if (!isRevision(revision)) {
    throw new Error(`Active revision artifact is invalid: ${command.activeRevisionId}.`);
  }
  return revision;
}

function artifactPaths(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot?: string;
  jobId: string;
}) {
  const store = command.artifactStore ?? new LocalJobArtifactStore(command.outputRoot ?? "outputs");
  return store.pathsFor(command.jobId);
}
async function readJsonArtifact<T>(path: string, label: string): Promise<T | null> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw new Error(`Unable to read ${label} artifact: ${errorMessage(error)}`);
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Unable to parse ${label} artifact.`);
  }
}

function isRevision(value: unknown): value is Revision {
  return isRecord(value) &&
    typeof value.revisionId === "string" &&
    Array.isArray(value.userInputs) &&
    Array.isArray(value.calculationSnapshots);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(error: unknown): error is { code: string } {
  return isRecord(error) && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
