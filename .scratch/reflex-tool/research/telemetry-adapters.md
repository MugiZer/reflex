# Research brief: real-GPU telemetry adapters (CUPTI/nsys/Kineto/Colab)

Date: 2026-09-04. Three tracks. Full returns condensed; source links kept
for retrieval. Companion paper-index entries live in `paper-index.md` only
for published papers — most sources below are vendor docs, linked inline.

## 1. What the hardware stack actually provides

- **Launch records:** `CUpti_ActivityKernel12` (device/context/stream/
  correlation/grid/block/shared/registers, start/end/completed ns) +
  `CUpti_ActivityAPI` (cbid, pid/tid, correlationId == kernel's). Join on
  correlationId. Gap = next-start minus end per stream (or
  queued-submitted with latency timestamps). Tracing works non-admin even
  restricted; only perf counters need privs.
  Docs: https://docs.nvidia.com/cupti/api/structCUpti__ActivityKernel12.html
- **Transfers:** `CUpti_ActivityMemcpy7` (kind HtoD/DtoH/DtoD/PtoP, bytes,
  start/end, stream, correlationId). Bandwidth/overlap are COMPUTED, not
  stored. No PCIe queue depth.
- **Sync:** `CUpti_ActivitySynchronization2` (start/end = blocked time,
  correlationId, streamId, event IDs) + synchronize-callback data.
- **L1 state (NVML, polled, coarse):** utilization % (166ms-1s granularity),
  memory bytes, SM clocks, power mW, throttle-reason bitmask, violation ns,
  PCIe throughput. NEVER per-kernel — coarse poll only. Same API T4/A100.
  Docs: https://docs.nvidia.com/deploy/nvml-api/group__nvmlDeviceQueries.html
- **L3 deep (PC/stall/source):** new PC sampling needs Volta+ (T4/A100 OK,
  P100 NO — legacy only); `correlationId` valid ONLY in SERIALIZED mode;
  stall sets arch-specific (query at runtime); source via
  `cuptiGetSassToSourceCorrelation` (needs -lineinfo); ncu replays kernels
  10-100x. REQUIRES perf-counter privs → expect BLOCKED on Colab free.
- **CUPTI Python:** official `cupti-python` (CUDA 13.3+, Activity+Callback+PM;
  PC sampling NOT covered) — https://docs.nvidia.com/cupti-python/13.3.0/user-guide/topics/overview.html

## 2. nsys export reality

- `nsys profile -t cuda,nvtx,osrt,cublas --gpu-metrics-device=all
  --cuda-memory-usage=true -o out`; `nsys export --type sqlite|json|text`.
- SQLite is canonical: `CUPTI_ACTIVITY_KIND_{RUNTIME,DRIVER,KERNEL,
  CONCURRENT_KERNEL,MEMCPY,MEMSET,SYNCHRONIZATION}` + `StringIds(id,value)`
  + `SCHED_EVENTS` + `COMPOSITE_EVENTS`. Columns are camelCase
  (`correlationId`, `deviceId`, `streamId`); kernel names via `nameId` →
  `StringIds` join. Exact columns version-dependent — query `.schema`.
- JSON export is newline-delimited protobuf, NOT Chrome trace. No
  `nsys export --type chrome`; Chrome JSON needs a (lossy) converter.

## 3. Kineto format guarantees (what our importer must handle)

- `ts`/`dur` are MICROSECONDS (`"us.frac"` strings); relative to
  `baseTimeNanoseconds`. Our writer currently emits ns ints — MUST align.
- GPU events: `pid=deviceId`, `tid=streamId`. CPU launch: host pid/tid.
- Linkage: `args."External id"` (= CUPTI correlationId) shared by CPU op +
  runtime + kernel; flow `s`/`f` with decimal-int `id` + `"bp":"e"` on `f`.
  Join rule: group by External id, never by name or time proximity.
- Cats: `cpu_op, cuda_runtime, cuda_driver, kernel, gpu_memcpy, gpu_memset,
  cuda_sync`. Args carry grid/block/stream/correlation/registers/occupancy,
  shapes/strides/dtypes (optional), call stacks (opt-in).
- CANNOT represent: device counters at fidelity, PC/stall samples, tensor
  lineage/IDs, multi-rank clock sync, queuing-vs-execution, system scope
  (sched/power/PCIe). Those ride in a SIDECAR, never the trace.

## 4. Colab operating picture

- GPUs: free ≈ T4 (sometimes P100); Pro adds L4/V100/A100; detect every
  session (`nvidia-smi` + torch properties + `nsys status -e`).
- Root available: `apt install nsight-systems-cli` works (ephemeral —
  reinstall each session). nsys CLI runs unprivileged; CUDA trace works;
  counters/`--gpu-metrics-device`/ncu expect failure (no host control).
- Session limits (~90min idle kill, ~12h max): shard sweeps <2h, checkpoint
  every 15-30min. Drive FUSE is not a disk: stage in `/content`, single
  `cp` to Drive, `flush_and_unmount`; never profile onto Drive directly.
- Detect-and-abort: no GPU, wrong card, driver<nsys minimum,
  paranoid>2 (drop to `--sample=none`), empty CUDA lane on smoke test,
  disk < 3x expected rep size.
- P100 = L0+L1 only (no modern PC/PM/SASS). T4/A100 full trace + NVML.

## 5. Minimal sidecar schema (travels WITH every trace)

trace_id, rank/world_size/host/pid, pg_config, deviceProperties,
baseTimeNanoseconds, clock domains + offset/drift, software versions
(torch/cuda/driver/cupti/nsys), capture config (activities, record_shapes,
stack, flops, sync events), stats (dropped records, correlation misses),
joins present, lineage (model hash, code ref, input manifest), system refs
(nsys sqlite URI for full-fidelity drill-down).

## Adopted consequences for our code (ticket 20)

- FakeGPU Kineto writer aligns to real conventions (us ts, real cat names,
  External id, pid=device/tid=stream) — no more synthetic-only dialect.
- Converters parse real shapes: us-frac ts, External-id linkage, camelCase
  nsys + StringIds join, mirrored-subset path kept.
- Manifest gains software/stats sections (versions, dropped counts).
- L3 stays synthetic/emulator-only until privileged hardware; L1 stays
  coarse-poll semantics (never per-kernel claims).
