"""Ticket 08 proofs on real synthetic matched pairs (same seed, healthy vs fault)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.fakegpu import generate
from reflex.reconstruct import (ROOFLINE_FAMILIES, adapt_lineage, align_clocks, build_graph,
                                classify_bundle, critical_path, diff_critical_path,
                                extract_suspect, nominate_dependency)

SEED, N = 11, 8
EXPECTED = {"attn_kernel": "compute-bound", "mlp_kernel": "compute-bound",
            "layernorm_kernel": "memory-bound"}


def _graphs(profile):
    h = generate(SEED, "healthy", N)
    f = generate(SEED, profile, N)
    return h, f, build_graph(h), build_graph(f)


def test_starvation_attributes_to_host_not_gpu():
    h, f, gh, gf = _graphs("cpu_starvation")
    d = diff_critical_path(gf, gh)
    assert d["regressed_stage"] == "host", d["excess_ns"]
    assert d["excess_ns"]["host"] > d["excess_ns"]["kernel"]  # wrong answer (GPU slow) loses
    assert d["excess_ns"]["host"] > 0


def test_sync_attributes_to_sync_despite_inflated_host_gaps():
    h, f, gh, gf = _graphs("sync_serialization")
    d = diff_critical_path(gf, gh)
    # host gaps are inflated too (host stalled on device) — evidence must still pick sync
    assert d["regressed_stage"] == "sync", d["excess_ns"]
    assert any(e["kind"] == "sync_host" and e["observed"] for e in gf["edges"])


def test_missing_events_yield_unknown_not_invented_order():
    h, f, gh, gf = _graphs("cpu_starvation")
    drop = f["gpu_kernel"][len(f["gpu_kernel"]) // 2]["correlation_id"]
    deg = {**f, "gpu_kernel": [r for r in f["gpu_kernel"] if r["correlation_id"] != drop]}
    g = build_graph(deg)
    unk = [e for e in g["edges"] if e["kind"] == "unknown"]
    assert unk and all(e["confidence"] == 0.0 and not e["observed"] for e in unk)
    assert any(e["src"].startswith("gpu:") and e["dst"].startswith("gpu:") for e in unk)
    spanning = [e for e in g["edges"]
                if e["kind"] == "stream_order" and e["confidence"] >= 0.9]
    lo = {e["src"] for e in spanning} | {e["dst"] for e in spanning}
    assert f"gpu:{drop}" not in lo  # dropped node takes part in no claimed order
    assert align_clocks(deg)["uncertainty_ns"] > align_clocks(f)["uncertainty_ns"]


def test_extraction_retains_causal_predecessors():
    kept, total, narrow = 0, 0, True
    for profile in ("cpu_starvation", "sync_serialization", "kernel_regression"):
        _, _, gh, gf = _graphs(profile)
        path = critical_path(gf)["path"]
        sub = extract_suspect(gf, path[-1], radius=2)
        for pred in path[-3:-1]:  # true causal predecessors on the critical path
            total += 1
            kept += pred in sub["nodes"]
        narrow &= len(sub["nodes"]) < len(gf["nodes"])
    assert kept == total and total == 6  # retention rate 1.0
    assert narrow  # extraction actually narrows


def test_roofline_confusion_family_only():
    h = generate(SEED, "healthy", N)
    fams = classify_bundle(h)
    truth = [EXPECTED[g["kernel_name"]] for g in h["gpu_kernel"]]
    acc = sum(fams[g["correlation_id"]] == t for g, t in zip(h["gpu_kernel"], truth)) / N
    assert acc >= 0.75, (acc, fams)
    assert set(fams.values()) <= set(ROOFLINE_FAMILIES)  # family only, never a source claim
    reg = classify_bundle(generate(SEED, "kernel_regression", N))
    assert sum(v == "latency-bound" for v in reg.values()) / N >= 0.75, reg


def test_xcorr_nominates_but_never_overrides():
    _, f, _, gf = _graphs("sync_serialization")
    nom = nominate_dependency(f)
    assert nom["overrides_edge"] is False
    assert "overrides_edge" not in str(gf)  # graph construction takes no xcorr input
    sync_edges = [e for e in gf["edges"] if e["kind"] == "sync"]
    assert sync_edges and all(e["observed"] and e["confidence"] == 1.0 for e in sync_edges)
    # evidence verdict stands regardless of the baseline's guess
    gh = build_graph(generate(SEED, "healthy", N))
    assert diff_critical_path(gf, gh)["regressed_stage"] == "sync"


def test_shared_batch_node_for_multistream_work():
    g = build_graph(generate(SEED, "queue_contention", N))
    assert "batch:shared" in g["nodes"]
    shares = [e for e in g["edges"] if e["dst"] == "batch:shared"]
    assert len(shares) > 1 and all(e["confidence"] < 1.0 and not e["observed"] for e in shares)


def test_lineage_adapter_joins_with_confidence():
    rows = adapt_lineage(generate(SEED, "healthy", N))
    assert len(rows) == N and all(r["aten_op"] == "aten::linear" for r in rows)
    assert all(r["module"] and 0.0 < r["confidence"] <= 1.0 for r in rows)
    b = generate(SEED, "healthy", N)
    b["l3_lineage"] = b["l3_lineage"][:-1]  # real dropped event, not a stub
    missing = [r for r in adapt_lineage(b) if r["confidence"] == 0.0]
    assert len(missing) == 1 and missing[0]["aten_op"] is None
