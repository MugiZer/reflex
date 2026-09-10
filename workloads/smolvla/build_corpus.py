"""Deterministic SmolVLA replay-corpus builder (stdlib only, no torch).

Genesis runs in Colab against the pinned dataset rev; every later run consumes
the committed files. Never silently re-base: assert loudly on any drift.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

DATASET_ID = "lerobot/svla_so100_pickplace"
DATASET_REV = "728583b5eaf9e739a7f119e2def466fa1d552402"
CHECKPOINT_ID = "lerobot/smolvla_base"
CHECKPOINT_REV = "c83c3163b8ca9b7e67c509fffd9121e66cb96205"
EPISODES = 50
MAIN_PER_EPISODE = 20
SMOKE_EVERY = 4  # every 4th main entry -> 5 smoke frames/episode
HOLDOUT_EPISODES = 5  # first frame of episodes 0..4, always outside the corpus
BUILDER_VERSION = "corpus-v1"


def frame_id(ep: int, fr: int) -> str:
    return f"ep{ep:02d}_fr{fr:05d}"


def _evenly(candidates: list[int], n: int) -> list[int]:
    if len(candidates) < n:
        raise ValueError(f"only {len(candidates)} frames for {n} picks")
    return [candidates[round(k * (len(candidates) - 1) / (n - 1))]
            for k in range(n)]


def build(lengths: list[int], instruction: str,
          preprocessing: dict) -> dict:
    """Pure function of (episode lengths, frozen instruction, pins)."""
    if len(lengths) != EPISODES:
        raise ValueError(f"expected {EPISODES} episodes, got {len(lengths)}")
    holdout = [{"frame_id": frame_id(e, 0), "episode_idx": e, "frame_idx": 0}
               for e in range(HOLDOUT_EPISODES)]
    banned = {(h["episode_idx"], h["frame_idx"]) for h in holdout}
    main = []
    for ep, length in enumerate(lengths):
        pool = [f for f in range(length) if (ep, f) not in banned]
        for fr in _evenly(pool, MAIN_PER_EPISODE):
            main.append({"frame_id": frame_id(ep, fr),
                         "episode_idx": ep, "frame_idx": fr})
    if len(main) != EPISODES * MAIN_PER_EPISODE:
        raise ValueError(f"main corpus is {len(main)}, not 1000")
    smoke = [m["frame_id"] for m in main[::SMOKE_EVERY]]
    if len(smoke) != EPISODES * MAIN_PER_EPISODE // SMOKE_EVERY:
        raise ValueError(f"smoke corpus is {len(smoke)}, not 250")
    header = {"type": "header", "builder": BUILDER_VERSION,
              "dataset": DATASET_ID, "dataset_rev": DATASET_REV,
              "checkpoint": CHECKPOINT_ID, "checkpoint_rev": CHECKPOINT_REV,
              "episodes": EPISODES, "instruction": instruction,
              "preprocessing": dict(preprocessing),
              "warmup": {"passes": 2, "rule": "holdout first-frames x2"},
              "counts": {"main": len(main), "smoke": len(smoke),
                         "holdout": len(holdout)}}
    return {"header": header, "main": main, "smoke": smoke,
            "holdout": holdout}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_files(bundle: dict, out_dir: str | Path) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    main_lines = [json.dumps(bundle["header"], sort_keys=True)]
    main_lines += [json.dumps({"type": "frame", **m}, sort_keys=True)
                   for m in bundle["main"]]
    main_bytes = ("\n".join(main_lines) + "\n").encode()
    (out / "main-1000.jsonl").write_bytes(main_bytes)
    main_sha = _sha256(main_bytes)
    smoke_header = {"type": "header", "kind": "smoke",
                    "builder": BUILDER_VERSION, "main_sha256": main_sha,
                    "count": len(bundle["smoke"])}
    smoke_lines = [json.dumps(smoke_header, sort_keys=True)]
    smoke_lines += [json.dumps({"type": "smoke_ref", "frame_id": fid})
                    for fid in bundle["smoke"]]
    (out / "smoke-250.jsonl").write_bytes(
        ("\n".join(smoke_lines) + "\n").encode())
    holdout_lines = [json.dumps(bundle["header"], sort_keys=True)]
    holdout_lines += [json.dumps({"type": "holdout", **h}, sort_keys=True)
                      for h in bundle["holdout"]]
    (out / "holdout.jsonl").write_bytes(
        ("\n".join(holdout_lines) + "\n").encode())
    return {"main_sha256": main_sha, "dir": str(out)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lengths", required=True,
                    help="JSON list of per-episode frame counts (from dataset meta)")
    ap.add_argument("--instruction", required=True,
                    help="exact task-string bytes from meta/tasks.parquet")
    ap.add_argument("--preprocessing", required=True,
                    help="JSON dict of preprocessing pins")
    ap.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args(argv)
    bundle = build(json.loads(Path(args.lengths).read_text()),
                   args.instruction,
                   json.loads(Path(args.preprocessing).read_text()))
    info = write_files(bundle, args.out)
    print(json.dumps(info, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
