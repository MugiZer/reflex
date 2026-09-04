"""Collector proofs: kill-safety, checksums, resume, idempotent ingest, converters."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import collect as C


def _kineto_doc(fault, seed, n=4):
    evs = []
    for i in range(n):
        cid = f"{seed:08x}-{i:04d}"
        t = 1000 * i
        evs.append({"name": "k[launch]", "cat": "cuda_api", "ph": "X",
                    "ts": t, "dur": 3, "pid": 1, "tid": 1,
                    "args": {"correlation_id": cid}})
        evs.append({"name": "launch->kernel", "cat": "flow", "ph": "s",
                    "ts": t, "pid": 1, "tid": 1, "id": cid})
        evs.append({"name": "k", "cat": "kernel", "ph": "X", "ts": t + 1,
                    "dur": 9, "pid": 2, "tid": 1,
                    "args": {"correlation_id": cid}})
        evs.append({"name": "launch->kernel", "cat": "flow", "ph": "f",
                    "ts": t + 1, "pid": 2, "tid": 1, "id": cid})
    return {"traceEvents": evs, "seed": seed, "fault": fault}


def _device(fault, seed):
    return {"trace.json": json.dumps(_kineto_doc(fault, seed)).encode()}


def test_kill_claims_nothing_then_resume_completes(tmp_path):
    root = tmp_path / "runs"
    out = C.collect(root, ("stalls",), (7,), device=_boom)
    assert out["done"] == [] and list(out["failed"]) == [("stalls", 7)]
    d = C.run_dir(root, "stalls", 7)
    assert (d / "manifest.json").exists()  # manifest-first: identity survives
    assert not (d / "DONE").exists()  # nothing claimed
    assert C.scan_todo(root, ("stalls",), (7,)) == [("stalls", 7)]
    out = C.collect(root, ("stalls",), (7,), device=_device)
    assert out["done"] == [("stalls", 7)] and not out["failed"]
    assert C.is_done(root, "stalls", 7)
    assert C.scan_todo(root, ("stalls",), (7,)) == []


def _boom(fault, seed):
    raise RuntimeError("colab preempted mid-run")


def test_tamper_invalidates_done_and_resume_repairs(tmp_path):
    root = tmp_path / "runs"
    C.collect(root, ("stalls",), (7,), device=_device)
    assert C.is_done(root, "stalls", 7)
    p = C.run_dir(root, "stalls", 7) / "trace.json"
    raw = bytearray(p.read_bytes())
    raw[100] ^= 0xFF  # single flipped byte on disk
    p.write_bytes(bytes(raw))
    assert not C.is_done(root, "stalls", 7)  # checksum gate catches it
    assert C.scan_todo(root, ("stalls",), (7,)) == [("stalls", 7)]
    C.collect(root, ("stalls",), (7,), device=_device)
    assert C.is_done(root, "stalls", 7)


def test_ingest_idempotent_and_rejects_corrupt(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("healthy", "stalls"), (7,), device=_device)
    first = C.ingest(root, ds)
    assert sorted(first["accepted"]) == ["healthy:7", "stalls:7"]
    assert first["rejected"] == {}
    again = C.ingest(root, ds)
    assert again["accepted"] == []  # idempotent: run_ids already present
    assert len(ds.read_text(encoding="utf-8").splitlines()) == 2
    C.collect(root, ("bw_pressure",), (8,),
              device=lambda f, s: {"trace.json": b"not json{{{"})
    bad = C.ingest(root, ds)  # transport-intact (checksums pass) but schema-invalid
    assert list(bad["rejected"]) == ["bw_pressure:8"]
    assert len(ds.read_text(encoding="utf-8").splitlines()) == 2  # dataset unchanged


def test_converters_real_shapes(tmp_path):
    b = C.kineto_to_bundle(_kineto_doc("stalls", 7))
    assert len(b["cpu_launch"]) == len(b["gpu_kernel"]) == 4
    assert b["flow_ids"] == sorted({g["correlation_id"] for g in b["gpu_kernel"]})
    assert b["synthetic"] is False
    broken = _kineto_doc("stalls", 7)
    del broken["traceEvents"][0]["ts"]
    with pytest.raises(ValueError):
        C.kineto_to_bundle(broken)  # missing required Chrome-trace field
    from reflex.fakegpu import generate, write_nsys_sqlite
    bundle = generate(7, "transfer_heavy", 4)
    db = tmp_path / "subset.db"
    write_nsys_sqlite(bundle, db)  # real writer output, not a hand mock
    back = C.nsys_subset_to_bundle(db)
    assert [g["correlation_id"] for g in back["gpu_kernel"]] == \
        [g["correlation_id"] for g in bundle["gpu_kernel"]]
    assert [g["duration_ns"] for g in back["gpu_kernel"]] == \
        [g["dur_ns"] for g in bundle["gpu_kernel"]]
    assert [t["bytes"] for t in back["transfer"]] == \
        [t["bytes"] for t in bundle["transfer"]]


def test_pair_corpus_needs_healthy(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("healthy", "stalls", "bw_pressure"), (7,), device=_device)
    C.collect(root, ("stalls",), (8,), device=_device)  # orphan: no healthy:8
    C.ingest(root, ds)
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    pairs = C.pair_corpus(recs)
    assert sorted(pairs) == ["bw_pressure:7", "stalls:7"]
    assert pairs["stalls:7"]["faulty"]["flow_ids"]


def test_nsys_command_builder():
    cmd = C.nsys_command(["python", "workload.py", "--n", "8"], "/out/run1")
    assert cmd[:4] == ["nsys", "profile", "--trace=cuda,nvtx,osrt", "--export=sqlite"]
    assert cmd[-4:] == ["python", "workload.py", "--n", "8"]
    assert any(a.startswith("--output=/out/run1") for a in cmd)
