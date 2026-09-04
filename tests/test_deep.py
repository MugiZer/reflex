"""Ticket 09 proofs: gate enforcement, source/lineage recovery, fallback."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.deep import (GateRefusal, compiler_probe, level_a, level_b, level_c,
                         run_ladder)
from reflex.fakegpu import generate

SEED, N = 11, 8


def _pair(profile):
    return generate(SEED, "healthy", N), generate(SEED, profile, N)


def _top_cids(h, f, k=2):
    hk = {g["correlation_id"]: g for g in h["gpu_kernel"]}
    ranked = sorted((g["correlation_id"] for g in f["gpu_kernel"]),
                    key=lambda c: next(g["dur_ns"] for g in f["gpu_kernel"]
                                       if g["correlation_id"] == c) - hk[c]["dur_ns"],
                    reverse=True)
    return ranked[:k]


def test_gate_order_refuses_out_of_order():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    with pytest.raises(GateRefusal):
        level_b(f, h, s, None)
    with pytest.raises(GateRefusal):
        level_c(f, s, None)
    a = level_a(f, h, s)
    with pytest.raises(GateRefusal):  # A result is not a B result
        level_c(f, s, a)


def test_gate_bounded_suspect_vocab_and_reproducibility():
    h, f = _pair("kernel_regression")
    all_cids = [g["correlation_id"] for g in f["gpu_kernel"]]
    with pytest.raises(GateRefusal):
        level_a(f, h, all_cids)  # unbounded: not localized
    with pytest.raises(GateRefusal):
        level_a(f, h, [])  # empty
    with pytest.raises(GateRefusal):
        level_a(f, h, ["no-such-cid"])  # outside reconstruct vocabulary
    with pytest.raises(GateRefusal):  # "gpu:<cid>" node ids are vocabulary: must pass
        level_a(f, h, [f"gpu:{all_cids[0]}", "no-such-cid"])
    f2 = generate(SEED + 1, "kernel_regression", N)
    s2 = [g["correlation_id"] for g in f2["gpu_kernel"][:2]]
    with pytest.raises(GateRefusal):
        level_a(f2, h, s2)  # irreproducible: seeds differ


def test_gate_budget_and_no_intrakernel_hypothesis():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    with pytest.raises(GateRefusal):
        level_a(f, h, s, budget={"max_samples": 1})
    hc, fc = _pair("cpu_starvation")  # host fault: no intra-kernel hypothesis
    cs = [g["correlation_id"] for g in fc["gpu_kernel"][:2]]
    with pytest.raises(GateRefusal):
        level_a(fc, hc, cs)


def test_compiler_probe_disabled_by_default():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    with pytest.raises(GateRefusal):
        compiler_probe(s)
    out = compiler_probe(s, enable_compiler_probe=True)
    assert out["evidence_level"] == "INFERRED" and out["synthetic"] is True
    assert "VERIFIED" not in repr(out)


def test_level_a_recovers_source_on_kernel_regression():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    a = level_a(f, h, s)
    assert a["discriminates"] and a["sufficient_for_validation"]
    assert a["regions"][0]["correlation_id"] == s[0]  # argmax duration excess
    top = a["regions"][0]
    assert top["source_region"] and top["pc_offset"] is not None and top["sass"]
    assert top["synthetic"] is True and a["synthetic"] is True
    assert a["evidence_level"] in ("OBSERVED", "INFERRED")
    assert "VERIFIED" not in repr(a)


def test_stop_rule_stall_class_alone_insufficient():
    h, f = _pair("stalls")  # uniform +40 long_scoreboard on every kernel
    s = [g["correlation_id"] for g in f["gpu_kernel"][:2]]
    a = level_a(f, h, s)
    assert a["stall_class"] == "long_scoreboard"  # class signal is real...
    assert not a["discriminates"] and not a["sufficient_for_validation"]  # ...but never sufficient


def test_level_a_abstains_without_pc_sampling():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    f = {**f, "l3_pc": [r for r in f["l3_pc"] if r["correlation_id"] not in s]}
    a = level_a(f, h, s)  # genuinely insufficient: real bundle, sampling gone
    assert a["sufficient_for_validation"] is False and not a["regions"]
    assert a["fallback"]["claim"] == "abstain" and "sass_stub" in a["fallback"]


def _layout_fault():
    h, f = _pair("kernel_regression")
    first = dict(f["l3_lineage"][0])
    # ponytail: fakegpu has no native layout preset; earliest-kernel permute
    # proxy stands in until a real layout fault preset exists.
    first.update({"aten_op": "aten::permute", "shapes": [[4096, 1024]],
                  "origin_tag": "synthetic-layout-proxy"})
    f["l3_lineage"][0] = first
    return h, f


def test_level_b_recovers_earlier_transform_not_final_kernel():
    h, f = _layout_fault()
    finals = [g["correlation_id"] for g in f["gpu_kernel"][-2:]]
    a = level_a(f, h, finals)
    b = level_b(f, h, finals, a)
    first_cid = f["l3_lineage"][0]["correlation_id"]
    assert b["recovers_transform"] and b["responsible_cid"] == first_cid
    assert b["responsible_cid"] not in finals  # upstream, not the final kernel
    assert b["tensor_transformation"]["aten_op"] == "aten::permute"
    assert b["synthetic"] is True and "VERIFIED" not in repr(b)


def test_level_b_abstains_on_lineage_stripped_bundle():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    f = {**f, "l3_lineage": [r for r in f["l3_lineage"] if r["correlation_id"] not in s]}
    b = level_b(f, h, s, level_a(f, h, s))
    assert b["recovers_transform"] is False and b["claim"] == "abstain"
    assert "mapping_note" in b["fallback"] and b["tensor_transformation"] is None


def test_level_c_producer_slice_for_residual_ambiguity():
    h, f = _pair("kernel_regression")
    s = _top_cids(h, f)
    a = level_a(f, h, s)
    b = level_b(f, h, s, a)  # identical lineage -> abstains, still orders C
    assert b["claim"] == "abstain"
    c = level_c(f, s, b)
    assert c["center"] == f"gpu:{s[0]}" and c["slice_nodes"] > 0
    starts = {g["correlation_id"]: g["start_ns"] for g in f["gpu_kernel"]}
    assert c["producer_chain"]  # single-stream bundle has real predecessors
    assert all(starts[p["correlation_id"]] < starts[s[0]] for p in c["producer_chain"])
    assert [starts[p["correlation_id"]] for p in c["producer_chain"]] == sorted(
        starts[p["correlation_id"]] for p in c["producer_chain"])
    assert c["synthetic"] is True and "VERIFIED" not in repr(c)


def test_run_ladder_stops():
    h, f = _pair("kernel_regression")
    assert run_ladder(f, h, _top_cids(h, f))["stop_level"] == "A"
    h2, f2 = _layout_fault()  # A blind (no pc) -> B rescues via lineage
    s = _top_cids(h2, f2)
    f2 = {**f2, "l3_pc": [r for r in f2["l3_pc"] if r["correlation_id"] not in s]}
    out = run_ladder(f2, h2, s)
    assert out["stop_level"] == "B"
    assert out["level_b"]["responsible_cid"] == f2["l3_lineage"][0]["correlation_id"]
