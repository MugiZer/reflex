import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalTopologyJson } from "../src/domain/topology/canonicalTopologyJson.js";
import { createComponentKnowledgeBase, resolveTopologyScenarioPlan } from "../src/domain/topology/componentKnowledgeBase.js";

const versions = {
  compiler: "compiler-1",
  primitiveRegistry: "registry-1",
  materialPack: "materials-1",
  runtime: "runtime-1",
  boundary: "boundary-1",
} as const;

describe("component evaluation identity contract", () => {
  it("component evaluation identities separate topology from dimensions", () => {
    const patternId = "repeating-metal-c-profile";
    const recipes = [0.041, 0.075, 0.1].map((depth) => recipe(depth));
    const hashes = recipes.map((value) => sha256(canonicalTopologyJson(value)));
    const expected = [
      "cf8f5e728eaf4c85785467698da8ba03586d2ef9944033763f6f41130a822b18",
      "6fdb6f280ac82d7a88e60c91b9c1da70958fea139e8584a281ab5de93c2c9fcc",
      "75ce506888860d7794f5784e3051aea2d88268ae280d2bf16e50c727272ceb30",
    ];

    expect(recipes.map(() => patternId)).toEqual([patternId, patternId, patternId]);
    expect(hashes).toEqual(expected);
    expect(new Set(hashes).size).toBe(3);
    const pack = createComponentKnowledgeBase({
      packId: patternId,
      version: "1.0.0",
      lifecycle: "promoted",
      supportedUnknowns: [{ key: "memberWidthM", values: [0.041, 0.075, 0.1], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "depth"] }],
      immaterialityGateWPerM2K: 0.03,
    } as Parameters<typeof createComponentKnowledgeBase>[0]);
    const planned = resolveTopologyScenarioPlan({ pack, recipe: recipe(0.075), unknownKeys: ["memberWidthM"] });
    expect(planned.outcome).toBe("ready");
    if (planned.outcome !== "ready") throw new Error("expected promoted pattern plan");
    expect(planned.plan.scenarios.map((scenario) => scenario.scenarioId)).toEqual(expected);

    const sourceEvidence = { ifcContentHash: "a".repeat(64), normalizedProfile: "c", ordinaryDepthM: 0.075 };
    const originalEvidenceHash = sha256(canonicalTopologyJson(sourceEvidence));
    const firstAnnotation = sha256(canonicalTopologyJson({ evidenceHash: originalEvidenceHash, authority: "ifc-derived" }));
    const secondAnnotation = sha256(canonicalTopologyJson({ evidenceHash: originalEvidenceHash, authority: "user-confirmed" }));
    expect(originalEvidenceHash).toBe(sha256(canonicalTopologyJson(sourceEvidence)));
    expect(firstAnnotation).not.toBe(secondAnnotation);

    for (const field of Object.keys(versions) as Array<keyof typeof versions>) {
      const changed = { ...versions, [field]: `${versions[field]}-changed` };
      expect(sha256(canonicalTopologyJson({ recipe: recipes[0], patternId, patternVersion: "1.0.0", versions })))
        .not.toBe(sha256(canonicalTopologyJson({ recipe: recipes[0], patternId, patternVersion: "1.0.0", versions: changed })));
    }
  });

  it("pattern lifecycle controls runtime eligibility", () => {
    const outcomes = (["draft", "candidate", "promoted", "rejected"] as const).map((lifecycle) => {
      const pack = createComponentKnowledgeBase({
        packId: "repeating-metal-c-profile",
        version: "1.0.0",
        lifecycle,
        supportedUnknowns: [{ key: "memberWidthM", values: [0.041, 0.075, 0.1], label: "Member width", binding: ["rows", 0, "member", "primitive", "parameters", "depth"] }],
        immaterialityGateWPerM2K: 0.03,
      } as Parameters<typeof createComponentKnowledgeBase>[0]);
      return resolveTopologyScenarioPlan({ pack, recipe: recipe(0.075), unknownKeys: ["memberWidthM"] }).outcome;
    });

    expect(outcomes).toEqual(["unmatched", "unmatched", "ready", "unmatched"]);
  });
});

function recipe(depth: number) {
  return {
    schemaVersion: "1.0.0-draft",
    topologyModule: { id: "repeating-parallel-profile-wall-2d", version: "1.0.0-draft" },
    rows: [{ id: "c-row", member: { primitive: { kind: "standard.c", version: "1.0.0", parameters: { depth, flangeWidth: 0.04, gauge: 0.001, lipWidth: 0.01 } }, material: "galvanized-steel" } }],
    boundaries: { exterior: "external-wall", interior: "internal", left: "periodic", right: "periodic" },
    versions,
  } as const;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
