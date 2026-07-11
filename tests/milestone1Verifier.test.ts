import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runMilestone1Verifier } from "../src/verifier/runMilestone1Verifier.js";

describe("runMilestone1Verifier", () => {
  it("passes when the full CLI flow produces the Milestone 1 artifact set", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1-verifier-"));
    const ifcPath = join(tmpdir(), "private-barclay.ifc");

    try {
      await writeFile(ifcPath, "private ifc bytes");
      const result = await runMilestone1Verifier({
        fixtureIfcPath: ifcPath,
        repoRoot: root,
        outputRoot: join(root, "outputs"),
        runInspectFlow: async ({ outputRoot }) => {
          await writeArtifactSet(outputRoot, "hash-123", {
            manifestCompleteness: "complete_milestone_1",
            smokeCanonical: false,
          });
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      });

      expect(result.passed).toBe(true);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "milestone_1_verifier_passed" }),
      ]);
      expect(result.artifactPaths.map((path) => path.replaceAll("\\", "/")))
        .toEqual(expect.arrayContaining([
          expect.stringContaining("outputs/hash-123/smoke.json"),
          expect.stringContaining("outputs/hash-123/evidence/manifest.json"),
          expect.stringContaining("outputs/hash-123/evidence/file.json"),
          expect.stringContaining("outputs/hash-123/evidence/elements.json"),
          expect.stringContaining("outputs/hash-123/evidence/type-evidence.json"),
          expect.stringContaining("outputs/hash-123/evidence/cited-ifc-entities.json"),
          expect.stringContaining("outputs/hash-123/evidence/diagnostics.json"),
          expect.stringContaining("outputs/hash-123/evidence/assembly-candidates.json"),
          expect.stringContaining("outputs/hash-123/evidence/calculation-input-evidence.json"),
          expect.stringContaining("outputs/hash-123/evidence/missing-datapoints.json"),
          expect.stringContaining("outputs/hash-123/evidence/readiness-diagnostics.json"),
          expect.stringContaining("outputs/hash-123/diagnostics.md"),
        ]));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(ifcPath, { force: true });
    }
  });

  it("reports parser/open failures separately from incomplete evidence artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1-verifier-"));
    const ifcPath = join(tmpdir(), "private-broken.ifc");

    try {
      await writeFile(ifcPath, "broken ifc bytes");
      const result = await runMilestone1Verifier({
        fixtureIfcPath: ifcPath,
        repoRoot: root,
        outputRoot: join(root, "outputs"),
        runInspectFlow: async () => ({
          exitCode: 1,
          stdout: "",
          stderr: "IFC smoke inspection failed: parse_error",
        }),
      });

      expect(result.passed).toBe(false);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "milestone_1_parser_or_open_failure",
          severity: "error",
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(ifcPath, { force: true });
    }
  });

  it("verifies the file hash printed by the current CLI run instead of stale newest output", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1-verifier-"));
    const ifcPath = join(tmpdir(), "private-current.ifc");

    try {
      await writeFile(ifcPath, "private ifc bytes");
      await writeArtifactSet(join(root, "outputs"), "stale-hash", {
        manifestCompleteness: "complete_milestone_1",
        smokeCanonical: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await runMilestone1Verifier({
        fixtureIfcPath: ifcPath,
        repoRoot: root,
        outputRoot: join(root, "outputs"),
        runInspectFlow: async ({ outputRoot }) => {
          await writeArtifactSet(outputRoot, "current-hash", {
            manifestCompleteness: "complete_milestone_1",
            smokeCanonical: false,
          });
          await writeArtifactSet(outputRoot, "newer-but-wrong-hash", {
            manifestCompleteness: "partial_evidence_only",
            smokeCanonical: false,
          });
          return { exitCode: 0, stdout: "File hash: current-hash", stderr: "" };
        },
      });

      expect(result.passed).toBe(true);
      expect(result.artifactPaths[0].replaceAll("\\", "/")).toContain(
        "outputs/current-hash/smoke.json",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(ifcPath, { force: true });
    }
  });

  it("uses manifest element artifact layout when elements are split by class", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1-verifier-"));
    const ifcPath = join(tmpdir(), "private-split.ifc");

    try {
      await writeFile(ifcPath, "private ifc bytes");
      const result = await runMilestone1Verifier({
        fixtureIfcPath: ifcPath,
        repoRoot: root,
        outputRoot: join(root, "outputs"),
        runInspectFlow: async ({ outputRoot }) => {
          await writeArtifactSet(outputRoot, "hash-123", {
            manifestCompleteness: "complete_milestone_1",
            smokeCanonical: false,
            splitElements: true,
          });
          return { exitCode: 0, stdout: "File hash: hash-123", stderr: "" };
        },
      });

      expect(result.passed).toBe(true);
      expect(result.artifactPaths.map((path) => path.replaceAll("\\", "/")))
        .toEqual(
          expect.arrayContaining([
            expect.stringContaining("outputs/hash-123/evidence/elements/walls.json"),
          ]),
        );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(ifcPath, { force: true });
    }
  });
});

async function writeArtifactSet(
  outputRoot: string,
  fileHash: string,
  command: {
    manifestCompleteness: string;
    smokeCanonical: boolean;
    splitElements?: boolean;
  },
) {
  const root = join(outputRoot, fileHash);
  const evidenceRoot = join(root, "evidence");
  await mkdir(evidenceRoot, { recursive: true });
  await writeJson(join(root, "smoke.json"), {
    canonical: command.smokeCanonical,
  });
  await writeJson(join(evidenceRoot, "manifest.json"), {
    artifactCompleteness: command.manifestCompleteness,
    elementArtifactLayout: command.splitElements
      ? {
          kind: "split_by_element_class",
          directory: "elements",
          files: [
            {
              elementClass: "IfcWall",
              path: "elements/walls.json",
              elementCount: 1,
            },
          ],
          elementCount: 1,
        }
      : {
          kind: "single_file",
          path: "elements.json",
          elementCount: 1,
        },
  });
  const artifactNames = [
    "file.json",
    "type-evidence.json",
    "cited-ifc-entities.json",
    "diagnostics.json",
    "assembly-candidates.json",
    "calculation-input-evidence.json",
    "missing-datapoints.json",
    "readiness-diagnostics.json",
  ];
  for (const name of artifactNames) {
    await writeJson(join(evidenceRoot, name), []);
  }
  if (command.splitElements) {
    await mkdir(join(evidenceRoot, "elements"), { recursive: true });
    await writeJson(join(evidenceRoot, "elements", "walls.json"), []);
  } else {
    await writeJson(join(evidenceRoot, "elements.json"), []);
  }
  await writeFile(join(root, "diagnostics.md"), "# IFC Evidence Review\n", "utf8");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
