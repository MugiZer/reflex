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
             commit: str, dtype: str = "float32",
             fault: str = "healthy", compile: bool = False,
             compile_mode: str = "default",
              cudnn_bench: bool = False, contention: int = 0,
              tf32: bool = True, shards: int = 1, exp: str = "",
              streams: int = 1, threads: int = 0,
              frame_fault: str = "none",
              instruction_fault: str = "none") -> dict:
    import torch
    import lerobot

    from reflex import collect as collector
    from reflex.collect import nvidia_smi_identity
    from workloads.smolvla.replay import make_device

    identity = nvidia_smi_identity()
    if identity["hardware"] == "unknown":
        raise RuntimeError("nvidia-smi did not provide GPU identity")
    device = make_device(corpus, CHECKPOINT, CHECKPOINT_REV, DATASET,
                         DATASET_REV, frames_file=frames_file, dtype=dtype,
                         compile=compile, compile_mode=compile_mode,
                         cudnn_bench=cudnn_bench, tf32=tf32,
                         contention_workers=contention, shards=shards,
                         streams=streams, threads=threads,
                         frame_fault=frame_fault,
                         instruction_fault=instruction_fault)
    root = output_root / commit[:12] / (exp or tier)
    dataset_out = output_root / commit[:12] / "smolvla-dataset.jsonl"
    target = [(fault, identity["hardware"], collector.COLLECTOR_VERSION)]
    software = {"torch": torch.__version__, "lerobot": lerobot.__version__,
                "checkpoint": CHECKPOINT, "checkpoint_rev": CHECKPOINT_REV,
                "dataset": DATASET, "dataset_rev": DATASET_REV,
                "corpus_sha256": corpus_sha, "rng": 0,
                "warmup": "holdout-5x2", "dtype": dtype,
                "video_backend": "pyav", "compile": compile,
                "cudnn_bench": cudnn_bench, "contention_workers": contention,
                "shards": shards, "streams": streams, "threads": threads,
                "frame_fault": frame_fault,
                "instruction_fault": instruction_fault,
                "exp": exp or tier,
                "repeat_is_seed": "manifest seed is repeat identity; "
                                  "model RNG fixed at 0"}
    pipeline = collector.run_pipeline(
        root, dataset_out, target, faults=(fault,), seeds=seeds,
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
        "REFLEX_TIERS", "smoke"))
    # all-on defaults: every run stacks all 10 knobs (regression harvesting).
    # Survival guardrails only: smoke-only (streams>1 OOMs main) + shards=4.
    # Pass explicit flags for one-factor isolation.
    parser.add_argument("--dtype", default=os.environ.get(
        "REFLEX_DTYPE", "float16"))
    parser.add_argument("--fault", default=os.environ.get(
        "REFLEX_FAULT", "candidate"))
    parser.add_argument("--compile", action="store_true",
                        default=os.environ.get("REFLEX_COMPILE",
                                               "1") not in ("", "0"))
    parser.add_argument("--cudnn-bench", action="store_true",
                        default=os.environ.get("REFLEX_CUDNN_BENCH",
                                               "1") not in ("", "0"))
    parser.add_argument("--contention", type=int, default=int(
        os.environ.get("REFLEX_CONTENTION", "2")))
    parser.add_argument("--compile-mode", default=os.environ.get(
        "REFLEX_COMPILE_MODE", "max-autotune"))
    _tf32_env = os.environ.get("REFLEX_TF32", "0") not in ("", "0")
    parser.add_argument("--tf32", action="store_true", default=None)
    parser.add_argument("--no-tf32", action="store_false", dest="tf32",
                        default=None)
    parser.add_argument("--shards", type=int, default=int(
        os.environ.get("REFLEX_SHARDS", "4")))
    parser.add_argument("--streams", type=int, default=int(
        os.environ.get("REFLEX_STREAMS", "2")))
    parser.add_argument("--threads", type=int, default=int(
        os.environ.get("REFLEX_THREADS", "1")))
    parser.add_argument("--frame-fault", default=os.environ.get(
        "REFLEX_FRAME_FAULT", "corrupt"))
    parser.add_argument("--instruction-fault", default=os.environ.get(
        "REFLEX_INSTRUCTION_FAULT", "hostile"))
    parser.add_argument("--exp", default=os.environ.get("REFLEX_EXP", ""),
                        help="experiment dir suffix; isolates candidates "
                             "sharing a fault name so resume never no-ops; "
                             "use exp=all10 for the stacked combo")
    args = parser.parse_args(argv)
    if args.tf32 is None:
        args.tf32 = _tf32_env

    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    log_path = output_root / "run.log"

    def log(msg: str) -> None:
        line = f"{dt.datetime.now(dt.timezone.utc).isoformat()} {msg}"
        print(line, flush=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

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
        log(f"start commit={commit} tiers={args.tiers} seeds={args.seeds} "
            f"dtype={args.dtype} fault={args.fault} compile={args.compile} "
            f"compile_mode={args.compile_mode} "
            f"cudnn_bench={args.cudnn_bench} tf32={args.tf32} "
            f"contention={args.contention} shards={args.shards} "
            f"streams={args.streams} threads={args.threads} "
            f"frame_fault={args.frame_fault} "
            f"instruction_fault={args.instruction_fault} "
            f"exp={args.exp!r}")
        if args.streams == 2 and "smoke" not in args.tiers:
            log("streams=2 forces smoke-only (OOM guard)")
            args.tiers = "smoke"
        result["corpus_tests"] = corpus_tests()
        log(f"corpus_tests exit={result['corpus_tests']['exit_code']}")
        if result["corpus_tests"]["exit_code"] != 0:
            raise RuntimeError("corpus contract tests failed")
        corpus, sha = genesis_or_validate()
        result["corpus_sha256"] = sha
        log(f"corpus {sha[:12]} valid")
        wanted = [t.strip() for t in args.tiers.split(",") if t.strip()]
        result["tiers"] = {}
        tier_dir = output_root / commit[:12]
        for tier, workload, frames_file in TIERS:
            if tier not in wanted:
                continue
            result["tiers"][tier] = run_tier(
                output_root, corpus, sha, tier, workload, frames_file,
                parse_seeds(args.seeds), commit, dtype=args.dtype,
                fault=args.fault, compile=args.compile,
                compile_mode=args.compile_mode,
                cudnn_bench=args.cudnn_bench, contention=args.contention,
                tf32=args.tf32, shards=args.shards, exp=args.exp,
                streams=args.streams, threads=args.threads,
                frame_fault=args.frame_fault,
                instruction_fault=args.instruction_fault)
            pipe = result["tiers"][tier]["pipeline"]
            log(f"tier {tier} done failed={pipe['collected']['failed']} "
                f"gaps={pipe['gaps']} records={pipe['records']}")
            # ponytail: checkpoint per tier, not just at the end — VMs die
            # mid-run and DONE dirs under /tmp die with them. Small JSON
            # survives via download/backup long before the full run ends.
            (tier_dir / f"tier-result-{tier}.json").write_text(
                json.dumps({"tier": tier, "workload": workload,
                            "corpus_sha256": sha, "commit": commit,
                            "result": result["tiers"][tier]},
                           indent=2, default=str), encoding="utf-8")
            print(f"tier {tier} checkpointed", flush=True)
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
    log(f"finish status={result['status']} "
        f"error={result.get('error', '')}")
    print(json.dumps({k: v for k, v in result.items()
                      if k != "corpus_tests"}, indent=2, default=str))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
