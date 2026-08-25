# Agent guide

For changes to product behavior, architecture, or terminology, use
`CONTEXT.md` to select one relevant document. Do not load unrelated context or
historical PRD/spec logs.

- Preserve immutable IFC evidence, explicit uncertainty, and immutable
  revision history.
- Keep `src/domain/` independent of HTTP, storage, filesystem, and `web-ifc`.
- During implementation, run focused tests. Before completion, run
  `npm run typecheck`, the affected module tests, and any ticket-required
  boundary proof. Run `npm test` for cross-cutting changes, final
  integration/release, or when affected-test selection is unreliable.
- Do not commit generated/local `outputs/`, `storage/`, `data/`, `dist/`, or
  private IFC fixtures. Preserve unrelated worktree changes.
- The learning harness is a deep module; read
  `src/development/learning-harness/README.md` before adding or importing it.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Use graph results for navigation; confirm decision-critical relationships in current source before changing code or reporting a finding.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
