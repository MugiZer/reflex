import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Ticket 09 completion artifact",()=>{
  it("completion manifest covers every invariant and outcome exactly once",async()=>{
    const report=await readFile(resolve(".scratch/component-topology-preliminary-v1/reports/09-durable-component-scenario-completion.md"),"utf8");
    const evidence=JSON.parse(await readFile(resolve(".scratch/component-topology-preliminary-v1/reports/09-authoritative-verifier-evidence.json"),"utf8"));
    expect(evidence).toMatchObject({schemaVersion:"durable-component-scenario-verifier/v1",counts:{selected:13,passed:13,failed:0,unexecuted:0},decision:"GO"});
    for(const item of evidence.cases)expect(report.match(new RegExp(`CASE\\[${item.caseId}\\]`,"g"))).toHaveLength(1);
    for(const invariant of ["immutable-evidence","domain-independence","append-only-history","real-worker-only","honest-aggregate","fail-closed","idempotent-durable","protected-state"])expect(report.match(new RegExp(`INV\\[${invariant}\\]`,"g"))).toHaveLength(1);
    for(const required of ["component-evaluation-sqlite/v1","SHA-256","repeating-metal-c-profile@1.0.0","repeating-c-profile-safety-v1","exact and bounded","replay","corruption","efb20084c7dd82cf6b79aaa71490372e0b9629a3","P5","P6"])expect(report).toContain(required);
    const durations = [...report.matchAll(/duration `(\d+) ms`/g)].map((match) => Number(match[1]));
    expect(durations).toHaveLength(1);
    expect(durations[0]).toBeGreaterThan(0);
    expect(evidence.durationMs).toBeGreaterThan(0);
    expect(report).toContain("No fake-backed or unit-only proof authorizes readiness.");
  });
});
