import { Ajv2020 } from "ajv/dist/2020.js";

import type { JsonSchema } from "../../domain/agent/agentProvider.js";

/** Full JSON Schema validation is independent of either provider's structured-output claim. */
export function validateAgentStructuredOutput(value: unknown, schema: JsonSchema): boolean {
  try { return new Ajv2020({ allErrors: true, strict: true }).compile(schema)(value) === true; }
  catch { return false; }
}
