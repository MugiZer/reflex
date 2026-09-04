import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type SavedUpload = {
  jobId: string;
  uploadPath: string;
  fileHash: string;
};

export class LocalJobFileStorage {
  constructor(private readonly storageRoot: string) {}

  async saveUpload(command: {
    originalFilename: string;
    content: Buffer;
  }): Promise<SavedUpload> {
    const jobId = `job_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const safeName = basename(command.originalFilename).replace(/[^a-zA-Z0-9._-]/g, "_") || "source.ifc";
    const uploadDir = join(this.storageRoot, "uploads", jobId);
    await mkdir(uploadDir, { recursive: true });
    const uploadPath = join(uploadDir, safeName);
    await writeFile(uploadPath, command.content);
    return {
      jobId,
      uploadPath,
      fileHash: createHash("sha256").update(command.content).digest("hex"),
    };
  }

  async readUpload(jobId: string, uploadPath: string): Promise<Buffer> {
    if (!uploadPath.includes(jobId)) {
      throw new Error("Upload path is not scoped by Job id.");
    }
    return readFile(uploadPath);
  }
}
