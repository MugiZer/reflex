"""Self-bootstrapping SmolVLA T4 collection for `colab exec -f`.

Mirrors colab/SmolVLA_T4_replay.ipynb Cells 1-2, then runs
scripts/smolvla_run.py with env/arg flags (one-factor battery or all10).
Always prints the local result path + run_id for retrieval.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/MugiZer/reflex.git"


def sh(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=str(cwd) if cwd else None, check=True)


def env_flag(name: str, default: str) -> str:
    return os.environ.get(name, default)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ref", default=env_flag("REFLEX_REF", "workloads/smolvla-replay"))
    p.add_argument("--seeds", default=env_flag("REFLEX_SEEDS", "11"))
    p.add_argument("--tiers", default=env_flag("REFLEX_TIERS", "smoke"))
    p.add_argument("--dtype", default=env_flag("REFLEX_DTYPE", "float32"))
    p.add_argument("--fault", default=env_flag("REFLEX_FAULT", "semantic-blank"))
    p.add_argument("--compile", default=env_flag("REFLEX_COMPILE", "0"))
    p.add_argument("--cudnn-bench", default=env_flag("REFLEX_CUDNN_BENCH", "0"))
    p.add_argument("--contention", default=env_flag("REFLEX_CONTENTION", "0"))
    p.add_argument("--compile-mode", default=env_flag("REFLEX_COMPILE_MODE", "default"))
    p.add_argument("--tf32", default=env_flag("REFLEX_TF32", "1"))
    p.add_argument("--shards", default=env_flag("REFLEX_SHARDS", "1"))
    p.add_argument("--streams", default=env_flag("REFLEX_STREAMS", "1"))
    p.add_argument("--threads", default=env_flag("REFLEX_THREADS", "0"))
    p.add_argument("--frame-fault", default=env_flag("REFLEX_FRAME_FAULT", "blank"))
    p.add_argument("--instruction-fault",
                   default=env_flag("REFLEX_INSTRUCTION_FAULT", "none"))
    p.add_argument("--exp", default=env_flag("REFLEX_EXP", "blank-smoke-seed11"))
    p.add_argument("--workdir", default="/content/reflex-loop")
    args = p.parse_args(argv)

    probe = subprocess.run(
        ["nvidia-smi", "--query-gpu=name", "--format=csv"],
        text=True, capture_output=True, check=True)
    print(probe.stdout.strip(), flush=True)
    if "Tesla T4" not in probe.stdout and "P100" not in probe.stdout:
        raise RuntimeError("expected a T4/P100-or-better Colab GPU")

    work = Path(args.workdir)
    repo = work / "reflex"
    if not (repo / ".git").exists():
        work.mkdir(parents=True, exist_ok=True)
        sh("git", "clone", "--filter=blob:none", REPO_URL, str(repo))
    sh("git", "fetch", "origin", args.ref, cwd=repo)
    sh("git", "checkout", "--force", "FETCH_HEAD", cwd=repo)

    sh("apt", "install", "-y", "-q", "ffmpeg")
    sh(sys.executable, "-m", "pip", "install", "-q", "--index-url",
       "https://download.pytorch.org/whl/cu128",
       "torch==2.9.1", "torchvision==0.24.1")
    sh(sys.executable, "-m", "pip", "install", "-q",
       "lerobot==0.6.0[smolvla,dataset,evaluation]", "pytest")

    cmd = [sys.executable, "scripts/smolvla_run.py",
           "--seeds", args.seeds, "--tiers", args.tiers,
           "--dtype", args.dtype, "--fault", args.fault,
           "--contention", args.contention,
           "--compile-mode", args.compile_mode,
           "--shards", args.shards, "--streams", args.streams,
           "--threads", args.threads, "--frame-fault", args.frame_fault,
           "--instruction-fault", args.instruction_fault,
           "--exp", args.exp]
    if args.compile not in ("", "0"):
        cmd.append("--compile")
    if args.cudnn_bench not in ("", "0"):
        cmd.append("--cudnn-bench")
    if args.tf32 in ("", "0"):
        cmd.append("--no-tf32")
    env = dict(os.environ, REFLEX_REF=args.ref,
               REFLEX_OUTPUT_ROOT=str(work / "runs"))
    completed = subprocess.run(cmd, cwd=repo, env=env, text=True,
                               capture_output=True)
    print(completed.stdout[-8000:])
    print(completed.stderr[-4000:], file=sys.stderr)

    result_path = work / "runs" / "run_result.json"
    result = json.loads(result_path.read_text(encoding="utf-8"))
    print(f"RUN_ID={result['run_id']} STATUS={result['status']}", flush=True)
    print(f"RESULT_PATH={result_path}", flush=True)
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
