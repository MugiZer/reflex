import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalTopologyJson } from "../../../domain/topology/canonicalTopologyJson.js";
import { componentEvaluationIdentities, type ComponentEvaluationGraph, type ComponentEvaluationRepository } from "../../../domain/topology/componentEvaluationRecords.js";
import type { JsonValue } from "../../../domain/topology/topologyTypes.js";

type Fault = "planned-scenarios" | "first-result";
type Row = { evaluation_id: string; job_id: string; revision_id: string; assembly_group_id: string; state: string; payload_json: string; payload_sha256: string };

export class SqliteComponentEvaluationRepository implements ComponentEvaluationRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("pragma foreign_keys = on; pragma busy_timeout = 5000");
    this.db.exec(`
      create table if not exists component_evaluations (
        evaluation_id text primary key, job_id text not null, revision_id text not null,
        assembly_group_id text not null, state text not null check(state = 'recoverable'),
        payload_json text not null, payload_sha256 text not null
      );
      create table if not exists component_evaluation_publications (
        evaluation_id text primary key references component_evaluations(evaluation_id),
        payload_json text not null, payload_sha256 text not null
      );
      create table if not exists component_evaluation_nodes (
        evaluation_id text not null references component_evaluations(evaluation_id),
        record_kind text not null, record_id text not null, parent_id text,
        payload_json text not null, payload_sha256 text not null,
        primary key(evaluation_id, record_kind, record_id)
      );
      create table if not exists component_evaluation_matches (
        match_id text primary key, evaluation_id text not null references component_evaluations(evaluation_id),
        pattern_id text, pattern_version text, payload_json text not null, payload_sha256 text not null
      );
      create table if not exists component_evaluation_recipes (
        recipe_id text primary key, evaluation_id text not null references component_evaluations(evaluation_id),
        match_id text not null, recipe_sha256 text not null, payload_json text not null, payload_sha256 text not null
      );
      create table if not exists component_evaluation_results (
        scenario_result_id text primary key, evaluation_id text not null references component_evaluations(evaluation_id),
        scenario_request_id text not null, outcome text not null, artifact_identity text,
        payload_json text not null, payload_sha256 text not null
      );
    `);
  }

  append(graph: ComponentEvaluationGraph, faultAfter?: Fault): void {
    const publish = !faultAfter && graph.state === "published";
    validateGraph(graph, publish);
    const recoverable: ComponentEvaluationGraph = { ...graph, state: "recoverable", aggregate: null, results: faultAfter === "first-result" ? graph.results.slice(0, 1) : faultAfter === "planned-scenarios" ? [] : graph.results };
    this.db.exec("begin immediate");
    try {
      const existing = this.db.prepare("select evaluation_id, job_id, revision_id, assembly_group_id from component_evaluations where evaluation_id = ?").get(graph.evaluation.evaluationId) as Pick<Row, "evaluation_id" | "job_id" | "revision_id" | "assembly_group_id"> | undefined;
      if (!existing) insertImmutable(this.db, "component_evaluations", [graph.evaluation.evaluationId, graph.jobId, graph.sourceRevisionId, graph.sourceAssemblyGroupId, "recoverable", json(recoverable), hashJson(recoverable)], "evaluation_id");
      else if (existing.job_id !== graph.jobId || existing.revision_id !== graph.sourceRevisionId || existing.assembly_group_id !== graph.sourceAssemblyGroupId) throw new Error("Immutable component evaluation identity conflict.");
      for (const node of nodes(faultAfter ? recoverable : graph)) insertImmutable(this.db, "component_evaluation_nodes", [graph.evaluation.evaluationId, node.kind, node.id, node.parentId, json(node.payload), hashJson(node.payload)], "evaluation_id, record_kind, record_id");
      insertImmutable(this.db, "component_evaluation_matches", [graph.match.matchId, graph.evaluation.evaluationId, graph.match.patternId, graph.match.patternVersion, json(graph.match), hashJson(graph.match)], "match_id");
      for (const recipe of graph.recipes) insertImmutable(this.db, "component_evaluation_recipes", [recipe.recipeId, graph.evaluation.evaluationId, recipe.matchId, recipe.recipeSha256, json(recipe.canonicalRecipe), hashJson(recipe.canonicalRecipe)], "recipe_id");
      for (const result of recoverable.results) insertImmutable(this.db, "component_evaluation_results", [result.scenarioResultId, graph.evaluation.evaluationId, result.scenarioRequestId, result.outcome, result.artifactIdentity, json(result.resultPayload), hashJson(result.resultPayload)], "scenario_result_id");
      if (publish) insertImmutable(this.db, "component_evaluation_publications", [graph.evaluation.evaluationId, json(graph), hashJson(graph)], "evaluation_id");
      this.db.exec("commit");
    } catch (error) {
      this.db.exec("rollback");
      throw error;
    }
    if (faultAfter) throw new Error(`component_evaluation_interrupted:${faultAfter}`);
  }

  listByJobId(jobId: string): readonly ComponentEvaluationGraph[] {
    const rows = this.db.prepare("select evaluation_id from component_evaluations where job_id = ? order by evaluation_id").all(jobId) as Array<{ evaluation_id: string }>;
    return rows.map((row) => this.getByEvaluationId(row.evaluation_id)!);
  }

  getByEvaluationId(evaluationId: string): ComponentEvaluationGraph | null {
    const base = this.db.prepare("select * from component_evaluations where evaluation_id = ?").get(evaluationId) as Row | undefined;
    if (!base) return null;
    const publication = this.db.prepare("select payload_json, payload_sha256 from component_evaluation_publications where evaluation_id = ?").get(evaluationId) as { payload_json: string; payload_sha256: string } | undefined;
    try {
      if (sha256(base.payload_json) !== base.payload_sha256) throw new Error();
      const selected = publication ?? base;
      if (sha256(selected.payload_json) !== selected.payload_sha256) throw new Error();
      let graph = JSON.parse(selected.payload_json) as ComponentEvaluationGraph;
      if (!publication) graph = reconstructRecoverableResults(this.db, graph);
      validateGraph(graph, Boolean(publication));
      if (graph.evaluation.evaluationId !== base.evaluation_id || graph.jobId !== base.job_id || graph.sourceRevisionId !== base.revision_id || graph.sourceAssemblyGroupId !== base.assembly_group_id) throw new Error();
      validateRows(this.db, graph);
      return graph;
    } catch {
      throw new Error("Persisted component evaluation graph is corrupt.");
    }
  }

  close(): void { this.db.close(); }
}

function reconstructRecoverableResults(db: DatabaseSync, graph: ComponentEvaluationGraph): ComponentEvaluationGraph {
  const rows = db.prepare("select payload_json, payload_sha256 from component_evaluation_nodes where evaluation_id = ? and record_kind = 'result'").all(graph.evaluation.evaluationId) as Array<{ payload_json: string; payload_sha256: string }>;
  const results = rows.map((row) => {
    if (sha256(row.payload_json) !== row.payload_sha256) throw new Error("result node hash mismatch");
    return JSON.parse(row.payload_json) as ComponentEvaluationGraph["results"][number];
  });
  const requestOrder = new Map(graph.requests.map((request, index) => [request.scenarioRequestId, index]));
  results.sort((left, right) => (requestOrder.get(left.scenarioRequestId) ?? Number.MAX_SAFE_INTEGER) - (requestOrder.get(right.scenarioRequestId) ?? Number.MAX_SAFE_INTEGER));
  return { ...graph, results };
}

function validateGraph(graph: ComponentEvaluationGraph, published: boolean): void {
  if (graph.schemaVersion !== "component-evaluation-sqlite/v1" || graph.evaluation.occurrenceId !== graph.occurrence.occurrenceId || graph.evaluation.matchId !== graph.match.matchId || graph.match.occurrenceId !== graph.occurrence.occurrenceId || (graph.pattern ? graph.match.patternId !== graph.pattern.patternId || graph.match.patternVersion !== graph.pattern.version : graph.match.patternId !== null || graph.match.patternVersion !== null) || graph.evidence.ifcImportId !== graph.ifcImport.ifcImportId || graph.occurrence.evidenceSnapshotId !== graph.evidence.evidenceSnapshotId) throw new Error("Invalid component evaluation graph.");
  if (graph.recipes.some((item) => item.matchId !== graph.match.matchId) || graph.requests.some((item) => item.evaluationId !== graph.evaluation.evaluationId || !graph.recipes.some((recipe) => recipe.recipeId === item.recipeId)) || graph.results.some((item) => !graph.requests.some((request) => request.scenarioRequestId === item.scenarioRequestId))) throw new Error("Invalid component evaluation graph.");
  if (published && (graph.state !== "published" || !graph.aggregate || graph.aggregate.evaluationId !== graph.evaluation.evaluationId || graph.results.length !== graph.requests.length)) throw new Error("Invalid component evaluation graph.");
}

function validateRows(db: DatabaseSync, graph: ComponentEvaluationGraph): void {
  const match = db.prepare("select * from component_evaluation_matches where match_id = ?").get(graph.match.matchId) as any;
  if (!match || match.pattern_id !== graph.match.patternId || match.pattern_version !== graph.match.patternVersion || match.payload_sha256 !== hashJson(graph.match) || match.payload_json !== json(graph.match)) throw new Error("match row mismatch");
  for (const recipe of graph.recipes) { const row = db.prepare("select * from component_evaluation_recipes where recipe_id = ?").get(recipe.recipeId) as any; if (!row || row.match_id !== recipe.matchId || row.recipe_sha256 !== recipe.recipeSha256 || row.payload_json !== json(recipe.canonicalRecipe) || row.payload_sha256 !== hashJson(recipe.canonicalRecipe)) throw new Error(`recipe row mismatch:${recipe.recipeId}`); }
  for (const result of graph.results) { const row = db.prepare("select * from component_evaluation_results where scenario_result_id = ?").get(result.scenarioResultId) as any; if (!row || row.scenario_request_id !== result.scenarioRequestId || row.outcome !== result.outcome || row.artifact_identity !== result.artifactIdentity || row.payload_json !== json(result.resultPayload) || row.payload_sha256 !== hashJson(result.resultPayload)) throw new Error(`result row mismatch:${result.scenarioResultId}`); }
  const storedNodes = db.prepare("select record_kind, record_id, parent_id, payload_json, payload_sha256 from component_evaluation_nodes where evaluation_id = ?").all(graph.evaluation.evaluationId) as any[];
  const expected = nodes(graph);
  for (const node of expected) { const row = storedNodes.find((item) => item.record_kind === node.kind && item.record_id === node.id); if (!row || row.parent_id !== node.parentId || row.payload_json !== json(node.payload) || row.payload_sha256 !== hashJson(node.payload)) throw new Error(`node row mismatch:${node.kind}:${node.id}`); }
}

function nodes(graph: ComponentEvaluationGraph): Array<{ kind: string; id: string; parentId: string | null; payload: JsonValue }> {
  const rows: Array<{ kind: string; id: string; parentId: string | null; payload: JsonValue }> = [
    { kind: "ifc_import", id: graph.ifcImport.ifcImportId, parentId: graph.jobId, payload: graph.ifcImport as unknown as JsonValue },
    { kind: "evidence", id: graph.evidence.evidenceSnapshotId, parentId: graph.ifcImport.ifcImportId, payload: graph.evidence as unknown as JsonValue },
    { kind: "occurrence", id: graph.occurrence.occurrenceId, parentId: graph.evidence.evidenceSnapshotId, payload: graph.occurrence as unknown as JsonValue },
    { kind: "match", id: graph.match.matchId, parentId: graph.occurrence.occurrenceId, payload: graph.match as unknown as JsonValue },
    { kind: "evaluation", id: graph.evaluation.evaluationId, parentId: graph.match.matchId, payload: graph.evaluation as unknown as JsonValue },
    ...graph.annotations.map((item) => ({ kind: "annotation", id: item.annotationId, parentId: item.occurrenceId, payload: item as unknown as JsonValue })),
    ...graph.recipes.map((item) => ({ kind: "recipe", id: item.recipeId, parentId: item.matchId, payload: item as unknown as JsonValue })),
    ...graph.requests.map((item) => ({ kind: "request", id: item.scenarioRequestId, parentId: item.recipeId, payload: item as unknown as JsonValue })),
    ...graph.results.map((item) => ({ kind: "result", id: item.scenarioResultId, parentId: item.scenarioRequestId, payload: item as unknown as JsonValue })),
    ...graph.unresolvedGroups.map((item) => ({ kind: "unresolved", id: item.unresolvedGroupId, parentId: null, payload: item as unknown as JsonValue })),
  ];
  if (graph.pattern) rows.push({ kind: "pattern", id: componentEvaluationIdentities.patternVersion({ patternId: graph.pattern.patternId, version: graph.pattern.version, canonicalPattern: graph.pattern.canonicalPattern }), parentId: null, payload: graph.pattern as unknown as JsonValue });
  if (graph.aggregate) rows.push({ kind: "aggregate", id: graph.aggregate.aggregateId, parentId: graph.evaluation.evaluationId, payload: graph.aggregate as unknown as JsonValue });
  return rows;
}

type SqlValue = string | number | bigint | null | Uint8Array;
function insertImmutable(db: DatabaseSync, table: string, values: SqlValue[], keyColumns: string): void {
  const columns = table === "component_evaluations" ? "evaluation_id, job_id, revision_id, assembly_group_id, state, payload_json, payload_sha256" : table === "component_evaluation_publications" ? "evaluation_id, payload_json, payload_sha256" : table === "component_evaluation_nodes" ? "evaluation_id, record_kind, record_id, parent_id, payload_json, payload_sha256" : table === "component_evaluation_matches" ? "match_id, evaluation_id, pattern_id, pattern_version, payload_json, payload_sha256" : table === "component_evaluation_recipes" ? "recipe_id, evaluation_id, match_id, recipe_sha256, payload_json, payload_sha256" : "scenario_result_id, evaluation_id, scenario_request_id, outcome, artifact_identity, payload_json, payload_sha256";
  const placeholders = values.map(() => "?").join(",");
  db.prepare(`insert or ignore into ${table} (${columns}) values (${placeholders})`).run(...values);
  const keys = keyColumns.split(", "); const keyValues = values.slice(0, keys.length);
  const row = db.prepare(`select ${columns} from ${table} where ${keys.map((key) => `${key} = ?`).join(" and ")}`).get(...keyValues) as Record<string, unknown>;
  const stored = columns.split(", ").map((name) => row[name]);
  if (canonicalTopologyJson(stored as unknown as JsonValue) !== canonicalTopologyJson(values as unknown as JsonValue)) throw new Error("Immutable component evaluation identity conflict.");
}

function json(value: unknown): string { return canonicalTopologyJson(value as JsonValue); }
function hashJson(value: unknown): string { return sha256(json(value)); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
