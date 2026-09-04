"""Ticket 12 proofs on real stored incidents (fakegpu bundles + ledger, never toy fixtures)."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.fakegpu import generate
from reflex.ledger import Hypothesis, Incident, Ledger
from reflex.memory import (MemoryStore, append_learning, describe, propose_learning,
                           record_from_ledger, recall, retrieve, shrunk_priors)

N = 8


def _qdepth(bundle) -> float:
    return sum(r["queue_depth"] for r in bundle["l1"]) / len(bundle["l1"])


def _view(fault: str, seed: int) -> dict:
    b, h = generate(seed, fault), generate(seed, "healthy")
    return describe(b, [h], h)


def _stored(tmp: Path, name: str, fault: str, seed: int, intervention: str | None,
            cause: str | None = None) -> object:
    ledger = Ledger(tmp / f"{name}.ledger.jsonl")
    inc = ledger.open_incident(Incident(provenance="t", title=fault))
    hypo = ledger.propose_hypothesis(Hypothesis(
        incident_id=inc.incident_id, provenance="t", cause=cause or fault, correlation_id="t"))
    if intervention is not None:
        from reflex.verify import run_intervention
        run_intervention(ledger, hypo.hypothesis_id, seed, fault, intervention, N, correlation_id="t")
    return ledger, inc


def _store(tmp: Path, name: str, fault: str, seed: int, intervention: str | None) -> tuple:
    store = MemoryStore(tmp / f"{name}.jsonl")
    ledger, inc = _stored(tmp, name, fault, seed, intervention)
    rec = record_from_ledger(ledger, inc.incident_id, _view(fault, seed), support=1)
    store.save(rec)
    return store, rec


def test_retrieval_returns_verified_prior_with_card(tmp_path: Path) -> None:
    store, starve = _store(tmp_path, "s", "cpu_starvation", 501, "isolate_submit")
    assert starve.verification == "VERIFIED"  # real ledger tier, not a fixture label
    _, dist = _store(tmp_path, "d", "kernel_regression", 502, "revert_kernel_config")
    store.save(dist)
    query = _view("cpu_starvation", 503)  # unseen seed, same fault family
    hits = retrieve(query, store)
    assert hits[0]["record"].cause == "cpu_starvation" and hits[0]["cause"] == "cpu_starvation"
    assert hits[0]["score"] >= 0.20
    out = recall(query, store)
    assert out["path"] == "retrieval" and out["cause"] == "cpu_starvation"


def test_difference_card_field_content(tmp_path: Path) -> None:
    store, _ = _store(tmp_path, "s", "cpu_starvation", 501, "isolate_submit")
    query = _view("cpu_starvation", 503)
    card = retrieve(query, store)[0]["card"]
    assert set(card) == {"why_retrieved", "matches", "mismatches", "unknowns",
                         "verification_quality", "transfer_risk", "evidence_still_needed"}
    assert "score=" in card["why_retrieved"] and "host" in card["why_retrieved"]  # regressed stage names it
    assert any(m.startswith("cpu z=") for m in card["matches"])  # dominant real stage, signed values
    assert card["verification_quality"] == "VERIFIED support=1 retracted=False"
    assert card["transfer_risk"].startswith("low")
    assert card["evidence_still_needed"] and "isolate_submit" in card["evidence_still_needed"][0]


def test_contamination_gate_both_ways(tmp_path: Path) -> None:
    # Same symptom (queue/qdepth elevated vs healthy), different cause: two real families.
    assert _qdepth(generate(501, "queue_contention")) > _qdepth(generate(501, "healthy"))
    assert _qdepth(generate(504, "competing_workload")) > _qdepth(generate(504, "healthy"))
    store, wrong = _store(tmp_path, "w", "queue_contention", 501, "revert_kernel_config")
    assert wrong.verification == "TESTED"  # unverified look-alike: no cause authority
    query = _view("competing_workload", 504)
    gated, ungated = retrieve(query, store, gated=True)[0], retrieve(query, store, gated=False)[0]
    assert gated["score"] > 0.20  # non-vacuous: the look-alike genuinely resembles the query
    assert gated["cause"] is None and gated["authority"] == "context-only"  # transfer blocked
    rec = recall(query, store)
    assert rec["cause"] is None and rec["fix"] == ""  # gated recall transfers neither cause nor fix
    assert ungated["cause"] == "queue_contention"  # gate off: the wrong cause transfers
    assert gated["cause"] != ungated["cause"]  # the gate makes the difference


def test_eligibility_tiers(tmp_path: Path) -> None:
    store = MemoryStore(tmp_path / "m.jsonl")
    _, v = _store(tmp_path, "v", "cpu_starvation", 501, "isolate_submit")
    _, t = _store(tmp_path, "t", "queue_contention", 501, "revert_kernel_config")
    ledger_i, inc_i = _stored(tmp_path, "i", "competing_workload", 504, None)
    inf = record_from_ledger(ledger_i, inc_i.incident_id, _view("competing_workload", 504))
    assert inf.verification == "INFERRED"
    _, r = _store(tmp_path, "r", "cpu_starvation", 509, "isolate_submit")
    for rec in (v, t, inf, r):
        store.save(rec)
    store.retract(r.incident_id, "duplicate of verified prior")
    hits = retrieve(_view("cpu_starvation", 503), store, top_k=10)
    ids = [h["record"].incident_id for h in hits]
    assert r.incident_id not in ids  # retracted: excluded, never ranked
    assert len(hits) == 3
    by_id = {h["record"].incident_id: h for h in hits}
    assert by_id[v.incident_id]["cause"] == "cpu_starvation"  # VERIFIED: full authority
    assert by_id[t.incident_id]["cause"] is None  # TESTED: ranked, no cause
    assert by_id[inf.incident_id]["cause"] is None  # INFERRED: ranked, no cause


def test_no_online_learning(tmp_path: Path) -> None:
    store, rec = _store(tmp_path, "s", "cpu_starvation", 501, "isolate_submit")
    for attr in ("online_update", "update_policy", "gradient_step", "learn_online"):
        with pytest.raises(AttributeError):  # the online path genuinely does not exist
            getattr(store, attr)("x")
    before = [r.model_dump_json() for r in store.all()]
    prop = append_learning(store, propose_learning(rec, note="promote after 3 corroborations"))
    assert prop["kind"] == "offline_learning_proposal"
    assert "offline_learning_proposal" in (store._learn.read_text(encoding="utf-8"))
    assert [r.model_dump_json() for r in store.all()] == before  # live weights untouched
    assert MemoryStore(store._path).get(rec.incident_id) == rec  # persistence round-trips


def test_rule_first_cascade_on_real_bundles(tmp_path: Path) -> None:
    store, _ = _store(tmp_path, "s", "cpu_starvation", 501, "isolate_submit")
    sync = recall(_view("sync_serialization", 505), store)
    assert sync["path"] == "rule:serialized-sync-v1" and sync["cause"] == "sync_serialization"
    kern = recall(_view("kernel_regression", 506), store)
    assert kern["path"] == "rule:kernel-regression-v1" and kern["cause"] == "kernel_regression"
    queue = recall(_view("queue_contention", 507), store)
    assert not queue["path"].startswith("rule:")  # no blanket rule: falls to retrieval reasoning


def test_shrunk_priors_discount_mismatch(tmp_path: Path) -> None:
    store, rec = _store(tmp_path, "s", "cpu_starvation", 501, "isolate_submit")
    raw = rec.interventions[0]["measured_ms"]
    assert raw > 0
    same = shrunk_priors(rec, _view("cpu_starvation", 503))["isolate_submit"]
    other = shrunk_priors(rec, _view("kernel_regression", 506))["isolate_submit"]
    assert same["shrunk_ms"] < raw and other["shrunk_ms"] < raw  # support=1 always shrinks
    assert other["factor"] < same["factor"]  # mismatch shrinks harder than match
