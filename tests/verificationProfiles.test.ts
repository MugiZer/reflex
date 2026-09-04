import { describe, expect, it } from "vitest";

import {
  TEST_INVENTORY,
  selectVerificationProfile,
  validateProfileInventory,
} from "../src/verifier/verificationProfiles.js";

describe("verification profiles", () => {
  it("classifies every discovered test exactly once", () => {
    const discovered = TEST_INVENTORY.map((entry) => entry.file);
    expect(() => validateProfileInventory(TEST_INVENTORY, discovered)).not.toThrow();
  });

  it("rejects unclassified and duplicated test membership", () => {
    const entries = TEST_INVENTORY.slice(0, 2);
    expect(() => validateProfileInventory(entries, [entries[0]!.file, "tests/not-classified.test.ts"])).toThrow("unclassified");
    expect(() => validateProfileInventory([...entries, entries[0]!], entries.map((entry) => entry.file))).toThrow("more than once");
  });

  it("never selects a real worker in fast feedback", () => {
    const realWorker = TEST_INVENTORY.find((entry) => entry.workerMode === "real-python")!;
    expect(() => selectVerificationProfile("fast", [...TEST_INVENTORY.filter((entry) => entry.profile === "fast"), { ...realWorker, profile: "fast", budgetMs: 90_000 }])).toThrow("real Python worker");
  });

  it("rejects a profile with a test whose budget exceeds it", () => {
    const fastEntry = TEST_INVENTORY.find((entry) => entry.profile === "fast")!;
    expect(() => selectVerificationProfile("fast", [{ ...fastEntry, budgetMs: 90_001 }])).toThrow("budget");
  });

  it("records the worker-only numerical proof facts accurately", () => {
    expect(TEST_INVENTORY.find((entry) => entry.file === "tests/provenPythonTopologyWorker.integration.test.ts")).toMatchObject({
      dependencies: ["filesystem"],
      workerMode: "real-python",
      sharedResource: "real-worker",
    });
  });
});
