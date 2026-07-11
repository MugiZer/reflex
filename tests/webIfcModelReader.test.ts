import {
  compactIfcAttributeValue,
  getIfcStepReference,
} from "../src/infrastructure/ifc/web-ifc/WebIfcModelReader.js";

describe("WebIfcModelReader IFC attribute helpers", () => {
  it("does not serialize wrapped numeric measures as STEP references", () => {
    expect(compactIfcAttributeValue("LayerThickness", { value: 75 })).toBe(75);
    expect(compactIfcAttributeValue("OffsetFromReferenceLine", { value: 37.5 }))
      .toBe(37.5);
    expect(getIfcStepReference("LayerThickness", { value: 75 })).toBeNull();
  });

  it("serializes known reference attributes as STEP references", () => {
    expect(compactIfcAttributeValue("ForLayerSet", { value: 17711 })).toEqual({
      stepId: 17711,
    });
    expect(getIfcStepReference("ForLayerSet", { value: 17711 })).toBe(17711);
  });
});
