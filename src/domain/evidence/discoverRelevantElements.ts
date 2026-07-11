import type {
  Confidence,
  Diagnostic,
  ElementClass,
  IfcModelReader,
  SkippedScopeSummary,
  StepId,
} from "./evidenceTypes.js";
import {
  PROXY_ENVELOPE_HINTS,
  RELEVANT_ELEMENT_RULES,
  SKIPPED_SCOPE_CLASS_RULES,
} from "./relevantElementRules.js";

export type RelevantElementRecord = {
  stepId: StepId;
  rawEntityClass: string;
  elementClass: ElementClass;
  classification: {
    classificationConfidence: Confidence;
    inclusionReason: string;
    matchedHints: string[];
    needsUserConfirmation: boolean;
  };
};

export type DiscoverRelevantElementsResult = {
  relevantElements: RelevantElementRecord[];
  relevantElementStepIds: Set<StepId>;
  skippedScopeSummaries: SkippedScopeSummary[];
  diagnostics: Diagnostic[];
};

export function discoverRelevantElements(
  reader: IfcModelReader,
): DiscoverRelevantElementsResult {
  const relevantElements: RelevantElementRecord[] = [];

  for (const rule of RELEVANT_ELEMENT_RULES) {
    for (const entity of reader.getEntitiesByClass(rule.rawEntityClass)) {
      const matchedHints = rule.needsHints
        ? getMatchedProxyHints(reader, entity.stepId)
        : [];

      if (rule.needsHints && matchedHints.length === 0) {
        continue;
      }

      relevantElements.push({
        stepId: entity.stepId,
        rawEntityClass: rule.rawEntityClass,
        elementClass: rule.elementClass,
        classification: {
          classificationConfidence: rule.classificationConfidence,
          inclusionReason: rule.inclusionReason,
          matchedHints,
          needsUserConfirmation: rule.classificationConfidence !== "high",
        },
      });
    }
  }

  const skippedScopeSummaries = SKIPPED_SCOPE_CLASS_RULES.map((rule) => ({
    rawEntityClass: rule.rawEntityClass,
    count: reader.getEntitiesByClass(rule.rawEntityClass).length,
    reason: rule.reason,
  })).filter((summary) => summary.count > 0);

  return {
    relevantElements,
    relevantElementStepIds: new Set(
      relevantElements.map((element) => element.stepId),
    ),
    skippedScopeSummaries,
    diagnostics: [],
  };
}

function getMatchedProxyHints(reader: IfcModelReader, stepId: StepId) {
  const searchableText = ["Name", "ObjectType", "PredefinedType"]
    .map((attributeName) => reader.getStringAttribute(stepId, attributeName))
    .filter((value): value is string => value !== null)
    .join(" ")
    .toLowerCase();

  return PROXY_ENVELOPE_HINTS.filter((hint) =>
    searchableText.includes(hint),
  );
}
