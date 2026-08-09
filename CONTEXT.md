# Context router

Use code and tests first for routine edits. Read one linked context document
only when its trigger applies.

| Task | Read |
| --- | --- |
| Product behavior, evidence, calculation, review, report, or scope | `context/domain.md` |
| Cross-cutting design, boundaries, naming, state, or verification | `context/working-contract.md` |
| Exact canonical term or state name | `UBIQUITOUS_LANGUAGE.md` |
| Current work or an unfinished slice | `context/roadmap.md` and its matching `context/issues/<area>/` file |
| Thermal-treatment family details | `src/development/thermal-treatment/README.md` |
| Historical rationale, prior acceptance criteria, or an explicitly named legacy contract | the specific file in `context/prds/`, `context/specs/`, `context/decisions/`, or `context/references/` |

`context/prds/` and `context/specs/` are historical design logs, not default
implementation instructions. When a historical document conflicts with code,
tests, or an active document above, inspect the conflict and update the active
contract deliberately rather than silently reviving the old rule.
