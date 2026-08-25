import {
  LEARNING_STATUSES,
  type LearningConcept,
  type LearningGraph,
  type LearningStatus,
} from "./capabilityAssessment.js";
import type { GraphifyGraph, GraphifyLink, GraphifyNode } from "./teaching.js";

export type TaskContextTask = {
  id: string;
  title: string;
  description?: string;
  codeAnchors?: string[];
  changedFiles?: string[];
};

export type TaskContextOptions = {
  now?: string;
  staleAfterDays?: number;
  maxConcepts?: number;
  maxGraphNodes?: number;
  neighborhoodDepth?: number;
};

export type BuildTaskContextInput = {
  task: TaskContextTask;
  graphify: GraphifyGraph;
  learningGraph: LearningGraph;
  options?: TaskContextOptions;
};

export type ContextFamiliarity = "known" | "fragile" | "new";
export type ContextRecency = "recent" | "stale" | "never" | "unknown";
export type ContextMatch = "task-file" | "graph-neighborhood" | "task-text";

export type TaskContextConcept = {
  conceptId: string;
  label: string;
  status: LearningStatus;
  familiarity: ContextFamiliarity;
  recency: ContextRecency;
  lastValidatedAt?: string;
  codeAnchors: string[];
  prerequisites: string[];
  matchedBy: ContextMatch[];
};

export type PrerequisiteGap = {
  conceptId: string;
  conceptLabel: string;
  prerequisiteId: string;
  prerequisiteLabel?: string;
  prerequisiteStatus?: LearningStatus;
  prerequisiteFamiliarity: ContextFamiliarity | "missing";
  reason: "missing-concept" | "new" | "fragile" | "stale";
};

export type TaskContextAttentionTarget =
  | {
    kind: "concept";
    conceptId: string;
    label: string;
    familiarity: ContextFamiliarity;
    reason: "prerequisite-gap" | "new-concept" | "fragile-concept" | "stale-known-concept" | "task-anchor";
    prompt: string;
    codeAnchors: string[];
  }
  | {
    kind: "unmapped-task";
    label: "Unmapped task context";
    reason: "no-linked-concept";
    prompt: string;
    codeAnchors: string[];
  };

export type TaskContextPacket = {
  schemaVersion: 1;
  task: TaskContextTask;
  source: {
    codeAnchors: string[];
    changedFiles: string[];
    files: string[];
    unmatchedFiles: string[];
  };
  concepts: TaskContextConcept[];
  graphify: {
    builtAtCommit?: string;
    nodes: GraphifyNode[];
    links: GraphifyLink[];
  };
  prerequisiteGaps: PrerequisiteGap[];
  attentionTarget: TaskContextAttentionTarget;
  capabilityEvidence: false;
};

const DEFAULT_STALE_AFTER_DAYS = 30;
const DEFAULT_MAX_CONCEPTS = 7;
const DEFAULT_MAX_GRAPH_NODES = 7;
const DEFAULT_NEIGHBORHOOD_DEPTH = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = new Set(["a", "and", "at", "for", "from", "in", "is", "of", "on", "or", "the", "to", "via", "with"]);

const statusRank = (status: LearningStatus): number => LEARNING_STATUSES.indexOf(status);

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid task context: ${field} must be a non-empty string`);
  }
  return value.trim();
};

const positiveInteger = (value: number | undefined, fallback: number, field: string): number => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`Invalid task context: ${field} must be a positive integer`);
  }
  return resolved;
};

const nonNegativeNumber = (value: number | undefined, fallback: number, field: string): number => {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error(`Invalid task context: ${field} must be a non-negative number`);
  }
  return resolved;
};

const normalizedPath = (value: string | undefined): string => {
  const normalized = value?.replaceAll("\\", "/").trim().replace(/^\.\//, "") ?? "";
  return normalized.toLowerCase();
};

const uniqueStrings = (values: readonly (string | undefined)[]): string[] => [...new Set(
  values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()),
)];

const pathMatches = (left: string | undefined, right: string | undefined): boolean => {
  const normalizedLeft = normalizedPath(left);
  const normalizedRight = normalizedPath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
};

const ignoredGraphPath = (path: string | undefined): boolean => {
  const normalized = normalizedPath(path);
  return normalized.startsWith(".scratch/") || normalized.startsWith("graphify-out/memory/");
};

const tokens = (value: string): Set<string> => new Set(
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
);

const matchesTaskText = (concept: LearningConcept, taskText: Set<string>): boolean =>
  [concept.label, ...concept.aliases].some((term) => {
    const termTokens = [...tokens(term)];
    return termTokens.length > 0 && termTokens.every((token) => taskText.has(token));
  });

const activeValidatedAssessments = (concept: LearningConcept) => {
  const assessments = concept.evidence.filter(
    (evidence): evidence is Extract<LearningConcept["evidence"][number], { recordType: "completed-concept-assessment" }> =>
      evidence.recordType === "completed-concept-assessment",
  );
  const superseded = new Set(assessments.flatMap((assessment) =>
    assessment.supersedesPacketId ? [assessment.supersedesPacketId] : []));
  return assessments
    .filter((assessment) => !superseded.has(assessment.id))
    .sort((left, right) => Date.parse(left.assessedAt) - Date.parse(right.assessedAt) || left.id.localeCompare(right.id));
};

type DerivedConceptState = {
  concept: LearningConcept;
  familiarity: ContextFamiliarity;
  recency: ContextRecency;
  lastValidatedAt?: string;
};

const deriveConceptState = (
  concept: LearningConcept,
  nowMs: number,
  staleAfterDays: number,
): DerivedConceptState => {
  const assessments = activeValidatedAssessments(concept);
  const latest = assessments.at(-1);
  const latestTime = latest ? Date.parse(latest.assessedAt) : Number.NaN;
  const recency: ContextRecency = !latest
    ? "never"
    : !Number.isFinite(latestTime)
      ? "unknown"
      : nowMs - latestTime > staleAfterDays * DAY_MS ? "stale" : "recent";
  const familiarity: ContextFamiliarity = assessments.length === 0
    ? "new"
    : statusRank(concept.status) < statusRank("understood")
      || recency !== "recent"
      || latest?.outcome !== "passed"
      ? "fragile"
      : "known";
  return {
    concept,
    familiarity,
    recency,
    lastValidatedAt: latest?.assessedAt,
  };
};

const conceptPriority = (familiarity: ContextFamiliarity): number =>
  familiarity === "new" ? 0 : familiarity === "fragile" ? 1 : 2;

const rankNode = (node: GraphifyNode): [number, number, string, string] => [
  node.source_location === "L1" && /\.(ts|tsx|js|jsx|py)$/.test(node.label) ? 0 : 1,
  Number.parseInt(node.source_location?.slice(1) ?? "999999", 10) || 999999,
  node.label,
  node.id,
];

const compareNode = (left: GraphifyNode, right: GraphifyNode): number => {
  const leftRank = rankNode(left);
  const rightRank = rankNode(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    const leftPart = leftRank[index];
    const rightPart = rightRank[index];
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
};

const buildNeighborhood = (
  graphify: GraphifyGraph,
  files: string[],
  maxNodes: number,
  depth: number,
): { nodes: GraphifyNode[]; links: GraphifyLink[]; unmatchedFiles: string[] } => {
  const nodes = graphify.nodes.filter((node) => !ignoredGraphPath(node.source_file));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = graphify.links.filter((link) =>
    nodeIds.has(link.source) && nodeIds.has(link.target) && !ignoredGraphPath(link.source_file));
  const anchorNodes = nodes
    .filter((node) => files.some((file) => pathMatches(node.source_file, file)))
    .sort((left, right) => {
      const leftFileIndex = files.findIndex((file) => pathMatches(left.source_file, file));
      const rightFileIndex = files.findIndex((file) => pathMatches(right.source_file, file));
      return leftFileIndex - rightFileIndex || compareNode(left, right);
    });
  const selectedNodes = anchorNodes.slice(0, maxNodes);
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const visited = new Set(selectedIds);
  let frontier = [...selectedIds];
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    adjacency.set(link.source, [...(adjacency.get(link.source) ?? []), link.target]);
    adjacency.set(link.target, [...(adjacency.get(link.target) ?? []), link.source]);
  }
  for (const neighbors of adjacency.values()) neighbors.sort();

  for (let level = 0; level < depth && selectedNodes.length < maxNodes; level += 1) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const neighbor = nodes.find((node) => node.id === neighborId);
        if (!neighbor) continue;
        selectedNodes.push(neighbor);
        nextFrontier.push(neighborId);
        if (selectedNodes.length >= maxNodes) break;
      }
      if (selectedNodes.length >= maxNodes) break;
    }
    frontier = nextFrontier;
  }

  const visibleIds = new Set(selectedNodes.map((node) => node.id));
  return {
    nodes: selectedNodes,
    links: links.filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target)),
    unmatchedFiles: files.filter((file) => !nodes.some((node) => pathMatches(node.source_file, file))),
  };
};

const contextConcept = (
  state: DerivedConceptState,
  matchedBy: ContextMatch[],
): TaskContextConcept => ({
  conceptId: state.concept.id,
  label: state.concept.label,
  status: state.concept.status,
  familiarity: state.familiarity,
  recency: state.recency,
  lastValidatedAt: state.lastValidatedAt,
  codeAnchors: [...state.concept.codeAnchors],
  prerequisites: [...state.concept.prerequisites],
  matchedBy: [...matchedBy],
});

const gapReason = (
  state: DerivedConceptState | undefined,
): PrerequisiteGap["reason"] => {
  if (!state) return "missing-concept";
  if (state.recency === "stale") return "stale";
  return state.familiarity === "new" ? "new" : "fragile";
};

const buildAttentionTarget = (
  task: TaskContextTask,
  concepts: TaskContextConcept[],
  states: Map<string, DerivedConceptState>,
  gaps: PrerequisiteGap[],
): TaskContextAttentionTarget => {
  const firstGap = gaps[0];
  if (firstGap) {
    const prerequisiteState = states.get(firstGap.prerequisiteId);
    const owner = states.get(firstGap.conceptId)?.concept;
    return {
      kind: "concept",
      conceptId: firstGap.prerequisiteId,
      label: firstGap.prerequisiteLabel ?? firstGap.prerequisiteId,
      familiarity: prerequisiteState?.familiarity ?? "new",
      reason: "prerequisite-gap",
      prompt: `Before starting “${task.title}”, close the ${firstGap.reason} prerequisite for ${firstGap.conceptLabel}.`,
      codeAnchors: [...(prerequisiteState?.concept.codeAnchors ?? owner?.codeAnchors ?? task.codeAnchors ?? [])],
    };
  }

  const target = concepts[0];
  if (!target) {
    return {
      kind: "unmapped-task",
      label: "Unmapped task context",
      reason: "no-linked-concept",
      prompt: `Identify the first concept boundary in “${task.title}” before changing code.`,
      codeAnchors: [...(task.codeAnchors ?? [])],
    };
  }
  return {
    kind: "concept",
    conceptId: target.conceptId,
    label: target.label,
    familiarity: target.familiarity,
    reason: target.familiarity === "new"
      ? "new-concept"
      : target.familiarity === "fragile"
        ? target.recency === "stale" ? "stale-known-concept" : "fragile-concept"
        : "task-anchor",
    prompt: target.familiarity === "known"
      ? `Keep ${target.label} in view while tracing “${task.title}”.`
      : `Start with ${target.label} before changing code for “${task.title}”.`,
    codeAnchors: [...target.codeAnchors],
  };
};

export function buildTaskContext({
  task,
  graphify,
  learningGraph,
  options = {},
}: BuildTaskContextInput): TaskContextPacket {
  const taskId = requiredText(task.id, "task.id");
  const taskTitle = requiredText(task.title, "task.title");
  const codeAnchors = uniqueStrings(task.codeAnchors ?? []);
  const changedFiles = uniqueStrings(task.changedFiles ?? []);
  const files = uniqueStrings([...codeAnchors, ...changedFiles]);
  const staleAfterDays = nonNegativeNumber(options.staleAfterDays, DEFAULT_STALE_AFTER_DAYS, "staleAfterDays");
  const maxConcepts = positiveInteger(options.maxConcepts, DEFAULT_MAX_CONCEPTS, "maxConcepts");
  const maxGraphNodes = positiveInteger(options.maxGraphNodes, DEFAULT_MAX_GRAPH_NODES, "maxGraphNodes");
  const neighborhoodDepth = positiveInteger(options.neighborhoodDepth, DEFAULT_NEIGHBORHOOD_DEPTH, "neighborhoodDepth");
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(nowMs)) throw new Error("Invalid task context: options.now must be an ISO-compatible date-time");

  const neighborhood = buildNeighborhood(graphify, files, maxGraphNodes, neighborhoodDepth);
  const neighborhoodFiles = uniqueStrings(neighborhood.nodes.map((node) => node.source_file));
  const taskText = tokens([taskTitle, task.description ?? ""].join(" "));
  const states = new Map(learningGraph.concepts.map((concept) => [
    concept.id,
    deriveConceptState(concept, nowMs, staleAfterDays),
  ]));
  const candidates = learningGraph.concepts.flatMap((concept) => {
    const direct = concept.codeAnchors.some((anchor) => files.some((file) => pathMatches(anchor, file)));
    const neighborhoodMatch = concept.codeAnchors.some((anchor) => neighborhoodFiles.some((file) => pathMatches(anchor, file)));
    const textMatch = matchesTaskText(concept, taskText);
    if (!direct && !neighborhoodMatch && !textMatch) return [];
    const matchedBy: ContextMatch[] = [
      ...(direct ? ["task-file" as const] : []),
      ...(neighborhoodMatch ? ["graph-neighborhood" as const] : []),
      ...(textMatch ? ["task-text" as const] : []),
    ];
    const relevance = (direct ? 100 : 0) + (neighborhoodMatch ? 50 : 0) + (textMatch ? 10 : 0);
    return [{ concept, state: states.get(concept.id) as DerivedConceptState, matchedBy, relevance }];
  }).sort((left, right) =>
    right.relevance - left.relevance
    || conceptPriority(left.state.familiarity) - conceptPriority(right.state.familiarity)
    || left.concept.id.localeCompare(right.concept.id));
  const selected = candidates.slice(0, maxConcepts);
  const concepts = selected.map(({ state, matchedBy }) => contextConcept(state, matchedBy));
  const selectedIds = new Set(selected.map(({ concept }) => concept.id));
  const gaps = selected.flatMap(({ concept }) => concept.prerequisites.flatMap((prerequisiteId) => {
    const prerequisiteState = states.get(prerequisiteId);
    if (prerequisiteState?.familiarity === "known") return [];
    return [{
      conceptId: concept.id,
      conceptLabel: concept.label,
      prerequisiteId,
      prerequisiteLabel: prerequisiteState?.concept.label,
      prerequisiteStatus: prerequisiteState?.concept.status,
      prerequisiteFamiliarity: prerequisiteState?.familiarity ?? "missing",
      reason: gapReason(prerequisiteState),
    } satisfies PrerequisiteGap];
  })).sort((left, right) => {
    const leftSelected = selectedIds.has(left.prerequisiteId) ? 0 : 1;
    const rightSelected = selectedIds.has(right.prerequisiteId) ? 0 : 1;
    return leftSelected - rightSelected || left.conceptId.localeCompare(right.conceptId) || left.prerequisiteId.localeCompare(right.prerequisiteId);
  });

  return {
    schemaVersion: 1,
    task: {
      ...task,
      id: taskId,
      title: taskTitle,
      codeAnchors: [...codeAnchors],
      changedFiles: [...changedFiles],
    },
    source: {
      codeAnchors,
      changedFiles,
      files,
      unmatchedFiles: neighborhood.unmatchedFiles,
    },
    concepts,
    graphify: {
      builtAtCommit: graphify.built_at_commit,
      nodes: neighborhood.nodes,
      links: neighborhood.links,
    },
    prerequisiteGaps: gaps,
    attentionTarget: buildAttentionTarget(task, concepts, states, gaps),
    capabilityEvidence: false,
  };
}
