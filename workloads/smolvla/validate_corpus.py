"""Frozen-manifest validator (stdlib only). Returns error list; empty means valid."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .build_corpus import (BUILDER_VERSION, CHECKPOINT_REV, DATASET_REV,
                           EPISODES, frame_id)


def _read(path: Path) -> tuple[dict, list[dict]]:
    lines = [json.loads(line) for line in
             path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines or lines[0].get("type") != "header":
        raise ValueError(f"{path.name}: first line must be a header")
    return lines[0], lines[1:]


def validate(corpus_dir: str | Path) -> list[str]:
    errs: list[str] = []
    d = Path(corpus_dir)
    try:
        header, frames = _read(d / "main-1000.jsonl")
    except (OSError, ValueError) as exc:
        return [f"main: {exc}"]
    for key, want in (("builder", BUILDER_VERSION),
                      ("dataset_rev", DATASET_REV),
                      ("checkpoint_rev", CHECKPOINT_REV),
                      ("episodes", EPISODES)):
        if header.get(key) != want:
            errs.append(f"main header {key}={header.get(key)!r}, want {want!r}")
    if header.get("counts", {}).get("main") != 1000 or len(frames) != 1000:
        errs.append(f"main has {len(frames)} frames, want 1000")
    ids = [f.get("frame_id") for f in frames]
    if len(set(ids)) != len(ids):
        errs.append("main frame_ids not unique")
    pairs = [(f.get("episode_idx"), f.get("frame_idx")) for f in frames]
    if any(fid != frame_id(ep, fr) for fid, (ep, fr) in zip(ids, pairs)):
        errs.append("main frame_id does not match episode_idx/frame_idx")
    if pairs != sorted(pairs):
        errs.append("main not sorted by (episode_idx, frame_idx)")
    from collections import Counter
    per_ep = Counter(ep for ep, _ in pairs)
    if set(per_ep) != set(range(EPISODES)) or set(per_ep.values()) != {20}:
        errs.append(f"main per-episode counts wrong: {sorted(per_ep.items())[:5]}...")
    try:
        holdout = {(h["episode_idx"], h["frame_idx"]) for h in
                   _read(d / "holdout.jsonl")[1]}
    except (OSError, ValueError) as exc:
        errs.append(f"holdout: {exc}")
        holdout = set()
    if set(pairs) & holdout:
        errs.append("corpus overlaps frozen warmup holdout")
    main_bytes = (d / "main-1000.jsonl").read_bytes()
    main_sha = hashlib.sha256(main_bytes).hexdigest()
    try:
        smoke_header, refs = _read(d / "smoke-250.jsonl")
    except (OSError, ValueError) as exc:
        return errs + [f"smoke: {exc}"]
    if smoke_header.get("main_sha256") != main_sha:
        errs.append("smoke header main_sha256 does not match main file")
    got = [r.get("frame_id") for r in refs]
    want = ids[::4]
    if len(got) != 250:
        errs.append(f"smoke has {len(got)} refs, want 250")
    elif got != want:
        errs.append("smoke is not every 4th main entry")
    return errs


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("corpus_dir")
    args = ap.parse_args(argv)
    errs = validate(args.corpus_dir)
    for e in errs:
        print("INVALID:", e)
    print("valid" if not errs else f"{len(errs)} errors")
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
