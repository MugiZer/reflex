import { buildIfcExtractionIndex } from "./buildIfcExtractionIndex.js";
import { composeIfcEvidence } from "./composeIfcEvidence.js";
import { detectIfcEvidenceExtractionRisk } from "./detectIfcEvidenceExtractionRisk.js";
import { discoverRelevantElements } from "./discoverRelevantElements.js";
import { extractElementIdentityEvidence } from "./features/extractElementIdentityEvidence.js";
import { extractMaterialPropertyEvidence } from "./features/extractMaterialPropertyEvidence.js";
import { extractTypeEvidence } from "./features/extractTypeEvidence.js";
import type {
  ExtractIfcEvidenceResult,
  IfcModelReader,
} from "./evidenceTypes.js";

export function extractIfcEvidenceFromReader(
  reader: IfcModelReader,
  options: { fileHash?: string } = {},
): ExtractIfcEvidenceResult {
  try {
    const relevantElementDiscovery = discoverRelevantElements(reader);
    const indexResult = buildIfcExtractionIndex({
      reader,
      relevantElementStepIds: relevantElementDiscovery.relevantElementStepIds,
    });
    const evidenceExtractionRiskResult = detectIfcEvidenceExtractionRisk({
      reader,
      extractionIndex: indexResult.extractionIndex,
      relevantElementStepIds: relevantElementDiscovery.relevantElementStepIds,
    });

    const elementIdentityResult = extractElementIdentityEvidence({
      reader,
      extractionIndex: indexResult.extractionIndex,
      relevantElements: relevantElementDiscovery.relevantElements,
    });
    const typeEvidenceResult = extractTypeEvidence({
      reader,
      extractionIndex: indexResult.extractionIndex,
    });
    const materialPropertyEvidenceResult = extractMaterialPropertyEvidence({
      reader,
      extractionIndex: indexResult.extractionIndex,
      elementEvidence: elementIdentityResult.evidence,
      typeEvidence: typeEvidenceResult.evidence,
    });

    const diagnostics = [
      ...relevantElementDiscovery.diagnostics,
      ...indexResult.diagnostics,
      ...evidenceExtractionRiskResult.diagnostics,
      ...elementIdentityResult.diagnostics,
      ...typeEvidenceResult.diagnostics,
      ...materialPropertyEvidenceResult.diagnostics,
    ];

    return {
      ok: true,
      ifcEvidence: composeIfcEvidence({
        reader,
        fileHash: options.fileHash,
        elementEvidence: materialPropertyEvidenceResult.elementEvidence,
        typeEvidence: materialPropertyEvidenceResult.typeEvidence,
        skippedScopeSummaries: relevantElementDiscovery.skippedScopeSummaries,
        diagnostics,
        citedStepIds: [
          ...elementIdentityResult.citedStepIds,
          ...typeEvidenceResult.citedStepIds,
          ...evidenceExtractionRiskResult.citedStepIds,
          ...materialPropertyEvidenceResult.citedStepIds,
        ],
      }),
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failureType: "internal_error",
      message,
      diagnostics: [
        {
          code: "ifc_evidence_extract_internal_error",
          severity: "error",
          message,
        },
      ],
    };
  }
}
