import type { IncomingMessage } from "node:http";
import { extname } from "node:path";

import { ApplicationFailure } from "../../application/applicationFailure.js";

export const DEFAULT_MAX_IFC_UPLOAD_BYTES = 256 * 1024 * 1024;

export async function parseMultipartUpload(req: IncomingMessage, options: {
  maxBytes?: number;
} = {}): Promise<{
  filename: string;
  content: Buffer;
}> {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) {
    throw invalidUpload("Expected a multipart IFC upload.");
  }
  const body = await readBuffer(req, options.maxBytes ?? DEFAULT_MAX_IFC_UPLOAD_BYTES);
  const marker = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, marker);
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      continue;
    }
    const header = part.subarray(0, headerEnd).toString("utf8");
    if (!header.includes('name="ifc"')) {
      continue;
    }
    const filename = header.match(/filename="([^"]+)"/)?.[1] ?? "source.ifc";
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(0, 2).toString() === "\r\n") {
      content = content.subarray(2);
    }
    if (content.subarray(-2).toString() === "\r\n") {
      content = content.subarray(0, -2);
    }
    if (content.length === 0 || !allowedIfcExtension(filename)) {
      throw invalidUpload("Expected a non-empty IFC upload with a supported IFC extension.");
    }
    return { filename, content };
  }
  throw invalidUpload('Missing multipart file field "ifc".');
}

export async function readBuffer(req: IncomingMessage, maxBytes = Number.POSITIVE_INFINITY): Promise<Buffer> {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw uploadTooLarge();
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += bytes.length;
    if (receivedBytes > maxBytes) throw uploadTooLarge();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function uploadTooLarge(): ApplicationFailure {
  return new ApplicationFailure(
    "payload_too_large",
    "upload_too_large",
    "The IFC upload exceeds the configured size limit.",
  );
}

function invalidUpload(message: string): ApplicationFailure {
  return new ApplicationFailure("invalid_input", "invalid_upload", message);
}

function allowedIfcExtension(filename: string): boolean {
  return [".ifc", ".ifczip", ".ifcxml", ""].includes(extname(filename).toLowerCase());
}

function splitBuffer(buffer: Buffer, separator: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    if (index > start) {
      parts.push(buffer.subarray(start, index));
    }
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  if (start < buffer.length) {
    parts.push(buffer.subarray(start));
  }
  return parts.filter((part) => !part.toString("utf8").startsWith("--"));
}
