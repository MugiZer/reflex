import { createConfiguredAgentProvider, type AgentProvider, type AgentProviderConfiguration } from "../../domain/agent/agentProvider.js";
import { CodexCliAgentProvider } from "./CodexCliAgentProvider.js";
import { OpenRouterAgentProvider } from "./OpenRouterAgentProvider.js";

/** The only provider composition point. It never substitutes a provider or model. */
export function createAgentProvider(configuration: AgentProviderConfiguration): AgentProvider {
  const config = createConfiguredAgentProvider(configuration);
  if (config.provider === "openrouter") return new OpenRouterAgentProvider(config.openRouter!);
  return new CodexCliAgentProvider(config.codex!);
}
