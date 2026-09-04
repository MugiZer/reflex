import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Revision, RevisionIndex } from "../../../domain/revisions/revisionTypes.js";
import { LocalJobArtifactStore } from "./jobArtifactStore.js";

export type WriteRevisionArtifactsResult = {
  revisionFilePath: string;
  revisionIndexFilePath: string;
};

export async function writeRevisionArtifacts(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot?: string;
  jobId?: string;
  fileHash?: string;
  revision: Revision;
}): Promise<WriteRevisionArtifactsResult> {
  const paths = artifactPaths(command);
  const revisionFilePath = paths.revisionFile(command.revision.revisionId);
  const revisionIndexFilePath = paths.revisionIndexFile();
  await mkdir(dirname(revisionFilePath), { recursive: true });

  await writeFile(revisionFilePath, JSON.stringify(command.revision, null, 2), "utf8");
  const existingIndex = await readExistingIndex(revisionIndexFilePath);
  const revisionIds = Array.from(
    new Set([...existingIndex.revisionIds, command.revision.revisionId]),
  );
  const nextIndex: RevisionIndex = {
    activeRevisionId: command.revision.revisionId,
    revisionIds,
  };
  await writeFile(revisionIndexFilePath, JSON.stringify(nextIndex, null, 2), "utf8");

  return { revisionFilePath, revisionIndexFilePath };
}

export async function restoreActiveRevisionIndex(command: { artifactStore: LocalJobArtifactStore; jobId: string; activeRevisionId: string | null }): Promise<void> {
  const path = command.artifactStore.pathsFor(command.jobId).revisionIndexFile();
  const existing = await readExistingIndex(path);
  const revisionIds = command.activeRevisionId === null ? existing.revisionIds : Array.from(new Set([...existing.revisionIds, command.activeRevisionId]));
  await writeFile(path, JSON.stringify({ activeRevisionId: command.activeRevisionId ?? "", revisionIds }, null, 2), "utf8");
}

function artifactPaths(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot?: string;
  jobId?: string;
  fileHash?: string;
}) {
  const store = command.artifactStore ?? new LocalJobArtifactStore(command.outputRoot ?? "outputs");
  return store.pathsFor(command.jobId ?? legacyJobId(command.fileHash ?? "unknown"));
}
function legacyJobId(fileHash: string): string {
  return fileHash.startsWith("job_") ? fileHash : `job_${fileHash.replace(/[^A-Za-z0-9]/g, "")}`;
}

async function readExistingIndex(path: string): Promise<RevisionIndex> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RevisionIndex;
  } catch {
    return {
      activeRevisionId: "",
      revisionIds: [],
    };
  }
}
