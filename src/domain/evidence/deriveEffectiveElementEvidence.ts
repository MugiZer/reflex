import type { Diagnostic, IfcEvidence, MaterialEvidence } from "./evidenceTypes.js";
import type { EffectiveElementEvidence } from "./effectiveElementEvidenceTypes.js";

export type DeriveEffectiveElementEvidenceResult = {
  effectiveElementEvidence: EffectiveElementEvidence[];
  diagnostics: Diagnostic[];
};

export function deriveEffectiveElementEvidence(command: {
  ifcEvidence: IfcEvidence;
}): DeriveEffectiveElementEvidenceResult {
  const typeEvidenceByStepId = new Map(
    command.ifcEvidence.typeEvidence.map((typeEvidence) => [
      typeEvidence.identity.stepId,
      typeEvidence,
    ]),
  );

  const effectiveElementEvidence = command.ifcEvidence.elementEvidence.map(
    (element) => {
      const typeEvidence =
        element.identity.ifcTypeObjectStepId === null
          ? null
          : typeEvidenceByStepId.get(element.identity.ifcTypeObjectStepId) ??
            null;
      const occurrenceMaterialEvidence = element.directMaterialEvidence;
      const typeMaterialEvidence = typeEvidence?.materialEvidence ?? [];
      const conflictDiagnostics = detectMaterialConflicts({
        occurrenceMaterialEvidence,
        typeMaterialEvidence,
      });
      const materialEvidenceSource =
        occurrenceMaterialEvidence.length > 0
          ? "occurrence"
          : typeMaterialEvidence.length > 0
            ? "type"
            : "none";
      const effectiveMaterialEvidence =
        materialEvidenceSource === "occurrence"
          ? occurrenceMaterialEvidence
          : materialEvidenceSource === "type"
            ? typeMaterialEvidence
            : [];

      return {
        elementStepId: element.identity.stepId,
        elementGlobalId: element.identity.globalId,
        elementClass: element.identity.elementClass,
        ifcTypeObjectStepId: element.identity.ifcTypeObjectStepId,
        materialEvidenceSource,
        effectiveMaterialEvidence,
        occurrenceMaterialEvidence,
        typeMaterialEvidence,
        candidatePropertyEvidence: dedupeByEvidencePath([
          ...element.candidatePropertyEvidence,
          ...(typeEvidence?.candidatePropertyEvidence ?? []),
        ]),
        evidenceReferences: dedupeEvidenceReferences([
          element.identity.evidenceReference,
          ...effectiveMaterialEvidence.map((evidence) => evidence.evidenceReference),
          ...element.evidenceReferences,
          ...(typeEvidence === null ? [] : [typeEvidence.identity.evidenceReference]),
        ]),
        conflictDiagnostics,
      } satisfies EffectiveElementEvidence;
    },
  );

  return {
    effectiveElementEvidence,
    diagnostics: effectiveElementEvidence.flatMap(
      (evidence) => evidence.conflictDiagnostics,
    ),
  };
}

function detectMaterialConflicts(command: {
  occurrenceMaterialEvidence: MaterialEvidence[];
  typeMaterialEvidence: MaterialEvidence[];
}): Diagnostic[] {
  if (
    command.occurrenceMaterialEvidence.length === 0 ||
    command.typeMaterialEvidence.length === 0
  ) {
    return [];
  }

  const occurrenceSignature = materialSemanticSignature(
    command.occurrenceMaterialEvidence,
  );
  const typeSignature = materialSemanticSignature(command.typeMaterialEvidence);
  if (occurrenceSignature === typeSignature) {
    return [];
  }

  return [
    {
      code: "effective_material_evidence_conflict",
      severity: "warning",
      message:
        `Occurrence material evidence differs from type material evidence; occurrence evidence is effective and both sources are preserved. Evidence paths: ${[
          ...command.occurrenceMaterialEvidence,
          ...command.typeMaterialEvidence,
        ].map((evidence) => evidence.evidenceReference.evidencePath).join(", ")}.`,
      stepIds: [
        ...command.occurrenceMaterialEvidence.map(
          (evidence) => evidence.associationStepId,
        ),
        ...command.typeMaterialEvidence.map(
          (evidence) => evidence.associationStepId,
        ),
      ],
    },
  ];
}

function dedupeByEvidencePath<T extends { evidenceReference: { evidencePath: string } }>(
  values: T[],
): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.evidenceReference.evidencePath;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeEvidenceReferences<
  T extends { evidencePath: string },
>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.evidencePath)) {
      return false;
    }
    seen.add(value.evidencePath);
    return true;
  });
}

function materialSemanticSignature(materialEvidence: MaterialEvidence[]): string {
  return JSON.stringify(
    materialEvidence.map((evidence) => ({
      materialStructureKind: evidence.materialStructureKind,
      relatingMaterialStepId: evidence.relatingMaterialStepId,
      materialNames: materialNames(evidence),
      layerThicknesses: layerThicknesses(evidence),
    })),
  );
}

function materialNames(evidence: MaterialEvidence): Array<string | null> {
  if (evidence.materialStructureKind === "single_material") {
    return [evidence.materialName];
  }
  if (
    evidence.materialStructureKind === "layer_set" ||
    evidence.materialStructureKind === "layer_set_usage"
  ) {
    return evidence.layers.map((layer) => layer.materialName);
  }
  if (evidence.materialStructureKind === "material_list") {
    return evidence.materialNames;
  }
  if (evidence.materialStructureKind === "constituent_set") {
    return evidence.constituents.map((constituent) => constituent.materialName);
  }
  return [];
}

function layerThicknesses(evidence: MaterialEvidence): Array<number | null> {
  if (
    evidence.materialStructureKind !== "layer_set" &&
    evidence.materialStructureKind !== "layer_set_usage"
  ) {
    return [];
  }
  return evidence.layers.map((layer) => layer.thickness?.normalizedValue ?? null);
}
