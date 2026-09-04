import {
  LEARNING_STATUSES,
  type LearningGraph,
  type LearningStatus,
} from "./capabilityAssessment.js";

export type LearningSignalScope = {
  readonly taskId?: string;
  readonly conceptIds: readonly string[];
};

export type LearningSignalObservation = {
  readonly id: string;
  readonly conceptId: string;
  readonly taskId?: string;
  readonly observedAt: string;
} & (
  | {
    readonly kind: "prediction";
    readonly tested: true;
    readonly correct: boolean;
    readonly mismatch?: "misconception" | "other";
  }
  | {
    readonly kind: "prediction";
    readonly tested: false;
  }
  | {
    readonly kind: "fix";
    readonly attempted: true;
    readonly independent: boolean;
  }
  | {
    readonly kind: "fix";
    readonly attempted: false;
  }
);

export type LearningSignalPolicy = {
  readonly repeatedMismatchThreshold: number;
  readonly staleAfterDays: number;
  readonly minimumHighConfidenceStatus: LearningStatus;
  readonly minimumPrerequisiteStatus: LearningStatus;
};

export type NormalizedLearningMetric = {
  readonly key: "prediction-accuracy" | "independent-fix-rate" | "transfer-coverage";
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
};

export type LearningSignal = {
  readonly kind:
    | "repeated-mismatch"
    | "stale-confidence"
    | "weak-prerequisite"
    | "regression-suspected"
    | "untested-transfer";
  readonly conceptId: string;
  readonly observationIds: readonly string[];
  readonly prerequisiteId?: string;
  readonly category?: "misconception" | "prediction-error";
  readonly message: string;
};

export type LearningSignalEvaluationInput = {
  readonly graph: LearningGraph;
  readonly scope: LearningSignalScope;
  readonly observations?: readonly LearningSignalObservation[];
  readonly asOf: string;
  readonly policy?: Partial<LearningSignalPolicy>;
};

export type LearningSignalEvaluation = {
  readonly signal: LearningSignal | null;
  readonly metrics: readonly NormalizedLearningMetric[];
};

const DEFAULT_POLICY: LearningSignalPolicy = {
  repeatedMismatchThreshold: 2,
  staleAfterDays: 30,
  minimumHighConfidenceStatus: "understood",
  minimumPrerequisiteStatus: "understood",
};

const statusRank = (status: LearningStatus): number => LEARNING_STATUSES.indexOf(status);

type CompletedAssessment = Extract<LearningGraph["concepts"][number]["evidence"][number], {
  recordType: "completed-concept-assessment";
}>;

type PredictionObservation = Extract<LearningSignalObservation, { kind: "prediction"; tested: true }>;

const assessmentDate = (assessment: CompletedAssessment): number => Date.parse(assessment.assessedAt);

const observationDate = (observation: LearningSignalObservation): number => Date.parse(observation.observedAt);

const isIndependentPass = (assessment: CompletedAssessment): boolean => assessment.outcome === "passed"
  && assessment.independence === "unprompted"
  && assessment.assistanceLevel === "none";

const completedAssessments = (concept: LearningGraph["concepts"][number]): CompletedAssessment[] => {
  const assessments = concept.evidence.filter(
    (item): item is CompletedAssessment => item.recordType === "completed-concept-assessment",
  );
  const superseded = new Set(assessments.map((assessment) => assessment.supersedesPacketId).filter(Boolean));
  return assessments
    .filter((assessment) => !superseded.has(assessment.id))
    .sort((left, right) => assessmentDate(left) - assessmentDate(right) || left.id.localeCompare(right.id));
};

const latestEvidenceAt = (concept: LearningGraph["concepts"][number]): number | null => {
  const dates = [
    concept.lastReviewed === undefined ? Number.NaN : Date.parse(concept.lastReviewed),
    ...concept.evidence.map((item) => Date.parse(
      item.recordType === "completed-concept-assessment" ? item.assessedAt : item.demonstratedAt,
    )),
  ].filter(Number.isFinite);
  return dates.length === 0 ? null : Math.max(...dates);
};

const evidenceIds = (concept: LearningGraph["concepts"][number]): string[] =>
  concept.evidence.map((item) => item.id);

const metric = (
  key: NormalizedLearningMetric["key"],
  numerator: number,
  denominator: number,
): NormalizedLearningMetric => ({
  key,
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const inScope = (
  observation: LearningSignalObservation,
  scope: LearningSignalScope,
  conceptIds: ReadonlySet<string>,
): boolean => conceptIds.has(observation.conceptId)
  && (scope.taskId === undefined || observation.taskId === scope.taskId);

const signalCandidate = (
  signal: LearningSignal,
  priority: number,
  observedAt: number | null,
  scopeIndex: number,
): SignalCandidate => ({ signal, priority, observedAt: observedAt ?? Number.NEGATIVE_INFINITY, scopeIndex });

type SignalCandidate = {
  readonly signal: LearningSignal;
  readonly priority: number;
  readonly observedAt: number;
  readonly scopeIndex: number;
};

const candidateOrder = (left: SignalCandidate, right: SignalCandidate): number =>
  left.priority - right.priority
  || right.observedAt - left.observedAt
  || left.scopeIndex - right.scopeIndex
  || left.signal.conceptId.localeCompare(right.signal.conceptId);

export function evaluateLearningSignals(
  input: LearningSignalEvaluationInput,
): LearningSignalEvaluation {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const conceptIds = new Set(input.scope.conceptIds);
  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) throw new Error("Learning signal evaluation requires an ISO-compatible asOf date-time");
  const observations = (input.observations ?? [])
    .filter((observation) => inScope(observation, input.scope, conceptIds));
  const testedPredictions = observations.filter(
    (observation): observation is Extract<LearningSignalObservation, { kind: "prediction"; tested: true }> =>
      observation.kind === "prediction" && observation.tested,
  );
  const concepts = input.graph.concepts.filter((concept) => conceptIds.has(concept.id));
  const scopeIndex = new Map(input.scope.conceptIds.map((conceptId, index) => [conceptId, index]));
  const candidates: SignalCandidate[] = [];

  const mismatchesByConcept = new Map<string, PredictionObservation[]>();
  for (const observation of testedPredictions.filter((item) => !item.correct)) {
    const mismatches = mismatchesByConcept.get(observation.conceptId) ?? [];
    mismatches.push(observation);
    mismatchesByConcept.set(observation.conceptId, mismatches);
  }
  for (const [conceptId, mismatches] of mismatchesByConcept) {
    if (mismatches.length < Math.max(1, Math.floor(policy.repeatedMismatchThreshold))) continue;
    const allMisconceptions = mismatches.every((observation) => observation.mismatch === "misconception");
    candidates.push(signalCandidate({
      kind: "repeated-mismatch",
      conceptId,
      observationIds: mismatches
        .sort((left, right) => observationDate(left) - observationDate(right) || left.id.localeCompare(right.id))
        .map((observation) => observation.id),
      category: allMisconceptions ? "misconception" : "prediction-error",
      message: "Repeated tested prediction mismatches are worth examining before adding more explanation.",
    }, 0, Math.max(...mismatches.map(observationDate)), scopeIndex.get(conceptId) ?? Number.MAX_SAFE_INTEGER));
  }

  for (const concept of concepts) {
    const assessments = completedAssessments(concept);
    const conceptScopeIndex = scopeIndex.get(concept.id) ?? Number.MAX_SAFE_INTEGER;
    const latestActivity = latestEvidenceAt(concept);
    const highConfidence = statusRank(concept.status) >= statusRank(policy.minimumHighConfidenceStatus);

    if (highConfidence && latestActivity !== null
      && asOf - latestActivity > Math.max(0, policy.staleAfterDays) * 24 * 60 * 60 * 1000) {
      candidates.push(signalCandidate({
        kind: "stale-confidence",
        conceptId: concept.id,
        observationIds: evidenceIds(concept),
        message: "High-confidence knowledge has no recent assessment or review in the supplied time window.",
      }, 3, latestActivity, conceptScopeIndex));
    }

    if (statusRank(concept.status) > statusRank("seed")) {
      for (const prerequisiteId of concept.prerequisites) {
        const prerequisite = input.graph.concepts.find((item) => item.id === prerequisiteId);
        if (prerequisite && statusRank(prerequisite.status) >= statusRank(policy.minimumPrerequisiteStatus)) continue;
        candidates.push(signalCandidate({
          kind: "weak-prerequisite",
          conceptId: concept.id,
          prerequisiteId,
          observationIds: [
            ...evidenceIds(concept),
            ...(prerequisite ? evidenceIds(prerequisite) : []),
          ],
          message: "A prerequisite is weaker than the current concept claim; check it before extending this work.",
        }, 2, latestActivity, conceptScopeIndex));
      }
    }

    if (highConfidence && assessments.some((assessment) => isIndependentPass(assessment))) {
      const transferAssessments = assessments.filter((assessment) =>
        assessment.kind === "transfer"
        && isIndependentPass(assessment)
        && Boolean(assessment.transferContext),
      );
      if (transferAssessments.length === 0) {
        candidates.push(signalCandidate({
          kind: "untested-transfer",
          conceptId: concept.id,
          observationIds: assessments.map((assessment) => assessment.id),
          message: "High-confidence knowledge has no independent transfer assessment in the supplied evidence.",
        }, 4, latestActivity, conceptScopeIndex));
      }
    }

    if (highConfidence) {
      const latestIndependentPass = assessments
        .filter(isIndependentPass)
        .at(-1);
      if (latestIndependentPass) {
        const regressionAssessments = assessments.filter((assessment) =>
          assessment.outcome !== "passed"
          && assessmentDate(assessment) > assessmentDate(latestIndependentPass),
        );
        if (regressionAssessments.length > 0) {
          candidates.push(signalCandidate({
            kind: "regression-suspected",
            conceptId: concept.id,
            observationIds: regressionAssessments.map((assessment) => assessment.id),
            message: "A later non-passing assessment suggests a possible regression; capability status is unchanged.",
          }, 1, Math.max(...regressionAssessments.map(assessmentDate)), conceptScopeIndex));
        }
      }
    }
  }

  const [selected] = candidates.sort(candidateOrder);
  const fixAttempts = observations.filter(
    (observation): observation is Extract<LearningSignalObservation, { kind: "fix"; attempted: true }> =>
      observation.kind === "fix" && observation.attempted,
  );
  const transferEligible = concepts.filter((concept) => {
    const assessments = completedAssessments(concept);
    return statusRank(concept.status) >= statusRank(policy.minimumHighConfidenceStatus)
      && assessments.some((assessment) => isIndependentPass(assessment));
  });
  const transferred = transferEligible.filter((concept) => completedAssessments(concept).some((assessment) =>
    assessment.kind === "transfer"
    && isIndependentPass(assessment)
    && Boolean(assessment.transferContext),
  ));

  return {
    signal: selected?.signal ?? null,
    metrics: [
      metric(
        "prediction-accuracy",
        testedPredictions.filter((observation) => observation.correct).length,
        testedPredictions.length,
      ),
      metric("independent-fix-rate", fixAttempts.filter((observation) => observation.independent).length, fixAttempts.length),
      metric("transfer-coverage", transferred.length, transferEligible.length),
    ],
  };
}
