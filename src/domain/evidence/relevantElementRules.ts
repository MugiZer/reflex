import type { Confidence, ElementClass } from "./evidenceTypes.js";

export const RELEVANT_ELEMENT_RULES_VERSION = "relevant-element-rules.v1";

export type RelevantElementRule = {
  rawEntityClass: string;
  elementClass: ElementClass;
  classificationConfidence: Confidence;
  inclusionReason: string;
  needsHints: boolean;
};

export const RELEVANT_ELEMENT_RULES: RelevantElementRule[] = [
  {
    rawEntityClass: "IfcWall",
    elementClass: "IfcWall",
    classificationConfidence: "high",
    inclusionReason: "Milestone 1 relevant wall element.",
    needsHints: false,
  },
  {
    rawEntityClass: "IfcWallStandardCase",
    elementClass: "IfcWall",
    classificationConfidence: "high",
    inclusionReason:
      "Milestone 1 relevant legacy wall element normalized to IfcWall.",
    needsHints: false,
  },
  {
    rawEntityClass: "IfcSlab",
    elementClass: "IfcSlab",
    classificationConfidence: "high",
    inclusionReason: "Milestone 1 relevant slab element.",
    needsHints: false,
  },
  {
    rawEntityClass: "IfcRoof",
    elementClass: "IfcRoof",
    classificationConfidence: "high",
    inclusionReason: "Milestone 1 relevant roof element.",
    needsHints: false,
  },
  {
    rawEntityClass: "IfcCurtainWall",
    elementClass: "IfcCurtainWall",
    classificationConfidence: "high",
    inclusionReason: "Milestone 1 relevant curtain wall element.",
    needsHints: false,
  },
  {
    rawEntityClass: "IfcBuildingElementProxy",
    elementClass: "IfcBuildingElementProxy",
    classificationConfidence: "low",
    inclusionReason: "Building element proxy matched static envelope hints.",
    needsHints: true,
  },
];

export const PROXY_ENVELOPE_HINTS = [
  "wall",
  "slab",
  "roof",
  "curtain",
  "envelope",
  "facade",
  "exterior",
  "external",
] as const;

export const SKIPPED_SCOPE_CLASS_RULES = [
  {
    rawEntityClass: "IfcCovering",
    reason: "Future scope; requires host association logic.",
  },
  {
    rawEntityClass: "IfcDoor",
    reason: "Out of Milestone 1 thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcWindow",
    reason: "Out of Milestone 1 thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcOpeningElement",
    reason: "Out of Milestone 1 thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcSpace",
    reason: "Out of Milestone 1 thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcBeam",
    reason: "Out of Milestone 1 top-level thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcColumn",
    reason: "Out of Milestone 1 top-level thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcPlate",
    reason: "Out of Milestone 1 top-level thermal assembly scope.",
  },
  {
    rawEntityClass: "IfcMember",
    reason: "Out of Milestone 1 top-level thermal assembly scope.",
  },
] as const;
