import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";

export type EvidenceReadinessState = "ready" | "needs_review" | "estimated" | "blocked";

/** Central readiness policy for projections that only have Calculation-Input Evidence. */
export function deriveEvidenceReadinessState(
  evidence: CalculationInputEvidence[],
): EvidenceReadinessState {
  if (evidence.length === 0) {
    return "blocked";
  }
  if (evidence.some((item) => item.calculationInputBasis === "blocked_missing_evidence")) {
    return "blocked";
  }
  if (evidence.some((item) => item.calculationInputBasis === "non_layered_estimate_possible")) {
    return "estimated";
  }
  return evidence.some((item) => item.missingInputs.length > 0) ? "needs_review" : "ready";
}