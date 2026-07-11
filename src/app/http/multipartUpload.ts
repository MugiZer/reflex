import type { IncomingMessage } from "node:http";
import { extname } from "node:path";

export async function parseMultipartUpload(req: IncomingMessage): Promise<{
  filename: string;
  content: Buffer;
}> {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) {
    throw new Error("Expected multipart upload.");
  }
  const body = await readBuffer(req);
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
      throw new Error("Expected a non-empty IFC upload.");
    }
    return { filename, content };
  }
  throw new Error('Missing multipart file field "ifc".');
}

export async function readBuffer(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
