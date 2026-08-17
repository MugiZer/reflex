import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { attemptAmbiguousGeneratedTopologyFamilyFit, authorizeFitGeneratedTopologyFamilyMatch, fitCandidateContracts, type AmbiguousFamilyFitAgent } from "../src/application/topology/fitGeneratedTopologyFamilyMatch.js";
import { GeneratedTopologyAdapterRegistry } from "../src/domain/topology/generatedTopologyAdapterRegistry.js";
import type { GeneratedTopologyAdapter } from "../src/domain/topology/generatedTopologyAdapter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

describe("ambiguous generated topology family fit", () => {
  it("offers only plausible contracts and authorizes the proposed candidate by fixed gates", () => {
    const registry = new GeneratedTopologyAdapterRegistry();
    registry.add("left", adapter("left"));
    registry.add("right", adapter("right"));
    const answers = { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, continuousThroughLayers: true, memberKindAuthority: "ifc-derived", memberMaterialAuthority: "ifc-derived" } as any;
    const candidates = fitCandidateContracts({ answers, bundle: PROVEN_TOPOLOGY_BUNDLE, registry });
    expect(candidates).toHaveLength(2);
    const proposedIdentity = candidates[1]!.identity;
    expect(authorizeFitGeneratedTopologyFamilyMatch({ answers, bundle: PROVEN_TOPOLOGY_BUNDLE, registry, candidateIdentity: proposedIdentity })?.recipe).toMatchObject({ rows: [{ member: { primitive: { parameters: { depth: 0.075 } } } }] });
    expect(authorizeFitGeneratedTopologyFamilyMatch({ answers: { ...answers, memberWidthM: 0.2 }, bundle: PROVEN_TOPOLOGY_BUNDLE, registry, candidateIdentity: proposedIdentity })).toBeNull();
  });

  it("calls fit only for ambiguous candidates and rejects a confident outside-envelope proposal", async () => {
    const registry = new GeneratedTopologyAdapterRegistry(); registry.add("left", adapter("left")); registry.add("right", adapter("right"));
    let calls = 0, saved: any[] = [];
    const agent: AmbiguousFamilyFitAgent = { model: "fixture", skillVersion: "fit/v1", attempts: { append: async (attempt: any) => { saved.push(attempt); }, listByCorrelationId: async () => saved }, provider: { execute: async (request: any) => { calls += 1; expect(request.prompt).not.toContain("IFC payload"); return { kind: "completed", output: { candidateIdentity: fitCandidateContracts({ answers: answers(), bundle: PROVEN_TOPOLOGY_BUNDLE, registry })[0]!.identity, confidence: "high", comparison: [], reasons: ["contract match"] }, attemptEvidence: { provider: "fixture", model: request.model, correlationId: request.correlationId, startedAt: "2026-08-17T00:00:00.000Z", durationMs: 1, outcome: "completed", safeUsage: null } }; } } };
    expect(await attemptAmbiguousGeneratedTopologyFamilyFit({ answers: answers(), bundle: PROVEN_TOPOLOGY_BUNDLE, registry, agent, canonicalEvidenceReference: "evidence:canonical-signature", correlationId: "fit-1", deadline: new Date(Date.now() + 1_000) })).not.toBeNull();
    expect(calls).toBe(1); expect(saved[0]).toMatchObject({ role: "fit", canonicalEvidenceReferences: ["evidence:canonical-signature"] });
    expect(await attemptAmbiguousGeneratedTopologyFamilyFit({ answers: answers({ memberWidthM: 0.2 }), bundle: PROVEN_TOPOLOGY_BUNDLE, registry, agent, canonicalEvidenceReference: "evidence:canonical-signature", correlationId: "fit-2", deadline: new Date(Date.now() + 1_000) })).toBeNull();
  });
});

function answers(overrides: Record<string, unknown> = {}) { return { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, continuousThroughLayers: true, memberKindAuthority: "ifc-derived", memberMaterialAuthority: "ifc-derived", ...overrides } as any; }

function adapter(id: string): GeneratedTopologyAdapter {
  return { schema: "generated-topology-adapter/v1", family: { familyId: `generated-c-profile-${id}`, familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.c", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-profile", profileKind: "c", requiredCharacteristics: { orientation: "parallel", steel: true } }, recognition: { profileKinds: ["c"], materialTokens: ["steel"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate: REPEATING_C_PROFILE_PATTERN.recipeTemplate, parameterBindings: [{ key: "memberWidthM", binding: ["rows", 0, "member", "primitive", "parameters", "depth"], bounds: { minimum: 0.041, maximum: 0.1 } }], permittedUnknowns: [], validationEnvelope: { memberWidthM: { minimum: 0.041, maximum: 0.1 } }, provenance: { datasetId: "test", datasetVersion: "1", datasetHash: hash("test"), sourceCitation: "safe:test" }, qualificationCases: { reference: { caseId: "reference", parameters: { memberWidthM: 0.075 } }, sensitivity: { caseId: "sensitivity", parameters: { memberWidthM: 0.1 }, direction: "decreases" } }, dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" } };
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
