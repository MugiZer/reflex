"""Headless SmolVLA replay on the self-hosted T4 runner.

Mirrors colab/SmolVLA_T4_replay.ipynb Cells 3-6. Runs in its own env (never
install requirements-t4.txt here: its numpy==2.3.4 conflicts with LeRobot's
numpy<2.3 — see #118). Only the corpus contract tests run here (stdlib).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import uuid
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from t4_run import git_commit, parse_seeds  # noqa: E402  (stable tiny helpers)

CHECKPOINT, CHECKPOINT_REV = ("lerobot/smolvla_base",
                              "c83c3163b8ca9b7e67c509fffd9121e66cb96205")
DATASET, DATASET_REV = ("lerobot/svla_so100_pickplace",
                        "728583b5eaf9e739a7f119e2def466fa1d552402")
TIERS = (("smoke", "smolvla-smoke-v1", "smoke-250.jsonl"),
         ("main", "smolvla-replay-v1", "main-1000.jsonl"))


def corpus_tests() -> dict:
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/test_smolvla_corpus.py", "-q"],
        cwd=REPO_ROOT, text=True, capture_output=True)
    output = (completed.stdout + "\n" + completed.stderr)[-8000:]
    return {"exit_code": completed.returncode, "output": output}


def genesis_or_validate() -> tuple[Path, str]:
    from lerobot.datasets.lerobot_dataset import LeRobotDataset

    from workloads.smolvla import build_corpus as B
    from workloads.smolvla import validate_corpus as V

    ds = LeRobotDataset(DATASET, revision=DATASET_REV)
    counts = Counter(int(e) for e in ds.hf_dataset["episode_index"])
    lengths = [counts[e] for e in sorted(counts)]
    instruction = str(ds.meta.tasks.index[0])  # task strings are the index
    corpus = REPO_ROOT / "workloads" / "smolvla" / "corpora"
    if not (corpus / "main-1000.jsonl").exists():
        pins = {"resize_pad": [512, 512],
                "normalization": "MEAN_STD-shipped",
                "tokenizer": "SmolVLM2-500M-Video-Instruct",
                "max_length": 48, "task_key": "task",
                "image_source_keys": ["observation.images.top",
                                      "observation.images.wrist"]}
        print(B.write_files(B.build(lengths, instruction, pins), corpus),
              flush=True)
        print("GENESIS manifests written — commit as a reviewed diff", flush=True)
    errs = V.validate(corpus)
    if errs:
        raise RuntimeError(f"corpus invalid: {errs}")
    sha = hashlib.sha256((corpus / "main-1000.jsonl").read_bytes()
                         ).hexdigest()
    return corpus, sha


def run_tier(output_root: Path, corpus: Path, corpus_sha: str, tier: str,
             workload: str, frames_file: str, seeds: tuple[int, ...],
             commit: str) -> dict:
    import torch
    import lerobot

    from reflex import collect as collector
    from reflex.collect import nvidia_smi_identity
    from workloads.smolvla.replay import make_device

    identity = nvidia_smi_identity()
    if identity["hardware"] == "unknown":
        raise RuntimeError("nvidia-smi did not provide GPU identity")
    device = make_device(corpus, CHECKPOINT, CHECKPOINT_REV, DATASET,
                         DATASET_REV, frames_file=frames_file)
    root = output_root / commit[:12] / tier
    dataset_out = output_root / commit[:12] / "smolvla-dataset.jsonl"
    target = [("healthy", identity["hardware"], collector.COLLECTOR_VERSION)]
    software = {"torch": torch.__version__, "lerobot": lerobot.__version__,
                "checkpoint": CHECKPOINT, "checkpoint_rev": CHECKPOINT_REV,
                "dataset": DATASET, "dataset_rev": DATASET_REV,
                "corpus_sha256": corpus_sha, "rng": 0,
                "warmup": "holdout-5x2", "dtype": "float32",
                "video_backend": "pyav",
                "repeat_is_seed": "manifest seed is repeat identity; "
                                  "model RNG fixed at 0"}
    pipeline = collector.run_pipeline(
        root, dataset_out, target, faults=("healthy",), seeds=seeds,
        device=device, identity_provider=nvidia_smi_identity,
        workload=workload, trace_variant="kineto", perf_status="profiled",
        torch_version=torch.__version__, software=software, commit=commit)
    return {"identity": identity, "workload": workload,
            "frames_file": frames_file, "pipeline": pipeline}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", default=os.environ.get(
        "REFLEX_OUTPUT_ROOT", "/tmp/reflex_runs"))
    parser.add_argument("--seeds", default=os.environ.get(
        "REFLEX_SEEDS", "11,17,23"))
    parser.add_argument("--tiers", default=os.environ.get(
        "REFLEX_TIERS", "smoke,main"))
    args = parser.parse_args(argv)

    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    commit = git_commit()
    result = {
        "run_id": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-" + uuid.uuid4().hex[:8],
        "kind": "smolvla-replay",
        "commit": commit,
        "requested_ref": os.environ.get("REFLEX_REF", "unknown"),
        "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    try:
        result["corpus_tests"] = corpus_tests()
        if result["corpus_tests"]["exit_code"] != 0:
            raise RuntimeError("corpus contract tests failed")
        corpus, sha = genesis_or_validate()
        result["corpus_sha256"] = sha
        wanted = [t.strip() for t in args.tiers.split(",") if t.strip()]
        result["tiers"] = {}
        for tier, workload, frames_file in TIERS:
            if tier not in wanted:
                continue
            result["tiers"][tier] = run_tier(
                output_root, corpus, sha, tier, workload, frames_file,
                parse_seeds(args.seeds), commit)
        pipes = [r["pipeline"] for r in result["tiers"].values()]
        result["status"] = ("passed" if pipes and all(
            not p["collected"]["failed"] and not p["gaps"] for p in pipes)
            else "incomplete")
    except Exception as exc:
        result["status"] = "error"
        result["error"] = f"{type(exc).__name__}: {exc}"
    result["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    (output_root / "run_result.json").write_text(
        json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items()
                      if k != "corpus_tests"}, indent=2, default=str))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
