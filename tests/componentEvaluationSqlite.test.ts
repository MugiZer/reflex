import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { ComponentEvaluationGraph } from "../src/domain/topology/componentEvaluationRecords.js";
import { SqliteComponentEvaluationRepository } from "../src/infrastructure/persistence/sqlite/SqliteComponentEvaluationRepository.js";

describe("component evaluation SQLite graph", () => {
  it("component evaluation graph survives a fresh SQLite reader", async () => {
    await withDatabase(async (path) => {
      const graph = fixture();
      const writer = new SqliteComponentEvaluationRepository(path);
      writer.append(graph);
      writer.close();
      const reader = new SqliteComponentEvaluationRepository(path);
      try { expect(reader.getByEvaluationId(graph.evaluation.evaluationId)).toEqual(graph); }
      finally { reader.close(); }
    });
  });

  it("recoverable result appends survive a fresh SQLite reader without rewriting source evidence", async () => {
    await withDatabase(async (path) => {
      const complete = fixture();
      const planned = { ...complete, state: "recoverable" as const, aggregate: null, results: [] };
      const writer = new SqliteComponentEvaluationRepository(path);
      writer.append(planned);
      writer.append({ ...planned, results: complete.results });
      writer.close();
      const reader = new SqliteComponentEvaluationRepository(path);
      try {
        expect(reader.getByEvaluationId(complete.evaluation.evaluationId)).toEqual({ ...planned, results: complete.results });
      } finally { reader.close(); }
    });
  });

  it("interrupted evaluation append publishes no trusted aggregate", async () => {
    for (const fault of ["planned-scenarios", "first-result"] as const) await withDatabase(async (path) => {
      const graph = fixture();
      const writer = new SqliteComponentEvaluationRepository(path);
      expect(() => writer.append(graph, fault)).toThrow(`component_evaluation_interrupted:${fault}`);
      writer.close();
      const reader = new SqliteComponentEvaluationRepository(path);
      try {
        const interrupted = reader.getByEvaluationId(graph.evaluation.evaluationId);
        expect(interrupted).toMatchObject({ state: "recoverable", aggregate: null });
        reader.append(graph);
        expect(reader.getByEvaluationId(graph.evaluation.evaluationId)).toEqual(graph);
      } finally { reader.close(); }
    });
  });

  it("corrupt evaluation lineage fails closed", async () => {
    const corruptions = ["indexed_identity", "canonical_payload", "missing_component", "match_version", "recipe_hash", "result_value", "artifact_identity", "outcome"] as const;
    for (const corruption of corruptions) await withDatabase(async (path) => {
      const graph = fixture();
      const writer = new SqliteComponentEvaluationRepository(path);
      writer.append(graph);
      writer.close();
      corrupt(path, corruption);
      const reader = new SqliteComponentEvaluationRepository(path);
      expect(() => reader.getByEvaluationId(graph.evaluation.evaluationId), corruption).toThrow("Persisted component evaluation graph is corrupt.");
      reader.close();
    });
  });

  it("simultaneous evaluation writers publish one graph", async () => {
    await withDatabase(async (path) => {
      const graph = fixture();
      const first = new SqliteComponentEvaluationRepository(path);
      const second = new SqliteComponentEvaluationRepository(path);
      await Promise.all([Promise.resolve().then(() => first.append(graph)), Promise.resolve().then(() => second.append(graph))]);
      first.close(); second.close();
      const reader = new SqliteComponentEvaluationRepository(path);
      try { expect(reader.getByEvaluationId(graph.evaluation.evaluationId)).toEqual(graph); }
      finally { reader.close(); }
      const db = new DatabaseSync(path);
      expect((db.prepare("select count(*) as count from component_evaluations where evaluation_id = ?").get(graph.evaluation.evaluationId) as { count: number }).count).toBe(1);
      db.close();
    });
  });
});

async function withDatabase(run: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "component-evaluation-sqlite-"));
  try { await run(join(root, "evaluation.db")); } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

function fixture(): ComponentEvaluationGraph {
  const at = "2026-08-02T00:00:00.000Z";
  const recipes = ["recipe-041", "recipe-075", "recipe-100"].map((recipeId) => ({ recipeId, matchId: "match-1", canonicalRecipe: { recipeId }, recipeSha256: hash(recipeId), createdAt: at }));
  const requests = recipes.map((recipe, index) => ({ scenarioRequestId: `request-${index + 1}`, evaluationId: "evaluation-1", recipeId: recipe.recipeId, idempotencyKey: hash(`request-${index + 1}`), createdAt: at }));
  const results = requests.map((request, index) => ({ scenarioResultId: `result-${index + 1}`, scenarioRequestId: request.scenarioRequestId, outcome: "preliminary-unsafe" as const, resultPayload: { effectiveUValueWPerM2K: [0.21, 0.24, 0.28][index] }, artifactIdentity: hash(`artifact-${index + 1}`), createdAt: at }));
  return { schemaVersion: "component-evaluation-sqlite/v1", jobId: "job-1", sourceRevisionId: "revision-1", sourceAssemblyGroupId: "assembly-1", ifcImport: { ifcImportId: "ifc-1", jobId: "job-1", revisionId: "revision-1", contentSha256: hash("ifc"), parserVersion: "web-ifc-0.0.77", createdAt: at }, evidence: { evidenceSnapshotId: "evidence-1", ifcImportId: "ifc-1", canonicalEvidence: { profile: "c" }, evidenceSha256: hash('{"profile":"c"}'), createdAt: at }, occurrence: { occurrenceId: "occurrence-1", evidenceSnapshotId: "evidence-1", elementStepId: 42, opportunityId: "opportunity-1", evidenceSignature: hash("signature"), createdAt: at }, annotations: [{ annotationId: "annotation-1", occurrenceId: "occurrence-1", payload: { authority: "ifc-derived" }, authority: "ifc-derived", createdAt: at }], pattern: { patternId: "repeating-metal-c-profile", version: "1.0.0", lifecycle: "promoted", canonicalPattern: { primitive: "standard.c" }, patternSha256: hash('{"primitive":"standard.c"}'), createdAt: at }, match: { matchId: "match-1", occurrenceId: "occurrence-1", annotationId: "annotation-1", patternId: "repeating-metal-c-profile", patternVersion: "1.0.0", outcome: "matched", reasons: ["frozen fixture"], createdAt: at }, recipes, requests, results, evaluation: { evaluationId: "evaluation-1", occurrenceId: "occurrence-1", matchId: "match-1", scenarioRequestIds: requests.map((item) => item.scenarioRequestId), createdAt: at }, aggregate: { aggregateId: "aggregate-1", evaluationId: "evaluation-1", outcome: "range", payload: { min: 0.21, max: 0.28 }, createdAt: at }, unresolvedGroups: [], state: "published" };
}

function corrupt(path: string, kind: string) {
  const db = new DatabaseSync(path);
  if (kind === "indexed_identity") db.prepare("update component_evaluations set job_id = 'tampered'").run();
  else if (kind === "canonical_payload") db.prepare("update component_evaluations set payload_json = '{}'").run();
  else if (kind === "missing_component") db.prepare("delete from component_evaluation_nodes where record_kind = 'recipe' and record_id = 'recipe-041'").run();
  else if (kind === "match_version") db.prepare("update component_evaluation_matches set pattern_version = '9.9.9'").run();
  else if (kind === "recipe_hash") db.prepare("update component_evaluation_recipes set recipe_sha256 = ?").run("f".repeat(64));
  else if (kind === "result_value") db.prepare("update component_evaluation_results set payload_json = '{\"effectiveUValueWPerM2K\":9}' where scenario_result_id = 'result-1'").run();
  else if (kind === "artifact_identity") db.prepare("update component_evaluation_results set artifact_identity = ? where scenario_result_id = 'result-1'").run("e".repeat(64));
  else db.prepare("update component_evaluation_results set outcome = 'fabricated' where scenario_result_id = 'result-1'").run();
  db.close();
}

function hash(value: string): string { return (awaitHash as (value: string) => string)(value); }
const awaitHash = (value: string) => requireHash(value);
function requireHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(64, "0");
}
