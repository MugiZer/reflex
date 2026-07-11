import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { runIfcInspectWorkflow } from "../application/ifc/runIfcInspectWorkflow.js";
import type { Diagnostic } from "../domain/evidence/evidenceTypes.js";

type RunInspectFlowCommand = {
  fixtureIfcPath: string;
  repoRoot: string;
  outputRoot: string;
};

type RunInspectFlowResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunMilestone1VerifierCommand = {
  fixtureIfcPath: string;
  repoRoot?: string;
  outputRoot?: string;
  runInspectFlow?: (
    command: RunInspectFlowCommand,
  ) => Promise<RunInspectFlowResult>;
};

export type RunMilestone1VerifierResult = {
  passed: boolean;
  diagnostics: Diagnostic[];
  artifactPaths: string[];
};

const expectedEvidenceArtifacts = [
  "file.json",
  "type-evidence.json",
  "cited-ifc-entities.json",
  "diagnostics.json",
  "assembly-candidates.json",
  "calculation-input-evidence.json",
  "missing-datapoints.json",
  "readiness-diagnostics.json",
];

export async function runMilestone1Verifier(
  command: RunMilestone1VerifierCommand,
): Promise<RunMilestone1VerifierResult> {
  const repoRoot = resolve(command.repoRoot ?? process.cwd());
  const outputRoot = resolve(command.outputRoot ?? join(repoRoot, "outputs"));
  const fixtureIfcPath = resolve(command.fixtureIfcPath);
  const diagnostics: Diagnostic[] = [];

  if (!existsSync(fixtureIfcPath)) {
    return fail("milestone_1_fixture_missing", "Provided IFC path does not exist.");
  }

  if (isRepoLocalPath(fixtureIfcPath, repoRoot)) {
    diagnostics.push({
      code: "milestone_1_private_ifc_inside_repo",
      severity: "warning",
      message:
        "Provided IFC path is inside the repository. Private IFC files must stay outside repo fixtures.",
    });
  }

  const flowResult = await (command.runInspectFlow ?? runCliInspectFlow)({
    fixtureIfcPath,
    repoRoot,
    outputRoot,
  });

  if (flowResult.exitCode !== 0) {
    return {
      passed: false,
      artifactPaths: [],
      diagnostics: [
        {
          code: "milestone_1_parser_or_open_failure",
          severity: "error",
          message: conciseFailureMessage(flowResult),
        },
      ],
    };
  }

  const fileHash =
    parseFileHash(flowResult) ?? (await findNewestOutputHash(outputRoot));
  if (fileHash === null) {
    return fail(
      "milestone_1_incomplete_evidence_artifacts",
      "CLI completed but no output hash directory was produced.",
    );
  }

  const root = join(outputRoot, fileHash);
  const manifestPath = join(root, "evidence", "manifest.json");
  const preliminaryArtifactPaths = [join(root, "smoke.json"), manifestPath];

  const missingPreliminaryPaths = preliminaryArtifactPaths.filter(
    (path) => !existsSync(path),
  );
  if (missingPreliminaryPaths.length > 0) {
    return {
      passed: false,
      artifactPaths: preliminaryArtifactPaths,
      diagnostics: [
        ...diagnostics,
        {
          code: "milestone_1_incomplete_evidence_artifacts",
          severity: "error",
          message: `Missing expected artifact(s): ${missingPreliminaryPaths.map((path) => relative(root, path)).join(", ")}`,
        },
      ],
    };
  }

  const manifest = await readJson(manifestPath);
  const elementArtifactPaths = getElementArtifactPaths(root, manifest);
  const artifactPaths = [
    join(root, "smoke.json"),
    join(root, "evidence", "manifest.json"),
    ...elementArtifactPaths,
    ...expectedEvidenceArtifacts.map((name) => join(root, "evidence", name)),
    join(root, "diagnostics.md"),
  ];

  const missingPaths = artifactPaths.filter((path) => !existsSync(path));
  if (missingPaths.length > 0) {
    return {
      passed: false,
      artifactPaths,
      diagnostics: [
        ...diagnostics,
        {
          code: "milestone_1_incomplete_evidence_artifacts",
          severity: "error",
          message: `Missing expected artifact(s): ${missingPaths.map((path) => relative(root, path)).join(", ")}`,
        },
      ],
    };
  }

  const smoke = await readJson(join(root, "smoke.json"));
  if (!isRecord(smoke) || smoke.canonical !== false) {
    return fail(
      "milestone_1_invalid_smoke_artifact",
      "smoke.json must exist and be marked canonical: false.",
      artifactPaths,
      diagnostics,
    );
  }

  if (
    !isRecord(manifest) ||
    manifest.artifactCompleteness !== "complete_milestone_1"
  ) {
    return fail(
      "milestone_1_incomplete_manifest",
      "manifest.json must mark artifactCompleteness as complete_milestone_1.",
      artifactPaths,
      diagnostics,
    );
  }

  return {
    passed: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    artifactPaths,
    diagnostics: [
      ...diagnostics,
      {
        code: "milestone_1_verifier_passed",
        severity: "info",
        message:
          "Full Milestone 1 CLI flow produced smoke, canonical evidence artifacts, missing datapoints, readiness diagnostics, and diagnostics.md.",
      },
    ],
  };

  function fail(
    code: string,
    message: string,
    artifactPaths: string[] = [],
    priorDiagnostics: Diagnostic[] = [],
  ): RunMilestone1VerifierResult {
    return {
      passed: false,
      artifactPaths,
      diagnostics: [
        ...priorDiagnostics,
        {
          code,
          severity: "error",
          message,
        },
      ],
    };
  }
}

function parseFileHash(result: RunInspectFlowResult): string | null {
  const match = [result.stdout, result.stderr]
    .join("\n")
    .match(/File hash:\s*([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

function getElementArtifactPaths(root: string, manifest: unknown): string[] {
  if (!isRecord(manifest) || !isRecord(manifest.elementArtifactLayout)) {
    return [join(root, "evidence", "elements.json")];
  }

  const layout = manifest.elementArtifactLayout;
  if (layout.kind === "single_file" && typeof layout.path === "string") {
    return [join(root, "evidence", layout.path)];
  }

  if (layout.kind === "split_by_element_class" && Array.isArray(layout.files)) {
    return layout.files.flatMap((file) =>
      isRecord(file) && typeof file.path === "string"
        ? [join(root, "evidence", file.path)]
        : [],
    );
  }

  return [join(root, "evidence", "elements.json")];
}

async function runCliInspectFlow(
  command: RunInspectFlowCommand,
): Promise<RunInspectFlowResult> {
  const result = await runIfcInspectWorkflow({
    sourceFilePath: command.fixtureIfcPath,
    repoRoot: command.repoRoot,
    outputRoot: command.outputRoot,
  });
  return result.ok
    ? {
        exitCode: 0,
        stdout: `File hash: ${result.fileHash}`,
        stderr: "",
      }
    : {
        exitCode: 1,
        stdout: "",
        stderr: `${result.failureType}: ${result.message}`,
      };
}

async function findNewestOutputHash(outputRoot: string): Promise<string | null> {
  if (!existsSync(outputRoot)) {
    return null;
  }

  const entries = await readdir(outputRoot);
  const hashEntries = await Promise.all(
    entries.map(async (entry) => {
      const path = join(outputRoot, entry);
      const entryStat = await stat(path);
      return entryStat.isDirectory()
        ? { entry, mtimeMs: entryStat.mtimeMs }
        : null;
    }),
  );

  return (
    hashEntries
      .filter((entry): entry is { entry: string; mtimeMs: number } => entry !== null)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.entry ?? null
  );
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function isRepoLocalPath(path: string, repoRoot: string): boolean {
  const relativePath = relative(repoRoot, path);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

function conciseFailureMessage(result: RunInspectFlowResult): string {
  const output = [result.stderr, result.stdout].join("\n").trim();
  return output.length > 0
    ? `CLI failed before artifact completeness checks: ${output.slice(0, 500)}`
    : "CLI failed before artifact completeness checks.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
