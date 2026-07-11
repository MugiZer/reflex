import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { extractIfcEvidenceFromReader } from "../../../domain/evidence/extractIfcEvidenceFromReader.js";
import type {
  ExtractIfcEvidenceCommand,
  ExtractIfcEvidenceResult,
  IfcEvidenceExtractor,
  IfcModelReader,
} from "../../../domain/evidence/evidenceTypes.js";
import { WebIfcModelReader } from "./WebIfcModelReader.js";

export class WebIfcEvidenceExtractor implements IfcEvidenceExtractor {
  constructor(
    private readonly options: {
      openReader?: (sourceFilePath: string) => Promise<IfcModelReader>;
    } = {},
  ) {}

  async extract(
    command: ExtractIfcEvidenceCommand,
  ): Promise<ExtractIfcEvidenceResult> {
    if (this.options.openReader) {
      let reader: IfcModelReader;
      try {
        reader = await this.options.openReader(command.sourceFilePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure("parse_error", message);
      }

      try {
        return extractIfcEvidenceFromReader(reader, {
          fileHash: command.fileHash,
        });
      } finally {
        reader.close();
      }
    }

    let sourceFileBytes: Uint8Array;

    try {
      sourceFileBytes = await readFile(command.sourceFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure("file_read_error", message);
    }

    let reader: WebIfcModelReader;
    try {
      reader = await WebIfcModelReader.open(sourceFileBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure("parse_error", message);
    }

    try {
      return extractIfcEvidenceFromReader(reader, {
        fileHash:
          command.fileHash ??
          createHash("sha256").update(sourceFileBytes).digest("hex"),
      });
    } finally {
      reader.close();
    }
  }
}

function failure(
  failureType: "file_read_error" | "parse_error" | "internal_error",
  message: string,
): ExtractIfcEvidenceResult {
  return {
    ok: false,
    failureType,
    message,
    diagnostics: [
      {
        code: `ifc_evidence_extract_${failureType}`,
        severity: "error",
        message,
      },
    ],
  };
}
