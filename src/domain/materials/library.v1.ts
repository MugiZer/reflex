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
    {
      materialKey: "rigid_insulation",
      displayName: "Rigid insulation",
      aliases: ["isolant rigide", "07 isolant rigide"],
      lambdaWPerMK: 0.032,
      sourceLabel: "Prototype reference library - confirm product data",
      confidence: "medium",
    },
    {
      materialKey: "semi_rigid_insulation",
      displayName: "Semi-rigid insulation",
      aliases: ["isolant semi rigide", "07 isolant semi rigide", "br h vert iso semi rig"],
      lambdaWPerMK: 0.04,
      sourceLabel: "Prototype reference library - confirm product data",
      confidence: "medium",
    },
    {
      materialKey: "gypsum_board",
      displayName: "Gypsum board",
      aliases: ["gypse", "gypse mural", "plaque de mur de gypse", "lma gypse 16mm", "lma gypse 25mm"],
      lambdaWPerMK: 0.25,
      sourceLabel: "Prototype reference library - confirm product data",
      confidence: "medium",
    },
    {
      materialKey: "plywood",
      displayName: "Plywood",
      aliases: ["contreplaque", "contreplaque traite", "06 bois contreplaque traite", "lma 06 contreplaque traite"],
      lambdaWPerMK: 0.13,
      sourceLabel: "Prototype reference library - confirm product data",
      confidence: "medium",
    },
    {
      materialKey: "softwood",
      displayName: "Softwood",
      aliases: ["bois", "structure madriers de bois", "montant bois", "lma montant bois non porteuse", "lma montant bois porteuse"],
      lambdaWPerMK: 0.13,
      sourceLabel: "Prototype reference library - confirm product data",
      confidence: "medium",
    },
  ],
};
