"""Single-request all-10-knob SmolVLA replay (smoke, seed 11, serial).

Stacks all 10 knobs on one request — no tier/seed fan-out, no parallel runs.
Knob values mirror scripts/t4_all10_retry.ps1. Guardrail: shards=4 + smoke-only
(streams=2 OOMs main). Thin wrapper over scripts/smolvla_run.py helpers.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from smolvla_run import corpus_tests, genesis_or_validate, run_tier  # noqa: E402
from t4_run import git_commit  # noqa: E402

# All 10 knobs, pinned (shards=4 is the OOM guardrail, not a knob).
SEED = 11
TIER, WORKLOAD, FRAMES = "smoke", "smolvla-smoke-v1", "smoke-250.jsonl"
KWARGS = {
    "dtype": "float16", "fault": "candidate", "compile": True,
    "compile_mode": "max-autotune", "cudnn_bench": True, "contention": 2,
    "tf32": False, "shards": 4, "streams": 2, "threads": 1,
    "frame_fault": "corrupt", "instruction_fault": "hostile", "exp": "all10",
}


def main() -> int:
    output_root = Path(os.environ.get("REFLEX_OUTPUT_ROOT", "/tmp/reflex_runs"))
    output_root.mkdir(parents=True, exist_ok=True)
    commit = git_commit()
    tests = corpus_tests()
    if tests["exit_code"] != 0:
        raise RuntimeError("corpus contract tests failed")
    corpus, sha = genesis_or_validate()
    result = run_tier(output_root, corpus, sha, TIER, WORKLOAD, FRAMES,
                      (SEED,), commit, **KWARGS)
    pipe = result["pipeline"]
    print(f"done failed={pipe['collected']['failed']} gaps={pipe['gaps']} "
          f"records={pipe['records']}")
    return 0 if not pipe["collected"]["failed"] and not pipe["gaps"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
