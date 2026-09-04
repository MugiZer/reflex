"""Seeded stochastic FakeGPU: deterministic L1/L2/L3 fake evidence.

Real-GPU-ready: field names mirror CUPTI/parcagpu (correlation_id,
stream_id/device_id/kernel_name, start_ns/end_ns); a future real CUPTI
reader consumes the same vocabulary. The ONLY fake part is fidelity:
every emitted ledger record carries synthetic=True (values stand in
for silicon). Timing core: roofline t=max(flops/(peak*mfu), bytes/bw)
+ lognormal jitter. Stdlib only (random + json + sqlite3).
"""
from __future__ import annotations

import json
import random
import sqlite3
from dataclasses import dataclass
from pathlib import Path

TIMING_MODEL_VERSION = "roofline-v1"
PROVENANCE = "fakegpu"
# ponytail: silicon-fidelity placeholders (peaks/MFU, 25 GB/s transfer, dram/clock L1); calibrate from InferSim bench_data or real nsys when duration fidelity matters.
PEAK_FLOPS, PEAK_BW, MFU = 100e12, 1.6e12, 0.35
BASE_CLOCK_NS = 1_000_000_000

# ponytail: fixed 3-kernel prior cycle, not a model registry; add NeuSight
# priors per kernel when duration fidelity (not just ordering) matters.
_PRIORS = (  # (kernel_name, flops, bytes, grid, block, shmem_B)
    ("attn_kernel", 2.0e9, 50e6, (128, 1, 1), (256, 1, 1), 49152),
    ("mlp_kernel", 4.0e9, 30e6, (256, 1, 1), (256, 1, 1), 32768),
    ("layernorm_kernel", 0.2e9, 20e6, (64, 1, 1), (512, 1, 1), 8192),
)
KERNEL_FLOPS = {k: f for k, f, *_ in _PRIORS}  # single source for flops priors; import, don't mirror


@dataclass(frozen=True)
class FaultProfile:
    """One knob preset per fault family (research/gpu-emulator.md contract)."""

    launch_overhead_us: float = 0.0
    bw_pressure_x: float = 1.0
    # ponytail: scalar stall ceiling, not stall_weights{} per-reason dict;
    # upgrade to a dict when attribution needs per-reason stalls.
    stall_extra_pct: float = 0.0
    force_sync_serialize: bool = False
    transfer_bytes_x: float = 1.0
    contention_streams: int = 1
    overlap_frac: float = 0.8
    jitter_lognormal_sigma: float = 0.15
    cpu_starve_us: float = 0.0
    kernel_slowdown_x: float = 1.0
    batch_delay_us: float = 0.0


PRESETS: dict[str, FaultProfile] = {
    "healthy": FaultProfile(),
    "cpu_starvation": FaultProfile(cpu_starve_us=120.0),
    "launch_overhead": FaultProfile(launch_overhead_us=60.0),
    "bw_pressure": FaultProfile(bw_pressure_x=3.0),
    "stalls": FaultProfile(stall_extra_pct=40.0),
    "sync_serialization": FaultProfile(force_sync_serialize=True),
    "transfer_heavy": FaultProfile(transfer_bytes_x=4.0),
    "batching_delay": FaultProfile(batch_delay_us=100.0),
    "queue_contention": FaultProfile(contention_streams=4, overlap_frac=0.2),
    "competing_workload": FaultProfile(contention_streams=3, overlap_frac=0.9),
    "kernel_regression": FaultProfile(kernel_slowdown_x=2.5),
    "preprocessing_interference": FaultProfile(cpu_starve_us=30.0, batch_delay_us=60.0),
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def generate(seed: int, profile: FaultProfile | str = "healthy", n_kernels: int = 8) -> dict:
    """Deterministic bundle of L1 state + L2 events + synthetic L3 stubs."""
    if isinstance(profile, str):
        name, prof = profile, PRESETS[profile]
    else:
        name, prof = "custom", profile
    rng = random.Random(seed)
    b: dict = {"seed": seed, "profile": name, "timing_model_version": TIMING_MODEL_VERSION,
               "l1": [], "cpu_launch": [], "gpu_kernel": [], "transfer": [],
               "sync_edge": [], "l3_pc": [], "l3_instr": [], "l3_lineage": []}
    t_ns, prev_cpu_end = BASE_CLOCK_NS, BASE_CLOCK_NS
    stream_end: dict[int, int] = {}  # per-stream device clock; overlap emerges, never forced
    for i in range(n_kernels):
        kname, flops, nbytes, grid, block, shmem = _PRIORS[i % len(_PRIORS)]
        cid = f"{seed:08x}-{i:04d}"
        sig = prof.jitter_lognormal_sigma
        j = lambda: rng.lognormvariate(0.0, sig)  # fixed draw order per op
        j_launch, j_inter, j_dur = j(), j(), j()
        bw_eff = PEAK_BW / prof.bw_pressure_x
        dur_ns = int(max(flops / (PEAK_FLOPS * MFU), nbytes / bw_eff) * 1e9
                     * prof.kernel_slowdown_x * j_dur)
        want_gap_ns = int((4.0 + prof.launch_overhead_us) * 1000 * j_launch)
        inter_gap_ns = int((6.0 + prof.cpu_starve_us + prof.batch_delay_us * 0.5) * 1000 * j_inter)
        cpu_dur_ns = int((3.0 + prof.batch_delay_us * 0.25) * 1000)
        blocked_ns = int((60.0 if prof.force_sync_serialize else 1.0) * 1000 * j())
        spread = rng.random() < prof.overlap_frac  # P(spread launch to least-busy stream)
        host_ready = prev_cpu_end + inter_gap_ns
        if prof.force_sync_serialize:
            cpu_start = max(host_ready, t_ns + blocked_ns)  # host stalled on device-wide sync
        else:
            cpu_start = host_ready  # host runs ahead; kernels overlap on streams (no t_ns clamp)
        cpu_end = cpu_start + cpu_dur_ns
        earliest = cpu_end + want_gap_ns
        nstreams = prof.contention_streams
        if nstreams == 1:
            stream_id = 1
        elif spread:
            stream_id = min(range(1, nstreams + 1), key=lambda s: (stream_end.get(s, BASE_CLOCK_NS), s))
        else:
            stream_id = (i % nstreams) + 1
        if prof.force_sync_serialize:
            gpu_start = max(earliest, t_ns)
        else:
            gpu_start = max(earliest, stream_end.get(stream_id, BASE_CLOCK_NS))
        launch_gap_ns = want_gap_ns  # submission cost only; queue wait is separate below
        gpu_end = gpu_start + dur_ns
        overlap = gpu_start < t_ns  # emergent: another stream is still live
        queue_wait_ns = gpu_start - earliest  # own-stream backlog; submission cost stays in launch_gap_ns
        stream_end[stream_id] = gpu_end
        active_kernels = 2 if (nstreams > 1 and overlap) else 1
        qdepth = nstreams + int(prof.batch_delay_us // 50)
        sm = _clamp(78 - prof.cpu_starve_us * 0.2 - prof.stall_extra_pct * 0.2
                    - (20 if prof.force_sync_serialize else 0) + (j() - 1) * 4, 2, 99)
        bw = _clamp(35 + (prof.bw_pressure_x - 1) * 20 + (j() - 1) * 6, 1, 99)
        tx_bytes = int(4_000_000 * prof.transfer_bytes_x * j())
        tx_dur = int(tx_bytes / 25e9 * 1e9)
        b["cpu_launch"].append({"correlation_id": cid, "pid": 1000, "tid": 1,
                                "api": "cudaLaunchKernel", "kernel_name": kname,
                                "grid": list(grid), "block": list(block), "shmem_B": shmem,
                                "stream_id": stream_id, "start_ns": cpu_start, "end_ns": cpu_end})
        b["gpu_kernel"].append({"correlation_id": cid, "stream_id": stream_id, "device_id": 0,
                                "kernel_name": kname, "start_ns": gpu_start, "end_ns": gpu_end,
                                "dur_ns": dur_ns, "launch_gap_ns": launch_gap_ns,
                                "queue_wait_ns": queue_wait_ns,
                                "occupancy_pct": round(_clamp(72 - prof.stall_extra_pct * 0.3, 5, 100), 2),
                                "tensor_active_pct": round(_clamp(60 - prof.stall_extra_pct * 0.8, 1, 100), 2),
                                "dram_read_B": int(nbytes * 0.6), "dram_write_B": int(nbytes * 0.4),
                                "l2_hit_pct": round(_clamp(75 - prof.bw_pressure_x * 2, 1, 100), 2)})
        b["transfer"].append({"correlation_id": cid, "kind": "HtoD", "bytes": tx_bytes,
                              "bw_GBs": 25.0, "start_ns": gpu_start, "end_ns": gpu_start + tx_dur,
                              "dur_ns": tx_dur, "stream_id": nstreams if nstreams > 1 else stream_id,
                              "overlaps_kernel": bool(overlap)})
        b["sync_edge"].append({"correlation_id": cid, "stream_id": stream_id, "type": "cudaStreamSynchronize",
                               "blocked_ns": blocked_ns, "serialized": bool(prof.force_sync_serialize),
                               "start_ns": gpu_end, "end_ns": gpu_end + blocked_ns})
        b["l1"].append({"ts_ns": gpu_end, "sm_util_pct": round(sm, 2), "mem_bw_util_pct": round(bw, 2),
                        "dram_used_MB": 8000 + i * 10, "queue_depth": qdepth,
                        "active_kernels": active_kernels, "active_streams": nstreams,
                        "last_kernel_dur_us": round(dur_ns / 1000, 2),
                        "last_gap_us": round(launch_gap_ns / 1000, 2),
                        "clock_sm_MHz": 1410, "power_W_stub": round(250 * sm / 100, 2),
                        "fault_active": name != "healthy"})
        stall_n = int(5 + prof.stall_extra_pct)
        # ponytail: one L3 triple per kernel, not sampled traces; sample
        # (stride/rate) when L3 volume or realism needs it.
        b["l3_pc"].append({"correlation_id": cid, "pc_offset": 0x100 + i * 0x40, "sass": "HMMA.1688",
                           "func": kname, "n_samples": 64,
                           "stall_hist": {"long_scoreboard": stall_n, "short_scoreboard": 8, "barrier": 3},
                           "synthetic": True})
        b["l3_instr"].append({"correlation_id": cid, "opcode_mix": {"HMMA": 50, "LDG": 30, "STG": 20},
                              "tensor_vs_simd_ratio": round(1.8 - prof.stall_extra_pct * 0.02, 3),
                              "bytes_per_op": 4, "synthetic": True})
        b["l3_lineage"].append({"correlation_id": cid, "aten_op": "aten::linear",
                                "module_stack": ["model.layers.%d" % (i % 4)], "shapes": [[1024, 1024]],
                                "dtype": "float16", "origin_tag": "synthetic-stub", "synthetic": True})
        t_ns, prev_cpu_end = max(t_ns, gpu_end), cpu_end
    return b


def kineto_events(bundle: dict) -> list[dict]:
    """Chrome-trace events (µs trace clock; bundle stays ns); flow s/f pairs join CPU launch to GPU kernel."""
    evs: list[dict] = []
    for cpu, gpu, tx, sy in zip(bundle["cpu_launch"], bundle["gpu_kernel"],
                                bundle["transfer"], bundle["sync_edge"]):
        cid = cpu["correlation_id"]
        evs.append({"name": gpu["kernel_name"] + "[launch]", "cat": "cuda_api", "ph": "X",
                    "ts": cpu["start_ns"] // 1000, "dur": (cpu["end_ns"] - cpu["start_ns"]) // 1000,
                    "pid": 1000, "tid": 1,
                    "args": {"correlation_id": cid, "stream_id": cpu["stream_id"],
                             "api": cpu["api"], "synthetic": True}})
        evs.append({"name": "launch->kernel", "cat": "flow", "ph": "s", "ts": cpu["start_ns"] // 1000,
                    "pid": 1000, "tid": 1, "id": cid, "args": {"correlation_id": cid}})
        evs.append({"name": gpu["kernel_name"], "cat": "kernel", "ph": "X",
                    "ts": gpu["start_ns"] // 1000, "dur": gpu["dur_ns"] // 1000, "pid": 2000, "tid": gpu["stream_id"],
                    "args": {"correlation_id": cid, "stream_id": gpu["stream_id"],
                             "device_id": gpu["device_id"], "synthetic": True}})
        evs.append({"name": "launch->kernel", "cat": "flow", "ph": "f", "ts": gpu["start_ns"] // 1000,
                    "pid": 2000, "tid": gpu["stream_id"], "id": cid, "args": {"correlation_id": cid}})
        evs.append({"name": "memcpy", "cat": "memcpy", "ph": "X", "ts": tx["start_ns"] // 1000,
                    "dur": tx["dur_ns"] // 1000, "pid": 2000, "tid": tx["stream_id"],
                    "args": {"correlation_id": cid, "bytes": tx["bytes"], "synthetic": True}})
        evs.append({"name": "sync", "cat": "sync", "ph": "X",
                    "ts": sy["start_ns"] // 1000, "dur": (sy["end_ns"] - sy["start_ns"]) // 1000,
                    "pid": 1000, "tid": 1,
                    "args": {"correlation_id": cid, "serialized": sy["serialized"], "synthetic": True}})
    return evs


def write_kineto_json(bundle: dict, path: str | Path) -> Path:
    p = Path(path)
    doc = {"traceEvents": kineto_events(bundle), "seed": bundle["seed"],
           "profile": bundle["profile"], "timing_model_version": bundle["timing_model_version"],
           "displayTimeUnit": "us"}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return p


# ponytail: 3 mirrored tables only (KERNEL/MEMCPY/CUDA_API + synthetic flag
# column); add tables/columns when a consumer reads more of nsys export.
_KERNEL_DDL = """CREATE TABLE CUPTI_ACTIVITY_KIND_KERNEL
(correlation_id TEXT, stream_id INTEGER, device_id INTEGER, kernel_name TEXT,
start_ns INTEGER, end_ns INTEGER, duration_ns INTEGER, occupancy_pct REAL, synthetic INTEGER)"""
_MEMCPY_DDL = """CREATE TABLE CUPTI_ACTIVITY_KIND_MEMCPY
(correlation_id TEXT, stream_id INTEGER, kind TEXT, bytes INTEGER,
start_ns INTEGER, end_ns INTEGER, duration_ns INTEGER, synthetic INTEGER)"""
_API_DDL = """CREATE TABLE CUPTI_ACTIVITY_KIND_CUDA_API
(correlation_id TEXT, api_name TEXT, pid INTEGER, tid INTEGER,
start_ns INTEGER, end_ns INTEGER, synthetic INTEGER)"""


def write_nsys_sqlite(bundle: dict, path: str | Path) -> Path:
    p = Path(path)
    if p.exists():
        p.unlink()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(p))
    try:
        con.execute(_KERNEL_DDL)
        con.execute(_MEMCPY_DDL)
        con.execute(_API_DDL)
        con.executemany("INSERT INTO CUPTI_ACTIVITY_KIND_KERNEL VALUES (?,?,?,?,?,?,?,?,?)",
                        [(g["correlation_id"], g["stream_id"], g["device_id"], g["kernel_name"],
                          g["start_ns"], g["end_ns"], g["dur_ns"], g["occupancy_pct"], 1)
                         for g in bundle["gpu_kernel"]])
        con.executemany("INSERT INTO CUPTI_ACTIVITY_KIND_MEMCPY VALUES (?,?,?,?,?,?,?,?)",
                        [(t["correlation_id"], t["stream_id"], t["kind"], t["bytes"],
                          t["start_ns"], t["end_ns"], t["dur_ns"], 1) for t in bundle["transfer"]])
        con.executemany("INSERT INTO CUPTI_ACTIVITY_KIND_CUDA_API VALUES (?,?,?,?,?,?,?)",
                        [(c["correlation_id"], c["api"], c["pid"], c["tid"],
                          c["start_ns"], c["end_ns"], 1) for c in bundle["cpu_launch"]])
        con.commit()
    finally:
        con.close()
    return p


def to_ledger(bundle: dict, ledger) -> list:
    """Emit one Trace per kernel + schema-valid Evidence rows; returns traces."""
    from .ledger import Evidence, Trace  # local import: ledger never imports fakegpu
    traces = []
    for i, gpu in enumerate(bundle["gpu_kernel"]):
        tr = ledger.append_trace(Trace(
            correlation_id=gpu["correlation_id"], provenance=f"{PROVENANCE}:seed={bundle['seed']}",
            stage="gpu_inference", duration_ns=gpu["dur_ns"], kernel_name=gpu["kernel_name"],
            stream_id=gpu["stream_id"], device_id=gpu["device_id"],
            start_ns=gpu["start_ns"], end_ns=gpu["end_ns"], synthetic=True))
        traces.append(tr)
        rows = [("cuda_api", bundle["cpu_launch"][i]), ("cupti_kernel", gpu),
                ("cupti_memcpy", bundle["transfer"][i]), ("sync_edge", bundle["sync_edge"][i]),
                ("l1_state", bundle["l1"][i]), ("l3_pc", bundle["l3_pc"][i]),
                ("l3_instr", bundle["l3_instr"][i]), ("l3_lineage", bundle["l3_lineage"][i])]
        for kind, payload in rows:
            ledger.append_evidence(Evidence(
                correlation_id=gpu["correlation_id"], provenance=f"{PROVENANCE}:seed={bundle['seed']}",
                kind=kind, payload=dict(payload), trace_id=tr.trace_id, synthetic=True))
    return traces
