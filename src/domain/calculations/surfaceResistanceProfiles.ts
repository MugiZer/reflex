import type { ElementClass } from "../evidence/evidenceTypes.js";
import type { SurfaceResistanceProfile } from "./calculationTypes.js";

export function defaultSurfaceResistanceProfileFor(
  elementClass: ElementClass,
): SurfaceResistanceProfile {
  if (elementClass === "IfcRoof") {
    return {
      profileId: "roof_upward",
      rsi: 0.1,
      rse: 0.04,
      sourceLabel: "Milestone 3 default profile",
      assumptions: ["Default roof upward heat-flow surface resistance profile."],
    };
  }
  if (elementClass === "IfcSlab") {
    return {
      profileId: "floor_downward",
      rsi: 0.17,
      rse: 0.04,
      sourceLabel: "Milestone 3 default profile",
      assumptions: ["Default floor downward heat-flow profile; slab classification should be reviewed."],
    };
  }
  return {
    profileId: "external_wall_vertical",
    rsi: 0.13,
    rse: 0.04,
    sourceLabel: "Milestone 3 default profile",
    assumptions: ["Default external wall vertical heat-flow surface resistance profile."],
  };
}
