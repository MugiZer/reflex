import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalComponentFamilyEvidence, componentFamilySignature, findExactGeneratedTopologyFamilyMatch } from "../src/domain/topology/exactGeneratedTopologyFamilyMatch.js";
import { GeneratedTopologyAdapterRegistry } from "../src/domain/topology/generatedTopologyAdapterRegistry.js";
import type { GeneratedTopologyAdapter } from "../src/domain/topology/generatedTopologyAdapter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

describe("exact generated topology family matching", () => {
  it("normalizes equivalent evidence into one reusable family identity without including wall layers", () => {
    const first = canonicalComponentFamilyEvidence({ answers: answers({ memberKind: " C ", memberMaterial: "Galvanized steel" }), bundle: PROVEN_TOPOLOGY_BUNDLE });
    const second = canonicalComponentFamilyEvidence({ answers: answers({ memberKind: "c", memberMaterial: "galvanized-steel" }), bundle: PROVEN_TOPOLOGY_BUNDLE });
    expect(first).toEqual(second);
    expect(componentFamilySignature(first!)).toBe(componentFamilySignature(second!));
    expect(componentFamilySignature({ ...first!, requiredCharacteristics: { ...first!.requiredCharacteristics, orientation: "perpendicular" } })).not.toBe(componentFamilySignature(first!));
  });

  it("returns a bound Recipe only for one contract-valid, dependency-compatible exact family", () => {
    const registry = new GeneratedTopologyAdapterRegistry();
    registry.add("adapter", adapter());
    const match = findExactGeneratedTopologyFamilyMatch({ answers: answers(), bundle: PROVEN_TOPOLOGY_BUNDLE, registry });
    expect(match?.recipe).toMatchObject({ rows: [{ member: { primitive: { parameters: { depth: 0.075 } } } }] });
    expect(findExactGeneratedTopologyFamilyMatch({ answers: answers({ memberWidthM: 0.2 }), bundle: PROVEN_TOPOLOGY_BUNDLE, registry })).toBeNull();
    expect(findExactGeneratedTopologyFamilyMatch({ answers: answers(), bundle: { ...PROVEN_TOPOLOGY_BUNDLE, runtimeHash: "f".repeat(64) }, registry })).toBeNull();
    const wrongBoundary = adapter();
    registry.replace([{ adapterHash: "wrong-boundary", adapter: { ...wrongBoundary, dependencies: { ...wrongBoundary.dependencies, boundaryVersion: "component-evaluation/v2" } } }]);
    expect(findExactGeneratedTopologyFamilyMatch({ answers: answers(), bundle: PROVEN_TOPOLOGY_BUNDLE, registry })).toBeNull();
  });
});

function answers(overrides: Record<string, unknown> = {}) {
  return { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, continuousThroughLayers: true, ...overrides } as any;
}
function adapter(): GeneratedTopologyAdapter {
  return {
    schema: "generated-topology-adapter/v1",
    family: { familyId: "generated-c-profile", familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.c", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-profile", profileKind: "c", requiredCharacteristics: { orientation: "parallel", steel: true } },
    recognition: { profileKinds: ["c"], materialTokens: ["steel"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate: REPEATING_C_PROFILE_PATTERN.recipeTemplate,
    parameterBindings: [{ key: "memberWidthM", binding: ["rows", 0, "member", "primitive", "parameters", "depth"], bounds: { minimum: 0.041, maximum: 0.1 } }], permittedUnknowns: [], validationEnvelope: { memberWidthM: { minimum: 0.041, maximum: 0.1 } },
    provenance: { datasetId: "test", datasetVersion: "1", datasetHash: hash("test"), sourceCitation: "test" }, qualificationCases: { reference: { caseId: "reference", parameters: { memberWidthM: 0.075 } }, sensitivity: { caseId: "sensitivity", parameters: { memberWidthM: 0.1 }, direction: "decreases" } },
    dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" },
  };
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
