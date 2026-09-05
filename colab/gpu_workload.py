"""Colab GPU workload for Reflex trace collection (torch, no model downloads).

One script, selectable fault modes mirroring the FakeGPU families. Each mode
runs N iters of matmul work on CUDA with a fault knob; pair every fault run
with a healthy run at the same seed for the corpus. Profile with:
  nsys profile -t cuda,nvtx -o <out> python gpu_workload.py --fault <name>
  and/or torch.profiler (see --torch-profile flag).

Fault -> knob mapping (all deterministic under --seed):
  healthy                  steady 512x512 matmuls, async launches
  cpu_starvation            host-side sleep jitter between launches (host gaps)
  launch_overhead           many tiny 32x32 kernels (launch-dominated)
  transfer_heavy            large H2D/D2H copies per iter
  sync_serialization        torch.cuda.synchronize() every iter
  batching_delay            variable batch sizes incl. oversize stalls
  queue_contention          second stream with competing matmuls, no sync
  competing_workload        second stream + periodic synchronize (contended)
  kernel_regression         2048x2048 matmuls (compute-heavy kernels)
        preprocessing_interference dataloader-style host prepare per iter
  stalls                    default path (memory-bound narrow matmuls)

CPU fallback: runs the same structure on CPU (no CUDA trace, validates logic).
"""
from __future__ import annotations

import argparse
import random
import time

import torch
import torch.nn.functional as F


def _sync(device: str) -> None:
    if device == "cuda":
        torch.cuda.synchronize()


def run_fault(fault: str, n_iters: int, seed: int, device: str) -> dict:
    """Run one fault mode; returns summary stats (iters, elapsed_s)."""
    rng = random.Random(seed)
    dev = torch.device(device)
    stats = {"fault": fault, "seed": seed, "device": device, "iters": n_iters}
    t0 = time.monotonic()
    stream = torch.cuda.Stream(device=dev) if device == "cuda" else None
    for i in range(n_iters):
        if fault == "cpu_starvation":
            time.sleep(rng.uniform(0.0, 0.005))  # host gaps starve the device
            a = torch.randn(512, 512, device=dev)
            a @ a
        elif fault == "launch_overhead":
            a = torch.randn(32, 32, device=dev)
            for _ in range(8):
                a = a @ a  # many tiny launches
        elif fault == "transfer_heavy":
            h = torch.randn(1024, 1024)
            d = h.to(dev, non_blocking=True)
            out = d @ d
            out.to("cpu", non_blocking=True)
        elif fault == "sync_serialization":
            a = torch.randn(512, 512, device=dev)
            b = a @ a
            _sync(device)  # serialize host on device every iter
        elif fault == "batching_delay":
            n = int(rng.choice((64, 256, 2048)))
            a = torch.randn(n, 512, device=dev)
            w = torch.randn(512, 512, device=dev)
            a @ w
            if n > 1000:
                time.sleep(0.01)
        elif fault in ("queue_contention", "competing_workload"):
            a = torch.randn(512, 512, device=dev)
            b = a @ a
            if stream is not None:
                with torch.cuda.stream(stream):
                    c = torch.randn(512, 512, device=dev)
                    d = c @ c
                if fault == "competing_workload" and i % 4 == 0:
                    _sync(device)
        elif fault == "kernel_regression":
            a = torch.randn(2048, 2048, device=dev)
            a @ a
        elif fault == "preprocessing_interference":
            h = torch.randn(512, 512)  # host-side prepare per iter
            h = F.layer_norm(h, (512,))
            d = h.to(dev)
            d @ d
        else:  # healthy + stalls (narrow memory-bound matmuls)
            a = torch.randn(512, 64, device=dev)
            w = torch.randn(64, 512, device=dev)
            a @ w
    _sync(device)
    stats["elapsed_s"] = round(time.monotonic() - t0, 3)
    return stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fault", default="healthy",
                    choices=("healthy", "cpu_starvation", "launch_overhead",
                             "transfer_heavy", "sync_serialization",
                             "batching_delay", "queue_contention",
                             "competing_workload", "kernel_regression",
                             "preprocessing_interference", "stalls"))
    ap.add_argument("--iters", type=int, default=20)
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available()
                    else "cpu")
    ap.add_argument("--torch-profile", default=None,
                    help="optional chrome-trace output path")
    args = ap.parse_args(argv)
    if args.torch_profile:
        from torch.profiler import ProfilerActivity, profile
        acts = [ProfilerActivity.CPU] + (
            [ProfilerActivity.CUDA] if args.device == "cuda" else [])
        with profile(activities=acts, record_shapes=True) as prof:
            stats = run_fault(args.fault, args.iters, args.seed, args.device)
        prof.export_chrome_trace(args.torch_profile)
    else:
        stats = run_fault(args.fault, args.iters, args.seed, args.device)
    print(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
