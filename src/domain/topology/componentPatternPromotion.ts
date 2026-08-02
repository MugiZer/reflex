import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import { interpretComponentPattern, type ComponentPattern } from "./componentPatternInterpreter.js";
import type { ComponentEvaluationGraph } from "./componentEvaluationRecords.js";
import type { JsonValue } from "./topologyTypes.js";

type DatasetCase = { caseId: string; profileKind: string; materialLabel: string; memberWidthM?: number; expected: string; conflictingKey?: string };
type FrozenDataset = { datasetId: string; frozenAt: string; development: DatasetCase[]; nearNeighbourNegatives: DatasetCase[]; rejections: DatasetCase[]; holdout: DatasetCase[]; varyingDimensions: string[] };

export function evaluatePatternPromotion(command: { pattern: ComponentPattern; dataset: FrozenDataset; minimumRecall: number }) {
  const executable = { ...command.pattern, lifecycle: "promoted" as const };
  const evaluate = (item: DatasetCase) => interpretComponentPattern({ evidence: { evidenceSignature: item.caseId, profileKind: item.profileKind, materialLabel: item.materialLabel, values: { memberWidthM: item.memberWidthM ?? "i-dont-know" }, authoritativeKeys: ["profileKind", "memberMaterial"], conflictingKeys: item.conflictingKey ? [item.conflictingKey] : [] }, patterns: [executable] }).outcome;
  const inventory=[...command.dataset.development,...command.dataset.nearNeighbourNegatives,...command.dataset.rejections,...command.dataset.holdout];
  const positives = inventory.filter((item) => item.expected === "matched");
  const truePositives = positives.filter((item) => evaluate(item) === "matched").length;
  const unsafeFalsePositives = command.dataset.nearNeighbourNegatives.filter((item) => item.expected === "unmatched" && evaluate(item) === "matched").length;
  const recall = positives.length ? truePositives / positives.length : 0;
  const expectationMisses=inventory.filter((item)=>evaluate(item)!==item.expected).map((item)=>item.caseId);
  const casesById=new Map(inventory.map((item)=>[item.caseId,item]));
  const varyingDimensionMisses=command.dataset.varyingDimensions.filter((caseId)=>{const item=casesById.get(caseId);return !item||evaluate(item)!=="matched"||typeof item.memberWidthM!=="number";});
  const datasetSha256 = sha256(canonicalTopologyJson(command.dataset as unknown as JsonValue));
  return { outcome: unsafeFalsePositives === 0 && recall >= command.minimumRecall&&expectationMisses.length===0&&varyingDimensionMisses.length===0 ? "promoted" as const : "refused" as const, patternId: command.pattern.patternId, patternVersion: command.pattern.version, datasetId: command.dataset.datasetId, datasetSha256, frozenAt: command.dataset.frozenAt, unsafeFalsePositives, recall, expectationMisses, varyingDimensionMisses, evaluatedCaseCount: inventory.length };
}

export function replayUnresolvedOccurrence(command: { original: ComponentEvaluationGraph; pattern: ComponentPattern; promotedAt: string }): ComponentEvaluationGraph {
  if (command.pattern.lifecycle !== "promoted" || command.original.match.outcome !== "unmatched") throw new Error("Replay requires unresolved history and a promoted pattern version.");
  const answers = readAnswers(command.original.annotations[0]?.payload);
  const interpretation = interpretComponentPattern({ evidence: { evidenceSignature: command.original.occurrence.evidenceSignature, profileKind: typeof answers.memberKind === "string" ? answers.memberKind : "", materialLabel: typeof answers.memberMaterial === "string" ? answers.memberMaterial : "", values: { memberWidthM: typeof answers.memberWidthM === "number" ? answers.memberWidthM : "i-dont-know" }, authoritativeKeys: ["profileKind", "memberMaterial"], conflictingKeys: [] }, patterns: [command.pattern] });
  if (interpretation.outcome !== "matched") throw new Error(`Promoted replay did not match:${interpretation.outcome}`);
  const matchId = sha256(canonicalTopologyJson({ occurrenceId: command.original.occurrence.occurrenceId, annotationId: command.original.annotations[0]?.annotationId ?? null, patternId: command.pattern.patternId, patternVersion: command.pattern.version }));
  const evaluationId = sha256(canonicalTopologyJson({ occurrenceId: command.original.occurrence.occurrenceId, matchId, sourceRevisionId: command.original.sourceRevisionId }));
  return { ...command.original, pattern: { patternId: command.pattern.patternId, version: command.pattern.version, lifecycle: command.pattern.lifecycle, canonicalPattern: command.pattern as unknown as JsonValue, patternSha256: sha256(canonicalTopologyJson(command.pattern as unknown as JsonValue)), createdAt: command.promotedAt }, match: { matchId, occurrenceId: command.original.occurrence.occurrenceId, annotationId: command.original.annotations[0]?.annotationId ?? null, patternId: command.pattern.patternId, patternVersion: command.pattern.version, outcome: "matched", reasons: interpretation.reasons, createdAt: command.promotedAt }, recipes: [], requests: [], results: [], evaluation: { evaluationId, occurrenceId: command.original.occurrence.occurrenceId, matchId, scenarioRequestIds: [], createdAt: command.promotedAt }, aggregate: null, unresolvedGroups: [], state: "recoverable" };
}

function readAnswers(value: JsonValue | undefined): Record<string, JsonValue> { if (typeof value !== "object" || value === null || Array.isArray(value)) return {}; const answers = (value as Record<string, JsonValue>).answers; return typeof answers === "object" && answers !== null && !Array.isArray(answers) ? answers as Record<string, JsonValue> : {}; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
