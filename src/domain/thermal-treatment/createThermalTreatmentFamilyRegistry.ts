import type { ThermalTreatmentFamily, ThermalTreatmentFamilyIdentity, ThermalTreatmentFamilyRegistry } from "./thermalTreatmentTypes.js";

/** Resolves families without exposing construction details to the generic calculation kernel. */
export function createThermalTreatmentFamilyRegistry(families: readonly ThermalTreatmentFamily[]): ThermalTreatmentFamilyRegistry {
  const familiesByIdentity = new Map(families.map((family) => [familyIdentityKey(family.identity), family]));
  if (familiesByIdentity.size !== families.length) throw new Error("Thermal Treatment family registry contains duplicate family identities.");

  return {
    availableFamilies: () => families,
    findByIdentity: (identity) => familiesByIdentity.get(familyIdentityKey(identity)) ?? null,
  };
}

function familyIdentityKey(identity: ThermalTreatmentFamilyIdentity): string {
  return `${identity.familyId}@${identity.familyVersion}`;
}