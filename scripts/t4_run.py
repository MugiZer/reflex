"""Run the full test suite and resumable real-T4 collection matrix."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


def parse_seeds(raw: str) -> tuple[int, ...]:
    seeds = tuple(int(item.strip()) for item in raw.split(",") if item.strip())
    if not seeds:
        raise ValueError("at least one seed is required")
    return seeds


def run_tests() -> dict:
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "tests", "-q"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )
    output = (completed.stdout + "\n" + completed.stderr)[-20000:]
    return {"exit_code": completed.returncode, "output": output}


def run_collection(output_root: Path, seeds: tuple[int, ...], iters: int) -> dict:
    import torch
    from torch.profiler import ProfilerActivity, profile

    from colab.gpu_workload import run_fault
    from reflex import collect as collector
    from reflex.collect import nvidia_smi_identity

    identity = nvidia_smi_identity()
    if identity["hardware"] == "unknown":
        raise RuntimeError("nvidia-smi did not provide GPU identity")

    faults = ("healthy",) + tuple(collector.FAULTS)
    root = output_root / git_commit()[:12]
    dataset = root / "dataset.jsonl"
    target = [
        (fault, identity["hardware"], collector.COLLECTOR_VERSION)
        for fault in faults
    ]

    def device(fault: str, seed: int) -> dict[str, bytes]:
        with tempfile.NamedTemporaryFile(
            suffix=".json", dir=root, delete=False
        ) as handle:
            trace_path = Path(handle.name)
        try:
            with profile(
                activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
                record_shapes=True,
            ) as profiler:
                stats = run_fault(fault, iters, seed, "cuda")
            profiler.export_chrome_trace(str(trace_path))
            return {
                "trace.json": trace_path.read_bytes(),
                "stats.json": json.dumps(stats, sort_keys=True).encode(),
            }
        finally:
            trace_path.unlink(missing_ok=True)

    pipeline = collector.run_pipeline(
        root,
        dataset,
        target,
        faults=faults,
        seeds=seeds,
        device=device,
        identity_provider=nvidia_smi_identity,
        workload="t4-kineto",
        trace_variant="kineto",
        perf_status="profiled",
        torch_version=torch.__version__,
    )
    return {
        "identity": identity,
        "faults": faults,
        "seeds": seeds,
        "iters_per_run": iters,
        "pipeline": pipeline,
    }


def git_commit() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
    ).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", default=os.environ.get("REFLEX_OUTPUT_ROOT", "/tmp/reflex_runs"))
    parser.add_argument("--seeds", default=os.environ.get("REFLEX_SEEDS", "11,17,23"))
    parser.add_argument("--iters", type=int, default=int(os.environ.get("REFLEX_ITERS", "20")))
    args = parser.parse_args(argv)

    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    commit = git_commit()
    result = {
        "run_id": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + uuid.uuid4().hex[:8],
        "commit": commit,
        "requested_ref": os.environ.get("REFLEX_REF", "unknown"),
        "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }

    try:
        result["pytest"] = run_tests()
        result["collection"] = run_collection(
            output_root, parse_seeds(args.seeds), args.iters
        )
        pipeline = result["collection"]["pipeline"]
        result["status"] = (
            "passed"
            if result["pytest"]["exit_code"] == 0
            and not pipeline["collected"]["failed"]
            and not pipeline["gaps"]
            else "incomplete"
        )
    except Exception as exc:
        result["status"] = "error"
        result["error"] = f"{type(exc).__name__}: {exc}"
    result["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()

    result_path = output_root / "run_result.json"
    result_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps(result, indent=2, default=str))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
