import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { GeneratedTopologyAdapter } from "../../domain/topology/generatedTopologyAdapter.js";

export type IndependentTopologyQualificationOracle = Readonly<{
  oracleId: string;
  oracleVersion: string;
  contentHash: string;
  familyId: string;
  caseId: string;
  parameters: Readonly<Record<string, number>>;
  expectedEffectiveUValueWPerM2K: number;
  toleranceWPerM2K: number;
}>;

const ORACLE_PAYLOAD = {
  schema: "generated-topology-qualification-oracle/v1",
  oracleId: "z-girt-independent-reference",
  oracleVersion: "1",
  familyId: "generated-z-girt",
  caseId: "z-girt-independent-reference",
  parameters: { insulationThicknessM: 0.2 },
  expectedEffectiveUValueWPerM2K: 0.2399856428620613,
  toleranceWPerM2K: 0.000001,
} as const;

/** Release-owned reference data. Candidate adapters cannot provide or alter these values. */
export const PROVEN_TOPOLOGY_QUALIFICATION_ORACLE: IndependentTopologyQualificationOracle = Object.freeze({
  ...ORACLE_PAYLOAD,
  contentHash: sha256(canonicalTopologyJson(ORACLE_PAYLOAD)),
  parameters: Object.freeze({ ...ORACLE_PAYLOAD.parameters }),
});

/** Resolve only an oracle whose case and parameters are exactly the release-owned fixture. */
export function oracleForGeneratedTopologyAdapter(adapter: GeneratedTopologyAdapter): IndependentTopologyQualificationOracle | null {
  const candidate = adapter.qualificationCases.reference;
  return adapter.family.familyId === PROVEN_TOPOLOGY_QUALIFICATION_ORACLE.familyId
    && candidate.caseId === PROVEN_TOPOLOGY_QUALIFICATION_ORACLE.caseId
    && canonicalTopologyJson(candidate.parameters as never) === canonicalTopologyJson(PROVEN_TOPOLOGY_QUALIFICATION_ORACLE.parameters as never)
    ? PROVEN_TOPOLOGY_QUALIFICATION_ORACLE
    : null;
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
