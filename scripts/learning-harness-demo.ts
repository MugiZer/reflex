import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import {
  buildLearningGraph,
  type ConceptSeed,
  type LearningEvidenceInput,
  type LearningGraph,
  type SourceClaim,
} from "../src/development/learning-harness/learningHarness.js";
import {
  buildTeachingFrontier,
  type GraphifyGraph,
  type TeachingPacket,
  type TeachingSliceDefinition,
} from "../src/development/learning-harness/teaching.js";
import { buildTaskContext, type TaskContextTask } from "../src/development/learning-harness/taskContext.js";
import { evaluateLearningSignals, type LearningSignalObservation } from "../src/development/learning-harness/signals.js";
import type { LearningSession } from "../src/development/learning-harness/session.js";

const root = process.cwd();
const learningDir = join(root, "learning");
const execFileAsync = promisify(execFile);

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
const readOptionalJson = async <T>(path: string, fallback: T): Promise<T> => {
  try { return await readJson<T>(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
};

const readEvidenceLedger = async (
  path: string,
  legacyObservationIds: ReadonlySet<string>,
): Promise<LearningEvidenceInput[]> => {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.recordType === "completed-concept-assessment") return record as LearningEvidenceInput;
      if (typeof record.id === "string" && legacyObservationIds.has(record.id)) return record as LearningEvidenceInput;
      throw new Error(`Evidence ${String(record.id)} is not a completed concept assessment or declared legacy migration`);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

type StoredSession = { taskId: string; conceptId: string; session: LearningSession };

const changedFiles = async (): Promise<string[]> => {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd: root });
    return stdout.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
};

const readSessions = async (): Promise<StoredSession[]> => {
  try {
    const paths = await readdir(join(learningDir, "sessions"));
    return await Promise.all(paths.filter((path) => path.endsWith(".json")).map((path) =>
      readJson<StoredSession>(join(learningDir, "sessions", path))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

const signalObservations = (sessions: readonly StoredSession[]): LearningSignalObservation[] => sessions.flatMap(({ taskId, conceptId, session }) => {
  const observation = session.observation;
  if (!observation) return [];
  const observations: LearningSignalObservation[] = [{
    id: `${session.id}:prediction`,
    kind: "prediction",
    conceptId,
    taskId,
    observedAt: observation.observedAt,
    tested: true,
    correct: observation.matchesPrediction,
    mismatch: observation.matchesPrediction ? undefined : "other",
  }];
  if (session.completedWork) observations.push({
    id: `${session.id}:fix`,
    kind: "fix",
    conceptId,
    taskId,
    observedAt: session.completedWork.completedAt,
    attempted: true,
    independent: session.hintDepth === 0 && session.debuggingSteps.length === 0,
  });
  return observations;
});

const sliceDefinitions: TeachingSliceDefinition[] = [
  {
    id: "request-to-async-job",
    title: "Request to asynchronous job",
    objective: "Trace how an IFC upload becomes a durable asynchronous verification job.",
    conceptIds: ["typescript-object-access", "async-control-flow", "dependency-injection", "repository-boundary", "state-transitions"],
    codeAnchors: ["src/app/http/httpServer.ts", "src/application/jobs/createJob.ts", "src/application/jobs/processIfcJob.ts", "src/domain/jobs/jobRepository.ts", "src/infrastructure/persistence/sqlite/SqliteJobRepository.ts"],
    boundary: "HTTP translates requests; application coordinates; the domain owns job states and the repository contract; infrastructure persists them.",
    failurePath: "Processing fails after the job identity has been durably created.",
    proof: "Follow the production upload route and its job-state integration tests.",
    visual: {
      questionKind: "time-flow",
      question: "How does an IFC upload become a durable asynchronous verification job?",
      focus: "The job identity exists before background IFC processing starts.",
      highlightedPath: ["upload", "createJob", "jobId", "processIfcJob", "report"],
      baseline: ["accept upload", "persist job", "return jobId", "process IFC", "publish report"],
      anomaly: ["processing fails", "durable job records the failure"],
      applicationQuestion: "What remains available to the architect if IFC processing fails after upload?",
    },
  },
  {
    id: "ifc-evidence-to-review",
    title: "IFC evidence to requested review",
    objective: "Trace raw IFC evidence into explicit calculation uncertainty and review requests.",
    conceptIds: ["domain-infrastructure-boundary", "interfaces-and-implementations", "evidence-vs-conclusion", "return-object-access", "domain-policy"],
    codeAnchors: ["src/infrastructure/ifc/web-ifc/WebIfcModelReader.ts", "src/domain/evidence/evidenceTypes.ts", "src/domain/evidence/deriveCalculationInputEvidence.ts", "src/domain/review/planRequestedInputs.ts", "src/application/jobs/processIfcJob.ts"],
    boundary: "Infrastructure reads web-ifc; domain contracts and deterministic policies own evidence meaning and uncertainty.",
    failurePath: "Required evidence is absent or ambiguous and must remain reviewable rather than guessed.",
    proof: "Exercise domain evidence tests and review-workflow regression tests.",
    visual: {
      questionKind: "boundary",
      question: "Which boundary turns IFC data into reviewable calculation evidence?",
      focus: "Infrastructure reads IFC; domain policy preserves uncertainty.",
      highlightedPath: ["WebIfcModelReader", "CalculationInputEvidence", "planRequestedInputs"],
      baseline: ["read IFC", "derive evidence", "plan requested inputs"],
      anomaly: ["missing or ambiguous value", "request review instead of guessing"],
      applicationQuestion: "Where should a new rule for ambiguous thermal evidence live, and why?",
    },
  },
  {
    id: "component-to-2d-result",
    title: "Component opportunity to 2-D thermal result",
    objective: "Trace a repeating wall component through topology identity, qualification, worker execution, and reporting.",
    conceptIds: ["canonicalization", "adapter-boundary", "validation-envelope", "process-boundary", "proof-carrying-result"],
    codeAnchors: ["src/domain/topology/ifcTopologyOpportunity.ts", "src/domain/topology/canonicalTopologyJson.ts", "src/application/topology/fitGeneratedTopologyFamilyMatch.ts", "src/application/thermal-treatment/runThermalTreatmentCalculationReport.ts", "src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.ts"],
    boundary: "The domain owns topology meaning and trust policy; infrastructure owns the external numerical process.",
    failurePath: "A numerical result exists but lacks qualification or falls outside the supported validation envelope.",
    proof: "Use generated-family qualification tests plus the numerical/release verification profile.",
    visual: {
      questionKind: "call-flow",
      question: "How does a repeating wall component reach the 2-D calculation worker?",
      focus: "Topology meaning and qualification precede external numerical execution.",
      highlightedPath: ["opportunity", "canonical identity", "qualification", "2-D worker", "report"],
      baseline: ["identify", "canonicalize", "qualify", "calculate", "report"],
      anomaly: ["unsupported topology", "result remains unverified"],
      applicationQuestion: "Which step prevents an unqualified numerical result from being treated as verified?",
    },
  },
];

const conceptSeedDefinitions: Array<[string, string, string[]?]> = [
  ["typescript-object-access", "TypeScript object and property access"],
  ["async-control-flow", "Asynchronous control flow"],
  ["verification-job-workflow", "Verification job workflow"],
  ["dependency-injection", "Dependency injection", ["typescript-object-access"]],
  ["repository-boundary", "Repository boundary", ["dependency-injection"]],
  ["state-transitions", "State transitions"],
  ["domain-infrastructure-boundary", "Domain and infrastructure boundaries"],
  ["interfaces-and-implementations", "Interfaces and implementations"],
  ["evidence-vs-conclusion", "Evidence versus conclusions"],
  ["return-object-access", "Return-object property access", ["typescript-object-access"]],
  ["domain-policy", "Domain policy", ["evidence-vs-conclusion"]],
  ["canonicalization", "Canonicalization"],
  ["adapter-boundary", "Adapter boundary", ["interfaces-and-implementations"]],
  ["validation-envelope", "Validation envelope"],
  ["process-boundary", "External process boundary", ["adapter-boundary"]],
  ["proof-carrying-result", "Proof-carrying result", ["evidence-vs-conclusion", "validation-envelope"]],
];

const conceptSeeds: ConceptSeed[] = conceptSeedDefinitions.map(([id, label, prerequisites]) => ({
  id,
  label,
  prerequisites,
}));

const graphMarkdown = (graph: LearningGraph): string => {
  const lines = ["# Learning knowledge graph", "", "Statuses change only when learner evidence justifies the change.", ""];
  for (const concept of graph.concepts) {
    const completedAssessments = concept.evidence.filter((item) => item.recordType === "completed-concept-assessment").length;
    const legacyObservations = concept.evidence.filter((item) => item.recordType === "legacy-observation").length;
    lines.push(`## ${concept.label}`, "", `- id: \`${concept.id}\``, `- status: \`${concept.status}\``, `- source claims: ${concept.sourceClaims.length}`, `- completed assessments: ${completedAssessments}`, `- legacy observations pending reassessment: ${legacyObservations}`);
    if (concept.codeAnchors.length) lines.push(`- code anchors: ${concept.codeAnchors.map((item) => `\`${item}\``).join(", ")}`);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
};

const frontierMarkdown = (packets: TeachingPacket[]): string => {
  const lines = ["# Lesson frontier", "", "Ordered by unresolved concepts and valid Graphify anchors.", ""];
  packets.forEach((packet, index) => {
    lines.push(`## ${index + 1}. ${packet.title}`, "", packet.objective, "", `- Visual question: ${packet.representation.question}`, `- Visual shape: \`${packet.representation.kind}\``, `- Focus: ${packet.representation.focus}`, `- Boundary: ${packet.explanation.invariant}`, `- Failure path: ${packet.explanation.failurePath}`, `- Application check: ${packet.earningCheck.prompt}`, `- Proof: ${packet.earningCheck.proof}`, `- Visible Graphify nodes: ${packet.representation.graphNodes.length}`, `- Missing anchors: ${packet.source.missingAnchors.length ? packet.source.missingAnchors.join(", ") : "none"}`, "");
  });
  return `${lines.join("\n").trim()}\n`;
};

async function build(): Promise<void> {
  await mkdir(join(learningDir, "evidence"), { recursive: true });
  await mkdir(join(learningDir, "sync"), { recursive: true });
  const sourceClaims = await readOptionalJson<SourceClaim[]>(join(learningDir, "drive-source-claims.json"), []);
  const legacyObservationIds = new Set(await readOptionalJson<string[]>(
    join(learningDir, "evidence", "legacy-observation-ids.json"),
    [],
  ));
  const evidence = await readEvidenceLedger(
    join(learningDir, "evidence", "evidence-ledger.jsonl"),
    legacyObservationIds,
  );
  const existing = await readOptionalJson<LearningGraph | undefined>(join(learningDir, "knowledge-graph.json"), undefined);
  const graphify = await readJson<GraphifyGraph>(join(root, "graphify-out", "graph.json"));
  const graph = buildLearningGraph(sourceClaims, evidence, existing, conceptSeeds);
  const task = await readOptionalJson<TaskContextTask | undefined>(join(learningDir, "current-task.json"), undefined);
  const sessions = await readSessions();
  const taskContext = task === undefined ? undefined : buildTaskContext({
    task: { ...task, changedFiles: task.changedFiles?.length ? task.changedFiles : await changedFiles() },
    graphify,
    learningGraph: graph,
  });
  const signalEvaluation = taskContext === undefined ? undefined : evaluateLearningSignals({
    graph,
    scope: { taskId: taskContext.task.id, conceptIds: taskContext.concepts.map((concept) => concept.conceptId) },
    observations: signalObservations(sessions),
    asOf: new Date().toISOString(),
  });
  const teachingPackets = buildTeachingFrontier(graphify, graph, sliceDefinitions);
  const codeLinks = teachingPackets.flatMap((packet) => packet.representation.graphNodes.map((node) => ({
    sliceId: packet.sliceId,
    concepts: packet.conceptIds,
    node,
  })));
  const manifest = {
    schemaVersion: 1,
    syncedAt: sourceClaims.map((claim) => claim.source.importedAt).sort().at(-1) ?? null,
    sources: sourceClaims.map((claim) => ({ documentId: claim.source.documentId, revisionId: claim.source.revisionId, importedAt: claim.source.importedAt })),
  };

  await Promise.all([
    writeFile(join(learningDir, "knowledge-graph.json"), `${JSON.stringify(graph, null, 2)}\n`),
    writeFile(join(learningDir, "knowledge-graph.md"), graphMarkdown(graph)),
    writeFile(join(learningDir, "lesson-frontier.md"), frontierMarkdown(teachingPackets)),
    writeFile(join(learningDir, "teaching-packets.json"), `${JSON.stringify(teachingPackets, null, 2)}\n`),
    writeFile(join(learningDir, "code-links.json"), `${JSON.stringify(codeLinks, null, 2)}\n`),
    writeFile(join(learningDir, "sync", "drive-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    ...(taskContext === undefined ? [] : [writeFile(join(learningDir, "current-task-context.json"), `${JSON.stringify(taskContext, null, 2)}\n`)]),
    ...(signalEvaluation === undefined ? [] : [writeFile(join(learningDir, "ambient-learning-signals.json"), `${JSON.stringify(signalEvaluation, null, 2)}\n`)]),
  ]);
  console.log(`Built learning harness: ${graph.concepts.length} concepts, ${teachingPackets.length} teaching packets.`);
}

await build();
