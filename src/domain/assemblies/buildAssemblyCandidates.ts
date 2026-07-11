import { createHash } from "node:crypto";

import type {
  AssemblyCandidate,
  AssemblyEvidenceSummary,
  EvidenceSignature,
  EvidenceSignatureComponent,
  GroupingBasis,
} from "./assemblyTypes.js";
import type {
  Diagnostic,
  ElementEvidence,
  IfcEvidence,
  LayeredMaterialEvidence,
  MaterialEvidence,
  TypeEvidence,
} from "../evidence/evidenceTypes.js";
import { deriveEffectiveElementEvidence } from "../evidence/deriveEffectiveElementEvidence.js";
import type { EffectiveElementEvidence } from "../evidence/effectiveElementEvidenceTypes.js";

export const CONSERVATIVE_GROUPING_POLICY_VERSION =
  "conservative-material-association.v1";
export const ASSEMBLY_ARTIFACT_SCHEMA_VERSION = "ifc-evidence-artifacts.v1";

export type BuildAssemblyCandidatesResult = {
  assemblyCandidates: AssemblyCandidate[];
  diagnostics: Diagnostic[];
};

type GroupingDecision =
  | {
      kind: "single_element";
      groupingKey: string;
      basis: GroupingBasis;
      signatures: EvidenceSignature[];
      materialEvidence: MaterialEvidence[];
      diagnostics: Diagnostic[];
    }
  | {
      kind: "groupable";
      groupingKey: string;
      basis: GroupingBasis;
      signatures: EvidenceSignature[];
      materialEvidence: MaterialEvidence[];
      diagnostics: Diagnostic[];
    };

export interface AssemblyGroupingPolicy {
  getGroupingDecision(command: {
    element: ElementEvidence;
    typeEvidence: TypeEvidence | null;
    effectiveElementEvidence: EffectiveElementEvidence;
  }): GroupingDecision;
}

export function buildAssemblyCandidates(command: {
  ifcEvidence: IfcEvidence;
  groupingPolicy?: AssemblyGroupingPolicy;
}): BuildAssemblyCandidatesResult {
  const groupingPolicy =
    command.groupingPolicy ?? new ConservativeAssemblyGroupingPolicy();
  const typeEvidenceByStepId = new Map(
    command.ifcEvidence.typeEvidence.map((typeEvidence) => [
      typeEvidence.identity.stepId,
      typeEvidence,
    ]),
  );
  const effectiveResult = deriveEffectiveElementEvidence({
    ifcEvidence: command.ifcEvidence,
  });
  const effectiveEvidenceByStepId = new Map(
    effectiveResult.effectiveElementEvidence.map((evidence) => [
      evidence.elementStepId,
      evidence,
    ]),
  );
  const candidateGroups = new Map<
    string,
    {
      decision: GroupingDecision;
      elements: ElementEvidence[];
    }
  >();

  for (const element of command.ifcEvidence.elementEvidence) {
    const decision = groupingPolicy.getGroupingDecision({
      element,
      typeEvidence:
        element.identity.ifcTypeObjectStepId === null
          ? null
          : typeEvidenceByStepId.get(element.identity.ifcTypeObjectStepId) ??
            null,
      effectiveElementEvidence:
        effectiveEvidenceByStepId.get(element.identity.stepId) ??
        fallbackEffectiveElementEvidence(element),
    });
    const existing = candidateGroups.get(decision.groupingKey);
    if (existing) {
      existing.elements.push(element);
    } else {
      candidateGroups.set(decision.groupingKey, {
        decision,
        elements: [element],
      });
    }
  }

  const assemblyCandidates = Array.from(candidateGroups.values()).map(
    (group) =>
      toAssemblyCandidate({
        fileHash: command.ifcEvidence.fileEvidence.fileHash ?? "unknown-file",
        groupingKey: group.decision.groupingKey,
        basis: group.decision.basis,
        signatures: group.decision.signatures,
        materialEvidence: group.decision.materialEvidence,
        diagnostics: group.decision.diagnostics,
        elements: group.elements,
      }),
  );

  return {
    assemblyCandidates,
    diagnostics: assemblyCandidates.flatMap(
      (candidate) => candidate.groupingDiagnostics,
    ),
  };
}

export class ConservativeAssemblyGroupingPolicy
  implements AssemblyGroupingPolicy
{
  getGroupingDecision(command: {
    element: ElementEvidence;
    typeEvidence: TypeEvidence | null;
    effectiveElementEvidence: EffectiveElementEvidence;
  }): GroupingDecision {
    const singleElementKey = getSingleElementGroupingKey(command.element);

    if (command.element.identity.ifcTypeObjectStepId === null) {
      return {
        kind: "single_element",
        groupingKey: singleElementKey,
        basis: {
          basisKind: "single_element",
          reasons: ["Missing ifcTypeObjectStepId."],
        },
        signatures: [],
        materialEvidence: [],
        diagnostics: [],
      };
    }

    if (command.typeEvidence === null) {
      return {
        kind: "single_element",
        groupingKey: singleElementKey,
        basis: {
          basisKind: "single_element",
          reasons: ["Referenced Type Evidence was not extracted."],
        },
        signatures: [],
        materialEvidence: [],
        diagnostics: [],
      };
    }

    const effectiveSignature = getMaterialAssociationSignature(
      command.effectiveElementEvidence.effectiveMaterialEvidence,
    );

    if (command.effectiveElementEvidence.conflictDiagnostics.length > 0) {
      return {
        kind: "single_element",
        groupingKey: singleElementKey,
        basis: {
          basisKind: "single_element",
          reasons: ["Effective material evidence has occurrence/type conflicts."],
        },
        signatures: effectiveSignature === null ? [] : [effectiveSignature],
        materialEvidence: command.effectiveElementEvidence.effectiveMaterialEvidence,
        diagnostics: command.effectiveElementEvidence.conflictDiagnostics,
      };
    }

    if (effectiveSignature !== null) {
      return groupableDecision(
        command.element,
        effectiveSignature,
        command.effectiveElementEvidence.effectiveMaterialEvidence,
      );
    }

    return {
      kind: "single_element",
      groupingKey: singleElementKey,
      basis: {
        basisKind: "single_element",
        reasons: ["Missing effective material association signature."],
      },
      signatures: [],
      materialEvidence: [],
      diagnostics: [],
    };
  }
}

function groupableDecision(
  element: ElementEvidence,
  signature: EvidenceSignature,
  materialEvidence: MaterialEvidence[],
): GroupingDecision {
  const typeObjectStepId = element.identity.ifcTypeObjectStepId;
  if (typeObjectStepId === null) {
    throw new Error("Cannot group element without ifcTypeObjectStepId.");
  }

  const groupingKey = [
    "type",
    element.identity.elementClass,
    typeObjectStepId,
    signature.hash,
  ].join(":");

  return {
    kind: "groupable",
    groupingKey,
    basis: {
      basisKind: "shared_type_and_material_signature",
      typeObjectStepId,
      materialSignatureHash: signature.hash,
    },
    signatures: [signature],
    materialEvidence,
    diagnostics: [],
  };
}

function fallbackEffectiveElementEvidence(
  element: ElementEvidence,
): EffectiveElementEvidence {
  return {
    elementStepId: element.identity.stepId,
    elementGlobalId: element.identity.globalId,
    elementClass: element.identity.elementClass,
    ifcTypeObjectStepId: element.identity.ifcTypeObjectStepId,
    materialEvidenceSource:
      element.directMaterialEvidence.length > 0 ? "occurrence" : "none",
    effectiveMaterialEvidence: element.directMaterialEvidence,
    occurrenceMaterialEvidence: element.directMaterialEvidence,
    typeMaterialEvidence: [],
    candidatePropertyEvidence: element.candidatePropertyEvidence,
    evidenceReferences: element.evidenceReferences,
    conflictDiagnostics: [],
  };
}

function toAssemblyCandidate(command: {
  fileHash: string;
  groupingKey: string;
  basis: GroupingBasis;
  signatures: EvidenceSignature[];
  materialEvidence: MaterialEvidence[];
  diagnostics: Diagnostic[];
  elements: ElementEvidence[];
}): AssemblyCandidate {
  return {
    assemblyCandidateId: createAssemblyCandidateId({
      fileHash: command.fileHash,
      groupingKey: command.groupingKey,
    }),
    sourceElementStepIds: command.elements.map(
      (element) => element.identity.stepId,
    ),
    sourceElementGlobalIds: command.elements
      .map((element) => element.identity.globalId)
      .filter((globalId): globalId is string => globalId !== null),
    groupingKey: command.groupingKey,
    groupingBasis: command.basis,
    groupingConfidence: "high",
    groupingSignatures: command.signatures,
    groupingDiagnostics: command.diagnostics,
    evidenceSummary: deriveAssemblyEvidenceSummary({
      elements: command.elements,
      materialEvidence: command.materialEvidence,
    }),
  };
}

function createAssemblyCandidateId(command: {
  fileHash: string;
  groupingKey: string;
}) {
  const hash = createHash("sha256")
    .update(
      [
        command.fileHash,
        command.groupingKey,
        CONSERVATIVE_GROUPING_POLICY_VERSION,
        ASSEMBLY_ARTIFACT_SCHEMA_VERSION,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);
  return `ac_${hash}`;
}

function getSingleElementGroupingKey(element: ElementEvidence) {
  return [
    "single_element",
    element.identity.rawEntityClass,
    element.identity.stepId,
    element.identity.globalId ?? "no_global_id",
  ].join(":");
}

function getMaterialAssociationSignature(
  materialEvidence: MaterialEvidence[],
): EvidenceSignature | null {
  if (materialEvidence.length === 0) {
    return null;
  }

  const components = materialEvidence.flatMap((evidence, index) =>
    materialEvidenceSignatureComponents(evidence, index),
  );
  const hash = hashComponents(components);
  return {
    signatureKind: "material_association",
    signatureVersion: 1,
    hash,
    components,
  };
}

function materialEvidenceSignatureComponents(
  evidence: MaterialEvidence,
  index: number,
): EvidenceSignatureComponent[] {
  const layeredEvidence =
    evidence.materialStructureKind === "layer_set" ||
    evidence.materialStructureKind === "layer_set_usage"
      ? evidence
      : null;

  return [
    { key: "associationIndex", value: index },
    { key: "associationScope", value: evidence.associationScope },
    { key: "associationStepId", value: evidence.associationStepId },
    { key: "relatingMaterialStepId", value: evidence.relatingMaterialStepId },
    { key: "materialStructureKind", value: evidence.materialStructureKind },
    {
      key: "layerSetStepId",
      value: layeredEvidence?.layerSet.stepId ?? null,
      evidenceReference: layeredEvidence?.layerSet.evidenceReference,
    },
    { key: "layerCount", value: layeredEvidence?.layers.length ?? null },
    {
      key: "layerMaterialStepIds",
      value:
        layeredEvidence?.layers
          .map((layer) => layer.materialStepId ?? "null")
          .join(",") ?? null,
    },
    {
      key: "layerMaterialNames",
      value:
        layeredEvidence?.layers
          .map((layer) => layer.materialName ?? "null")
          .join("|") ?? null,
    },
    {
      key: "layerThicknessRawValues",
      value:
        layeredEvidence?.layers
          .map((layer) => layer.thickness?.rawValue ?? "null")
          .join(",") ?? null,
    },
  ];
}

function deriveAssemblyEvidenceSummary(command: {
  elements: ElementEvidence[];
  materialEvidence: MaterialEvidence[];
}): AssemblyEvidenceSummary {
  const materialEvidence =
    command.materialEvidence.length > 0
      ? command.materialEvidence
      : command.elements.flatMap((element) => element.directMaterialEvidence);
  const layeredEvidence = materialEvidence.filter(isLayeredMaterialEvidence);
  const layers = layeredEvidence.flatMap((evidence) => evidence.layers);
  const candidateProperties = command.elements.flatMap(
    (element) => element.candidatePropertyEvidence,
  );
  const lambdaCandidates = candidateProperties.filter(
    (candidate) => candidate.candidateKind === "lambda",
  );

  return {
    hasLayeredMaterialEvidence: layeredEvidence.length > 0,
    hasOrderedLayers: layeredEvidence.some(
      (evidence) => evidence.layerOrderSource === "IfcMaterialLayerSet.MaterialLayers",
    ),
    layerCount: layers.length,
    hasAllLayerThicknesses:
      layers.length > 0 && layers.every((layer) => layer.thickness !== null),
    missingLayerThicknessCount: layers.filter(
      (layer) => layer.thickness === null,
    ).length,
    hasAllMaterialNames:
      layers.length > 0 && layers.every((layer) => layer.materialName !== null),
    missingMaterialNameCount: layers.filter(
      (layer) => layer.materialName === null,
    ).length,
    hasAnyLambdaCandidates: lambdaCandidates.length > 0,
    hasAllLambdaCandidates:
      layers.length > 0 && lambdaCandidates.length >= layers.length,
    missingLambdaCandidateCount: Math.max(
      layers.length - lambdaCandidates.length,
      0,
    ),
    hasNonLayeredMaterialEvidence: materialEvidence.some(
      (evidence) =>
        evidence.materialStructureKind !== "layer_set" &&
        evidence.materialStructureKind !== "layer_set_usage",
    ),
    hasAssemblyThicknessCandidate: candidateProperties.some(
      (candidate) => candidate.candidateKind === "assembly_thickness",
    ),
    hasClassificationUncertainty: command.elements.some(
      (element) => element.identity.classification.needsUserConfirmation,
    ),
  };
}

function isLayeredMaterialEvidence(
  evidence: MaterialEvidence,
): evidence is LayeredMaterialEvidence {
  return (
    evidence.materialStructureKind === "layer_set" ||
    evidence.materialStructureKind === "layer_set_usage"
  );
}

function hashComponents(components: EvidenceSignatureComponent[]) {
  return createHash("sha256")
    .update(JSON.stringify(components.map(({ key, value }) => ({ key, value }))))
    .digest("hex");
}
