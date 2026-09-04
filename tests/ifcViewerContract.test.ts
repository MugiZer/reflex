import { renderIfcReviewViewerClientScript } from "../src/app/http/ifcReviewViewerClient.js";
import {
  IFC_VIEWER_GEOMETRY_SCHEMA_VERSION,
  isIfcViewerGeometryPayload,
  type IfcViewerGeometryPayload,
} from "../src/infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";

describe("IFC viewer extractor-to-browser contract", () => {
  it("accepts the versioned full-model payload and rejects malformed payloads", () => {
    const payload: IfcViewerGeometryPayload = {
      schemaVersion: IFC_VIEWER_GEOMETRY_SCHEMA_VERSION,
      meshes: [{
        expressId: 40,
        positions: [0, 0, 0],
        normals: [0, 0, 1],
        indices: [0, 0, 0],
        color: [0.6, 0.6, 0.6, 1],
        storeyId: 10,
      }],
      truncated: false,
      elementCount: 1,
      triangleCount: 1,
      storeys: [{ expressId: 10, name: "Ground floor", elevation: 0 }],
    };

    expect(isIfcViewerGeometryPayload(payload)).toBe(true);
    expect(isIfcViewerGeometryPayload({ ...payload, schemaVersion: "ifc-viewer-geometry.v5" })).toBe(false);
    expect(isIfcViewerGeometryPayload({
      ...payload,
      meshes: [{ ...payload.meshes[0], positions: ["invalid"] }],
    })).toBe(false);
  });

  it("ships a browser adapter that validates the same payload contract", () => {
    const script = renderIfcReviewViewerClientScript();

    expect(script).toContain("isIfcViewerGeometryPayload(payload)");
    expect(script).toContain("value.schemaVersion !== \"ifc-viewer-geometry.v6\"");
    expect(script).toContain("Array.isArray(value.storeys)");
    expect(() => new Function(script)).not.toThrow();

    const browserWindow: Record<string, unknown> = {};
    new Function("window", "document", script)(browserWindow, {});
    expect(typeof browserWindow.createIfcReviewViewer).toBe("function");
  });
});
