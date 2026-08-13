import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const MANIFEST_SCHEMA = "paid-pilot-workspace-backup/v1";

type BackupManifest = {
  schema: typeof MANIFEST_SCHEMA;
  createdAt: string;
  restoreTargetHashes: {
    databasePath: string;
    storageRoot: string;
    outputRoot: string;
  };
  files: Array<{ path: string; sha256: string; sizeBytes: number }>;
};

export async function createPaidPilotWorkspaceBackup(command: {
  databasePath: string;
  storageRoot: string;
  outputRoot: string;
  backupDirectory: string;
}): Promise<{ manifestPath: string }> {
  const targets = resolvedTargets(command);
  const backupDirectory = resolve(command.backupDirectory);
  assertSeparateBackupDirectory(backupDirectory, targets);
  await Promise.all([access(targets.databasePath), access(targets.storageRoot), access(targets.outputRoot)]);
  await mkdir(dirname(backupDirectory), { recursive: true });
  await mkdir(backupDirectory);
  await mkdir(join(backupDirectory, "database"), { recursive: true });
  await cp(targets.databasePath, join(backupDirectory, "database", "app.db"));
  await cp(targets.storageRoot, join(backupDirectory, "storage"), { recursive: true });
  await cp(targets.outputRoot, join(backupDirectory, "outputs"), { recursive: true });
  const manifest: BackupManifest = {
    schema: MANIFEST_SCHEMA,
    createdAt: new Date().toISOString(),
    restoreTargetHashes: hashedTargets(targets),
    files: await inventory(backupDirectory),
  };
  const manifestPath = join(backupDirectory, "manifest.json");
  const temporary = `${manifestPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, manifestPath);
  return { manifestPath };
}

export async function restorePaidPilotWorkspaceBackup(command: {
  backupDirectory: string;
  databasePath: string;
  storageRoot: string;
  outputRoot: string;
}): Promise<void> {
  const backupDirectory = resolve(command.backupDirectory);
  const targets = resolvedTargets(command);
  const manifest = parseManifest(await readFile(join(backupDirectory, "manifest.json"), "utf8"));
  if (JSON.stringify(manifest.restoreTargetHashes) !== JSON.stringify(hashedTargets(targets))) {
    throw new Error("Backup restore targets do not match the original isolated workspace paths.");
  }
  await verifyInventory(backupDirectory, manifest.files);
  for (const path of [targets.databasePath, targets.storageRoot, targets.outputRoot]) {
    if (await exists(path)) throw new Error(`Restore target already exists: ${path}`);
  }
  await mkdir(dirname(targets.databasePath), { recursive: true });
  await cp(join(backupDirectory, "database", "app.db"), targets.databasePath);
  await cp(join(backupDirectory, "storage"), targets.storageRoot, { recursive: true });
  await cp(join(backupDirectory, "outputs"), targets.outputRoot, { recursive: true });
}

function resolvedTargets(command: { databasePath: string; storageRoot: string; outputRoot: string }) {
  return {
    databasePath: resolve(command.databasePath),
    storageRoot: resolve(command.storageRoot),
    outputRoot: resolve(command.outputRoot),
  };
}

function hashedTargets(targets: ReturnType<typeof resolvedTargets>) {
  return {
    databasePath: createHash("sha256").update(targets.databasePath).digest("hex"),
    storageRoot: createHash("sha256").update(targets.storageRoot).digest("hex"),
    outputRoot: createHash("sha256").update(targets.outputRoot).digest("hex"),
  };
}

function assertSeparateBackupDirectory(backupDirectory: string, targets: ReturnType<typeof resolvedTargets>): void {
  for (const source of [targets.databasePath, targets.storageRoot, targets.outputRoot]) {
    const sourceRoot = source === targets.databasePath ? dirname(source) : source;
    if (backupDirectory === sourceRoot || backupDirectory.startsWith(`${sourceRoot}${sep}`)) {
      throw new Error("Backup directory must be outside the active paid-pilot workspace.");
    }
  }
}

async function inventory(root: string): Promise<BackupManifest["files"]> {
  const files = await listFiles(root);
  return Promise.all(files.map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
    };
  }));
}

async function verifyInventory(root: string, expected: BackupManifest["files"]): Promise<void> {
  const actual = await inventory(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Backup contents failed integrity verification.");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "manifest.json" || entry.name.endsWith(".tmp")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function parseManifest(content: string): BackupManifest {
  const value = JSON.parse(content) as Partial<BackupManifest>;
  if (value.schema !== MANIFEST_SCHEMA || !value.restoreTargetHashes || !Array.isArray(value.files)) {
    throw new Error("Paid-pilot backup manifest is invalid.");
  }
  if (Object.values(value.restoreTargetHashes).some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("Paid-pilot backup restore targets are invalid.");
  }
  if (value.files.some((file) => !file || typeof file.path !== "string" || file.path.includes("..") || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0)) {
    throw new Error("Paid-pilot backup file inventory is invalid.");
  }
  return value as BackupManifest;
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}
