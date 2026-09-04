# Choose the library stack for a fast complete build

Status: resolved
Type: research
Blocked by: none

## Question

Which mature libraries will the spec mandate for each subsystem — async runtime and telemetry buffering, matched baselines and the full diagnostic tournament (Median/MAD, GLS, Elastic Net, BALANCE-style attribution, EBM, XGBoost), dependency/critical-path graphs, calibration, and report/eval — so the complete architecture ships fast with minimal hand-rolled code, and where must we still write custom code because no library fits?

## Answer

Decision: Python 3.12 with `asyncio` + stdlib buffering (no new runtime dep), `statsmodels` + `scikit-learn` for the stats core, `interpret-core` for EBM, LightGBM first with XGBoost fallback, `networkx` for DAGs (rustworkx only if profiling demands), `MAPIE` for conformal sets, `pydantic` for records, `fastembed` + `sqlite-vec` for retrieval, stdlib JSON/Markdown + `sklearn.metrics` for report/eval — ~300 lines total custom gaps. Full pins, fallbacks, and rejects (torch-based embeddings, servers, unmaintained libs) in `../research/library-stack.md`.
