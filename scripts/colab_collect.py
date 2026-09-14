"""Self-bootstrapping T4 collection for `colab run --gpu T4`.

Executed as a file body inside the remote kernel (argv mirrors `python
colab_collect.py --ref main --seeds 11,17,23 --iters 20`; the kernel
appends its own `-f connection.json`, so args parse with
parse_known_args). Clones the repo at REFLEX_REF, installs deps, runs
scripts/t4_run.py (--workload t4) or scripts/smolvla_run.py
(--workload smolvla), publishes the summary via repository_dispatch when
REFLEX_GITHUB_TOKEN is set (pass --github-token), and always prints the
local result path + run_id for retrieval.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/MugiZer/reflex.git"


def sh(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=str(cwd) if cwd else None, check=True)


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default=env("REFLEX_REF", "main"))
    parser.add_argument("--workload", default=env("REFLEX_WORKLOAD", "t4"))
    parser.add_argument("--seeds", default=env("REFLEX_SEEDS", "11,17,23"))
    parser.add_argument("--iters", type=int, default=int(env("REFLEX_ITERS", "20")))
    parser.add_argument("--tiers", default=env("REFLEX_TIERS", "smoke"))
    parser.add_argument("--dtype", default=env("REFLEX_DTYPE", "float16"))
    parser.add_argument("--fault", default=env("REFLEX_FAULT", "candidate"))
    parser.add_argument("--compile", default=env("REFLEX_COMPILE", "1"))
    parser.add_argument("--cudnn-bench", default=env("REFLEX_CUDNN_BENCH", "1"))
    parser.add_argument("--contention", default=env("REFLEX_CONTENTION", "2"))
    parser.add_argument("--compile-mode", default=env("REFLEX_COMPILE_MODE", "max-autotune"))
    parser.add_argument("--tf32", default=env("REFLEX_TF32", "0"))
    parser.add_argument("--shards", default=env("REFLEX_SHARDS", "4"))
    parser.add_argument("--streams", default=env("REFLEX_STREAMS", "2"))
    parser.add_argument("--threads", default=env("REFLEX_THREADS", "1"))
    parser.add_argument("--frame-fault", default=env("REFLEX_FRAME_FAULT", "corrupt"))
    parser.add_argument("--instruction-fault",
                        default=env("REFLEX_INSTRUCTION_FAULT", "hostile"))
    parser.add_argument("--exp", default=env("REFLEX_EXP", ""))
    parser.add_argument("--github-token", default=env("REFLEX_GITHUB_TOKEN", ""))
    parser.add_argument("--workdir", default="/content/reflex-loop")
    args, _unknown = parser.parse_known_args(argv)

    work = Path(args.workdir)
    repo = work / "reflex"
    if not (repo / ".git").exists():
        work.mkdir(parents=True, exist_ok=True)
        sh("git", "clone", "--filter=blob:none", REPO_URL, str(repo))
    sh("git", "fetch", "origin", args.ref, cwd=repo)
    sh("git", "checkout", "--force", "FETCH_HEAD", cwd=repo)

    env_out = dict(os.environ, REFLEX_REF=args.ref, REFLEX_SEEDS=args.seeds,
                   REFLEX_OUTPUT_ROOT=str(work / "runs"))
    if args.github_token:
        env_out["REFLEX_GITHUB_TOKEN"] = args.github_token
    if args.workload == "smolvla":
        sh("apt", "install", "-y", "-q", "ffmpeg")
        sh(sys.executable, "-m", "pip", "install", "-q", "--index-url",
           "https://download.pytorch.org/whl/cu128",
           "torch==2.9.1", "torchvision==0.24.1")
        sh(sys.executable, "-m", "pip", "install", "-q",
           "lerobot[smolvla,dataset,evaluation]==0.6.0", "pytest")
        cmd = [sys.executable, "scripts/smolvla_run.py",
               "--seeds", args.seeds, "--tiers", args.tiers,
               "--dtype", args.dtype, "--fault", args.fault,
               "--contention", args.contention,
               "--compile-mode", args.compile_mode,
               "--shards", args.shards, "--streams", args.streams,
               "--threads", args.threads, "--frame-fault", args.frame_fault,
               "--instruction-fault", args.instruction_fault,
               "--exp", args.exp or args.fault]
        if args.compile not in ("", "0"):
            cmd.append("--compile")
        if args.cudnn_bench not in ("", "0"):
            cmd.append("--cudnn-bench")
        if args.tf32 in ("", "0"):
            cmd.append("--no-tf32")
    else:
        # ponytail: requirements file when the ref carries it (loop/toolchain+),
        # inline pins when testing older refs — the run must never die on install.
        req = repo / "requirements-t4.txt"
        if req.exists():
            sh(sys.executable, "-m", "pip", "install", "-q", "torch", "-r", str(req))
        else:
            sh(sys.executable, "-m", "pip", "install", "-q", "torch", "pytest",
               "mapie==1.5.0", "scikit-learn==1.9.0", "lightgbm==4.7.0",
               "interpret-core==0.7.8", "numpy==2.3.4", "scipy==1.18.1")
        env_out["REFLEX_ITERS"] = str(args.iters)
        cmd = [sys.executable, "scripts/t4_run.py", "--seeds", args.seeds,
               "--iters", str(args.iters)]
    completed = subprocess.run(cmd, cwd=repo, env=env_out, text=True,
                               capture_output=True)
    print(completed.stdout[-8000:])
    print(completed.stderr[-4000:], file=sys.stderr)

    sys.path.insert(0, str(repo))
    from colab.report_results import publish
    import json
    result_path = work / "runs" / "run_result.json"
    result = json.loads(result_path.read_text(encoding="utf-8"))
    publish(result, output_path=result_path)
    print(f"RUN_ID={result['run_id']} STATUS={result['status']}")
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
