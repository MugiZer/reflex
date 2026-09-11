"""SmolVLA offline-replay device callable for reflex.collect (Colab runtime).

torch/lerobot import lazily so the module is importable without GPU deps.
Usage (notebook Cell 5): device = make_device(corpus_dir=..., ...);
run_pipeline(..., device=device, ...).
"""
from __future__ import annotations

import hashlib
import json
import statistics
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

PROFILE = {"activities": ["CPU", "CUDA"], "record_shapes": True,
           "profile_memory": False, "with_stack": False,
           "with_flops": False, "with_modules": False}


def _pct(data: list[float], pct: float) -> float:
    if not data:
        return 0.0
    ordered = sorted(data)
    rank = (len(ordered) - 1) * pct / 100.0
    lo, hi = int(rank), min(int(rank) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (rank - lo)


def _summarize(name: str, xs: list[float]) -> dict:
    return {"name": name, "n": len(xs),
            "total_s": round(sum(xs) / 1000.0, 6) if xs else 0.0,
            "mean_ms": round(statistics.fmean(xs), 6) if xs else 0.0,
            "median_ms": round(statistics.median(xs), 6) if xs else 0.0,
            "p95_ms": round(_pct(xs, 95), 6),
            "p99_ms": round(_pct(xs, 99), 6)}


def make_device(corpus_dir: str | Path, checkpoint: str, checkpoint_rev: str,
                dataset: str, dataset_rev: str, dtype: str = "float32",
                rng: int = 0, frames_file: str = "main-1000.jsonl"):
    """Bind pins; return device(fault, seed) -> {artifact_name: bytes}."""
    corpus_dir = Path(corpus_dir)

    def device(fault: str, seed: int) -> dict[str, bytes]:
        import random
        import numpy as np
        import torch
        from torch.profiler import ProfilerActivity, profile
        t0 = time.time()
        acts = {"CPU": ProfilerActivity.CPU, "CUDA": ProfilerActivity.CUDA}
        random.seed(rng)
        np.random.seed(rng % (2 ** 32))
        torch.manual_seed(rng)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        try:
            torch.use_deterministic_algorithms(True, warn_only=True)
        except Exception:
            pass
        header = json.loads((corpus_dir / "main-1000.jsonl")
                            .read_text(encoding="utf-8").splitlines()[0])
        corpus_sha = hashlib.sha256(
            (corpus_dir / "main-1000.jsonl").read_bytes()).hexdigest()
        corpus_kind = "smoke" if frames_file.startswith("smoke") else "main"
        from lerobot.policies.factory import make_pre_post_processors
        from lerobot.policies.smolvla.modeling_smolvla import SmolVLAPolicy
        from lerobot.datasets.lerobot_dataset import LeRobotDataset
        # ponytail: pyav, not torchcodec — torchcodec's prebuilt ABI needs a
        # system libavutil the T4 image lacks; revisit if pins change.
        policy = SmolVLAPolicy.from_pretrained(checkpoint,
                                              revision=checkpoint_rev)
        policy.to("cuda", dtype=getattr(torch, dtype))
        policy.eval()
        # Official rename channel (lerobot policies/utils.py): dataset cameras
        # top/wrist -> policy slots camera1/camera2 (first-listed first).
        # Partial fill is legal (policy needs at least one); recorded, loud.
        key_path = "rename top->camera1 wrist->camera2"
        RENAME = {"observation.images.top": "observation.images.camera1",
                  "observation.images.wrist": "observation.images.camera2"}
        preprocess, postprocess = make_pre_post_processors(
            policy.config, checkpoint,
            preprocessor_overrides={"device_processor": {"device": "cuda"}})
        ds = LeRobotDataset(dataset, revision=dataset_rev,
                            video_backend="pyav")
        ep_col = [int(e) for e in ds.hf_dataset["episode_index"]]
        starts: dict[int, int] = {}
        for gi, e in enumerate(ep_col):
            starts.setdefault(e, gi)

        def gindex(ep: int, fr: int) -> int:
            g = starts[ep] + fr
            if int(ep_col[g]) != ep:
                raise ValueError(
                    f"frame {fr} out of range for episode {ep}")
            return g
        holdout = [json.loads(line) for line in
                   (corpus_dir / "holdout.jsonl").read_text(
                       encoding="utf-8").splitlines()[1:] if line.strip()]
        if frames_file == "main-1000.jsonl":
            frames = [json.loads(line) for line in
                      (corpus_dir / "main-1000.jsonl").read_text(
                          encoding="utf-8").splitlines()[1:] if line.strip()]
        else:
            smoke_ids = [json.loads(line)["frame_id"] for line in
                         (corpus_dir / frames_file).read_text(
                             encoding="utf-8").splitlines()[1:]
                         if line.strip()]
            by_id = {json.loads(line)["frame_id"]: json.loads(line)
                     for line in
                     (corpus_dir / "main-1000.jsonl").read_text(
                         encoding="utf-8").splitlines()[1:] if line.strip()}
            frames = [by_id[fid] for fid in smoke_ids]
        input_keys: list[str] = []
        warmup_cpu: list[float] = []

        def infer(ep: int, fr: int) -> dict:
            # Real path: official preprocess (rename/batch/task/device/
            # normalize) -> select_action -> postprocess. The frozen
            # instruction gates the raw frame (mismatch = incompatible run).
            # Wall covers preprocess+call (host side); CUDA events cover the
            # policy call only — never mislabel one as the other.
            sample = ds[gindex(ep, fr)]
            if sample.get("task") != header["instruction"]:
                raise ValueError(
                    "dataset task drifted from frozen manifest instruction")
            # Verified on T4 (r3): factory kwargs do not survive
            # pretrained-path processor loading, so the frozen rename happens
            # here, explicitly, before the official preprocess pipeline.
            renamed = {RENAME.get(k, k): v for k, v in sample.items()}
            batch = preprocess(renamed)
            batch = {k: (v.cuda() if torch.is_tensor(v) else v)
                     for k, v in batch.items()}
            if not input_keys:
                input_keys.extend(sorted(batch))
            start = torch.cuda.Event(enable_timing=True)
            end = torch.cuda.Event(enable_timing=True)
            cpu0 = time.perf_counter()
            start.record()
            with torch.inference_mode():
                action = postprocess(policy.select_action(batch))
            end.record()
            cpu_ms = (time.perf_counter() - cpu0) * 1000.0
            return {"action": action.detach().float().cpu(),
                    "cpu_ms": cpu_ms, "events": (start, end)}

        with torch.inference_mode():
            for rep in range(header["warmup"]["passes"]):
                for h in holdout:
                    c0 = time.perf_counter()
                    infer(h["episode_idx"], h["frame_idx"])
                    warmup_cpu.append((time.perf_counter() - c0) * 1000.0)
        torch.cuda.synchronize()
        per_req_gpu: list[float] = []
        per_req_cpu: list[float] = []
        fingerprints: list[dict] = []
        measured_start = datetime.now(timezone.utc).isoformat()
        with profile(activities=[acts["CPU"], acts["CUDA"]],
                     record_shapes=PROFILE["record_shapes"],
                     profile_memory=PROFILE["profile_memory"],
                     with_stack=PROFILE["with_stack"],
                     with_flops=PROFILE["with_flops"],
                     with_modules=PROFILE["with_modules"]) as prof:
            pending = []
            for f in frames:
                out = infer(f["episode_idx"], f["frame_idx"])
                pending.append((f, out))
                per_req_cpu.append(out["cpu_ms"])
            torch.cuda.synchronize()
            measured_end = datetime.now(timezone.utc).isoformat()
            for f, out in pending:
                a = out["action"].numpy()
                s, e = out["events"]
                per_req_gpu.append(s.elapsed_time(e))
                fingerprints.append(
                    {"frame_id": f["frame_id"],
                     "shape": list(a.shape), "dtype": str(a.dtype),
                     "chunk_size": int(a.size),
                     "mean": float(a.mean()), "std": float(a.std()),
                     "sha256": hashlib.sha256(a.tobytes()).hexdigest()})
        wall_s = round(time.time() - t0, 6)
        with tempfile.NamedTemporaryFile(suffix=".json",
                                         delete=False) as handle:
            trace_path = handle.name
        prof.export_chrome_trace(trace_path)
        trace = Path(trace_path).read_bytes()
        Path(trace_path).unlink(missing_ok=True)
        try:
            freeze = subprocess.run(
                ["pip", "freeze"], capture_output=True, text=True,
                timeout=60).stdout.encode()
        except Exception:
            freeze = b"freeze unavailable"
        mid = len(warmup_cpu) // 2
        metrics = {
            "fault": fault, "seed": seed, "key_path": key_path,
            "corpus_sha256": corpus_sha, "corpus": corpus_kind,
            "frames_file": frames_file, "rng": rng, "dtype": dtype,
            "device_event_ms": _summarize("device_event_ms", per_req_gpu),
            "host_cpu_ms": _summarize("host_cpu_ms", per_req_cpu),
            "device_event_ms_raw": [round(x, 6) for x in per_req_gpu],
            "host_cpu_ms_raw": [round(x, 6) for x in per_req_cpu],
            "warmup_cpu_ms": [round(x, 6) for x in warmup_cpu],
            "warmup_pass_median_ms": [
                round(statistics.median(warmup_cpu[:mid]), 6) if mid else 0.0,
                round(statistics.median(warmup_cpu[mid:]), 6)
                if warmup_cpu[mid:] else 0.0],
            "measured_wall_s": wall_s,
            "throughput_req_s": round(len(frames) / wall_s, 3) if wall_s else 0.0,
            "measured_start_utc": measured_start,
            "measured_end_utc": measured_end,
            "input_keys": input_keys,
        }
        stats = {"dropped_records": 0, "correlation_misses": 0,
                 "frames": len(frames), "warmup_inferences": len(warmup_cpu),
                 "key_path": key_path, "input_keys": input_keys,
                 "video_backend": "pyav"}
        return {"trace.json": trace,
                "metrics.json": json.dumps(metrics, sort_keys=True).encode(),
                "fingerprints.json": json.dumps(
                    {"frames": fingerprints}, sort_keys=True).encode(),
                "stats.json": json.dumps(stats, sort_keys=True).encode(),
                "freeze.txt": freeze}

    return device
