import { describe, expect, it } from "vitest";
import { runOpenRouterProviderCanary } from "../src/verifier/openRouterProviderCanary.js";

describe("OpenRouter production canary", () => {
  it("reports NOT-PROVEN until a credentialed canary is explicitly run", async () => {
    await expect(runOpenRouterProviderCanary({})).resolves.toMatchObject({ decision: "NOT-PROVEN", executedAt: null });
  });
});
