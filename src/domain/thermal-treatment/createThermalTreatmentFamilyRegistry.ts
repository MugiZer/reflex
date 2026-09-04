import { assertValidThermalTreatmentPacks } from "./evaluateThermalTreatmentTrust.js";
import type { GeneratedThermalTreatmentFamily, ThermalTreatmentFamily, ThermalTreatmentFamilyIdentity, ThermalTreatmentFamilyRegistry } from "./thermalTreatmentTypes.js";

/** Resolves families without exposing construction details to the generic calculation kernel. */
export function createThermalTreatmentFamilyRegistry(families: readonly ThermalTreatmentFamily[]): ThermalTreatmentFamilyRegistry {
  for (const family of families) assertValidThermalTreatmentPacks(family);
  const allFamiliesByIdentity = new Map(families.map((family) => [familyIdentityKey(family.identity), family]));
  if (allFamiliesByIdentity.size !== families.length) throw new Error("Thermal Treatment family registry contains duplicate family identities.");
  const enabledFamilies = families.filter((family) => !isGeneratedFamily(family) || family.qualification.decision === "go");
  const familiesByIdentity = new Map(enabledFamilies.map((family) => [familyIdentityKey(family.identity), family]));

  return {
    availableFamilies: () => enabledFamilies,
    findByIdentity: (identity) => familiesByIdentity.get(familyIdentityKey(identity)) ?? null,
  };
}

function isGeneratedFamily(family: ThermalTreatmentFamily): family is GeneratedThermalTreatmentFamily {
  return "generation" in family && "qualification" in family;
}

function familyIdentityKey(identity: ThermalTreatmentFamilyIdentity): string {
  return `${identity.familyId}@${identity.familyVersion}`;
}
