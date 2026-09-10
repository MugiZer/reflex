"""SmolVLA corpus contract proofs: determinism, counts, linkage, validation."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from workloads.smolvla import build_corpus as B
from workloads.smolvla import validate_corpus as V

PINS = {"resize_pad": [512, 512], "normalization": "MEAN_STD-shipped",
        "tokenizer": "SmolVLM2-500M-Video-Instruct", "max_length": 48,
        "task_key": "task",
        "image_source_keys": ["observation.images.top",
                              "observation.images.wrist"]}
INSTR = "pick up the cube and place it in the box"


def _bundle(lengths=None):
    return B.build(lengths or [400] * 50, INSTR, PINS)


def test_build_is_deterministic_and_sized(tmp_path):
    a = _bundle()
    b = _bundle()
    assert a == b
    assert len(a["main"]) == 1000
    assert len(a["smoke"]) == 250
    assert len(a["holdout"]) == 5
    assert a["smoke"] == [m["frame_id"] for m in a["main"][::4]]


def test_holdout_disjoint_from_corpus():
    bundle = _bundle()
    hold = {(h["episode_idx"], h["frame_idx"]) for h in bundle["holdout"]}
    main = {(m["episode_idx"], m["frame_idx"]) for m in bundle["main"]}
    assert hold & main == set()
    assert hold == {(e, 0) for e in range(5)}


def test_files_validate_clean(tmp_path):
    info = B.write_files(_bundle(), tmp_path)
    assert info["main_sha256"]
    assert V.validate(tmp_path) == []


def test_validator_rejects_drift(tmp_path):
    B.write_files(_bundle(), tmp_path)
    lines = (tmp_path / "main-1000.jsonl").read_text().splitlines()
    lines.pop(500)  # drop a frame
    (tmp_path / "main-1000.jsonl").write_text("\n".join(lines) + "\n")
    errs = V.validate(tmp_path)
    assert any("1000" in e for e in errs)
    assert any("main_sha256" in e for e in errs)


def test_validator_rejects_wrong_rev(tmp_path):
    bundle = _bundle()
    bundle["header"]["dataset_rev"] = "deadbeef"
    B.write_files(bundle, tmp_path)
    assert any("dataset_rev" in e for e in V.validate(tmp_path))


def test_builder_refuses_short_episode():
    with pytest.raises(ValueError):
        B.build([10] * 50, INSTR, PINS)


def test_builder_refuses_wrong_episode_count():
    with pytest.raises(ValueError):
        B.build([400] * 49, INSTR, PINS)
