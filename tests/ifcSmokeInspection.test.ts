import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { inspectIfcSmoke } from "../src/domain/evidence/smoke/inspectIfcSmoke.js";
import type { IfcSmokeModelReader } from "../src/domain/evidence/smoke/ifcSmokeTypes.js";
import type {
  CitedIfcEntity,
  IfcEntityRecord,
  IfcHeaderEvidence,
  StepId,
} from "../src/domain/evidence/evidenceTypes.js";

class FakeSmokeModelReader implements IfcSmokeModelReader {
  constructor(
    private readonly counts: Record<string, StepId[]>,
    private readonly unitSignal = {
      ifcProjectCount: 1,
      unitsInContextAvailable: true,
      lengthUnitAppearsAvailable: true,
    },
  ) {}

  getHeader(): IfcHeaderEvidence {
    return { schema: "IFC4" };
  }

  getSchema() {
    return "IFC4";
  }

  hasEntityClass(entityClass: string) {
    return this.getEntitiesByClass(entityClass).length > 0;
  }

  getEntitiesByClass(entityClass: string) {
    const stepIds = this.counts[entityClass] ?? [];
    return stepIds.map((stepId) => ({
      stepId,
      entityClass,
      attributes: {},
    }));
  }

  getEntity(stepId: StepId): IfcEntityRecord | null {
    const entityClass =
      Object.entries(this.counts).find(([, stepIds]) =>
        stepIds.includes(stepId),
      )?.[0] ?? null;

    return entityClass === null
      ? null
      : {
          stepId,
          entityClass,
          attributes: {},
        };
  }

  getEntityClass(stepId: StepId) {
    return this.getEntity(stepId)?.entityClass ?? null;
  }

  getStringAttribute(stepId: StepId, attributeName: string) {
    if (
      this.unitSignal.lengthUnitAppearsAvailable &&
      this.getEntityClass(stepId) === "IfcSIUnit" &&
      attributeName === "UnitType"
    ) {
      return "LENGTHUNIT";
    }

    return null;
  }

  getNumberAttribute() {
    return null;
  }

  getBooleanAttribute() {
    return null;
  }

  getEntityReference(stepId: StepId, attributeName: string) {
    if (
      this.unitSignal.unitsInContextAvailable &&
      this.getEntityClass(stepId) === "IfcProject" &&
      attributeName === "UnitsInContext"
    ) {
      return 101;
    }

    return null;
  }

  getEntityReferenceList(stepId: StepId, attributeName: string) {
    if (
      this.unitSignal.lengthUnitAppearsAvailable &&
      stepId === 101 &&
      attributeName === "Units"
    ) {
      return [102];
    }

    return [];
  }

  getCompactEntitySnapshot(stepId: StepId): CitedIfcEntity {
    const entity = this.getEntity(stepId);
    return {
      stepId,
      entityClass: entity?.entityClass ?? null,
      attributes: entity?.attributes ?? {},
    };
  }

  close() {}
}

describe("inspectIfcSmoke", () => {
  it("writes a non-canonical smoke artifact without private model evidence", async () => {
    const tempRoot = await makeTempDir();
    const sourceFilePath = join(tempRoot, "fixture.ifc");
    await writeFile(sourceFilePath, "private ifc bytes");

    const fileHash = createHash("sha256")
      .update("private ifc bytes")
      .digest("hex");

    const result = await inspectIfcSmoke({
      sourceFilePath,
      outputRoot: join(tempRoot, "outputs"),
      repoRoot: join(tempRoot, "repo"),
      createReader: async () =>
        new FakeSmokeModelReader({
          IfcProject: [100],
          IfcSIUnit: [102],
          IfcWall: [11, 12, 13, 14, 15, 16],
          IfcSlab: [],
          IfcRelAssociatesMaterial: [101],
        }),
    });

    expect(result.fileHash).toBe(fileHash);
    expect(result.smokeArtifactPath).toBe(
      join(tempRoot, "outputs", fileHash, "smoke.json"),
    );

    const artifact = JSON.parse(
      await readFile(result.smokeArtifactPath, "utf8"),
    );

    expect(artifact.canonical).toBe(false);
    expect(artifact.nonCanonicalMarker).toContain("non-canonical");
    expect(artifact.fileHash).toBe(fileHash);
    expect(artifact.schema).toBe("IFC4");
    expect(artifact.projectLengthUnitSignal.lengthUnitAppearsAvailable).toBe(
      true,
    );
    expect(artifact.counts.IfcWall).toEqual({
      total: 6,
      sampleStepIds: [11, 12, 13, 14, 15],
    });
    expect(artifact.counts.IfcSlab).toEqual({
      total: 0,
      sampleStepIds: [],
    });

    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain("GlobalId");
    expect(serialized).not.toContain("ObjectType");
    expect(serialized).not.toContain("Description");
    expect(serialized).not.toContain("materialName");
    expect(serialized).not.toContain(sourceFilePath);
  });

  it("warns when the source IFC is inside the repo", async () => {
    const tempRoot = await makeTempDir();
    const repoRoot = join(tempRoot, "repo");
    await mkdir(repoRoot, { recursive: true });
    const sourceFilePath = join(repoRoot, "private.ifc");
    await writeFile(sourceFilePath, "repo-local ifc bytes");

    const result = await inspectIfcSmoke({
      sourceFilePath,
      outputRoot: join(tempRoot, "outputs"),
      repoRoot,
      createReader: async () => new FakeSmokeModelReader({}),
    });

    expect(result.warnings).toContain(
      "Source IFC appears to be inside the repository. Keep private IFC files outside the repo and do not commit them.",
    );
  });
});

async function makeTempDir() {
  const path = join(tmpdir(), `ifc-smoke-${randomUUID()}`);
  await mkdir(path, {
    recursive: true,
  });
  return path;
}
