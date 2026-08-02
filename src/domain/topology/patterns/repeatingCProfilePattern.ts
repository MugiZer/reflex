import type { ComponentPattern } from "../componentPatternInterpreter.js";

/** Declarative recognition and Recipe policy only; numerical physics remains in the pinned worker. */
export const REPEATING_C_PROFILE_PATTERN: ComponentPattern = Object.freeze({
  patternId: "repeating-metal-c-profile",
  version: "1.0.0",
  lifecycle: "promoted",
  recognition: { profileKinds: ["c"], materialTokens: ["steel", "metal", "montant métallique"] },
  requiredAuthorities: ["profileKind", "memberMaterial"],
  permittedUnknowns: [{ key: "memberWidthM", values: [0.041, 0.075, 0.1], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "depth"] }],
  maxScenarioCount: 8,
  immaterialityGateWPerM2K: 0.03,
  recipeTemplate: {
    schemaVersion: "1.0.0-draft",
    topologyModule: { id: "repeating-parallel-profile-wall-2d", version: "1.0.0-draft" },
    periodicity: { value: 0.6, authority: { state: "user-confirmed", sourceRefs: ["component-pattern:c-spacing"] } },
    projectedArea: { value: 0.6, authority: { state: "validated-default", sourceRefs: ["contract:unit-out-of-plane-length"] } },
    layers: [{ id: "insulation-zone", material: { value: "mineral-wool", authority: { state: "ifc-derived", sourceRefs: ["IFC:material"] } }, thickness: { value: 0.15, authority: { state: "ifc-derived", sourceRefs: ["IFC:thickness"] } } }],
    rows: [{ id: "c-row", offsetX: { value: 0, authority: { state: "user-confirmed", sourceRefs: ["component-pattern:c-offset"] } }, originY: { value: 0, authority: { state: "user-confirmed", sourceRefs: ["component-pattern:c-origin"] } }, member: { primitive: { kind: "standard.c", version: "1.0.0", parameters: { depth: 0.075, flangeWidth: 0.05, gauge: 0.0015, lipWidth: 0.012 } }, material: { value: "galvanized-steel", authority: { state: "user-confirmed", sourceRefs: ["component-pattern:c-material"] } } } }],
    cavities: [], thermalBreaks: [],
    boundaries: { exterior: { value: "external-wall", authority: { state: "validated-default", sourceRefs: ["surface-profile:external-wall"] } }, interior: { value: "internal", authority: { state: "validated-default", sourceRefs: ["surface-profile:external-wall"] } }, left: "periodic", right: "periodic" },
  },
});
