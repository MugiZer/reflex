import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AssemblyCandidate } from "../src/domain/assemblies/assemblyTypes.js";
import { writeIfcEvidenceArtifacts } from "../src/infrastructure/storage/local-files/writeIfcEvidenceArtifacts.js";
import type { IfcEvidence } from "../src/domain/evidence/evidenceTypes.js";

describe("writeIfcEvidenceArtifacts", () => {
  it("writes the canonical partial evidence artifact set under the file hash", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ifc-evidence-artifacts-"));

    try {
      const result = await writeIfcEvidenceArtifacts({
        outputRoot,
        ifcEvidence: fixtureEvidence(),
      });

      expect(result.evidenceDirectoryPath).toBe(
        join(outputRoot, "hash-123", "evidence"),
      );
      expect(result.writtenArtifactPaths.map((path) => path.slice(outputRoot.length + 1)))
        .toEqual([
          join("hash-123", "evidence", "manifest.json"),
          join("hash-123", "evidence", "file.json"),
          join("hash-123", "evidence", "elements.json"),
          join("hash-123", "evidence", "type-evidence.json"),
          join("hash-123", "evidence", "cited-ifc-entities.json"),
          join("hash-123", "evidence", "diagnostics.json"),
        ]);

      const manifest = await readJson(
        join(outputRoot, "hash-123", "evidence", "manifest.json"),
      );
      expect(manifest).toEqual({
        artifactSchemaVersion: "ifc-evidence-artifacts.v1",
        extractorVersion: "web-ifc-evidence-extractor.v1",
        ifcModelReaderVersion: "web-ifc-model-reader.v1",
        extractionIndexVersion: "ifc-extraction-index.v1",
        relevantElementRulesVersion: "relevant-element-rules.v1",
        groupingPolicyVersion: "not-produced.partial-evidence-only",
        missingDatapointRulesVersion: "not-produced.partial-evidence-only",
        readinessRulesVersion: "not-produced.partial-evidence-only",
        artifactCompleteness: "partial_evidence_only",
        elementArtifactLayout: {
          kind: "single_file",
          path: "elements.json",
          elementCount: 1,
        },
      });

      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "file.json")),
      ).resolves.toEqual(fixtureEvidence().fileEvidence);
      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "elements.json")),
      ).resolves.toEqual(fixtureEvidence().elementEvidence);
      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "type-evidence.json")),
      ).resolves.toEqual(fixtureEvidence().typeEvidence);
      await expect(
        readJson(
          join(outputRoot, "hash-123", "evidence", "cited-ifc-entities.json"),
        ),
      ).resolves.toEqual(fixtureEvidence().citedIfcEntities);
      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "diagnostics.json")),
      ).resolves.toEqual(fixtureEvidence().diagnostics);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("splits element artifacts by class when the threshold is reached", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ifc-evidence-artifacts-"));

    try {
      const evidence = fixtureEvidence();
      evidence.elementEvidence.push({
        ...evidence.elementEvidence[0],
        identity: {
          ...evidence.elementEvidence[0].identity,
          stepId: 20,
          rawEntityClass: "IfcSlab",
          elementClass: "IfcSlab",
        },
      });

      await writeIfcEvidenceArtifacts({
        outputRoot,
        ifcEvidence: evidence,
        splitThresholds: {
          elementCount: 1,
        },
      });

      const manifest = await readJson(
        join(outputRoot, "hash-123", "evidence", "manifest.json"),
      );
      expect(manifest).toEqual(
        expect.objectContaining({
          elementArtifactLayout: {
            kind: "split_by_element_class",
            directory: "elements",
            files: [
              {
                elementClass: "IfcWall",
                path: "elements/walls.json",
                elementCount: 1,
              },
              {
                elementClass: "IfcSlab",
                path: "elements/slabs.json",
                elementCount: 1,
              },
            ],
            elementCount: 2,
          },
        }),
      );
      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "elements", "walls.json")),
      ).resolves.toHaveLength(1);
      await expect(
        readJson(join(outputRoot, "hash-123", "evidence", "elements", "slabs.json")),
      ).resolves.toHaveLength(1);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("writes assembly candidates, missing datapoints, and readiness when candidates are provided", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ifc-evidence-artifacts-"));

    try {
      await writeIfcEvidenceArtifacts({
        outputRoot,
        ifcEvidence: fixtureEvidence(),
        assemblyCandidates: [fixtureAssemblyCandidate()],
        calculationInputEvidence: [
          {
            elementStepId: 10,
            elementGlobalId: "wall-1",
            elementClass: "IfcWall",
            calculationInputBasis: "blocked_missing_evidence",
            fixedInputs: [],
            candidateInputs: [],
            missingInputs: [],
            diagnostics: [],
          },
        ],
        missingDatapoints: [],
        readinessDiagnostics: [
          {
            assemblyCandidateId: "ac_123456789abc",
            sourceElementStepIds: [10],
            sourceElementGlobalIds: ["wall-1"],
            readinessState: "estimated",
            confidence: "low",
            reasons: [],
          },
        ],
      });

      const manifest = await readJson(
        join(outputRoot, "hash-123", "evidence", "manifest.json"),
      );
      expect(manifest).toEqual(
        expect.objectContaining({
          artifactCompleteness: "complete_milestone_1",
          groupingPolicyVersion: "conservative-material-association.v1",
          missingDatapointRulesVersion: "missing-datapoint-rules.v1",
          readinessRulesVersion: "assembly-readiness-rules.v1",
        }),
      );
      await expect(
        readJson(
          join(outputRoot, "hash-123", "evidence", "assembly-candidates.json"),
        ),
      ).resolves.toEqual([fixtureAssemblyCandidate()]);
      await expect(
        readJson(
          join(
            outputRoot,
            "hash-123",
            "evidence",
            "calculation-input-evidence.json",
          ),
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          elementStepId: 10,
          calculationInputBasis: "blocked_missing_evidence",
        }),
      ]);
      await expect(
        readJson(
          join(outputRoot, "hash-123", "evidence", "missing-datapoints.json"),
        ),
      ).resolves.toEqual([]);
      await expect(
        readJson(
          join(
            outputRoot,
            "hash-123",
            "evidence",
            "readiness-diagnostics.json",
          ),
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          assemblyCandidateId: "ac_123456789abc",
          readinessState: "estimated",
          confidence: "low",
        }),
      ]);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function fixtureEvidence(): IfcEvidence {
  return {
    fileEvidence: {
      fileHash: "hash-123",
      schema: "IFC4",
      projectLengthUnitSignal: {
        ifcProjectCount: 0,
        unitsInContextAvailable: false,
        lengthUnitAppearsAvailable: false,
        evidenceReferences: [],
      },
      skippedScopeSummaries: [],
    },
    elementEvidence: [
      {
        identity: {
          stepId: 10,
          globalId: "wall-1",
          rawEntityClass: "IfcWall",
          elementClass: "IfcWall",
          name: "Wall 1",
          objectType: null,
          predefinedType: null,
          tag: null,
          description: null,
          ifcTypeObjectStepId: null,
          classification: {
            classificationConfidence: "high",
            inclusionReason: "Relevant Milestone 1 element class.",
            matchedHints: [],
            needsUserConfirmation: false,
          },
          sourceContext: {
            containerStepId: null,
            storeyName: null,
          },
          evidenceReference: {
            evidencePath: "IfcWall#10",
            sourceStepIds: [10],
            pathParts: [{ stepId: 10, entityClass: "IfcWall" }],
          },
          rawAttributeSnapshot: {},
        },
        directMaterialEvidence: [],
        directPropertySets: [],
        directQuantitySets: [],
        candidatePropertyEvidence: [],
        evidenceReferences: [],
        diagnostics: [],
      },
    ],
    typeEvidence: [],
    citedIfcEntities: [
      {
        stepId: 10,
        entityClass: "IfcWall",
        attributes: { Name: "Wall 1" },
      },
    ],
    skippedScopeSummaries: [],
    diagnostics: [
      {
        code: "ifc_material_entities_present_without_material_associations",
        severity: "warning",
        message: "Relationship gap preserved.",
        stepIds: [30, 31],
      },
    ],
  };
}

function fixtureAssemblyCandidate(): AssemblyCandidate {
  return {
    assemblyCandidateId: "ac_123456789abc",
    sourceElementStepIds: [10],
    sourceElementGlobalIds: ["wall-1"],
    groupingKey: "single_element:IfcWall:10:wall-1",
    groupingBasis: {
      basisKind: "single_element",
      reasons: ["Missing ifcTypeObjectStepId."],
    },
    groupingConfidence: "high",
    groupingSignatures: [],
    groupingDiagnostics: [],
    evidenceSummary: {
      hasLayeredMaterialEvidence: false,
      hasOrderedLayers: false,
      layerCount: 0,
      hasAllLayerThicknesses: false,
      missingLayerThicknessCount: 0,
      hasAllMaterialNames: false,
      missingMaterialNameCount: 0,
      hasAnyLambdaCandidates: false,
      hasAllLambdaCandidates: false,
      missingLambdaCandidateCount: 0,
      hasNonLayeredMaterialEvidence: false,
      hasAssemblyThicknessCandidate: false,
      hasClassificationUncertainty: false,
    },
  };
}
