# Root demo diagrams

Six standalone Mermaid diagrams, in narration order. Rendered assets use a 16:9 canvas, a dark background, white text, teal for selected evidence, and coral for regression. SVGs remain sharp at any size; PNGs are 3840 × 2160. The `.mmd` files are editable source.

## 01 — Matched healthy comparison

Communicates: the incident is compared with compatible healthy evidence; incompatible context is excluded.

Reveal: regressed execution → healthy candidates → context comparison → compatible baseline. Dim incompatible candidates last.

Implementation: `diagnose.py` checks context and refuses mismatched baselines. The diagram abstracts candidate selection; the comparator itself validates supplied baselines rather than searching a repository. The real-trace path checks `timing_model_version` (card/collector context), while synthetic comparison additionally checks workload/kernel context. Do not imply that every hardware/software fingerprint is independently validated.

## 02 — CPU → CUDA → GPU execution path

Communicates: timing belongs to connected work and dependencies. Enqueue links a host launch to GPU execution; transfers feed kernels; synchronization can block host progress.

Reveal: CPU work → CUDA launch → enqueue → kernels. Add the transfer branch, then synchronization and host continuation. Highlight the correlation-ID edge as the narration says “reconstructs.”

Implementation: `reconstruct.py:build_graph` links `cpu_launch`, `gpu_kernel`, `transfer`, and `sync_edge`; the real trace adapter supplies runtime/correlation context. This shows one synchronized path, not a claim that all launches block the host or that all transfers serialize.

## 03 — Evidence → cause ranking

Communicates: matched timing, dependency structure, and statistical/ML attribution feed a combined ranking.

Reveal: the three evidence branches one at a time → combined diagnosis → ranked candidates.

Implementation: `confidence.py`, `tournament.py`, and `report.py` combine evidence. Candidate names are actual stage vocabulary. No numerical probabilities or particular winner are asserted; order shown is illustrative. Differently derived evidence may be correlated, so the diagram does not call the sources statistically independent. Ranking remains INFERRED.

## 04 — Active measurement selection

Communicates: remaining hypotheses and candidate measurements determine which signal is worth acquiring next.

Reveal: remaining hypotheses → three candidate measurements → selector → selected measurement → updated hypotheses. Highlight only the selected branch at the end. A particular winning profiler is deliberately not invented.

Implementation: `select.py` exposes `scheduler_trace`, `kernel_timeline`, and `counters` (three of six real action names). With trusted outcome models, score is EIG × reliability × nonredundancy / effective cost. Cost includes incremental overhead and unpaid shared setup. Prerequisites, permissions, budgets, and stop/abstain conditions constrain execution. Cold-start or high unknown mass uses a disclosed cost-aware fallback, not an invented EIG estimate. The headline is an abstraction of the trusted-model path. New evidence updates beliefs; reduced ambiguity is the objective, not a guaranteed outcome.

## 05 — Controlled verification

Communicates: a recorded prediction is tested through an intervention and rerun; both mechanism and latency checks must pass.

Reveal: suspect → predicted change → intervention → controlled rerun → mechanism check → recovery check. Reveal VERIFIED only after both Yes edges. The No branch stays TESTED.

Implementation: `report.py` passes cause-specific expected effects to `verify.py:run_intervention`. The verified path requires the directional effects, positive measured end-to-end improvement, and recovery of at least half the predicted gap. The figure depicts this cause-specific path. The inspected implementation performs these interventions in the synthetic harness; the T4 measurements in asset 06 do not establish that the complete verification loop ran on real hardware.

## 06 — Real T4 result

Communicates: SmolVLA on NVIDIA T4 shows higher median and tail device latency plus a strong matched GPU anomaly.

Reveal: healthy column → regressed column → percentage increases → anomaly pair. Keep all three rows on screen together at the end.

The anomaly is a dimensionless matched per-kernel z-scale score, not milliseconds. The +152% and +230% increases are the rounded values recorded in the evaluation. This asset makes no recovery, verified-fix, or accuracy claim.

## Sources and scope

- [Drive demo script](https://docs.google.com/document/d/1pilZQRYgJFLlnUd3fOKJXQhHxq2T6N0_BCYR7g5rjsI/edit)
- [Drive project design](https://docs.google.com/document/d/1DiPVXxgo2rH6kVPB9obIcjupev9sronkbQZE8dHy_VA/edit)
- Local implementation: `C:/Users/moham/OneDrive/Documents/ChatGPT/Reflex/reflex/`
- Evaluation values: `C:/Users/moham/OneDrive/Documents/ChatGPT/Reflex/README.md` and `workloads/smolvla/TRACES.md`, `max-risky-colab-20260914-seed11` entry.
- The attached six-asset brief defines the deliverables. Its statement that full codebase context was already known was not assumed; the sources above were inspected. The transcript was treated as narration context, and retrieved documents as source material.

`mermaid-source.md` contains all six code blocks for copy/paste. Rendering is reproducible with `render.cjs` using local Mermaid and Puppeteer packages, supplied through `MERMAID_PACKAGE_ROOT`, plus the Chrome executable in `CHROME_PATH`.
