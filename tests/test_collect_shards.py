"""Shard-merge ingest: split trace == whole trace (modulo l1 seams)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.collect import _merge_shard_bundles, kineto_to_bundle


def _ev(name, cat, ts, dur, cid):
    return {"ph": "X", "ts": ts, "dur": dur, "pid": 1, "tid": 2,
            "name": name, "cat": cat, "args": {"External id": cid}}


def _doc(events):
    return {"traceEvents": events, "timing_model_version": "t"}


def _events():
    evs = []
    for i in range(20):
        evs.append(_ev("k", "kernel", 1000 + i * 10, 5, i))
        evs.append(_ev("c", "cpu_op", 1000 + i * 10, 2, i))
    return evs


def test_merge_shards_equals_whole(tmp_path):
    evs = _events()
    whole = kineto_to_bundle(_doc(evs))
    pa, pb = tmp_path / "trace-shard-0.json", tmp_path / "trace-shard-1.json"
    pa.write_text(__import__("json").dumps(_doc(evs[:20])), encoding="utf-8")
    pb.write_text(__import__("json").dumps(_doc(evs[20:])), encoding="utf-8")
    merged = _merge_shard_bundles([pa, pb])
    for key in ("cpu_launch", "gpu_kernel"):
        assert [r["correlation_id"] for r in merged[key]] == \
            [r["correlation_id"] for r in whole[key]]
        assert [r["dur_ns"] for r in merged[key]] == \
            [r["dur_ns"] for r in whole[key]]
    assert set(merged["flow_ids"]) == set(whole["flow_ids"])
    assert len(merged["l1"]) == len(whole["l1"])
    assert merged["timing_model_version"] == "t"
    assert merged["synthetic"] is False
