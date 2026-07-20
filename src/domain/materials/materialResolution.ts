import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { MaterialLibraryEntry, MaterialLibrary, MaterialMatchBasis, MaterialResolution, SpecialPhysicsIssue } from "./materialTypes.js";

type MaterialVariant = {
  value: string;
  basis: MaterialMatchBasis;
};

export function normalizeMaterialName(value: string | null): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveMaterialName(
  materialName: string | null,
  materialLibrary: MaterialLibrary,
): MaterialResolution {
  const rawMaterialName = materialName;
  const repairedMaterialName = materialName === null ? null : repairMojibake(materialName);
  const normalizedMaterialName = normalizeMaterialName(repairedMaterialName);
  const nameForMatching = materialName ?? "";
  if (normalizedMaterialName.length === 0) {
    return unresolvedResolution(materialName, normalizedMaterialName, [], "Material name is missing.");
  }

  const special = specialIssueForMaterialName(materialName);
  if (special !== null && special.code !== "product_sensitive") {
    return {
      rawMaterialName,
      normalizedMaterialName,
      status: "special_physics",
      matchedMaterialKey: null,
      matchedMaterialName: null,
      matchBasis: null,
      candidateMaterialKeys: [],
      reason: special.message,
      evidenceState: "unresolved",
    };
  }

  const matches = new Map<string, { entry: MaterialLibraryEntry; basis: MaterialMatchBasis }>();
  for (const variant of materialVariants(nameForMatching)) {
    for (const entry of materialLibrary.entries) {
      if (entry.autoResolve === false || entry.familyKind === "special_physics" ||
        (entry.familyKind === "product_sensitive" && entry.autoResolve !== true)) {
        continue;
      }
      const aliases = [entry.displayName, ...entry.aliases].map(normalizeMaterialName);
      if (aliases.includes(variant.value) && !matches.has(entry.materialKey)) {
        matches.set(entry.materialKey, { entry, basis: variant.basis });
      }
    }
  }

  if (matches.size === 1) {
    const match = [...matches.values()][0];
    return {
      rawMaterialName,
      normalizedMaterialName,
      status: "resolved",
      matchedMaterialKey: match.entry.materialKey,
      matchedMaterialName: match.entry.displayName,
      matchBasis: match.basis,
      candidateMaterialKeys: [match.entry.materialKey],
      reason: "Unique eligible Material Library match for '" + materialName + "'.",
      evidenceState: "library_assisted",
    };
  }

  if (matches.size > 1) {
    return {
      rawMaterialName,
      normalizedMaterialName,
      status: "ambiguous",
      matchedMaterialKey: null,
      matchedMaterialName: null,
      matchBasis: null,
      candidateMaterialKeys: [...matches.keys()].sort(),
      reason: "Material name '" + materialName + "' matches multiple eligible Material Library families.",
      evidenceState: "unresolved",
    };
  }

  const suggestions = suggestedFamilies(nameForMatching, materialLibrary);
  return unresolvedResolution(
    materialName,
    normalizedMaterialName,
    suggestions,
    suggestions.length > 1
      ? "Material name '" + materialName + "' needs a family decision before lambda can be selected."
      : "No unique eligible Material Library match was found for '" + materialName + "'.",
  );
}

export function specialPhysicsIssuesForEvidence(command: {
  evidence: CalculationInputEvidence;
  materialLibrary: MaterialLibrary;
}): SpecialPhysicsIssue[] {
  const issues: SpecialPhysicsIssue[] = [];
  const evidence = command.evidence;

  if (evidence.elementClass === "IfcCurtainWall") {
    issues.push({
      code: "curtain_wall",
      label: "Curtain wall assembly evidence",
      message: "Curtain walls do not prove one ordered opaque serial layer stack.",
      nextAction: "Provide the curtain-wall opaque panel and framing assembly evidence.",
    });
  }
  if (evidence.elementClass === "IfcSlab" && evidence.calculationInputBasis !== "layered_ifc_complete") {
    issues.push({
      code: "uncertain_slab_role",
      label: "Slab role and boundary condition",
      message: "The slab role and boundary condition are not proven by material lookup alone.",
      nextAction: "Confirm whether this slab is an exterior floor, ground-contact slab, or another boundary.",
    });
  }
  if (
    evidence.calculationInputBasis === "non_layered_estimate_possible" ||
    evidence.calculationInputBasis === "blocked_missing_evidence"
  ) {
    issues.push({
      code: "non_layered_assembly",
      label: "Non-layered assembly evidence",
      message: "The IFC does not prove an ordered layer stack for this assembly.",
      nextAction: "Provide an ordered IFC material layer set or consultant assembly evidence.",
    });
  }

  const layerInputs = [...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs]
    .filter((input) => input.field === "layer_material_name");
  if (layerInputs.some((input) => input.layer?.materialName === null || (input.layer === undefined && typeof input.value !== "string"))) {
    issues.push({
      code: "unnamed_layer",
      label: "Unnamed IFC layer",
      message: "At least one layer has no IFC material name, so its material evidence cannot be audited.",
      nextAction: "Name the IFC material layer or provide source-backed material evidence.",
    });
  }

  const materialNames = layerInputs
    .map((input) => typeof input.value === "string" ? input.value : input.layer?.materialName)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  for (const materialName of materialNames) {
    const special = specialIssueForMaterialName(materialName);
    if (special !== null && !issues.some((issue) => issue.code === special.code)) {
      issues.push(special);
    }
    if (
      special?.code === "product_sensitive" &&
      resolveMaterialName(materialName, command.materialLibrary).status === "resolved"
    ) {
      const index = issues.findIndex((issue) => issue.code === "product_sensitive");
      if (index >= 0) issues.splice(index, 1);
    }
  }

  return uniqueIssues(issues);
}

export function specialIssueForMaterialName(materialName: string | null): SpecialPhysicsIssue | null {
  const normalized = normalizeMaterialName(materialName);
  if (normalized.length === 0) return null;
  if (/\b(air cavity|air space|cavite air|cavity|void air|vide air)\b/.test(normalized)) {
    return {
      code: "air_cavity",
      label: "Air cavity",
      message: "An air cavity is not an ordinary serial material layer.",
      nextAction: "Model the cavity using a cavity or surface-resistance treatment.",
    };
  }
  if (/\b(metal stud|metal furring|metal framing|steel stud|metallic stud|montant metallique|z bar|metal cladding|metal fixing|metal fastener|aluminum|aluminium|resilient bar|resilient bars|barres resilientes)\b/.test(normalized)) {
    return {
      code: "metal_path",
      label: "Metal framing or fixing path",
      message: "Metal framing, cladding, and fixings require a parallel-path or thermal-bridge treatment.",
      nextAction: "Provide a parallel-path or thermal-bridge model for the metal path.",
    };
  }
  if (/\b(membrane|lightweight concrete|light weight concrete|concrete panel|panneau beton leger|lightweight panel)\b/.test(normalized)) {
    return {
      code: "product_sensitive",
      label: "Product-sensitive material",
      message: "This material family has materially variable product performance and is not safe as a generic serial lambda.",
      nextAction: "Provide approved product lambda evidence or select a documented product value.",
    };
  }
  return null;
}

function materialVariants(materialName: string): MaterialVariant[] {
  const variants: MaterialVariant[] = [];
  const original = normalizeMaterialName(materialName);
  const repaired = normalizeMaterialName(repairMojibake(materialName));
  addVariant(variants, original, original === repaired ? "exact_alias" : "mojibake_repaired");
  if (repaired !== original) {
    addVariant(variants, repaired, "mojibake_repaired");
  }

  for (const variant of [...variants]) {
    const withoutDimensions = variant.value
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|in|po)\b/g, " ")
      .replace(/\b\d+\s*x\s*\d+(?:\s*x\s*\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    addVariant(
      variants,
      stripNamingPrefixes(withoutDimensions),
      variant.basis === "mojibake_repaired" ? "mojibake_repaired" : "naming_noise_removed",
    );
  }
  return variants;
}

function stripNamingPrefixes(value: string): string {
  let result = value;
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result
      .replace(/^(?:lma|ifc|material|mat|project|csi|type|prefix)\s+/i, "")
      .replace(/^\d{1,5}\s+/, "")
      .trim();
  }
  return result;
}

function repairMojibake(value: string): string {
  if (!/[\u00c3\u00c2\u00e2]/.test(value)) return value;
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    return repaired.includes("\uFFFD") ? value : repaired;
  } catch {
    return value;
  }
}

function suggestedFamilies(materialName: string, materialLibrary: MaterialLibrary): string[] {
  const normalized = normalizeMaterialName(materialName);
  const keys = materialLibrary.entries
    .filter((entry) => entry.autoResolve !== false && entry.familyKind !== "product_sensitive" && entry.familyKind !== "special_physics")
    .filter((entry) => {
      const label = normalizeMaterialName(entry.materialKey + " " + entry.displayName + " " + entry.aliases.join(" "));
      if (/\b(insulation|isolant)\b/.test(normalized)) {
        return /\b(insulation|isolant|mineral wool|laine)\b/.test(label);
      }
      if (/\b(wood|bois|timber)\b/.test(normalized)) {
        return /\b(wood|bois|timber|plywood|contreplaque)\b/.test(label);
      }
      return false;
    })
    .map((entry) => entry.materialKey);
  return [...new Set(keys)].sort();
}

function unresolvedResolution(
  rawMaterialName: string | null,
  normalizedMaterialName: string,
  candidateMaterialKeys: string[],
  reason: string,
): MaterialResolution {
  return {
    rawMaterialName,
    normalizedMaterialName,
    status: candidateMaterialKeys.length > 1 ? "ambiguous" : "unresolved",
    matchedMaterialKey: null,
    matchedMaterialName: null,
    matchBasis: null,
    candidateMaterialKeys,
    reason,
    evidenceState: "unresolved",
  };
}

function addVariant(variants: MaterialVariant[], value: string, basis: MaterialMatchBasis): void {
  if (value && !variants.some((variant) => variant.value === value)) {
    variants.push({ value, basis });
  }
}

function uniqueIssues(issues: SpecialPhysicsIssue[]): SpecialPhysicsIssue[] {
  const seen = new Set<SpecialPhysicsIssue["code"]>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) return false;
    seen.add(issue.code);
    return true;
  });
}
