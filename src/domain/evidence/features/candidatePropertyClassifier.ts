import type {
  CandidatePropertyEvidence,
  PropertySetEvidence,
  QuantitySetEvidence,
} from "../evidenceTypes.js";
import { findDatapointByCandidateName } from "../../datapoints/calculationDatapointRegistry.js";

export function candidatePropertiesFromPropertySet(
  propertySet: PropertySetEvidence,
): CandidatePropertyEvidence[] {
  return propertySet.properties.flatMap((property): CandidatePropertyEvidence[] => {
    const propertyName = property.name ?? "";
    const normalizedName = normalizeName(propertyName);
    const base = {
      propertySetName: propertySet.name,
      propertyName,
      rawValue: property.rawValue,
      rawUnit: property.rawUnit,
      evidenceReference: property.evidenceReference,
    };

    const datapoint = findDatapointByCandidateName(propertyName);
    if (datapoint?.key === "lambda") {
      return [
        {
          ...base,
          candidateKind: "lambda" as const,
          normalizedValue: property.numericEvidence?.normalizedValue ?? null,
          normalizedUnit: "W/mK",
          confidence:
            property.numericEvidence?.unitSource === "ifc_property_unit"
              ? ("high" as const)
              : ("medium" as const),
          reason: "Property name is a broad thermal conductivity candidate.",
          lambdaClassification:
            property.numericEvidence?.unitSource === "ifc_property_unit"
              ? ("confirmed_lambda" as const)
              : ("candidate_lambda" as const),
        },
      ];
    }

    if (datapoint !== null) {
      return [
        {
          ...base,
          candidateKind: candidateKindFor(datapoint.key),
          normalizedValue: property.numericEvidence?.normalizedValue ?? null,
          normalizedUnit: datapoint.unit ?? property.numericEvidence?.normalizedUnit ?? "",
          confidence: "medium" as const,
          reason: `Property name is a candidate for calculation datapoint ${datapoint.key}.`,
        },
      ];
    }

    if (normalizedName.includes("thickness") || normalizedName === "width") {
      return [
        {
          ...base,
          candidateKind: "assembly_thickness" as const,
          normalizedValue: property.numericEvidence?.normalizedValue ?? null,
          normalizedUnit: "m",
          confidence: "medium" as const,
          reason: "Generic thickness property is assembly thickness evidence, not confirmed layer thickness.",
        },
      ];
    }

    if (
      normalizedName.includes("reference") ||
      normalizedName.includes("classification") ||
      normalizedName.includes("predefined")
    ) {
      return [
        {
          ...base,
          candidateKind: "classification" as const,
          confidence: "medium" as const,
          reason: "Property name may help classify the source element.",
        },
      ];
    }

    if (normalizedName.includes("material")) {
      return [
        {
          ...base,
          candidateKind: "material_name" as const,
          confidence: "medium" as const,
          reason: "Property name may identify material evidence.",
        },
      ];
    }

    if (normalizedName.includes("unit")) {
      return [
        {
          ...base,
          candidateKind: "unit" as const,
          confidence: "medium" as const,
          reason: "Property name may identify unit evidence.",
        },
      ];
    }

    return [];
  });
}

export function candidatePropertiesFromQuantitySet(
  quantitySet: QuantitySetEvidence,
): CandidatePropertyEvidence[] {
  return quantitySet.quantities.flatMap((quantity) => {
    const quantityName = quantity.name ?? "";
    const normalizedName = normalizeName(quantityName);
    if (!normalizedName.includes("thickness") && normalizedName !== "width") {
      return [];
    }

    return [
      {
        candidateKind: "assembly_thickness" as const,
        propertySetName: quantitySet.name,
        propertyName: quantityName,
        rawValue: quantity.rawValue,
        rawUnit: quantity.rawUnit,
        normalizedValue: quantity.numericEvidence?.normalizedValue ?? null,
        normalizedUnit: "m",
        confidence: "medium" as const,
        evidenceReference: quantity.evidenceReference,
        reason: "Generic quantity thickness or width is assembly thickness evidence, not confirmed layer thickness.",
      },
    ];
  });
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function candidateKindFor(key: NonNullable<ReturnType<typeof findDatapointByCandidateName>>["key"]) {
  const map = {
    lambda: "lambda",
    specificHeatCapacity: "specific_heat_capacity",
    massDensity: "mass_density",
    vaporResistanceFactor: "vapor_resistance_factor",
    vaporPermeability: "vapor_permeability",
    moistureDiffusivity: "moisture_diffusivity",
    isothermalMoistureCapacity: "isothermal_moisture_capacity",
    indoorTemperature: "indoor_temperature",
    outdoorTemperature: "outdoor_temperature",
    indoorRelativeHumidity: "indoor_relative_humidity",
    outdoorRelativeHumidity: "outdoor_relative_humidity",
    surfaceResistanceProfile: "unit",
  } as const;
  return map[key];
}
