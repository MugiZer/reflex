import type { JsonValue } from "./topologyTypes.js";

/** Language-neutral canonical JSON used for topology identities and protocol hashes. */
export function canonicalTopologyJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalTopologyJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as { readonly [key: string]: JsonValue };
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalTopologyJson(record[key]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
