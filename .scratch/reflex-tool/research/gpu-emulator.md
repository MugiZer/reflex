# Research: GPU emulator and fake-evidence contract

Source: research subagent findings, 2026-09-04. Full text preserved; decision lives in `../issues/01-gpu-emulator-and-fake-evidence.md`.

## Ranked options

| # | Option | Verdict |
|---|---|---|
| 1 | Purpose-built stochastic FakeGPU in Python (~200–400 LOC): emits Kineto Chrome-trace JSON + minimal nsys-sqlite-subset rows, seeded RNG + fault-injection knobs | **PRIMARY recommendation** — only option hitting L1/L2/L3 fake evidence, µs overhead, Windows-native, zero dep risk |
| 2 | alibaba/InferSim (Apache-2.0, active) — pure-Python LLM-inference roofline simulator | Timing-model donor for kernel durations; fallback #1 |
| 3 | microsoft/vidur (MIT) — discrete-event LLM inference simulator, Chrome-trace export | Serving-level realism cross-check; fallback #2 (offline only) |
| 4 | scai-tech/sitar-lab NeuSight (MIT, ASPLOS'25) — per-tile MLP kernel-latency predictor, pretrained weights | Per-kernel duration prior donor |
| 5 | TraceSmith (`tracesmith`, PyPI, Apache-2.0) — cross-vendor trace format + replay engine with `--mode dry-run` | Format/replay reference only (capture needs GPU) |
| 6 | parca-dev/parcagpu (Apache-2.0, active) — CUPTI injection lib + `mock_cupti.c` / `mock_cuda.c`, `make test` with no GPU | Level-3 API-shape reference (copy schema, not Linux-only code) |
| 7 | Accel-Sim / GPGPU-Sim | **REJECT as runtime** — needs real GPU for traces, Linux-only, hours per workload |
| 8 | leap-sa/cuda-mock, chaunceyjiang/fake-gpu | **REJECT for timing evidence** — no durations/overlap/stall model |

Notes: CUPTI (incl. `cupti-python`) needs a real GPU — no emulation value. `nsys export --type sqlite` schema is the right long-term import target, but generate synthetic rows into the same shape instead.

## Recommendation

Build the purpose-built stochastic FakeGPU emitting (a) Kineto Chrome-trace JSON and (b) minimal nsys-sqlite-subset (2–3 tables mirroring `CUPTI_ACTIVITY_KIND_KERNEL` / `MEMCPY` / `CUDA_API`). Timing core: InferSim roofline `t = max(flops/(peak*mfu), bytes/bw)` + lognormal jitter; per-op priors optionally from NeuSight; serving checks vs Vidur. Fault injection via one seeded `FaultProfile` dataclass. Mirror parcagpu probe field names and TraceSmith/Kineto flow-link convention so the real CUPTI reader drops in later.

## Fake-evidence contract (minimal fields)

- Conventions: timestamps ns uint64 monotonic fake clock; every GPU record carries `corr_id`; RNG `seed` stored per trace.
- L1 cheap state per tick (<1ms): `ts_ns, sm_util_pct, mem_bw_util_pct, dram_used_MB, queue_depth, active_kernels, active_streams, last_kernel_dur_us, last_gap_us, clock_sm_MHz, power_W_stub, fault_active`.
- L2 events: `cpu_launch{corr_id, pid, tid, api, kernel_name, grid, block, shmem_B, stream_id, t_cpu_start, t_cpu_end}`, `gpu_kernel{corr_id, stream_id, dev_id, name, t_gpu_start, dur_ns, launch_gap_ns, occupancy_pct, tensor_active_pct, dram_read_B, dram_write_B, l2_hit_pct}`, `transfer{corr_id, kind, bytes, bw_GBs, t_start, dur_ns, stream_id, overlaps_kernel}`, `sync_edge{corr_id|stream_id, type, blocked_ns, serialized}`, `counters{... synthetic=True}`.
- L3 deep (sampled, on-demand): `pc_samples{kernel corr_id, pc_offset, sass, func, n_samples, stall_hist}`, `instr_slice{corr_id, opcode_mix, tensor_vs_simd_ratio, bytes_per_op}`, `tensor_lineage{corr_id, aten_op, module_stack, shapes, dtype, origin_tag}` with `synthetic_l3=True`.
- Fault knobs: `launch_overhead_us, bw_pressure_x, stall_weights{}, force_sync_serialize, transfer_bytes_x, contention_streams + overlap_frac, jitter_lognormal_sigma`; each fault family = one knob preset.

## Open risks

1. Synthetic L3 will disagree with silicon — gate only on L1/L2 thresholds, L3 advisory until real GPU.
2. InferSim MFU tables age — pin table versions, record `timing_model_version` per trace.
3. nsys-sqlite schema unstable — depend only on 3 mirrored tables + Chrome-trace JSON as stable contract.
4. Overfitting to generator artifacts — seed sweeps + a real-trace replay acceptance test before calling the swap done.
