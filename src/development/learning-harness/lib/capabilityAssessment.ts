export const LEARNING_STATUSES = [
  "seed",
  "introduced",
  "practicing",
  "understood",
  "transferable",
  "operational",
] as const;

export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export type LegacyLearningObservation = {
  id: string;
  recordType: "legacy-observation";
  conceptId: string;
  kind: "prediction" | "trace" | "explanation" | "test" | "diagnosis" | "modification" | "transfer";
  description: string;
  demonstratedAt: string;
  codeAnchors?: string[];
};

export type CompletedConceptAssessment = {
  id: string;
  recordType: "completed-concept-assessment";
  conceptId: string;
  capabilityBoundary: string;
  demonstration: string;
  kind: LegacyLearningObservation["kind"] | "delayed-retrieval";
  outcome: "passed" | "partial" | "not-demonstrated";
  independence: "unprompted" | "lightly-prompted" | "guided";
  assistanceLevel: "none" | "minor" | "substantial";
  sessionId: string;
  assessedAt: string;
  rubricVersion: string;
  delayedRetrieval: boolean;
  codeAnchors?: string[];
  producedArtifact?: string;
  transferContext?: string;
  consequentialWork?: boolean;
  supersedesPacketId?: string;
};

export type LearningEvidence = LegacyLearningObservation | CompletedConceptAssessment;
export type LearningEvidenceInput =
  | (Omit<LegacyLearningObservation, "recordType"> & { recordType?: "legacy-observation" })
  | CompletedConceptAssessment;

export type SourceClaim = {
  conceptId: string;
  label: string;
  aliases?: string[];
  claim: "prior-exposure" | "learning-goal" | "learning-preference";
  source: {
    kind: "google-drive";
    documentId: string;
    documentTitle: string;
    documentUrl: string;
    revisionId: string;
    importedAt: string;
  };
};

export type LearningConcept = {
  id: string;
  label: string;
  aliases: string[];
  status: LearningStatus;
  prerequisites: string[];
  codeAnchors: string[];
  sourceClaims: SourceClaim[];
  evidence: LearningEvidence[];
  lastReviewed?: string;
};

export type LearningGraph = {
  schemaVersion: 1;
  concepts: LearningConcept[];
};

export type ConceptSeed = {
  id: string;
  label: string;
  prerequisites?: string[];
};

export type CapabilityReviewDecision = {
  assessmentId: string;
  conceptId: string;
  accepted: boolean;
  previousStatus: LearningStatus;
  earnedStatus: LearningStatus | null;
  resultingStatus: LearningStatus;
  reasons: string[];
};

type AssessmentOutcome = {
  uncappedStatus: LearningStatus | null;
  earnedStatus: LearningStatus | null;
};

const statusRank = (status: LearningStatus): number => LEARNING_STATUSES.indexOf(status);
const laterStatus = (left: LearningStatus, right: LearningStatus): LearningStatus =>
  statusRank(left) >= statusRank(right) ? left : right;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid completed concept assessment: ${field} must be a non-empty string`);
  }
  return value;
};

const stringArray = (value: unknown, field: string): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid completed concept assessment: ${field} must contain non-empty strings`);
  }
  return value;
};

const enumValue = <T extends string>(value: unknown, field: string, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid completed concept assessment: ${field} is not supported`);
  }
  return value as T;
};

const validateCompletedConceptAssessment = (input: unknown): CompletedConceptAssessment => {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid completed concept assessment: expected an object");
  }
  const value = input as Record<string, unknown>;
  if (value.recordType !== "completed-concept-assessment") {
    throw new Error("Invalid completed concept assessment: recordType must be completed-concept-assessment");
  }
  const assessment: CompletedConceptAssessment = {
    id: requiredString(value.id, "id"),
    recordType: "completed-concept-assessment",
    conceptId: requiredString(value.conceptId, "conceptId"),
    capabilityBoundary: requiredString(value.capabilityBoundary, "capabilityBoundary"),
    demonstration: requiredString(value.demonstration, "demonstration"),
    kind: enumValue(value.kind, "kind", ["prediction", "trace", "explanation", "test", "diagnosis", "modification", "transfer", "delayed-retrieval"] as const),
    outcome: enumValue(value.outcome, "outcome", ["passed", "partial", "not-demonstrated"] as const),
    independence: enumValue(value.independence, "independence", ["unprompted", "lightly-prompted", "guided"] as const),
    assistanceLevel: enumValue(value.assistanceLevel, "assistanceLevel", ["none", "minor", "substantial"] as const),
    sessionId: requiredString(value.sessionId, "sessionId"),
    assessedAt: requiredString(value.assessedAt, "assessedAt"),
    rubricVersion: requiredString(value.rubricVersion, "rubricVersion"),
    delayedRetrieval: value.delayedRetrieval === true,
    codeAnchors: stringArray(value.codeAnchors, "codeAnchors"),
    producedArtifact: value.producedArtifact === undefined ? undefined : requiredString(value.producedArtifact, "producedArtifact"),
    transferContext: value.transferContext === undefined ? undefined : requiredString(value.transferContext, "transferContext"),
    consequentialWork: value.consequentialWork === true,
    supersedesPacketId: value.supersedesPacketId === undefined ? undefined : requiredString(value.supersedesPacketId, "supersedesPacketId"),
  };
  if (typeof value.delayedRetrieval !== "boolean") {
    throw new Error("Invalid completed concept assessment: delayedRetrieval must be boolean");
  }
  if (!Number.isFinite(Date.parse(assessment.assessedAt))) {
    throw new Error("Invalid completed concept assessment: assessedAt must be an ISO-compatible date-time");
  }
  if (assessment.kind === "delayed-retrieval" && !assessment.delayedRetrieval) {
    throw new Error("Invalid completed concept assessment: delayed retrieval kind must be marked delayed");
  }
  if (assessment.supersedesPacketId === assessment.id) {
    throw new Error("Invalid completed concept assessment: a packet cannot supersede itself");
  }
  if (!(assessment.codeAnchors?.length || assessment.producedArtifact)) {
    throw new Error("Invalid completed concept assessment: codeAnchors or producedArtifact is required");
  }
  return assessment;
};

const normalizeLearningEvidence = (input: LearningEvidenceInput): LearningEvidence =>
  input.recordType === "completed-concept-assessment"
    ? validateCompletedConceptAssessment(input)
    : { ...input, recordType: "legacy-observation" };

const independentPass = (assessment: CompletedConceptAssessment): boolean =>
  assessment.outcome === "passed"
  && assessment.independence === "unprompted"
  && assessment.assistanceLevel === "none";

const hasPriorIndependentRetrieval = (
  assessments: CompletedConceptAssessment[],
  before: CompletedConceptAssessment,
): boolean => assessments.some((assessment) =>
  assessment.kind === "delayed-retrieval"
  && assessment.delayedRetrieval
  && independentPass(assessment)
  && Date.parse(assessment.assessedAt) < Date.parse(before.assessedAt)
);

const assessmentCeiling = (
  assessment: CompletedConceptAssessment,
  earlierAssessments: CompletedConceptAssessment[],
): LearningStatus | null => {
  if (assessment.outcome !== "passed") return null;
  const consequentialSessions = new Set(
    [...earlierAssessments, assessment]
      .filter((item) =>
        independentPass(item)
        && item.consequentialWork === true
        && ["modification", "test", "diagnosis", "transfer"].includes(item.kind)
      )
      .map((item) => item.sessionId),
  );
  const hasPriorTransfer = earlierAssessments.some((item, index) =>
    item.kind === "transfer"
    && independentPass(item)
    && Boolean(item.transferContext)
    && hasPriorIndependentRetrieval(earlierAssessments.slice(0, index), item)
  );
  if (consequentialSessions.size >= 3 && hasPriorTransfer) return "operational";
  if (assessment.kind === "explanation") return "introduced";
  if (assessment.kind === "delayed-retrieval") {
    const priorSession = earlierAssessments.some((earlier) =>
      earlier.outcome === "passed"
      && earlier.sessionId !== assessment.sessionId
      && Date.parse(earlier.assessedAt) < Date.parse(assessment.assessedAt)
    );
    return independentPass(assessment) && assessment.delayedRetrieval && priorSession
      ? "understood"
      : "practicing";
  }
  if (assessment.kind === "transfer") {
    return independentPass(assessment)
      && Boolean(assessment.transferContext)
      && hasPriorIndependentRetrieval(earlierAssessments, assessment)
      ? "transferable"
      : "practicing";
  }
  return assessment.independence === "guided" || assessment.assistanceLevel === "substantial"
    ? "introduced"
    : "practicing";
};

const activeAssessments = (evidence: LearningEvidence[]): CompletedConceptAssessment[] => {
  const assessments = evidence.filter(
    (item): item is CompletedConceptAssessment => item.recordType === "completed-concept-assessment",
  );
  const byId = new Map(assessments.map((item) => [item.id, item]));
  const superseded = new Set<string>();
  for (const assessment of assessments) {
    if (!assessment.supersedesPacketId) continue;
    const target = byId.get(assessment.supersedesPacketId);
    if (!target) throw new Error(`Superseded evidence packet not found: ${assessment.supersedesPacketId}`);
    if (Date.parse(target.assessedAt) >= Date.parse(assessment.assessedAt)) {
      throw new Error(`Superseding packet must be later than ${assessment.supersedesPacketId}`);
    }
    superseded.add(target.id);
  }
  return assessments
    .filter((assessment) => !superseded.has(assessment.id))
    .sort((left, right) => left.assessedAt.localeCompare(right.assessedAt) || left.id.localeCompare(right.id));
};

const validateGraphEvidence = (graph: LearningGraph): void => {
  const ids = new Set<string>();
  for (const concept of graph.concepts) {
    for (const evidence of concept.evidence) {
      if (ids.has(evidence.id)) throw new Error(`Duplicate evidence packet: ${evidence.id}`);
      ids.add(evidence.id);
    }
    activeAssessments(concept.evidence);
  }
};

const capByPrerequisites = (
  graph: LearningGraph,
  concept: LearningConcept,
  earnedStatus: LearningStatus,
): LearningStatus => concept.prerequisites.reduce<LearningStatus>((status, prerequisiteId) => {
  const prerequisite = graph.concepts.find((item) => item.id === prerequisiteId);
  if (!prerequisite) return "seed";
  return statusRank(prerequisite.status) < statusRank(status) ? prerequisite.status : status;
}, earnedStatus);

const evaluateConceptHistory = (
  graph: LearningGraph,
  concept: LearningConcept,
): { status: LearningStatus; outcomes: Map<string, AssessmentOutcome> } => {
  const assessments = activeAssessments(concept.evidence);
  const outcomes = new Map<string, AssessmentOutcome>();
  let status = concept.status;
  assessments.forEach((assessment, index) => {
    const uncappedStatus = assessmentCeiling(assessment, assessments.slice(0, index));
    const earnedStatus = uncappedStatus === null ? null : capByPrerequisites(graph, concept, uncappedStatus);
    outcomes.set(assessment.id, { uncappedStatus, earnedStatus });
    if (earnedStatus !== null) status = laterStatus(status, earnedStatus);
  });
  return { status, outcomes };
};

const deriveCapabilityState = <TGraph extends LearningGraph>(
  graph: TGraph,
  statusFloors: ReadonlyMap<string, LearningStatus> = new Map(),
): { graph: TGraph; outcomes: Map<string, AssessmentOutcome> } => {
  validateGraphEvidence(graph);
  let derived = {
    ...graph,
    concepts: graph.concepts.map((concept) => ({
      ...concept,
      status: statusFloors.get(concept.id) ?? "seed",
    })),
  } as TGraph;
  let outcomes = new Map<string, AssessmentOutcome>();

  for (let pass = 0; pass <= graph.concepts.length; pass += 1) {
    let changed = false;
    const passOutcomes = new Map<string, AssessmentOutcome>();
    const concepts = derived.concepts.map((concept) => {
      const evaluation = evaluateConceptHistory(derived, concept);
      evaluation.outcomes.forEach((outcome, id) => passOutcomes.set(id, outcome));
      if (evaluation.status !== concept.status) changed = true;
      return { ...concept, status: evaluation.status };
    });
    derived = { ...derived, concepts } as TGraph;
    outcomes = passOutcomes;
    if (!changed) break;
  }
  return { graph: derived, outcomes };
};

export function reviewCapabilityAssessment<TGraph extends LearningGraph>(
  graph: TGraph,
  input: unknown,
): { graph: TGraph; decision: CapabilityReviewDecision } {
  const assessment = validateCompletedConceptAssessment(input);
  validateGraphEvidence(graph);
  const concept = graph.concepts.find((item) => item.id === assessment.conceptId);
  if (!concept) throw new Error(`Unknown concept: ${assessment.conceptId}`);
  if (graph.concepts.some((item) => item.evidence.some((evidence) => evidence.id === assessment.id))) {
    throw new Error(`Duplicate evidence packet: ${assessment.id}`);
  }
  if (assessment.supersedesPacketId && !concept.evidence.some((item) => item.id === assessment.supersedesPacketId)) {
    throw new Error(`Superseded evidence packet not found: ${assessment.supersedesPacketId}`);
  }

  const appendedGraph = {
    ...graph,
    concepts: graph.concepts.map((item) => item.id === concept.id ? {
      ...item,
      codeAnchors: [...new Set([...item.codeAnchors, ...(assessment.codeAnchors ?? [])])],
      evidence: [...item.evidence, assessment],
    } : item),
  } as TGraph;
  const statusFloors = new Map(graph.concepts.map((item) => [item.id, item.status]));
  if (assessment.supersedesPacketId) statusFloors.delete(concept.id);
  const derived = deriveCapabilityState(appendedGraph, statusFloors);
  const outcome = derived.outcomes.get(assessment.id) ?? { uncappedStatus: null, earnedStatus: null };
  const reviewedConcept = derived.graph.concepts.find((item) => item.id === concept.id);
  if (!reviewedConcept) throw new Error(`Unknown concept after review: ${concept.id}`);

  const reasons = assessment.outcome === "passed"
    ? [
      `Assessment supports at most ${outcome.uncappedStatus}`,
      ...(outcome.earnedStatus !== outcome.uncappedStatus ? ["Prerequisites cap the earned status"] : []),
    ]
    : ["Partial or not-demonstrated assessments do not award or remove capability status"];

  return {
    graph: derived.graph,
    decision: {
      assessmentId: assessment.id,
      conceptId: assessment.conceptId,
      accepted: true,
      previousStatus: concept.status,
      earnedStatus: outcome.earnedStatus,
      resultingStatus: reviewedConcept.status,
      reasons: assessment.supersedesPacketId
        ? [...reasons, `Explicitly supersedes ${assessment.supersedesPacketId}`]
        : reasons,
    },
  };
}

export function buildLearningGraph(
  sourceClaims: SourceClaim[],
  evidence: LearningEvidenceInput[],
  existing?: LearningGraph,
  seeds: ConceptSeed[] = [],
): LearningGraph {
  const concepts = new Map<string, LearningConcept>((existing?.concepts ?? []).map((concept) => [concept.id, {
    ...concept,
    evidence: [],
  }]));

  for (const seed of seeds) {
    const current = concepts.get(seed.id);
    if (!current) {
      concepts.set(seed.id, {
        id: seed.id,
        label: seed.label,
        aliases: [],
        status: "seed",
        prerequisites: seed.prerequisites ?? [],
        codeAnchors: [],
        sourceClaims: [],
        evidence: [],
      });
    } else if (seed.prerequisites) {
      concepts.set(seed.id, { ...current, prerequisites: seed.prerequisites });
    }
  }

  for (const claim of sourceClaims) {
    const current = concepts.get(claim.conceptId);
    concepts.set(claim.conceptId, {
      id: claim.conceptId,
      label: claim.label,
      aliases: [...new Set([...(current?.aliases ?? []), ...(claim.aliases ?? [])])],
      status: current?.status ?? "seed",
      prerequisites: current?.prerequisites ?? [],
      codeAnchors: current?.codeAnchors ?? [],
      sourceClaims: [...(current?.sourceClaims ?? []).filter((item) =>
        !(item.source.documentId === claim.source.documentId && item.source.revisionId === claim.source.revisionId)
      ), claim],
      evidence: current?.evidence ?? [],
      lastReviewed: current?.lastReviewed,
    });
  }

  const inputEvidenceIds = new Set<string>();
  for (const input of evidence) {
    const item = normalizeLearningEvidence(input);
    if (inputEvidenceIds.has(item.id)) throw new Error(`Duplicate evidence packet: ${item.id}`);
    inputEvidenceIds.add(item.id);
    const current = concepts.get(item.conceptId);
    if (!current) throw new Error(`Evidence references unknown concept: ${item.conceptId}`);
    current.evidence = [...current.evidence.filter((entry) => entry.id !== item.id), item];
    current.codeAnchors = [...new Set([...current.codeAnchors, ...(item.codeAnchors ?? [])])];
  }

  return deriveCapabilityState({
    schemaVersion: 1,
    concepts: [...concepts.values()].sort((left, right) => left.id.localeCompare(right.id)),
  }).graph;
}
