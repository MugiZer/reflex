import * as WebIFC from "web-ifc";

export const IFC_VIEWER_GEOMETRY_SCHEMA_VERSION = "ifc-viewer-geometry.v6" as const;

export type IfcViewerGeometryPayload = {
  schemaVersion: typeof IFC_VIEWER_GEOMETRY_SCHEMA_VERSION;
  meshes: IfcViewerMesh[];
  truncated: boolean;
  elementCount: number;
  triangleCount: number;
  storeys: IfcViewerStorey[];
};

export type IfcViewerStorey = {
  expressId: number;
  name: string;
  elevation: number | null;
};

export type IfcViewerMesh = {
  expressId: number;
  positions: number[];
  normals: number[];
  indices: number[];
  color: [number, number, number, number];
  storeyId: number | null;
};

export type ExtractIfcViewerGeometryCommand = {
  sourceFileBytes: Uint8Array;
};

// Viewer geometry is the building context, not the current review selection.
// Keep the guardrails high enough for ordinary architectural IFC models while
// still preventing a pathological file from exhausting the localhost process.
const MAX_MESHES = 5_000;
const MAX_TRIANGLES = 2_000_000;
export class WebIfcViewerGeometryExtractor {
  async extract(command: ExtractIfcViewerGeometryCommand): Promise<IfcViewerGeometryPayload> {
    return buildIfcViewerGeometry(command.sourceFileBytes);
  }
}

async function buildIfcViewerGeometry(
  sourceFileBytes: Uint8Array,
): Promise<IfcViewerGeometryPayload> {
  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();
  const modelId = ifcApi.OpenModel(sourceFileBytes);
  const meshes: IfcViewerMesh[] = [];
  let elementCount = 0;
  let triangleCount = 0;
  let truncated = false;
  let storeyIndex: ReturnType<typeof buildIfcStoreyIndex> = {
    storeys: [],
    storeyIdByElement: new Map(),
  };

  try {
    storeyIndex = buildIfcStoreyIndex(ifcApi, modelId);
    const callback = (mesh: WebIFC.FlatMesh) => {
      elementCount += 1;
      if (truncated) {
        return;
      }
      if (meshes.length >= MAX_MESHES || triangleCount >= MAX_TRIANGLES) {
        truncated = true;
        return;
      }
      const viewerMesh = meshToViewerMesh(ifcApi, modelId, mesh, storeyIndex.storeyIdByElement);
      const nextTriangleCount = triangleCount + viewerMesh.indices.length / 3;
      if (nextTriangleCount > MAX_TRIANGLES) {
        truncated = true;
        return;
      }
      triangleCount = nextTriangleCount;
      meshes.push(viewerMesh);
    };
    ifcApi.StreamAllMeshes(modelId, callback);
  } finally {
    ifcApi.CloseModel(modelId);
  }

  return {
    schemaVersion: IFC_VIEWER_GEOMETRY_SCHEMA_VERSION,
    meshes,
    truncated,
    elementCount,
    triangleCount,
    storeys: buildIfcStoreyIndexFromMeshes(meshes, storeyIndex.storeys),
  };
}

export function isIfcViewerGeometryPayload(value: unknown): value is IfcViewerGeometryPayload {
  if (!isRecord(value) || value.schemaVersion !== IFC_VIEWER_GEOMETRY_SCHEMA_VERSION) return false;
  return Array.isArray(value.meshes) && value.meshes.every(isIfcViewerMesh) &&
    typeof value.truncated === "boolean" &&
    isNonNegativeInteger(value.elementCount) &&
    isNonNegativeNumber(value.triangleCount) &&
    Array.isArray(value.storeys) && value.storeys.every(isIfcViewerStorey);
}

function isIfcViewerMesh(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonNegativeInteger(value.expressId) &&
    isNumberArray(value.positions) &&
    isNumberArray(value.normals) &&
    isIntegerArray(value.indices) &&
    Array.isArray(value.color) && value.color.length === 4 && value.color.every(isFiniteNumber) &&
    (value.storeyId === null || isNonNegativeInteger(value.storeyId));
}

function isIfcViewerStorey(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonNegativeInteger(value.expressId) &&
    typeof value.name === "string" &&
    (value.elevation === null || isFiniteNumber(value.elevation));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}
function buildIfcStoreyIndex(ifcApi: WebIFC.IfcAPI, modelId: number): {
  storeys: IfcViewerStorey[];
  storeyIdByElement: Map<number, number>;
} {
  const storeys = new Map<number, IfcViewerStorey>();
  const storeyIdByElement = new Map<number, number>();
  const storeyIds = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
  for (let index = 0; index < storeyIds.size(); index += 1) {
    const storeyId = storeyIds.get(index);
    const storeyLine = ifcApi.GetLine(modelId, storeyId, false) as {
      Name?: { value?: string };
      LongName?: { value?: string };
      Elevation?: { value?: number };
    };
    storeys.set(storeyId, {
      expressId: storeyId,
      name: storeyLine.LongName?.value?.trim() || storeyLine.Name?.value?.trim() || "Storey #" + storeyId,
      elevation: typeof storeyLine.Elevation?.value === "number" ? storeyLine.Elevation.value : null,
    });
  }
  const relationIds = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (let index = 0; index < relationIds.size(); index += 1) {
    const relation = ifcApi.GetLine(modelId, relationIds.get(index), true) as {
      RelatingStructure?: { expressID?: number; value?: number };
      RelatedElements?: Array<{ expressID?: number; value?: number }>;
    };
    const storeyId = referenceId(relation.RelatingStructure);
    if (storeyId === null || !storeys.has(storeyId)) continue;
    for (const element of relation.RelatedElements ?? []) {
      const elementId = referenceId(element);
      if (elementId !== null) storeyIdByElement.set(elementId, storeyId);
    }
  }
  return {
    storeys: [...storeys.values()].sort((left, right) => (right.elevation ?? 0) - (left.elevation ?? 0)),
    storeyIdByElement,
  };
}

function referenceId(reference: { expressID?: number; value?: number } | undefined): number | null {
  if (typeof reference?.expressID === "number") return reference.expressID;
  if (typeof reference?.value === "number") return reference.value;
  return null;
}
function buildIfcStoreyIndexFromMeshes(
  meshes: IfcViewerMesh[],
  storeys: IfcViewerStorey[],
): IfcViewerStorey[] {
  const used = new Set(meshes.flatMap((mesh) => mesh.storeyId === null ? [] : [mesh.storeyId]));
  return storeys.filter((storey) => used.has(storey.expressId));
}
function meshToViewerMesh(
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  mesh: WebIFC.FlatMesh,
  storeyIdByElement: Map<number, number>,
): IfcViewerMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let color: [number, number, number, number] = [0.62, 0.66, 0.62, 1];

  for (let geometryIndex = 0; geometryIndex < mesh.geometries.size(); geometryIndex += 1) {
    const placedGeometry = mesh.geometries.get(geometryIndex);
    color = [
      placedGeometry.color.x,
      placedGeometry.color.y,
      placedGeometry.color.z,
      placedGeometry.color.w,
    ];
    const geometry = ifcApi.GetGeometry(modelId, placedGeometry.geometryExpressID);
    const vertexData = ifcApi.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize(),
    );
    const indexData = ifcApi.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize(),
    );
    const vertexOffset = positions.length / 3;
    appendTransformedVertices(
      positions,
      normals,
      vertexData,
      placedGeometry.flatTransformation,
    );
    for (const index of indexData) {
      indices.push(vertexOffset + index);
    }
    geometry.delete();
  }

  return {
    expressId: mesh.expressID,
    positions,
    normals,
    indices,
    color,
    storeyId: storeyIdByElement.get(mesh.expressID) ?? null,
  };
}

function appendTransformedVertices(
  positions: number[],
  normals: number[],
  vertexData: Float32Array,
  matrix: number[],
): void {
  for (let index = 0; index < vertexData.length; index += 6) {
    const x = vertexData[index] ?? 0;
    const y = vertexData[index + 1] ?? 0;
    const z = vertexData[index + 2] ?? 0;
    const nx = vertexData[index + 3] ?? 0;
    const ny = vertexData[index + 4] ?? 0;
    const nz = vertexData[index + 5] ?? 1;
    positions.push(
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    );
    const transformedNormal = normalize([
      matrix[0] * nx + matrix[4] * ny + matrix[8] * nz,
      matrix[1] * nx + matrix[5] * ny + matrix[9] * nz,
      matrix[2] * nx + matrix[6] * ny + matrix[10] * nz,
    ]);
    normals.push(...transformedNormal);
  }
}

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) {
    return [0, 0, 1];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
