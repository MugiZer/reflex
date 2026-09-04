"""Ticket 05 proofs: matched comparator, localization, ambiguity, registry lifecycle."""
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.diagnose import (STAGES, ContextMismatch, compare, diagnose, rank,
                             regression)
from reflex.fakegpu import generate
from reflex.ledger import UNKNOWN, Evidence, EvidenceLevel, Ledger

N = 8
CLEAN = (("kernel_regression", "gpu"), ("cpu_starvation", "cpu"),
         ("transfer_heavy", "transport"), ("launch_overhead", "scheduler"),
         ("queue_contention", "queue"))


def _ledger(tmp_path: Path) -> Ledger:
    return Ledger(tmp_path / "d.jsonl")


def _base(seeds, n=N):
    return [generate(s, "healthy", n) for s in seeds]


def test_comparator_matches_context_and_rejects_mismatch(tmp_path: Path) -> None:
    inc = generate(11, "kernel_regression", N)
    comp = compare(inc, _base((21, 22)))  # matched: same timing/heatmap shape
    assert comp["context"]["n_ops"] == N
    assert comp["context"]["timing_model_version"] == "roofline-v1"
    assert len(comp["context"]["kernels"]) == N
    with pytest.raises(ContextMismatch):  # workload shape differs
        compare(inc, _base((21, 22), n=16))
    other = generate(21, "healthy", N)
    other["timing_model_version"] = "roofline-v9"
    with pytest.raises(ContextMismatch):  # timing model differs
        compare(inc, [other])
    renamed = dict(generate(21, "healthy", N))
    renamed["gpu_kernel"] = [dict(g, kernel_name="mystery_kernel")
                             for g in renamed["gpu_kernel"][:1]] + renamed["gpu_kernel"][1:]
    with pytest.raises(ContextMismatch):  # kernel set differs
        compare(inc, [renamed])
    with pytest.raises(ContextMismatch):  # one bad apple spoils the pool
        compare(inc, _base((21,)) + _base((22,), n=16))
    with pytest.raises(ContextMismatch):  # empty pool is a global median in disguise
        compare(inc, [])


def test_localization_names_subsystem_on_five_faults() -> None:
    for seed in (11, 21, 31):
        for profile, want in CLEAN:
            comp = compare(generate(seed, profile, N), _base((seed + 100, seed + 200)))
            top, z1, _ = rank(comp["surfaces"])[0]
            _, z2, _ = rank(comp["surfaces"])[1]
            assert top == want, (seed, profile, rank(comp["surfaces"])[:3])
            assert z1 > 2.0 and z2 < 2.0, (seed, profile, z1, z2)  # single real winner


def test_ms_class_regression_localizes_gpu(tmp_path: Path) -> None:
    n = 96
    out = diagnose(generate(501, "kernel_regression", n),
                   _base((502, 503), n), _ledger(tmp_path))
    assert out["regression"]["span_delta_ms"] > 5.0  # ~9ms measured, ms-class
    assert out["regression"]["p99_delta_ms"] > 0
    assert out["ranking"][0][0] == "gpu"
    assert out["fixes"] == []


def test_ambiguity_holds_competing_hypotheses(tmp_path: Path) -> None:
    out = diagnose(generate(11, "sync_serialization", N), _base((21, 22)),
                   _ledger(tmp_path))
    causes = [h["cause"] for h in out["hypotheses"] if h["cause"] != UNKNOWN]
    assert len(causes) >= 2  # cpu gaps inflate downstream of the sync stall
    assert all(h["support_ids"] and h["contradict_ids"] for h in out["hypotheses"]
               if h["cause"] != UNKNOWN)
    (s1, _, _), (s2, _, _) = out["ranking"][:2]
    z = dict((st, zz) for st, zz, _ in out["ranking"])
    assert z[s1] / z[s2] < 3.0  # close competing signals, not a strawman
    assert out["unknown_mass"] > 0
    assert any(h["cause"] == UNKNOWN for h in out["hypotheses"])
    assert out["fixes"] == []
    led = out["registry"]._ledger
    assert {led.hypotheses[h["hypothesis_id"]].status for h in out["hypotheses"]} == \
        {EvidenceLevel.INFERRED}
    assert {h["cause"] for h in out["hypotheses"]} <= set(STAGES) | {UNKNOWN}


def test_weak_evidence_abstains_to_unknown(tmp_path: Path) -> None:
    out = diagnose(generate(11, "stalls", N), _base((21, 22)), _ledger(tmp_path))
    assert [h["cause"] for h in out["hypotheses"]] == [UNKNOWN]  # no ns excess anywhere
    assert out["unknown_mass"] > 0.9  # sub-threshold noise never spends UNKNOWN down
    assert out["fixes"] == []


def test_suppress_reopen_lifecycle(tmp_path: Path) -> None:
    out = diagnose(generate(11, "sync_serialization", N), _base((21, 22)),
                   _ledger(tmp_path))
    reg = out["registry"]
    hid = next(h["hypothesis_id"] for h in out["hypotheses"] if h["cause"] != UNKNOWN)
    keep = list(reg.entries[hid]["support_ids"])
    assert keep  # weakening evidence present before suppression
    reg.suppress(hid, "host gap is downstream of serialized sync")
    e = reg.entries[hid]
    assert e["suppressed"] and e["support_ids"] == keep  # retained, not deleted
    assert hid in reg.entries
    with pytest.raises(ValueError):
        reg.suppress(hid, "twice")
    with pytest.raises(ValueError):
        reg.suppress(hid, "   ")
    with pytest.raises(ValueError):
        reg.suppress("ghost", "reason")
    led = reg._ledger
    extra = led.append_evidence(Evidence(
        correlation_id="recheck", provenance="diagnose", kind="stage_delta",
        payload={"stage": "scheduler", "serialized": True},
        incident_id=out["incident_id"])).record_id
    reg.reopen(hid, "serialized sync_edge observed on re-slice", [extra])
    e = reg.entries[hid]
    assert not e["suppressed"] and e["support_ids"] == keep + [extra]
    assert [h.split(":")[0] for h in e["history"]] == ["proposed", "suppressed", "reopened"]
    with pytest.raises(ValueError):
        reg.reopen(hid, "not suppressed")
    with pytest.raises(ValueError):
        reg.reopen("ghost", "reason")


def test_inferred_only_and_no_action_language(tmp_path: Path) -> None:
    outs = [diagnose(generate(s, p, N), _base((s + 100, s + 200)), _ledger(tmp_path / f"{s}{p}.jsonl"))
            for s, (p, _) in zip((11, 21), (CLEAN[0], CLEAN[1]))]
    for out in outs:
        led = out["registry"]._ledger
        assert led.hypotheses and all(h.status is EvidenceLevel.INFERRED
                                      for h in led.hypotheses.values())
        assert not led.experiments  # no experiment exists, so TESTED/VERIFIED unreachable
        blob = json.dumps({k: v for k, v in out.items() if k != "registry"},
                          sort_keys=True, default=str).replace('"fixes": []', '""')
        assert not re.search(r"\b(fix|recommend\w*|should|must)\b", blob), blob
        assert "VERIFIED" not in blob and "TESTED" not in blob


def test_ranker_orders_by_z_with_name_tiebreak() -> None:
    surf = {st: {"z": 0.0, "delta": 0.0} for st in STAGES}
    surf["cpu"]["z"], surf["gpu"]["z"] = 3.0, 3.0
    surf["transport"]["z"] = 9.0
    r = rank(surf)
    assert [st for st, _, _ in r[:3]] == ["transport", "cpu", "gpu"]


def test_module_consumes_bundles_only() -> None:
    src = (ROOT / "reflex" / "diagnose.py").read_text(encoding="utf-8")
    assert "corpus" not in src  # label table unreachable by construction
    assert "fakegpu" not in src and "generate" not in src  # bundles in, never made
