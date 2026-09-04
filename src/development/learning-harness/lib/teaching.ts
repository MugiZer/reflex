import {
  LEARNING_STATUSES,
  type LearningGraph,
  type LearningStatus,
} from "./capabilityAssessment.js";

export type GraphifyNode = {
  id: string;
  label: string;
  source_file?: string;
  source_location?: string;
  community_name?: string;
};

export type GraphifyLink = {
  source: string;
  target: string;
  relation: string;
  confidence?: string;
  source_file?: string;
  source_location?: string;
};

export type GraphifyGraph = {
  built_at_commit?: string;
  nodes: GraphifyNode[];
  links: GraphifyLink[];
};

export type TeachingQuestionKind =
  | "value-shape"
  | "call-flow"
  | "time-flow"
  | "state-transition"
  | "ownership"
  | "change"
  | "algorithm"
  | "boundary"
  | "failure";

export type TeachingRepresentationKind =
  | "object-shape"
  | "call-tree"
  | "sequence"
  | "state-diagram"
  | "file-tree"
  | "diff"
  | "pseudocode"
  | "boundary-diagram"
  | "expected-vs-actual";

export type TeachingSliceDefinition = {
  id: string;
  title: string;
  objective: string;
  conceptIds: string[];
  codeAnchors: string[];
  boundary: string;
  failurePath: string;
  proof: string;
  visual: {
    questionKind: TeachingQuestionKind;
    question: string;
    focus: string;
    highlightedPath: string[];
    baseline?: string[];
    anomaly?: string[];
    applicationQuestion: string;
  };
};

export type TeachingPacket = {
  schemaVersion: 1;
  sliceId: string;
  title: string;
  objective: string;
  conceptIds: string[];
  representation: {
    kind: TeachingRepresentationKind;
    question: string;
    focus: string;
    highlightedPath: string[];
    baseline?: string[];
    anomaly?: string[];
    attentionBudget: { readonly maxMeaningfulNodes: 7 };
    graphNodes: Array<Pick<GraphifyNode, "id" | "label" | "source_file" | "source_location">>;
    graphEdges: GraphifyLink[];
  };
  source: {
    codeAnchors: string[];
    missingAnchors: string[];
    omittedAnchors: string[];
  };
  explanation: {
    invariant: string;
    failurePath: string;
  };
  earningCheck: {
    prompt: string;
    proof: string;
  };
  capabilityEvidence: false;
};

const VISUAL_ATTENTION_BUDGET = { maxMeaningfulNodes: 7 } as const;

const representationByQuestion: Record<TeachingQuestionKind, TeachingRepresentationKind> = {
  "value-shape": "object-shape",
  "call-flow": "call-tree",
  "time-flow": "sequence",
  "state-transition": "state-diagram",
  ownership: "file-tree",
  change: "diff",
  algorithm: "pseudocode",
  boundary: "boundary-diagram",
  failure: "expected-vs-actual",
};

const normalizedPath = (path: string | undefined): string => path?.replaceAll("\\", "/") ?? "";
const normalizedText = (value: string): string => value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
const ignoredGraphPath = (path: string | undefined): boolean =>
  normalizedPath(path).startsWith(".scratch/")
  || normalizedPath(path).startsWith("graphify-out/memory/");

const scopedGraph = (graph: GraphifyGraph): GraphifyGraph => {
  const nodes = graph.nodes.filter((node) => !ignoredGraphPath(node.source_file));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    built_at_commit: graph.built_at_commit,
    nodes,
    links: graph.links.filter(
      (link) => ids.has(link.source) && ids.has(link.target) && !ignoredGraphPath(link.source_file),
    ),
  };
};

const rankedAnchorNodes = (
  graph: GraphifyGraph,
  anchors: string[],
): Array<Pick<GraphifyNode, "id" | "label" | "source_file" | "source_location">> => {
  const anchorSet = new Set(anchors.map(normalizedPath));
  const candidates = graph.nodes.filter((node) => anchorSet.has(normalizedPath(node.source_file)));
  return [...anchorSet].flatMap((anchor) => candidates
    .filter((node) => normalizedPath(node.source_file) === anchor)
    .sort((left, right) => {
      const rank = (node: GraphifyNode): number => {
        if (node.source_location === "L1" && /\.(ts|py)$/.test(node.label)) return 0;
        if (node.label.endsWith("()")) return 1;
        if (node.source_location === "L1") return 2;
        return 3;
      };
      return rank(left) - rank(right) || left.label.localeCompare(right.label);
    })
    .slice(0, 3));
};

const buildTeachingPacket = (
  graphify: GraphifyGraph,
  definition: TeachingSliceDefinition,
): TeachingPacket => {
  const graph = scopedGraph(graphify);
  const candidateNodes = rankedAnchorNodes(graph, definition.codeAnchors);
  const highlightedTerms = definition.visual.highlightedPath.map(normalizedText).filter(Boolean);
  const relevanceScore = (node: (typeof candidateNodes)[number]): number => {
    const label = normalizedText(node.label);
    return highlightedTerms.reduce(
      (score, term) => score + (label.includes(term) || term.includes(label) ? 1 : 0),
      0,
    );
  };
  const selectedIds = new Set<string>();
  const representativeNodes = definition.codeAnchors.flatMap((anchor) => {
    const node = candidateNodes.find((candidate) => normalizedPath(candidate.source_file) === normalizedPath(anchor));
    if (!node || selectedIds.has(node.id)) return [];
    selectedIds.add(node.id);
    return [node];
  });
  const detailNodes = candidateNodes
    .filter((node) => !selectedIds.has(node.id) && relevanceScore(node) > 0)
    .map((node, index) => ({ node, index }))
    .sort((left, right) => relevanceScore(right.node) - relevanceScore(left.node) || left.index - right.index)
    .map(({ node }) => node);
  const graphNodes = [...representativeNodes, ...detailNodes]
    .slice(0, VISUAL_ATTENTION_BUDGET.maxMeaningfulNodes);
  const visibleNodeIds = new Set(graphNodes.map((node) => node.id));
  const representedAnchors = new Set(graphNodes.map((node) => normalizedPath(node.source_file)));
  const foundAnchors = new Set(candidateNodes.map((node) => normalizedPath(node.source_file)));
  const missingAnchors = definition.codeAnchors.filter((anchor) => !foundAnchors.has(normalizedPath(anchor)));
  const missingSet = new Set(missingAnchors.map(normalizedPath));
  const omittedAnchors = definition.codeAnchors.filter((anchor) => {
    const normalized = normalizedPath(anchor);
    return !missingSet.has(normalized) && !representedAnchors.has(normalized);
  });

  return {
    schemaVersion: 1,
    sliceId: definition.id,
    title: definition.title,
    objective: definition.objective,
    conceptIds: [...definition.conceptIds],
    representation: {
      kind: representationByQuestion[definition.visual.questionKind],
      question: definition.visual.question,
      focus: definition.visual.focus,
      highlightedPath: [...definition.visual.highlightedPath],
      baseline: definition.visual.baseline ? [...definition.visual.baseline] : undefined,
      anomaly: definition.visual.anomaly ? [...definition.visual.anomaly] : undefined,
      attentionBudget: VISUAL_ATTENTION_BUDGET,
      graphNodes,
      graphEdges: graph.links.filter(
        (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
      ),
    },
    source: {
      codeAnchors: [...definition.codeAnchors],
      missingAnchors,
      omittedAnchors,
    },
    explanation: {
      invariant: definition.boundary,
      failurePath: definition.failurePath,
    },
    earningCheck: {
      prompt: definition.visual.applicationQuestion,
      proof: definition.proof,
    },
    capabilityEvidence: false,
  };
};

const statusRank = (status: LearningStatus): number => LEARNING_STATUSES.indexOf(status);

export function buildTeachingFrontier(
  graphify: GraphifyGraph,
  learningGraph: LearningGraph,
  definitions: TeachingSliceDefinition[],
): TeachingPacket[] {
  const concepts = new Map(learningGraph.concepts.map((concept) => [concept.id, concept]));
  const packets = definitions.map((definition) => buildTeachingPacket(graphify, definition));
  return packets.sort((left, right) => {
    const score = (packet: TeachingPacket): number => packet.conceptIds.reduce((total, id) => {
      const concept = concepts.get(id);
      return total + (concept ? LEARNING_STATUSES.length - statusRank(concept.status) : 0);
    }, 0) - packet.source.missingAnchors.length * 100;
    return score(right) - score(left);
  });
}
