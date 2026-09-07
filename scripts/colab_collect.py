"""Self-bootstrapping T4 collection for `colab run --gpu T4`.

Executed as a file body inside the remote kernel (argv mirrors `python
colab_collect.py --ref main --seeds 11,17,23 --iters 20`). Clones the repo at
REFLEX_REF, installs deps, runs scripts/t4_run.py, publishes the summary via
repository_dispatch when REFLEX_GITHUB_TOKEN is set (pass --github-token), and
always prints the local result path + run_id for retrieval.
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default=os.environ.get("REFLEX_REF", "main"))
    parser.add_argument("--seeds", default=os.environ.get("REFLEX_SEEDS", "11,17,23"))
    parser.add_argument("--iters", type=int, default=int(os.environ.get("REFLEX_ITERS", "20")))
    parser.add_argument("--github-token", default=os.environ.get("REFLEX_GITHUB_TOKEN", ""))
    parser.add_argument("--workdir", default="/content/reflex-loop")
    args = parser.parse_args(argv)

    work = Path(args.workdir)
    repo = work / "reflex"
    if not (repo / ".git").exists():
        work.mkdir(parents=True, exist_ok=True)
        sh("git", "clone", "--filter=blob:none", REPO_URL, str(repo))
    sh("git", "fetch", "origin", args.ref, cwd=repo)
    sh("git", "checkout", "--force", "FETCH_HEAD", cwd=repo)
    sh(sys.executable, "-m", "pip", "install", "-q", "torch", "-r", str(repo / "requirements-t4.txt"))

    env = dict(os.environ, REFLEX_REF=args.ref, REFLEX_SEEDS=args.seeds,
               REFLEX_ITERS=str(args.iters), REFLEX_OUTPUT_ROOT=str(work / "runs"))
    if args.github_token:
        env["REFLEX_GITHUB_TOKEN"] = args.github_token
    completed = subprocess.run(
        [sys.executable, "scripts/t4_run.py", "--seeds", args.seeds,
         "--iters", str(args.iters)], cwd=repo, env=env, text=True,
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
