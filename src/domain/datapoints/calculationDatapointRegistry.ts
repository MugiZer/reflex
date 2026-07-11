export type CalculationDatapointKey =
  | "lambda"
  | "specificHeatCapacity"
  | "massDensity"
  | "vaporResistanceFactor"
  | "vaporPermeability"
  | "moistureDiffusivity"
  | "isothermalMoistureCapacity"
  | "indoorTemperature"
  | "outdoorTemperature"
  | "indoorRelativeHumidity"
  | "outdoorRelativeHumidity"
  | "surfaceResistanceProfile";

export type CalculationDatapointDefinition = {
  key: CalculationDatapointKey;
  neededFor: Array<"u_value" | "temperature_profile" | "vapour_light" | "heat_storage">;
  officialIfcPaths: string[];
  candidatePropertyNames: string[];
  unit: string | null;
  askableByUser: boolean;
  libraryResolvable: boolean;
};

export const calculationDatapointRegistry: CalculationDatapointDefinition[] = [
  {
    key: "lambda",
    neededFor: ["u_value", "temperature_profile"],
    officialIfcPaths: ["Pset_MaterialThermal.ThermalConductivity"],
    candidatePropertyNames: [
      "ThermalConductivity",
      "Conductivity",
      "Lambda",
      "LambdaValue",
      "KValue",
      "K-Value",
      "ThermalTransmittance",
      "UValue",
      "U-Value",
      "ThermalResistance",
      "RValue",
      "R-Value",
    ],
    unit: "W/mK",
    askableByUser: true,
    libraryResolvable: true,
  },
  {
    key: "specificHeatCapacity",
    neededFor: ["heat_storage"],
    officialIfcPaths: ["Pset_MaterialThermal.SpecificHeatCapacity"],
    candidatePropertyNames: ["SpecificHeatCapacity", "SpecificHeat", "HeatCapacity"],
    unit: "J/kgK",
    askableByUser: true,
    libraryResolvable: true,
  },
  {
    key: "massDensity",
    neededFor: ["heat_storage"],
    officialIfcPaths: ["Pset_MaterialCommon.MassDensity"],
    candidatePropertyNames: ["MassDensity", "Density"],
    unit: "kg/m3",
    askableByUser: true,
    libraryResolvable: true,
  },
  {
    key: "vaporResistanceFactor",
    neededFor: ["vapour_light"],
    officialIfcPaths: [
      "Pset_MaterialHygroscopic.UpperVaporResistanceFactor",
      "Pset_MaterialHygroscopic.LowerVaporResistanceFactor",
    ],
    candidatePropertyNames: ["VaporResistanceFactor", "VapourResistanceFactor", "Mu", "Sd"],
    unit: null,
    askableByUser: true,
    libraryResolvable: true,
  },
  {
    key: "vaporPermeability",
    neededFor: ["vapour_light"],
    officialIfcPaths: ["Pset_MaterialHygroscopic.VaporPermeability"],
    candidatePropertyNames: ["VaporPermeability", "VapourPermeability"],
    unit: null,
    askableByUser: true,
    libraryResolvable: true,
  },
  {
    key: "moistureDiffusivity",
    neededFor: ["vapour_light"],
    officialIfcPaths: ["Pset_MaterialHygroscopic.MoistureDiffusivity"],
    candidatePropertyNames: ["MoistureDiffusivity"],
    unit: null,
    askableByUser: false,
    libraryResolvable: true,
  },
  {
    key: "isothermalMoistureCapacity",
    neededFor: ["vapour_light"],
    officialIfcPaths: ["Pset_MaterialHygroscopic.IsothermalMoistureCapacity"],
    candidatePropertyNames: ["IsothermalMoistureCapacity"],
    unit: null,
    askableByUser: false,
    libraryResolvable: true,
  },
  {
    key: "indoorTemperature",
    neededFor: ["temperature_profile"],
    officialIfcPaths: [],
    candidatePropertyNames: ["IndoorTemperature", "Temperature"],
    unit: "C",
    askableByUser: true,
    libraryResolvable: false,
  },
  {
    key: "outdoorTemperature",
    neededFor: ["temperature_profile"],
    officialIfcPaths: [],
    candidatePropertyNames: ["OutdoorTemperature", "Temperature"],
    unit: "C",
    askableByUser: true,
    libraryResolvable: false,
  },
  {
    key: "indoorRelativeHumidity",
    neededFor: ["vapour_light"],
    officialIfcPaths: [],
    candidatePropertyNames: ["IndoorRH", "RelativeHumidity"],
    unit: "%",
    askableByUser: true,
    libraryResolvable: false,
  },
  {
    key: "outdoorRelativeHumidity",
    neededFor: ["vapour_light"],
    officialIfcPaths: [],
    candidatePropertyNames: ["OutdoorRH", "RelativeHumidity"],
    unit: "%",
    askableByUser: true,
    libraryResolvable: false,
  },
  {
    key: "surfaceResistanceProfile",
    neededFor: ["u_value", "temperature_profile"],
    officialIfcPaths: [],
    candidatePropertyNames: [],
    unit: "m2K/W",
    askableByUser: true,
    libraryResolvable: false,
  },
];

export function findDatapointByCandidateName(
  propertyName: string,
): CalculationDatapointDefinition | null {
  const normalized = normalizePropertyName(propertyName);
  return calculationDatapointRegistry.find((definition) =>
    definition.candidatePropertyNames.some((name) => {
      const alias = normalizePropertyName(name);
      return alias === normalized || normalized.includes(alias);
    })
  ) ?? null;
}

export function normalizePropertyName(value: string): string {
  return value.toLowerCase().replace(/[_\-\s]+/g, "");
}
