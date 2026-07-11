import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";

export function syntheticMilestone4CalculationInputEvidence(): CalculationInputEvidence {
  return {
    elementStepId: 40,
    elementGlobalId: "m4-wall",
    elementClass: "IfcWall",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      input("layer_order", [401]),
      input("layer_thickness", 0.14),
      input("layer_material_name", "Mineral wool"),
    ],
    candidateInputs: [
      input("layer_lambda", 0.041, "ifc_candidate", "Candidate material library hint."),
    ],
    missingInputs: [input("layer_lambda", null, "missing", "Lambda absent in uploaded IFC evidence.")],
    diagnostics: [],
  };
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  source: "ifc_fixed" | "ifc_candidate" | "missing" = "ifc_fixed",
  reason = "Synthetic Milestone 4 localhost fixture.",
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: source === "missing" ? "low" : "high",
    evidenceReferences: [
      {
        evidencePath: "SyntheticMilestone4Fixture#401",
        sourceStepIds: [401],
        pathParts: [{ stepId: 401, entityClass: "IfcMaterialLayer" }],
      },
    ],
    reason,
  };
}
