import type { Diagnostic } from "../evidence/evidenceTypes.js";
import type { CalculationSnapshot, PhysicsAssembly } from "./calculationTypes.js";

export type CalculateThermalPerformanceResult = {
  calculationSnapshot: CalculationSnapshot;
  diagnostics: Diagnostic[];
};

export function calculateThermalPerformance(command: {
  physicsAssembly: PhysicsAssembly;
}): CalculateThermalPerformanceResult {
  const diagnostics: Diagnostic[] = [];
  const invalidLayer = command.physicsAssembly.layers.find(
    (layer) => layer.thicknessM <= 0 || layer.lambdaWPerMK <= 0,
  );
  if (invalidLayer !== undefined || command.physicsAssembly.layers.length === 0) {
    const message =
      invalidLayer === undefined
        ? "No layers are available for thermal calculation."
        : "Layer thickness and lambda must be positive for thermal calculation.";
    diagnostics.push({ code: "thermal_calculation_blocked", severity: "error", message });
    return {
      calculationSnapshot: {
        calculationSnapshotId: snapshotId(command.physicsAssembly.assemblyGroupId),
        assemblyGroupId: command.physicsAssembly.assemblyGroupId,
        readinessState: "blocked",
        confidence: "low",
        calculationBasis: command.physicsAssembly.calculationBasis,
        layers: [],
        surfaceResistanceProfile: command.physicsAssembly.surfaceResistanceProfile,
        totalRValueM2KPerW: null,
        uValueWPerM2K: null,
        uValueRangeWPerM2K: null,
        temperatureProfile: null,
        assumptions: [...(command.physicsAssembly.assumptions ?? []), ...command.physicsAssembly.surfaceResistanceProfile.assumptions],
        warnings: [message],
        provenance: [],
      },
      diagnostics,
    };
  }

  const layers = command.physicsAssembly.layers.map((layer) => ({
    ...layer,
    rValueM2KPerW: layer.thicknessM / layer.lambdaWPerMK,
  }));
  const layerRValue = layers.reduce((sum, layer) => sum + layer.rValueM2KPerW, 0);
  const totalRValueM2KPerW =
    command.physicsAssembly.surfaceResistanceProfile.rsi +
    layerRValue +
    command.physicsAssembly.surfaceResistanceProfile.rse;
  const uValueWPerM2K = 1 / totalRValueM2KPerW;
  const lowConfidenceRange = command.physicsAssembly.confidence === "low"
    ? {
        min: uValueWPerM2K * 0.85,
        max: uValueWPerM2K * 1.15,
      }
    : null;
  const temperatureProfile = buildTemperatureProfile({
    layers,
    totalRValueM2KPerW,
    rsi: command.physicsAssembly.surfaceResistanceProfile.rsi,
    rse: command.physicsAssembly.surfaceResistanceProfile.rse,
  });

  return {
    calculationSnapshot: {
      calculationSnapshotId: snapshotId(command.physicsAssembly.assemblyGroupId),
      assemblyGroupId: command.physicsAssembly.assemblyGroupId,
      readinessState: command.physicsAssembly.confidence === "low" ? "estimated" : "ready",
      confidence: command.physicsAssembly.confidence,
      calculationBasis: command.physicsAssembly.calculationBasis,
      layers,
      surfaceResistanceProfile: command.physicsAssembly.surfaceResistanceProfile,
      totalRValueM2KPerW,
      uValueWPerM2K: lowConfidenceRange === null ? uValueWPerM2K : null,
      uValueRangeWPerM2K: lowConfidenceRange,
      temperatureProfile,
      assumptions: [
        ...(command.physicsAssembly.assumptions ?? []),
        ...command.physicsAssembly.surfaceResistanceProfile.assumptions,
        ...temperatureProfile.assumptions,
      ],
      warnings:
        command.physicsAssembly.confidence === "low"
          ? ["Low confidence basis; report should avoid false precision."]
          : [],
      provenance: [...(command.physicsAssembly.provenance ?? []), ...layers.flatMap((layer) => layer.provenance)],
    },
    diagnostics,
  };
}

function snapshotId(assemblyGroupId: string): string {
  return `snap_${assemblyGroupId}`;
}

function buildTemperatureProfile(command: {
  layers: CalculateThermalPerformanceResult["calculationSnapshot"]["layers"];
  totalRValueM2KPerW: number;
  rsi: number;
  rse: number;
}) {
  const indoorTemperatureC = 20;
  const outdoorTemperatureC = -5;
  const delta = indoorTemperatureC - outdoorTemperatureC;
  const temperatureAt = (cumulativeRValueM2KPerW: number) =>
    indoorTemperatureC - (delta * cumulativeRValueM2KPerW) / command.totalRValueM2KPerW;
  let cumulative = command.rsi;
  const points = [
    {
      label: "Indoor air",
      temperatureC: indoorTemperatureC,
      cumulativeRValueM2KPerW: 0,
    },
    {
      label: "Inside surface",
      temperatureC: temperatureAt(cumulative),
      cumulativeRValueM2KPerW: cumulative,
    },
  ];
  command.layers.forEach((layer, index) => {
    cumulative += layer.rValueM2KPerW;
    points.push({
      label: `After layer ${index + 1}: ${layer.materialName}`,
      temperatureC: temperatureAt(cumulative),
      cumulativeRValueM2KPerW: cumulative,
    });
  });
  points.push({
    label: "Outdoor air",
    temperatureC: outdoorTemperatureC,
    cumulativeRValueM2KPerW: cumulative + command.rse,
  });
  return {
    indoorTemperatureC,
    outdoorTemperatureC,
    points,
    assumptions: [
      "Temperature profile assumes 20 C indoor air and -5 C outdoor air until user climate inputs are supplied.",
      "Temperature drop is distributed across surface and layer R-values.",
    ],
  };
}
