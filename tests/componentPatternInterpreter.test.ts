import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { interpretComponentPattern, type ComponentPattern, type ComponentPatternEvidence } from "../src/domain/topology/componentPatternInterpreter.js";
import { createComponentKnowledgeBase, resolveTopologyScenarioPlan } from "../src/domain/topology/componentKnowledgeBase.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";

describe("component pattern interpreter", () => {
  it("one promoted C-profile pattern matches 41 75 and 100 mm variants", () => {
    const dataset = JSON.parse(readFileSync(new URL("./fixtures/component-patterns/repeating-c-profile-v1.json", import.meta.url), "utf8")) as any;
    expect(dataset.development.map((item: any) => [item.memberWidthM, item.expected])).toEqual([[0.041, "matched"], [0.075, "matched"], [0.1, "matched"]]);
    expect(dataset.nearNeighbourNegatives.map((item: any) => item.expected)).toEqual(["unmatched", "unmatched"]);
    expect(dataset.rejections.map((item: any) => item.expected)).toEqual(["rejected", "rejected"]);
    expect(dataset.holdout.map((item: any) => item.expected)).toEqual(["matched", "unmatched"]);
    for (const depth of [0.041, 0.075, 0.1]) {
      const result = interpretComponentPattern({ evidence: evidence({ memberWidthM: depth }), patterns: [pattern()] });
      expect(result).toMatchObject({ outcome: "matched", patternId: "repeating-metal-c-profile", patternVersion: "1.0.0" });
    }
    expect(interpretComponentPattern({ evidence: evidence({ profileKind: "z" }), patterns: [pattern()] })).toEqual({ outcome: "unmatched", evidenceSignature: "frozen-c-signature" });
  });

  it("interpreter exposes every honest outcome", () => {
    expect(interpretComponentPattern({ evidence: evidence(), patterns: [pattern()] }).outcome).toBe("matched");
    expect(interpretComponentPattern({ evidence: evidence(), patterns: [pattern(), pattern({ patternId: "second-c" })] }).outcome).toBe("ambiguous");
    expect(interpretComponentPattern({ evidence: evidence({ profileKind: "hat" }), patterns: [pattern()] }).outcome).toBe("unmatched");
    expect(interpretComponentPattern({ evidence: evidence({ authoritativeKeys: ["profileKind"] }), patterns: [pattern()] })).toMatchObject({ outcome: "blocked", missingKey: "memberMaterial", requiredAuthority: "authoritative" });
    expect(interpretComponentPattern({ evidence: evidence({ conflictingKeys: ["memberWidthM"] }), patterns: [pattern()] })).toMatchObject({ outcome: "rejected", diagnostic: "conflicting_signal:memberWidthM" });
  });

  it("Recipe bindings target the production scalar vocabulary", () => {
    const matched = interpretComponentPattern({ evidence: evidence({ memberWidthM: "i-dont-know" }), patterns: [pattern()] });
    expect(matched.outcome).toBe("matched");
    if (matched.outcome !== "matched") throw new Error("expected match");
    expect((matched.plan.scenarios[0]!.recipe as any).rows[0].member.primitive.parameters.depth).toBe(0.041);
    for (const binding of [["rows", 0, "member", "primitive", "parameters", "depth", "value"], ["rows", 9, "member"], ["unknown"], ["rows", 0, "id"], ["__proto__", "polluted"]] as const) {
      expect(interpretComponentPattern({ evidence: evidence({ memberWidthM: "i-dont-know" }), patterns: [pattern({ permittedUnknowns: [{ ...pattern().permittedUnknowns[0]!, binding }] })] }).outcome).toBe("rejected");
    }
  });

  it("scenario generation is complete and capped", () => {
    const matched = interpretComponentPattern({ evidence: evidence({ memberWidthM: "i-dont-know" }), patterns: [pattern()] });
    expect(matched).toMatchObject({ outcome: "matched", plan: { scenarios: [{}, {}, {}] } });
    if (matched.outcome === "matched") expect(matched.plan.scenarios.map((item) => (item.recipe as any).rows[0].member.primitive.parameters.depth)).toEqual([0.041, 0.075, 0.1]);
    const pack = createComponentKnowledgeBase({ packId: "multi", version: "1.0.0", lifecycle: "promoted", supportedUnknowns: [{ key: "a", values: [1, 2], label: "A", binding: ["a"] }, { key: "b", values: [3, 4], label: "B", binding: ["b"] }], immaterialityGateWPerM2K: 0, maxScenarioCount: 3 } as any);
    expect(resolveTopologyScenarioPlan({ pack, recipe: { a: 1, b: 3 }, unknownKeys: ["a", "b"] })).toEqual({ outcome: "rejected", reason: "scenario_count_exceeds_maximum:4>3" });
  });
});

function pattern(overrides: Partial<ComponentPattern> = {}): ComponentPattern {
  return { ...REPEATING_C_PROFILE_PATTERN, ...overrides };
}

function evidence(overrides: Partial<ComponentPatternEvidence> & { memberWidthM?: number | "i-dont-know" } = {}): ComponentPatternEvidence {
  const { memberWidthM = 0.075, ...rest } = overrides;
  return { evidenceSignature: "frozen-c-signature", profileKind: "c", materialLabel: "galvanized steel stud", values: { memberWidthM }, authoritativeKeys: ["profileKind", "memberMaterial"], conflictingKeys: [], ...rest };
}
