import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { TopologyBundleIdentity } from "./topologyTypes.js";

export type TopologyPilotPolicy = {
  schema: "topology-pilot-policy/v1";
  policyVersion: string;
  enabled: boolean;
  cohort: { kind: "all" } | { kind: "job-id-allow-list"; jobIds: readonly string[] };
  killSwitch: { active: boolean; reasonCode: string | null; version: string };
  bundle: TopologyBundleIdentity;
  retry: { maxAttempts: 2; retryableCodes: readonly string[]; backoffMs: 250 };
  limits: { maxScenarioCount: number; deadlineMs: number };
  retention: { temporary: "terminal-cleanup"; failedDays: number; unreferencedPublishedDays: number };
};

export type TopologyPilotDecision = {
  /** The persisted decision carries the immutable policy snapshot contract. */
  schema: "topology-pilot-policy/v1";
  policyVersion: string;
  policyHash: string;
  decisionId: string;
  decisionCode: "topology_pilot_enabled" | "topology_pilot_disabled" | "topology_pilot_cohort_excluded" | "topology_pilot_killed";
  disposition: "eligible" | "disabled" | "cohort-excluded" | "killed";
  bundle: TopologyBundleIdentity;
};

export function defaultTopologyPilotPolicy(bundle: TopologyBundleIdentity): TopologyPilotPolicy {
  return { schema: "topology-pilot-policy/v1", policyVersion: "localhost-topology-pilot/v1", enabled: true, cohort: { kind: "all" }, killSwitch: { active: false, reasonCode: null, version: "localhost-kill-switch/v1" }, bundle, retry: { maxAttempts: 2, retryableCodes: ["topology_runtime_unavailable"], backoffMs: 250 }, limits: { maxScenarioCount: 8, deadlineMs: 120_000 }, retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 } };
}

export function decideTopologyPilotPolicy(input: { policy: TopologyPilotPolicy; jobId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; opportunityId: string }): TopologyPilotDecision {
  const { policy } = input;
  const disposition = policy.killSwitch.active ? "killed" : !policy.enabled ? "disabled" : policy.cohort.kind === "job-id-allow-list" && !policy.cohort.jobIds.includes(input.jobId) ? "cohort-excluded" : "eligible";
  const decisionCode = disposition === "eligible" ? "topology_pilot_enabled" : disposition === "disabled" ? "topology_pilot_disabled" : disposition === "killed" ? "topology_pilot_killed" : "topology_pilot_cohort_excluded";
  const policyHash = hash(policy);
  return { schema: policy.schema, policyVersion: policy.policyVersion, policyHash, decisionId: hash({ policyHash, jobId: input.jobId, sourceRevisionId: input.sourceRevisionId, sourceAssemblyGroupId: input.sourceAssemblyGroupId, opportunityId: input.opportunityId, disposition }), decisionCode, disposition, bundle: policy.bundle };
}

function hash(value: unknown): string { return createHash("sha256").update(canonicalTopologyJson(value as never)).digest("hex"); }
