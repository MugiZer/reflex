import { join } from "node:path";

const JOB_ID_PATTERN = /^job_[A-Za-z0-9]+$/;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type JobArtifactPaths = {
  root: string;
  jobDirectory: string;
  evidenceDirectory: string;
  revisionsDirectory: string;
  reportsDirectory: string;
  viewerDirectory: string;
  jobFile(filename: string): string;
  evidenceFile(filename: string): string;
  revisionFile(revisionId: string): string;
  revisionIndexFile(): string;
  reportFile(revisionId: string): string;
  viewerFile(filename: string): string;
};

/**
 * The only path seam for artifacts produced by the asynchronous Job workflow.
 * Content provenance stays in JobRecord.fileHash; artifact addressing uses jobId.
 */
export class LocalJobArtifactStore {
  constructor(private readonly outputRoot: string) {}

  pathsFor(jobId: string): JobArtifactPaths {
    assertJobId(jobId);
    const root = join(this.outputRoot, jobId);
    const jobDirectory = join(root, "job");
    const evidenceDirectory = join(root, "evidence");
    const revisionsDirectory = join(root, "revisions");
    const reportsDirectory = join(root, "reports");
    const viewerDirectory = join(root, "viewer");

    return {
      root,
      jobDirectory,
      evidenceDirectory,
      revisionsDirectory,
      reportsDirectory,
      viewerDirectory,
      jobFile: (filename) => join(jobDirectory, safeArtifactName(filename)),
      evidenceFile: (filename) => join(evidenceDirectory, safeArtifactName(filename)),
      revisionFile: (revisionId) => join(revisionsDirectory, `${safeArtifactName(revisionId)}.json`),
      revisionIndexFile: () => join(revisionsDirectory, "index.json"),
      reportFile: (revisionId) => join(reportsDirectory, `${safeArtifactName(revisionId)}.html`),
      viewerFile: (filename) => join(viewerDirectory, safeArtifactName(filename)),
    };
  }
}

export function assertJobId(jobId: string): void {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(`Invalid Job id: ${jobId}`);
  }
}

function safeArtifactName(name: string): string {
  if (!ARTIFACT_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid artifact name: ${name}`);
  }
  return name;
}
