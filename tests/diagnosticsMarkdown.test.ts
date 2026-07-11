import type { AssemblyCandidate } from "../src/domain/assemblies/assemblyTypes.js";
import { generateDiagnosticsMarkdown } from "../src/application/reports/generateDiagnosticsMarkdown.js";
import type { AssemblyReadinessDiagnostic } from "../src/domain/evidence/evidenceArtifactTypes.js";
import type { EvidenceArtifactManifest, IfcEvidence } from "../src/domain/evidence/evidenceTypes.js";

describe("generateDiagnosticsMarkdown", () => {
  it("renders architect-facing diagnostics from structured artifacts", () => {
    const markdown = generateDiagnosticsMarkdown({
      manifest: manifest(),
      fileEvidence: evidence().fileEvidence,
      elementEvidence: evidence().elementEvidence,
      typeEvidence: evidence().typeEvidence,
      diagnostics: evidence().diagnostics,
      assemblyCandidates: [assemblyCandidate()],
      missingDatapoints: [
        {
          field: "layer_lambda",
          severity: "required_for_layered_calculation",
          reason: "1 layer lambda candidate is missing.",
          userFixable: true,
          userQuestionLevel: "material",
          suggestedUserQuestion: "What thermal conductivity should be used?",
          bimSourceFixRecommended: true,
          bimSourceFixHint: "Add thermal conductivity to material properties.",
          evidenceChecked: [
            {
              evidencePath: "IfcMaterialLayerSet#200",
              sourceStepIds: [200],
              pathParts: [{ stepId: 200, entityClass: "IfcMaterialLayerSet" }],
            },
          ],
          affectedElementIds: ["wall-a"],
          affectedElementStepIds: [10],
        },
      ],
      readinessDiagnostics: [
        {
          assemblyCandidateId: "ac_test",
          sourceElementStepIds: [10],
          sourceElementGlobalIds: ["wall-a"],
          readinessState: "needs_review",
          confidence: "medium",
          reasons: [
            {
              code: "assembly_needs_review_for_missing_datapoints",
              severity: "warning",
              message: "Assembly Candidate has user-fixable missing datapoints.",
              stepIds: [10],
            },
          ],
        },
      ],
      artifactIndex: [
        "evidence/manifest.json",
        "evidence/missing-datapoints.json",
        "evidence/readiness-diagnostics.json",
      ],
    });

    expect(markdown).toContain("# IFC Evidence Review");
    expect(markdown).toContain("## File Summary");
    expect(markdown).toContain("## What We Could Verify");
    expect(markdown).toContain("## What Needs Review");
    expect(markdown).toContain("## What To Fix In BIM");
    expect(markdown).toContain("## Assembly Evidence Summary");
    expect(markdown).toContain("## Conformity Evidence");
    expect(markdown).toContain("## Artifact Index");
    expect(markdown).toContain("Readiness State: needs_review");
    expect(markdown).toContain("Missing Datapoint: layer_lambda");
    expect(markdown).toContain("BIM source fix: Add thermal conductivity to material properties.");
    expect(markdown).toContain("IfcMaterialLayerSet#200");
    expect(markdown).not.toContain("rawAttributeSnapshot");
  });

  it("highlights critical evidence gaps and caps assembly details", () => {
    const candidates = Array.from({ length: 22 }, (_, index) =>
      assemblyCandidate({
        assemblyCandidateId: `ac_gap_${index + 1}`,
        sourceElementStepIds: [index + 1],
        sourceElementGlobalIds: [`wall-${index + 1}`],
      }),
    );
    const markdown = generateDiagnosticsMarkdown({
      manifest: manifest(),
      fileEvidence: evidence().fileEvidence,
      elementEvidence: evidence().elementEvidence,
      typeEvidence: [],
      diagnostics: evidence().diagnostics,
      assemblyCandidates: candidates,
      missingDatapoints: [
        {
          field: "type_link",
          severity: "required_for_provenance",
          reason: "Official IFC type link evidence was not found.",
          userFixable: false,
          bimSourceFixRecommended: true,
          bimSourceFixHint: "Connect relevant elements to IFC type objects.",
          evidenceChecked: [],
          affectedElementIds: ["wall-1"],
          affectedElementStepIds: [1],
        },
        {
          field: "material_association",
          severity: "required_for_layered_calculation",
          reason: "Official IFC material association evidence was not found.",
          userFixable: false,
          bimSourceFixRecommended: true,
          bimSourceFixHint: "Associate relevant elements with materials.",
          evidenceChecked: [],
          affectedElementIds: ["wall-1"],
          affectedElementStepIds: [1],
        },
        {
          field: "calculation_basis_evidence",
          severity: "required_for_estimate",
          reason: "No calculation or estimate basis was found.",
          userFixable: false,
          bimSourceFixRecommended: true,
          bimSourceFixHint: "Add material layers or thickness evidence.",
          evidenceChecked: [],
          affectedElementIds: ["wall-1"],
          affectedElementStepIds: [1],
        },
        ...Array.from({ length: 18 }, (_, index) => ({
          field: "layer_lambda" as const,
          severity: "required_for_layered_calculation" as const,
          reason: `Layer lambda ${index + 1} is missing.`,
          userFixable: true,
          userQuestionLevel: "material" as const,
          bimSourceFixRecommended: true,
          bimSourceFixHint: "Add thermal conductivity to material properties.",
          evidenceChecked: [],
          affectedElementIds: ["wall-1"],
          affectedElementStepIds: [1],
        })),
      ],
      readinessDiagnostics: candidates.map((candidate) => ({
        assemblyCandidateId: candidate.assemblyCandidateId,
        sourceElementStepIds: candidate.sourceElementStepIds,
        sourceElementGlobalIds: candidate.sourceElementGlobalIds,
        readinessState: "blocked",
        confidence: "high",
        reasons: [],
      })),
      artifactIndex: [],
    });

    expect(markdown).toContain("## Critical BIM Evidence Gaps");
    expect(markdown).toContain("official type links absent");
    expect(markdown).toContain("official material associations absent");
    expect(markdown).toContain("cannot prove thermal assembly");
    expect(markdown).toContain("2 more Assembly Candidates omitted");
    expect(markdown).toContain("1 more BIM source fixes omitted");
    expect(markdown).toContain("Assembly Candidate ac_gap_20");
    expect(markdown).not.toContain("Assembly Candidate ac_gap_21");
    expect(markdown).not.toContain("No BIM source fixes recorded");
  });
});

function manifest(): EvidenceArtifactManifest {
  return {
    artifactSchemaVersion: "ifc-evidence-artifacts.v1",
    extractorVersion: "web-ifc-evidence-extractor.v1",
    ifcModelReaderVersion: "web-ifc-model-reader.v1",
    extractionIndexVersion: "ifc-extraction-index.v1",
    relevantElementRulesVersion: "relevant-element-rules.v1",
    groupingPolicyVersion: "conservative-material-association.v1",
    missingDatapointRulesVersion: "missing-datapoint-rules.v1",
    readinessRulesVersion: "assembly-readiness-rules.v1",
    artifactCompleteness: "complete_milestone_1",
    elementArtifactLayout: {
      kind: "single_file",
      path: "elements.json",
      elementCount: 1,
    },
  };
}

function evidence(): IfcEvidence {
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
      skippedScopeSummaries: [
        {
          rawEntityClass: "IfcDoor",
          count: 3,
          reason: "Outside Milestone 1 envelope scope.",
        },
      ],
    },
    elementEvidence: [
      {
        identity: {
          stepId: 10,
          globalId: "wall-a",
          rawEntityClass: "IfcWall",
          elementClass: "IfcWall",
          name: "Wall A",
          objectType: null,
          predefinedType: null,
          tag: null,
          description: null,
          ifcTypeObjectStepId: 100,
          classification: {
            classificationConfidence: "high",
            inclusionReason: "Relevant Milestone 1 element class.",
            matchedHints: [],
            needsUserConfirmation: false,
          },
          sourceContext: {
            containerStepId: null,
            storeyName: "Level 1",
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
    citedIfcEntities: [],
    skippedScopeSummaries: [],
    diagnostics: [
      {
        code: "ifc_material_entities_present_without_material_associations",
        severity: "warning",
        message: "Material entities exist but official associations were not found.",
        stepIds: [30],
      },
    ],
  };
}

function assemblyCandidate(
  overrides: Partial<AssemblyCandidate> = {},
): AssemblyCandidate {
  return {
    assemblyCandidateId: "ac_test",
    sourceElementStepIds: [10],
    sourceElementGlobalIds: ["wall-a"],
    groupingKey: "type:IfcWall:100:abc",
    groupingBasis: {
      basisKind: "shared_type_and_material_signature",
      typeObjectStepId: 100,
      materialSignatureHash: "abc",
    },
    groupingConfidence: "high",
    groupingSignatures: [],
    groupingDiagnostics: [],
    evidenceSummary: {
      hasLayeredMaterialEvidence: true,
      hasOrderedLayers: true,
      layerCount: 2,
      hasAllLayerThicknesses: true,
      missingLayerThicknessCount: 0,
      hasAllMaterialNames: true,
      missingMaterialNameCount: 0,
      hasAnyLambdaCandidates: true,
      hasAllLambdaCandidates: false,
      missingLambdaCandidateCount: 1,
      hasNonLayeredMaterialEvidence: false,
      hasAssemblyThicknessCandidate: false,
      hasClassificationUncertainty: false,
    },
    ...overrides,
  };
}
