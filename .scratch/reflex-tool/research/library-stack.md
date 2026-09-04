# Research: library stack for a fast complete build

Source: research subagent findings, pins verified 2026-09-04 via PyPI/GitHub. Full text preserved; decision lives in `../issues/02-library-stack.md`.

Target: Python `==3.12` (only version satisfying all: `xgboost>=3.3` requires `>=3.12`, sklearn 1.9 supports 3.11–3.14, interpret 0.7.8 covers 3.10–3.14, networkx 3.6.1 requires `>=3.11`). All have `win_amd64` wheels, CPU-only default.

## Recommendations

| Subsystem | Primary (+ pin) | Fallback | Custom-code gap |
|---|---|---|---|
| Async runtime + telemetry buffering | stdlib `asyncio` + `collections.deque(maxlen=N)` + `numpy` (transitive) | `anyio==4.15.0` only if trio-compat needed | ~30-line `TelemetryRing` (dict[str, deque] + median/MAD snapshot) |
| Baselines + stats | `statsmodels==0.15.0` (GLS) + `scikit-learn==1.9.0` (ElasticNetCV, isotonic, CalibratedClassifierCV, lag-xcorr) | `numpy`-only OLS/MAD baseline | correlated-feature attribution (~100 lines on top); lagged xcorr + MAD gates (~40 lines) |
| Glassbox ranker | `interpret-core==0.7.8` (install `-core`, not `[all]`) | LightGBM gain + permutation importance | cap `interactions` (O(p²)); fit in background only |
| GB ranking | `lightgbm==4.7.0` (1.4MB wheel, fast CPU train) | `xgboost==3.4.1` | — |
| Dependency/critical-path graphs | `networkx==3.6.1` (`dag_longest_path` = critical path, ancestors/descendants = suspect subgraph) | `rustworkx==0.18.1` only if profiling proves networkx hot | request-scoped DAG builder + k-hop extraction (~80 lines) |
| Calibration | `scikit-learn==1.9.0` (Platt + isotonic); temperature scaling custom ~20 lines via scipy | — | temperature fit; `temperature_scaling` repo is archived — avoid |
| Conformal sets | `MAPIE==1.5.0` (v1 API; needs ~500/1000/5000 cal points for α=0.10/0.05/0.01) | custom 30-line split-conformal via `numpy.quantile` | recalibration cadence under drift |
| Abstention/stopping | custom policy on calibrated p + set size + hysteresis (~30 lines) | — | no mature lib exists |
| Incident records | `pydantic==2.13.5` (validation + JSON-schema export) | stdlib `dataclasses` | — |
| Semantic retrieval | `fastembed==0.8.0` (ONNX CPU, no torch) + `sqlite-vec==0.1.9` (293kB); default `BAAI/bge-small-en-v1.5` 384-d | sklearn TF-IDF+cosine (zero new deps) | HF model cache for air-gap |
| Graph similarity | custom on networkx (`weisfeiler_lehman_graph_hash` + edge Jaccard, ~40 lines) | — | no fitting maintained CPU/Windows lib |
| Report + eval | stdlib `json` + handwritten Markdown + `sklearn.metrics` | `tabulate` if tables get painful | ~60-line `EvalHarness` (JSONL log, seed table, Markdown emitter) |

## Minimal install

`python==3.12 + statsmodels==0.15.0 scikit-learn==1.9.0 interpret-core==0.7.8 lightgbm==4.7.0 networkx==3.6.1 MAPIE==1.5.0 pydantic==2.13.5 fastembed==0.8.0 sqlite-vec==0.1.9` — everything else stdlib + ~300 lines total custom gaps.

## Flags

- REJECT: `uvloop` (Windows-hostile), `sentence-transformers+torch` (~2GB, GPU-leaning), `chroma`/`qdrant-server`/`lancedb` (server/heavy for <100k incidents), `mlflow`/`W&B` (overkill; JSONL log suffices), `crepes`/`nonconformist` (unmaintained), `interpret[all]` (drags shap/lime/dash).
