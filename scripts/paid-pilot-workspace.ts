import { resolve } from "node:path";

import {
  createPaidPilotWorkspaceBackup,
  restorePaidPilotWorkspaceBackup,
} from "../src/infrastructure/operations/paidPilotWorkspaceBackup.js";

const operation = process.argv[2];
const databasePath = requiredArgument("--database");
const storageRoot = requiredArgument("--storage");
const outputRoot = requiredArgument("--outputs");
const backupDirectory = requiredArgument("--backup");

if (operation === "backup") {
  const result = await createPaidPilotWorkspaceBackup({
    databasePath,
    storageRoot,
    outputRoot,
    backupDirectory,
  });
  console.log(`Backup verified: ${result.manifestPath}`);
} else if (operation === "restore") {
  await restorePaidPilotWorkspaceBackup({
    databasePath,
    storageRoot,
    outputRoot,
    backupDirectory,
  });
  console.log(`Workspace restored from: ${resolve(backupDirectory)}`);
} else {
  throw new Error("Expected operation: backup or restore.");
}

function requiredArgument(name: string): string {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  const value = inline?.slice(name.length + 1);
  if (!value) throw new Error(`Missing ${name}=<path>.`);
  return resolve(value);
}
