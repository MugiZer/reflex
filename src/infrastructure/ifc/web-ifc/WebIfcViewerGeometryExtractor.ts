import * as WebIFC from "web-ifc";

export type IfcViewerGeometryPayload = {
  schemaVersion: "ifc-viewer-geometry.v4";
  meshes: IfcViewerMesh[];
  truncated: boolean;
  elementCount: number;
  triangleCount: number;
};

export type IfcViewerMesh = {
  expressId: number;
  positions: number[];
  normals: number[];
  indices: number[];
  color: [number, number, number, number];
};

export type ExtractIfcViewerGeometryCommand = {
  sourceFileBytes: Uint8Array;
  targetStepIds?: number[];
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

  try {
    const callback = (mesh: WebIFC.FlatMesh) => {
      elementCount += 1;
      if (truncated) {
        return;
      }
      if (meshes.length >= MAX_MESHES || triangleCount >= MAX_TRIANGLES) {
        truncated = true;
        return;
      }
      const viewerMesh = meshToViewerMesh(ifcApi, modelId, mesh);
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
    schemaVersion: "ifc-viewer-geometry.v4",
    meshes,
    truncated,
    elementCount,
    triangleCount,
  };
}

function meshToViewerMesh(
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  mesh: WebIFC.FlatMesh,
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
