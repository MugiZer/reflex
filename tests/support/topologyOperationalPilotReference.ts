import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyAnalysisOutcome, TopologyResult } from "../../src/domain/topology/topologyTypes.js";

type TopologyRequestService = { submit(request: SubmitTopologyAnalysisRequest): Promise<TopologyResult> };
type PilotDisposition = "disabled" | "cohort-excluded" | "killed" | "completed";

export type TopologyOperationalEvent = {
  timestamp: string;
  event: string;
  correlationId: string;
  outcome: TopologyAnalysisOutcome | null;
  code: string | null;
  moduleId: string;
  moduleVersion: string;
  registryHash: string;
  packHash: string;
  runtimeHash: string;
};

/**
 * Test-only reference seam for the retired pilot behavior.
 *
 * This deliberately stays under tests/ so no production composition can use
 * pilot enablement, cohort, kill-switch, counters, or event state.
 */
export function createTopologyOperationalPilot(command: {
  enabled: boolean;
  selectedOwnerIds: readonly string[];
  requests: TopologyRequestService;
  now?: () => string;
}) {
  let enabled = command.enabled;
  let killed = false;
  const selectedOwners = new Set(command.selectedOwnerIds);
  const events: TopologyOperationalEvent[] = [];
  const counters = new Map<string, number>();
  const now = command.now ?? (() => new Date().toISOString());

  const count = (key: string) => counters.set(key, (counters.get(key) ?? 0) + 1);
  const log = (event: string, request: SubmitTopologyAnalysisRequest, outcome: TopologyAnalysisOutcome | null, code: string | null) => {
    events.push({ timestamp: now(), event, correlationId: request.correlationId, outcome, code, ...request.bundle });
  };

  return {
    async submit(input: { ownerId: string; request: SubmitTopologyAnalysisRequest }): Promise<{ disposition: PilotDisposition; layerOnlySnapshot: JsonValue; result?: TopologyResult }> {
      if (killed) {
        count("topology.kill_switch");
        log("topology.killed", input.request, null, "kill_switch");
        return { disposition: "killed", layerOnlySnapshot: input.request.layerOnlySnapshot };
      }
      if (!enabled) {
        count("topology.disabled");
        log("topology.disabled", input.request, null, "feature_disabled");
        return { disposition: "disabled", layerOnlySnapshot: input.request.layerOnlySnapshot };
      }
      if (!selectedOwners.has(input.ownerId)) {
        count("topology.cohort_excluded");
        log("topology.cohort_excluded", input.request, null, "cohort_excluded");
        return { disposition: "cohort-excluded", layerOnlySnapshot: input.request.layerOnlySnapshot };
      }
      const result = await command.requests.submit(input.request);
      count(`topology.${result.outcome.replaceAll("-", "_")}`);
      log("topology.completed", input.request, result.outcome, result.errorCode);
      return { disposition: "completed", result, layerOnlySnapshot: input.request.layerOnlySnapshot };
    },
    setEnabled(value: boolean): void { enabled = value; },
    kill(reason = "operator request"): void { killed = true; void reason; },
    health(): { available: boolean; reason: "ready" | "feature-disabled" | "kill-switch" } {
      return killed ? { available: false, reason: "kill-switch" } : enabled ? { available: true, reason: "ready" } : { available: false, reason: "feature-disabled" };
    },
    events(): readonly TopologyOperationalEvent[] { return events.slice(); },
    metrics(): Readonly<Record<string, number>> { return Object.fromEntries(counters); },
  };
}
