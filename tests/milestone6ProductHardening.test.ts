import { renderAppShellClientScript } from "../src/app/http/frontend/appShellClient.js";
import {
  calculationDatapointRegistry,
  findDatapointByCandidateName,
} from "../src/domain/datapoints/calculationDatapointRegistry.js";

describe("Milestone 6 product hardening", () => {
  it("declares calculation datapoints for temperature and later calculation slices", () => {
    expect(calculationDatapointRegistry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lambda",
          neededFor: expect.arrayContaining(["u_value", "temperature_profile"]),
          unit: "W/mK",
          askableByUser: true,
          libraryResolvable: true,
        }),
        expect.objectContaining({
          key: "indoorTemperature",
          neededFor: ["temperature_profile"],
          unit: "C",
        }),
        expect.objectContaining({
          key: "massDensity",
          neededFor: ["heat_storage"],
        }),
      ]),
    );
    expect(findDatapointByCandidateName("K-Value")?.key).toBe("lambda");
    expect(findDatapointByCandidateName("SpecificHeat")?.key).toBe("specificHeatCapacity");
  });

  it("renders explicit empty, failed, review-needed, and report-ready state copy", () => {
    const client = renderAppShellClientScript();

    expect(client).toContain("No analyses yet");
    expect(client).toContain("Failure:");
    expect(client).toContain("Missing inputs need resolution before the report is ready.");
    expect(client).toContain("Review complete. Report ready.");
    expect(client).toContain("Analysis failed before report generation.");
    expect(client).toContain("No next action is available for this analysis.");
  });
});
