import type { CompletedConceptAssessment } from "./capabilityAssessment.js";

export const MAX_DEEP_DEBUGGING_STEPS = 5;

export const HINT_DEPTHS = [0, 1, 2, 3] as const;
export type HintDepth = (typeof HINT_DEPTHS)[number];

const OBSERVATION_SOURCE_KINDS = ["test", "typecheck", "lint", "runtime", "review", "manual", "other"] as const;
const MISMATCH_CATEGORIES = ["expected-vs-actual", "causal-model", "scope", "verification", "other"] as const;
const COMPLETED_WORK_KINDS = [
  "trace",
  "explanation",
  "test",
  "diagnosis",
  "modification",
  "transfer",
  "delayed-retrieval",
  "trivial",
] as const;

export type LearningSessionStatus = "active" | "completed";

export type ObservationSourceKind =
  | "test"
  | "typecheck"
  | "lint"
  | "runtime"
  | "review"
  | "manual"
  | "other";

export type ObservationSource = Readonly<{
  kind: ObservationSourceKind;
  name?: string;
  command?: string;
}>;

export type ObservationSourceInput = ObservationSource | ObservationSourceKind;

export type Prediction = Readonly<{
  expectedResult: string;
  command?: string;
  modification?: string;
  predictedAt: string;
}>;

export type RealityObservation = Readonly<{
  actualResult: string;
  source: ObservationSource;
  matchesPrediction: boolean;
  observedAt: string;
}>;

export type MismatchCategory =
  | "expected-vs-actual"
  | "causal-model"
  | "scope"
  | "verification"
  | "other";

export type Mismatch = Readonly<{
  category: MismatchCategory;
  explanation: string;
  recordedAt: string;
}>;

export type Correction = Readonly<{
  correctedCausalModel: string;
  fix: string;
  correctedAt: string;
}>;

export type Diagnosis = Readonly<{
  hypothesis: string;
  diagnosis: string;
  diagnosedAt: string;
}>;

export type Verification = Readonly<{
  result: "passed" | "failed";
  source: ObservationSource;
  details?: string;
  verifiedAt: string;
}>;

export type DebuggingStep = Readonly<{
  description: string;
  recordedAt: string;
}>;

export type DebuggingMode = Readonly<{
  status: "active" | "exited";
  reason: string;
  enteredAt: string;
  maxSteps: number;
  stepsUsed: number;
  exitedAt?: string;
  exitReason?: string;
}>;

export type CompletedWorkKind =
  | "trace"
  | "explanation"
  | "test"
  | "diagnosis"
  | "modification"
  | "transfer"
  | "delayed-retrieval"
  | "trivial";

export type CompletedCodingWork = Readonly<{
  conceptId: string;
  capabilityBoundary: string;
  kind: CompletedWorkKind;
  description: string;
  changedFiles: readonly string[];
  codeAnchors: readonly string[];
  producedArtifact?: string;
  completedAt: string;
}>;

export type CapabilityEvidenceCandidate = Readonly<{
  id: string;
  recordType: "capability-evidence-candidate";
  promotionStatus: "candidate";
  conceptId: string;
  capabilityBoundary: string;
  demonstration: string;
  kind: Exclude<CompletedWorkKind, "trivial">;
  suggestedAssessment: Readonly<{
    outcome: "passed";
    independence: "unprompted" | "lightly-prompted" | "guided";
    assistanceLevel: "none" | "minor" | "substantial";
  }>;
  sessionId: string;
  assessedAt: string;
  codeAnchors: readonly string[];
  producedArtifact?: string;
  source: Readonly<{
    prediction: Prediction;
    observation: RealityObservation;
    mismatch?: Mismatch;
    correction?: Correction;
    diagnosis?: Diagnosis;
    verification: Verification;
  }>;
  uncertainty: readonly string[];
}>;

export type LearningSession = Readonly<{
  schemaVersion: 1;
  id: string;
  task: string;
  startedAt: string;
  status: LearningSessionStatus;
  prediction: Prediction | null;
  observation: RealityObservation | null;
  mismatch: Mismatch | null;
  correction: Correction | null;
  hintDepth: HintDepth;
  diagnosis: Diagnosis | null;
  verification: Verification | null;
  debuggingMode: DebuggingMode | null;
  debuggingSteps: readonly DebuggingStep[];
  completedWork: CompletedCodingWork | null;
  completedAt?: string;
  evidenceCandidate: CapabilityEvidenceCandidate | null;
}>;

export type CreateLearningSessionInput = Readonly<{
  id: string;
  task: string;
  startedAt: string;
}>;

export type StartPredictionInput = Readonly<{
  expectedResult: string;
  command?: string;
  modification?: string;
  predictedAt: string;
}>;

export type RecordObservationInput = Readonly<{
  actualResult: string;
  source: ObservationSourceInput;
  matchesPrediction: boolean;
  observedAt: string;
}>;

export type RecordMismatchInput = Readonly<{
  category: MismatchCategory;
  explanation: string;
  recordedAt: string;
}>;

export type RecordCorrectionInput = Readonly<{
  correctedCausalModel: string;
  fix: string;
  correctedAt: string;
}>;

export type RecordDiagnosisInput = Readonly<{
  hypothesis: string;
  diagnosis: string;
  diagnosedAt: string;
}>;

export type RecordVerificationInput = Readonly<{
  result: "passed" | "failed";
  source: ObservationSourceInput;
  details?: string;
  verifiedAt: string;
}>;

export type EnterDeepDebuggingInput = Readonly<{
  reason: string;
  maxSteps: number;
  enteredAt: string;
}>;

export type DebuggingStepInput = Readonly<{
  description: string;
  recordedAt: string;
}>;

export type ExitDeepDebuggingInput = Readonly<{
  reason: string;
  exitedAt: string;
}>;

export type RecordCompletedWorkInput = Readonly<{
  conceptId: string;
  capabilityBoundary: string;
  kind: CompletedWorkKind;
  description: string;
  changedFiles: readonly string[];
  codeAnchors?: readonly string[];
  producedArtifact?: string;
  completedAt: string;
}>;

export type CompleteLearningSessionInput = Readonly<{
  completedAt: string;
}>;

export type CandidateAssessmentInput = Readonly<{
  id: string;
  rubricVersion: string;
  outcome: "passed" | "partial" | "not-demonstrated";
  independence: "unprompted" | "lightly-prompted" | "guided";
  assistanceLevel: "none" | "minor" | "substantial";
  consequentialWork: boolean;
  delayedRetrieval?: boolean;
  transferContext?: string;
  supersedesPacketId?: string;
}>;

export type LearningSessionEvent =
  | Readonly<{ type: "prediction"; input: StartPredictionInput }>
  | Readonly<{ type: "observation"; input: RecordObservationInput }>
  | Readonly<{ type: "mismatch"; input: RecordMismatchInput }>
  | Readonly<{ type: "correction"; input: RecordCorrectionInput }>
  | Readonly<{ type: "hint"; input: { hintDepth: HintDepth } }>
  | Readonly<{ type: "diagnosis"; input: RecordDiagnosisInput }>
  | Readonly<{ type: "verification"; input: RecordVerificationInput }>
  | Readonly<{ type: "enter-deep-debugging"; input: EnterDeepDebuggingInput }>
  | Readonly<{ type: "debugging-step"; input: DebuggingStepInput }>
  | Readonly<{ type: "exit-deep-debugging"; input: ExitDeepDebuggingInput }>
  | Readonly<{ type: "completed-work"; input: RecordCompletedWorkInput }>;

const nonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid learning session: ${field} must be a non-empty string`);
  }
  return value;
};

const validDate = (value: unknown, field: string): string => {
  const result = nonEmpty(value, field);
  if (!Number.isFinite(Date.parse(result))) {
    throw new Error(`Invalid learning session: ${field} must be an ISO-compatible date-time`);
  }
  return result;
};

const oneOf = <T extends string>(value: unknown, field: string, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid learning session: ${field} is not supported`);
  }
  return value as T;
};

const uniqueStrings = (values: readonly string[], field: string): readonly string[] => {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`Invalid learning session: ${field} must contain non-empty strings`);
  }
  return [...new Set(values)];
};

const immutable = <T>(value: T): T => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    value.forEach((item) => immutable(item));
  } else {
    Object.values(value as Record<string, unknown>).forEach((item) => immutable(item));
  }
  return Object.freeze(value);
};

const replace = (session: LearningSession, patch: Partial<LearningSession>): LearningSession =>
  immutable({ ...session, ...patch });

const assertActive = (session: LearningSession): void => {
  if (session.status !== "active") throw new Error("Learning session is already completed");
};

const source = (input: ObservationSourceInput): ObservationSource => {
  if (typeof input === "string") return immutable({ kind: oneOf(input, "source.kind", OBSERVATION_SOURCE_KINDS) });
  return immutable({
    kind: oneOf(input.kind, "source.kind", OBSERVATION_SOURCE_KINDS),
    name: input.name === undefined ? undefined : nonEmpty(input.name, "source.name"),
    command: input.command === undefined ? undefined : nonEmpty(input.command, "source.command"),
  });
};

function assertHintDepth(value: number): asserts value is HintDepth {
  if (!HINT_DEPTHS.includes(value as HintDepth)) {
    throw new Error("Invalid learning session: hint depth must be between 0 and 3");
  }
}

export function createLearningSession(input: CreateLearningSessionInput): LearningSession {
  return immutable({
    schemaVersion: 1 as const,
    id: nonEmpty(input.id, "id"),
    task: nonEmpty(input.task, "task"),
    startedAt: validDate(input.startedAt, "startedAt"),
    status: "active" as const,
    prediction: null,
    observation: null,
    mismatch: null,
    correction: null,
    hintDepth: 0 as const,
    diagnosis: null,
    verification: null,
    debuggingMode: null,
    debuggingSteps: [],
    completedWork: null,
    evidenceCandidate: null,
  });
}

export function startPrediction(
  session: LearningSession,
  input: StartPredictionInput,
): LearningSession {
  assertActive(session);
  if (session.prediction) throw new Error("Learning session allows only one active prediction");
  if (!input.command && !input.modification) {
    throw new Error("Invalid learning session: a prediction must name a command or modification");
  }
  return replace(session, {
    prediction: immutable({
      expectedResult: nonEmpty(input.expectedResult, "expectedResult"),
      command: input.command === undefined ? undefined : nonEmpty(input.command, "command"),
      modification: input.modification === undefined ? undefined : nonEmpty(input.modification, "modification"),
      predictedAt: validDate(input.predictedAt, "predictedAt"),
    }),
  });
}

export function recordObservation(
  session: LearningSession,
  input: RecordObservationInput,
): LearningSession {
  assertActive(session);
  if (!session.prediction) throw new Error("A prediction is required before recording reality");
  if (session.observation) throw new Error("Learning session allows only one reality observation");
  if (typeof input.matchesPrediction !== "boolean") {
    throw new Error("Invalid learning session: matchesPrediction must be boolean");
  }
  return replace(session, {
    observation: immutable({
      actualResult: nonEmpty(input.actualResult, "actualResult"),
      source: source(input.source),
      matchesPrediction: input.matchesPrediction,
      observedAt: validDate(input.observedAt, "observedAt"),
    }),
  });
}

export function recordMismatch(
  session: LearningSession,
  input: RecordMismatchInput,
): LearningSession {
  assertActive(session);
  if (!session.observation) throw new Error("Reality must be observed before recording a mismatch");
  if (session.observation.matchesPrediction) throw new Error("A matching observation cannot record a mismatch");
  if (session.mismatch) throw new Error("Learning session allows only one mismatch record");
  return replace(session, {
    mismatch: immutable({
      category: oneOf(input.category, "category", MISMATCH_CATEGORIES),
      explanation: nonEmpty(input.explanation, "explanation"),
      recordedAt: validDate(input.recordedAt, "recordedAt"),
    }),
  });
}

export function recordCorrection(
  session: LearningSession,
  input: RecordCorrectionInput,
): LearningSession {
  assertActive(session);
  if (!session.mismatch) throw new Error("A mismatch is required before recording a correction");
  if (session.correction) throw new Error("Learning session allows only one correction record");
  return replace(session, {
    correction: immutable({
      correctedCausalModel: nonEmpty(input.correctedCausalModel, "correctedCausalModel"),
      fix: nonEmpty(input.fix, "fix"),
      correctedAt: validDate(input.correctedAt, "correctedAt"),
    }),
  });
}

export function recordHint(
  session: LearningSession,
  hintDepth: HintDepth,
): LearningSession {
  assertActive(session);
  assertHintDepth(hintDepth);
  if (hintDepth < session.hintDepth) throw new Error("Hint depth cannot be reduced within a session");
  return replace(session, { hintDepth });
}

export function recordDiagnosis(
  session: LearningSession,
  input: RecordDiagnosisInput,
): LearningSession {
  assertActive(session);
  if (!session.observation) throw new Error("Reality must be observed before recording a diagnosis");
  if (session.diagnosis) throw new Error("Learning session allows only one diagnosis record");
  return replace(session, {
    diagnosis: immutable({
      hypothesis: nonEmpty(input.hypothesis, "hypothesis"),
      diagnosis: nonEmpty(input.diagnosis, "diagnosis"),
      diagnosedAt: validDate(input.diagnosedAt, "diagnosedAt"),
    }),
  });
}

export function recordVerification(
  session: LearningSession,
  input: RecordVerificationInput,
): LearningSession {
  assertActive(session);
  if (!session.observation) throw new Error("Reality must be observed before recording verification");
  if (session.verification) throw new Error("Learning session allows only one verification record");
  return replace(session, {
    verification: immutable({
      result: oneOf(input.result, "result", ["passed", "failed"] as const),
      source: source(input.source),
      details: input.details === undefined ? undefined : nonEmpty(input.details, "details"),
      verifiedAt: validDate(input.verifiedAt, "verifiedAt"),
    }),
  });
}

export function enterDeepDebugging(
  session: LearningSession,
  input: EnterDeepDebuggingInput,
): LearningSession {
  assertActive(session);
  if (!session.observation || !session.mismatch) {
    throw new Error("Deep debugging requires a recorded mismatch");
  }
  if (session.debuggingMode) throw new Error("Learning session allows only one bounded debugging episode");
  if (!Number.isInteger(input.maxSteps) || input.maxSteps < 1 || input.maxSteps > MAX_DEEP_DEBUGGING_STEPS) {
    throw new Error(`Deep debugging must be bounded to 1-${MAX_DEEP_DEBUGGING_STEPS} steps`);
  }
  return replace(session, {
    debuggingMode: immutable({
      status: "active" as const,
      reason: nonEmpty(input.reason, "reason"),
      enteredAt: validDate(input.enteredAt, "enteredAt"),
      maxSteps: input.maxSteps,
      stepsUsed: 0,
    }),
  });
}

export function recordDebuggingStep(
  session: LearningSession,
  input: DebuggingStepInput,
): LearningSession {
  assertActive(session);
  if (!session.debuggingMode || session.debuggingMode.status !== "active") {
    throw new Error("Deep debugging must be entered before recording a debugging step");
  }
  if (session.debuggingMode.stepsUsed >= session.debuggingMode.maxSteps) {
    throw new Error("Deep debugging step budget is exhausted; exit debugging mode");
  }
  const step = immutable({
    description: nonEmpty(input.description, "description"),
    recordedAt: validDate(input.recordedAt, "recordedAt"),
  });
  return replace(session, {
    debuggingMode: immutable({
      ...session.debuggingMode,
      stepsUsed: session.debuggingMode.stepsUsed + 1,
    }),
    debuggingSteps: [...session.debuggingSteps, step],
  });
}

export function exitDeepDebugging(
  session: LearningSession,
  input: ExitDeepDebuggingInput,
): LearningSession {
  assertActive(session);
  if (!session.debuggingMode || session.debuggingMode.status !== "active") {
    throw new Error("Deep debugging is not active");
  }
  return replace(session, {
    debuggingMode: immutable({
      ...session.debuggingMode,
      status: "exited" as const,
      exitedAt: validDate(input.exitedAt, "exitedAt"),
      exitReason: nonEmpty(input.reason, "reason"),
    }),
  });
}

export function recordCompletedWork(
  session: LearningSession,
  input: RecordCompletedWorkInput,
): LearningSession {
  assertActive(session);
  if (session.completedWork) throw new Error("Learning session allows only one completed-work record");
  const kind = oneOf(input.kind, "kind", COMPLETED_WORK_KINDS);
  const changedFiles = uniqueStrings(input.changedFiles, "changedFiles");
  const codeAnchors = uniqueStrings(input.codeAnchors ?? [], "codeAnchors");
  return replace(session, {
    completedWork: immutable({
      conceptId: nonEmpty(input.conceptId, "conceptId"),
      capabilityBoundary: nonEmpty(input.capabilityBoundary, "capabilityBoundary"),
      kind,
      description: nonEmpty(input.description, "description"),
      changedFiles,
      codeAnchors: [...new Set([...changedFiles, ...codeAnchors])],
      producedArtifact: input.producedArtifact === undefined
        ? undefined
        : nonEmpty(input.producedArtifact, "producedArtifact"),
      completedAt: validDate(input.completedAt, "completedAt"),
    }),
  });
}

const codeFile = (path: string): boolean =>
  /\.(?:[cm]?[jt]sx?|py|go|rs|java|cs|rb|php|swift|kt|kts|cpp|c|h|sql)$/i.test(path);

export const isMeaningfulCompletedWork = (
  work: CompletedCodingWork,
): boolean => work.kind !== "trivial"
  && work.description.trim().length > 0
  && work.changedFiles.some(codeFile);

const assistanceFor = (
  session: LearningSession,
): Pick<CapabilityEvidenceCandidate["suggestedAssessment"], "independence" | "assistanceLevel"> => {
  if (session.hintDepth === 0 && session.debuggingSteps.length === 0) {
    return { independence: "unprompted", assistanceLevel: "none" };
  }
  if (session.hintDepth <= 1 && session.debuggingSteps.length <= 1) {
    return { independence: "lightly-prompted", assistanceLevel: "minor" };
  }
  return { independence: "guided", assistanceLevel: "substantial" };
};

const candidateKind = (kind: CompletedWorkKind): Exclude<CompletedWorkKind, "trivial"> | null =>
  kind === "trivial" ? null : kind;

export function deriveCapabilityEvidenceCandidate(
  session: LearningSession,
): CapabilityEvidenceCandidate | null {
  if (session.status !== "completed" || !session.completedWork || !session.prediction || !session.observation || !session.verification) {
    return null;
  }
  if (!isMeaningfulCompletedWork(session.completedWork) || session.verification.result !== "passed") return null;
  if (!session.observation.matchesPrediction && (!session.mismatch || !session.correction || !session.diagnosis)) return null;
  const kind = candidateKind(session.completedWork.kind);
  if (!kind) return null;
  const assistance = assistanceFor(session);
  return immutable({
    id: `${session.id}:evidence-candidate`,
    recordType: "capability-evidence-candidate" as const,
    promotionStatus: "candidate" as const,
    conceptId: session.completedWork.conceptId,
    capabilityBoundary: session.completedWork.capabilityBoundary,
    demonstration: session.completedWork.description,
    kind,
    suggestedAssessment: immutable({ outcome: "passed" as const, ...assistance }),
    sessionId: session.id,
    assessedAt: session.completedWork.completedAt,
    codeAnchors: session.completedWork.codeAnchors,
    producedArtifact: session.completedWork.producedArtifact,
    source: {
      prediction: session.prediction,
      observation: session.observation,
      mismatch: session.mismatch ?? undefined,
      correction: session.correction ?? undefined,
      diagnosis: session.diagnosis ?? undefined,
      verification: session.verification,
    },
    uncertainty: [
      "Candidate requires explicit capability review before promotion.",
      "The reviewer must decide outcome, independence, assistance level, and consequentiality.",
    ],
  });
}

export function completeLearningSession(
  session: LearningSession,
  input: CompleteLearningSessionInput,
): LearningSession {
  assertActive(session);
  if (!session.prediction || !session.observation) {
    throw new Error("A prediction and reality observation are required before completion");
  }
  if (session.debuggingMode?.status === "active") {
    throw new Error("Exit deep debugging before completing a learning session");
  }
  if (!session.verification) throw new Error("Verification is required before completing a learning session");
  const completed = replace(session, {
    status: "completed" as const,
    completedAt: validDate(input.completedAt, "completedAt"),
  });
  const candidate = deriveCapabilityEvidenceCandidate(completed);
  return replace(completed, { evidenceCandidate: candidate });
}

export function applyLearningSessionEvent(
  session: LearningSession,
  event: LearningSessionEvent,
): LearningSession {
  switch (event.type) {
    case "prediction": return startPrediction(session, event.input);
    case "observation": return recordObservation(session, event.input);
    case "mismatch": return recordMismatch(session, event.input);
    case "correction": return recordCorrection(session, event.input);
    case "hint": return recordHint(session, event.input.hintDepth);
    case "diagnosis": return recordDiagnosis(session, event.input);
    case "verification": return recordVerification(session, event.input);
    case "enter-deep-debugging": return enterDeepDebugging(session, event.input);
    case "debugging-step": return recordDebuggingStep(session, event.input);
    case "exit-deep-debugging": return exitDeepDebugging(session, event.input);
    case "completed-work": return recordCompletedWork(session, event.input);
  }
}

export function toCompletedConceptAssessment(
  candidate: CapabilityEvidenceCandidate,
  input: CandidateAssessmentInput,
): CompletedConceptAssessment {
  if (candidate.recordType !== "capability-evidence-candidate" || candidate.promotionStatus !== "candidate") {
    throw new Error("Only a capability evidence candidate can become a review packet");
  }
  return {
    id: nonEmpty(input.id, "id"),
    recordType: "completed-concept-assessment",
    conceptId: candidate.conceptId,
    capabilityBoundary: candidate.capabilityBoundary,
    demonstration: candidate.demonstration,
    kind: candidate.kind,
    outcome: oneOf(input.outcome, "outcome", ["passed", "partial", "not-demonstrated"] as const),
    independence: oneOf(input.independence, "independence", ["unprompted", "lightly-prompted", "guided"] as const),
    assistanceLevel: oneOf(input.assistanceLevel, "assistanceLevel", ["none", "minor", "substantial"] as const),
    sessionId: candidate.sessionId,
    assessedAt: candidate.assessedAt,
    rubricVersion: nonEmpty(input.rubricVersion, "rubricVersion"),
    delayedRetrieval: input.delayedRetrieval === true,
    codeAnchors: [...candidate.codeAnchors],
    producedArtifact: candidate.producedArtifact,
    transferContext: input.transferContext,
    consequentialWork: input.consequentialWork === true,
    supersedesPacketId: input.supersedesPacketId,
  };
}
