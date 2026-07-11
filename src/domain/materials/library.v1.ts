import type { MaterialLibrary } from "./materialTypes.js";

export const defaultMaterialLibraryV1: MaterialLibrary = {
  version: "materials.library.v1",
  entries: [
    {
      materialKey: "mineral_wool",
      displayName: "Mineral wool",
      aliases: ["mineral wool", "rock wool", "stone wool"],
      lambdaWPerMK: 0.04,
      sourceLabel: "Milestone 3 seed library",
      confidence: "high",
    },
    {
      materialKey: "concrete",
      displayName: "Concrete",
      aliases: ["concrete", "cast concrete"],
      lambdaWPerMK: 1.7,
      sourceLabel: "Milestone 3 seed library",
      confidence: "medium",
    },
  ],
};
