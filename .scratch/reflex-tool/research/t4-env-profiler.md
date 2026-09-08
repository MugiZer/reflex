# Colab T4 pinned env + Kineto profiler path (issue #118)

AFK research, no code written. `[UNVERIFIED]` = predicted from specs/docs, must confirm with one live `pip index` / runtime probe on a fresh T4 session.

## 1. Decision

- Fresh Colab GPU runtime (Python 3.12), pre-install **torch 2.9.1 + torchvision 0.24.1 from the cu128 index** (CUDA 12.8; fallback cu126 index if `nvidia-smi` driver < 570), then `pip install 'lerobot==0.6.0[smolvla,dataset,evaluation]'` (`lerobot/smolvla_base` checkpoint, revision SHA recorded at runtime). No `hardware`/`core_scripts`/`viz` extras — no robot-hardware imports.
- Single in-process Kineto collection per run: `profile(activities=[CPU, CUDA], record_shapes=True, profile_memory=False, with_stack=False, with_flops=False, with_modules=False)` + `export_chrome_trace(trace.json)`. No schedule, no second tracer alongside.
- Existing `colab/gpu_workload.py --torch-profile` call and notebook Cell 5 already use this shape (CPU+CUDA, `record_shapes=True`, chrome export); keep them as the collection path, add only the explicit `False` flags + runtime version recording.
- Keep the home-side ranker env (`requirements-t4.txt`) **separate** from the Colab collector env: `requirements-t4.txt` pins `numpy==2.3.4`, LeRobot core requires `numpy>=2.0,<2.3` — one env cannot satisfy both (predicted from specifiers, confirm with `pip` at runtime).

## 2. Boundary fit (all verified by local read)

- `reflex/collect.py:ingest` (L625): DONE-gated; per run needs `trace.json` (parsed by `kineto_to_bundle(trace, man)`, L661) and a manifest with all of `REQUIRED_MANIFEST` (L39: run_id/fault/seed + device/hardware/driver/cuda/collector_version + execution/context ids). Notebook Cell 5 already passes `identity_provider=nvidia_smi_identity`, `workload='t4-kineto'`, `trace_variant='kineto'`, `perf_status='profiled'`, `torch_version`/`software` — keep all of them.
- `kineto_to_bundle` (L390): requires per event only `ph/ts/pid/tid/name`; tolerates missing `dur/args/cat`; accepts integer-us or `us.frac` strings; unknown cats ignored. Consumes exactly what Kineto chrome export emits: `cpu_op`/`cuda_runtime`/`cuda_driver` -> `cpu_launch` (names containing `synchronize` rerouted to `sync_edge`), `kernel` -> `gpu_kernel` (+ normalized `kernel_name`, derived `launch_gap_ns`), `gpu_memcpy`/`gpu_memset` -> `transfer`, `cuda_sync` -> `sync_edge` (`blocked_ns` = dur). Derives `l1` timeline and `coverage = {timeline True, counters/stalls/tensors False}`.
- `adapt_bundle_for_diagnose` (L348): fills `kernel_name`/`launch_gap_ns`/`blocked_ns`/`l1` only where missing and sets `timing_model_version = kineto-{hardware}-{collector_version}` — no collector-side action needed beyond supplying the manifest.
- `reflex/envelope.py:stamp` via `collect.manifest` (L88–150): envelope carries commit/fault/seed/hw/collector/tmv/outcome/reason + `extra_env` device/driver/cuda/software/stats. **Gap:** notebook Cell 5 never passes `commit=COMMIT`, so `envelope.commit` lands as `"unknown"` — pass it (record-only recommendation, no code written here).

## 3. Pin list (collector env, install order matters)

| # | Package | Pin | Source / status |
|---|---------|-----|-----------------|
| 1 | Python | 3.12 (Colab default; notebook metadata `3.12.0`) | verified local notebook; LeRobot requires `>=3.12` (verified, installation docs + pyproject) |
| 2 | torch / torchvision | `torch==2.9.1`, `torchvision==0.24.1` via `--index-url https://download.pytorch.org/whl/cu128` (CUDA 12.8) | LeRobot project itself pins Linux torch to cu128, driver floor 570.86 (verified, pyproject `tool.uv`); 2.9.1+cu128 build exists (verified via pytorch 2.9.1-cuda12.8 image in pytorch#170774). Exact torchvision patch [UNVERIFIED] — confirm wheel on the cu128 index. Fallback `--index-url .../cu126` if Colab driver < 570. [UNVERIFIED live driver value — probe `nvidia-smi` first.] Never take PyPI-default cu130 on T4 (driver floor 580.65, verified LeRobot install docs) |
| 3 | lerobot | `lerobot==0.6.0` with extras `[smolvla,dataset,evaluation]` | 0.6.0 on PyPI released Jul 6 2026 (verified). `main` pyproject already says 0.6.2 [UNVERIFIED on PyPI] — prefer the PyPI version, or clone at tag `v0.6.0` and record `git rev-parse HEAD` |
| 4 | SmolVLA deps (come with `smolvla` extra) | `transformers>=5.4,<5.6`, `num2words>=0.5.14,<0.6.0`, `accelerate>=1.14,<2` | verified, pyproject `smolvla = [..., transformers-dep, num2words, accelerate-dep]` |
| 5 | HF / video-image (come with `dataset`+`evaluation` extras + core) | `huggingface-hub>=1.6,<2`, `datasets>=4.8,<5`, `av>=15,<16`, `torchcodec` (per-platform wheel), `safetensors`, `Pillow>=10,<13`, `opencv-python-headless>=4.9,<4.14`, `torchvision` (see #2), `gymnasium` | verified, pyproject + installation docs. `ffmpeg`: `apt install ffmpeg` on Colab when torch>=2.10 (system-link, verified docs), else rely on torchcodec-bundled/conda path; `av` (PyAV) is the automatic fallback where torchcodec has no wheel (verified docs) |
| 6 | Checkpoint | `lerobot/smolvla_base` (450M, flow-matching action expert, SmolVLM2 vision) + pin the Hub repo revision SHA at runtime | model page verified (`pip install "lerobot[smolvla]"`, `SmolVLAPolicy.from_pretrained`); exact revision SHA [UNVERIFIED] — record `snapshot_download(..., revision=<sha>)` output into manifest `software` |
| 7 | Import surface | `from lerobot.policies.smolvla.modeling_smolvla import SmolVLAPolicy` + dataset/policy factory only; do NOT install `hardware`/`core_scripts`/`viz`/`feetech`/`dynamixel` extras | [UNVERIFIED] that `modeling_smolvla` imports cleanly without hardware extras — first-run probe: import it in the smolvla+dataset-only env and record the result |
| 8 | Record, don't pre-pin | full `pip freeze` + `torch.__version__`, `torch.version.cuda`, driver/CUDA from `nvidia_smi_identity`, Hub revision → manifest `software`/`stats` (notebook Cell 5 already sends `torch_version`/`software`; extend the dict, don't add new plumbing) | recommendation only |

Do NOT `pip install -r requirements-t4.txt` into this env (numpy 2.3.4 vs LeRobot numpy<2.3 conflict, §1). Notebook Cell 2's unpinned `pip install pytest mapie interpret lightgbm` also contradicts `requirements-t4.txt` (mapie==1.5.0, sklearn==1.9.0, lightgbm==4.7.0, interpret-core==0.7.8, numpy==2.3.4, scipy==1.18.1 — verified local read): run the test suite against the pinned file home-side, or accept drift and record it.

## 4. Exact profiler options

```python
from torch.profiler import ProfilerActivity, profile
with profile(activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
             record_shapes=True, profile_memory=False,
             with_stack=False, with_flops=False, with_modules=False) as prof:
    stats = run_fault(fault, iters, seed, "cuda")
prof.export_chrome_trace(trace_path)
```

- `CPU`: aten ops + `cuda_runtime`/`cuda_driver` launch records + host-side `*synchronize*` waits -> feeds `cpu_launch` and (via the synchronize routing) `sync_edge`. Without it, `launch_gap_ns` derivation has no host end-times.
- `CUDA`: CUPTI kernels/copies/syncs -> `kernel` / `gpu_memcpy`+`gpu_memset` / `cuda_sync` cats (Kineto `CuptiActivityProfiler` handles `KERNEL`, `MEMCPY(2)`, `MEMSET`, `SYNCHRONIZATION`; profiler docs: CUDA tracing uses CUPTI, falls back to legacy timing-only mode when CUPTI is absent — so assert kernels appear in the exported JSON on first run).
- `record_shapes=True`: op input shapes into event `args` (preserved verbatim by the converter); required for shape-aware diagnose context. Cost (tensor refs held, minor extra copies) is documented and acceptable for a 20-iter microbench.
- `profile_memory=False`: memory events are allocation CREATE/DESTROY timelines, not silicon counters — `coverage.counters` stays `False` either way, so this only adds trace bulk for no bundle field.
- `with_stack/with_flops/with_modules=False`: stacks/flops/module hierarchy are not read by `kineto_to_bundle` (needs only `ph/ts/pid/tid/name` + optional `dur/args/cat`); stacks in particular add heavy overhead.
- No `schedule`/`on_trace_ready`: whole-run capture; `export_chrome_trace` exports the single context (with a schedule, only the last cycle is exported — wrong for one-shot fault runs).
- Warmup: 1 unprofiled `run_fault` pass before the profiled context is advisable (first-CUDA-use overhead is documented) — process recommendation, keeps steady-state timing.

## 5. Why no second tracing system

One CUPTI consumer per profiled run. Kineto collects in-process via CUPTI (verified: torch profiler docs "profiler uses CUPTI"; Kineto README "CUPTI used to collect traces from NVIDIA GPUs"); `nsys profile` also drives CUPTI out-of-process. Running both concurrently contends for the same buffers, perturbs exactly the launch-gap/overlap timing diagnose reads, and yields two clocks to reconcile plus double the artifact bytes. `collect.py` already encodes one-artifact-one-converter (`trace.json`->Kineto, `subset.db`->nsys, L659–663) and `run_pipeline.device()` returns one artifact set per run. Keep `nsys_command` (L237) as the *alternative* path for sessions where Kineto/CUPTI is unavailable — never simultaneous. (Contention mechanism is standard CUPTI knowledge, not a quoted doc line.)

## 6. Deterministic flags (where practical)

Set before CUDA init: `PYTHONHASHSEED`, `CUBLAS_WORKSPACE_CONFIG=:4096:8` (`setdefault` so an exported value wins); in-process: `random.seed`, `np.seed`, `torch.manual_seed`/`cuda.manual_seed_all`, `torch.backends.cudnn.deterministic=True`, `benchmark=False`, `torch.use_deterministic_algorithms(True, warn_only=True)` (`warn_only` so collection never hard-fails on an op without a deterministic kernel — verified PyTorch reproducibility docs). Ceiling: cuBLAS itself documents bit-wise reproducibility is void with concurrent streams, so `queue_contention`/`competing_workload` faults stay comparative-only; T4 (Turing, sm_75) has no TF32 units, so TF32 flags are moot on a T4-only corpus. Seeds 11/17/23 x iters 20 (notebook defaults) stand.

## 7. Sources

- Repo (verified local read): `reflex/collect.py` L39/88/237/348/390/625/661, `reflex/envelope.py` L13, `colab/gpu_workload.py` L136–142, `colab/Reflex_Colab_T4_run.ipynb` Cells 2/4/5, `requirements-t4.txt`.
- LeRobot installation docs (conda/py3.12/ffmpeg/torchcodec-matrix/cu128-vs-cu130 + driver floors 570.86/580.65); LeRobot `pyproject.toml` @ main (v0.6.2, torch>=2.7,<2.12, smolvla/dataset/evaluation extras, cu128 uv index); SmolVLA docs + `lerobot/smolvla_base` model page (`pip install "lerobot[smolvla]"`, `SmolVLAPolicy`); PyPI `lerobot 0.6.0` (Jul 6 2026).
- Torch profiler docs (`profile` signature: activities/record_shapes/profile_memory/with_stack/with_flops/with_modules/experimental_config; recipe: activities + record_shapes + export_chrome_trace; CUPTI note); Kineto repo + `libkineto` README + `CuptiActivityProfiler.cpp` activity kinds; PyTorch reproducibility + CUDA-env-var docs (`CUBLAS_WORKSPACE_CONFIG`, cudnn deterministic/benchmark).
- Websearch session `ses_f7dcfd087ffezc1QRzgtZIP12h` (Colab/torch-2.13-cu130 threads, cuBLAS multi-stream nondeterminism).
