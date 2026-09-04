import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.ledger import (UNMODELED, UNKNOWN, Evidence, EvidenceLevel, Experiment,
                           Hypothesis, Incident, Ledger, LedgerError, Trace)

PROV = "striatrace.fastpath"
CORR = "cupti-corr-1"


def seed(path: Path) -> Ledger:
    l = Ledger(path)
    l.append_trace(Trace(correlation_id=CORR, provenance=PROV, stage="gpu_inference", duration_ns=41_000_000,
                         kernel_name="attn_kernel", stream_id=7, device_id=0))
    l.open_incident(Incident(provenance=PROV, title="p99 36ms -> 50ms"))
    return l


def hyp(l: Ledger, cause: str = "host_starvation") -> Hypothesis:
    inc = next(iter(l.incidents))
    return l.propose_hypothesis(Hypothesis(incident_id=inc, provenance=PROV, cause=cause, correlation_id=CORR))


def exp(l: Ledger, h: Hypothesis, predicted: float = 8.0) -> Experiment:
    return l.record_experiment(Experiment(hypothesis_id=h.hypothesis_id, correlation_id=CORR,
                                          provenance=PROV, intervention="isolate_submit_thread",
                                          predicted_delta_ms=predicted))


def lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def test_legal_lifecycle_inferred_tested_verified(tmp_path: Path) -> None:
    l = seed(tmp_path / "l.jsonl")
    h = hyp(l)
    e = exp(l, h)
    assert l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id).status is EvidenceLevel.TESTED
    with pytest.raises(LedgerError):  # measured effect missing -> cannot verify
        l.transition(h.hypothesis_id, EvidenceLevel.VERIFIED, e.experiment_id)
    l.set_measured(e.experiment_id, 7.5)
    assert l.transition(h.hypothesis_id, EvidenceLevel.VERIFIED, e.experiment_id).status is EvidenceLevel.VERIFIED
    with pytest.raises(LedgerError):  # VERIFIED is terminal
        l.transition(h.hypothesis_id, EvidenceLevel.INFERRED)
    # refuted path degrades to TESTED->INFERRED, never VERIFIED
    h2 = hyp(l, "synchronization")
    e2 = exp(l, h2)
    l.transition(h2.hypothesis_id, EvidenceLevel.TESTED, e2.experiment_id)
    assert l.transition(h2.hypothesis_id, EvidenceLevel.INFERRED).status is EvidenceLevel.INFERRED


def test_illegal_transition_rejected_store_unchanged(tmp_path: Path) -> None:
    p = tmp_path / "ledger.jsonl"
    l = seed(p)
    h = hyp(l)
    before = l.snapshot()
    n = len(lines(p))
    with pytest.raises(LedgerError):  # INFERRED -> VERIFIED without a TESTED experiment
        l.transition(h.hypothesis_id, EvidenceLevel.VERIFIED)
    with pytest.raises(LedgerError):  # unlinked experiment cannot promote
        l.transition(h.hypothesis_id, EvidenceLevel.TESTED, "nope")
    assert l.snapshot() == before
    assert len(lines(p)) == n


def test_invalid_records_rejected_at_boundary(tmp_path: Path) -> None:
    p = tmp_path / "ledger.jsonl"
    l = seed(p)
    n_ev, n_lines = len(l.evidence), len(lines(p))
    with pytest.raises(LedgerError):
        Evidence(correlation_id="", provenance=PROV, kind="k")  # missing correlation
    with pytest.raises(LedgerError):
        Evidence(correlation_id=CORR, provenance="  ", kind="k")  # missing provenance
    with pytest.raises(LedgerError):
        Evidence(correlation_id=CORR, provenance=PROV, kind="k", level="BOGUS")
    with pytest.raises(LedgerError):
        Evidence(correlation_id=CORR, provenance=PROV, kind="k", payload={"f": object()})
    with pytest.raises(LedgerError):
        Trace.from_dict({"trace_id": "t", "correlation_id": CORR, "provenance": PROV, "schema_version": 999})
    assert len(l.evidence) == n_ev
    assert len(lines(p)) == n_lines
    assert not [r for r in l.evidence.values() if not r.provenance or not r.correlation_id]


def test_jsonl_restart_readback_identical_in_fresh_process(tmp_path: Path) -> None:
    p = tmp_path / "ledger.jsonl"
    l = seed(p)
    h = hyp(l, UNKNOWN)
    e = exp(l, h)
    l.append_evidence(Evidence(correlation_id=CORR, provenance=PROV, level=EvidenceLevel.OBSERVED,
                               kind="cupti_kernel", payload={"kernel": "attn", "dur_ns": 9000}))
    l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id)
    want = l.snapshot()
    code = ("import json, sys; sys.path.insert(0, %r);"
            " from reflex.ledger import Ledger;"
            " print(json.dumps(Ledger(sys.argv[1]).snapshot(), sort_keys=True))" % str(ROOT))
    r = subprocess.run([sys.executable, "-c", code, str(p)], capture_output=True, text=True, cwd=ROOT, timeout=60)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == json.loads(json.dumps(want, sort_keys=True))


def test_replay_reproduces_identical_state(tmp_path: Path) -> None:
    a = tmp_path / "a.jsonl"
    l = seed(a)
    h = hyp(l, UNMODELED)
    e = exp(l, h, predicted=3.0)
    l.set_measured(e.experiment_id, 0.5)
    l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id)
    b = tmp_path / "b.jsonl"
    b.write_text(a.read_text(encoding="utf-8"), encoding="utf-8")
    assert Ledger(b).snapshot() == l.snapshot()


def test_hypothesis_registry_unknown_unmodeled_provisional(tmp_path: Path) -> None:
    l = seed(tmp_path / "ledger.jsonl")
    for cause in (UNKNOWN, UNMODELED, "kernel_launch_overhead"):
        assert hyp(l, cause).status is EvidenceLevel.INFERRED
    assert len(l.hypotheses) == 3
    with pytest.raises(LedgerError):  # empty cause is not a hypothesis
        hyp(l, "")


def test_transition_table_and_load_boundaries(tmp_path: Path) -> None:
    p = tmp_path / "ledger.jsonl"
    l = seed(p)
    h = hyp(l)
    with pytest.raises(LedgerError):  # self-transitions are nonsense
        l.transition(h.hypothesis_id, EvidenceLevel.INFERRED)
    with pytest.raises(LedgerError):  # proposals enter at INFERRED only
        l.propose_hypothesis(Hypothesis(incident_id=next(iter(l.incidents)), provenance=PROV,
                                        cause="x", correlation_id=CORR, status=EvidenceLevel.TESTED))
    with pytest.raises(LedgerError):  # versioned schema covers hypotheses too
        Hypothesis(incident_id="i", provenance=PROV, cause="x", correlation_id=CORR, schema_version=999)
    e = exp(l, h)
    l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id)
    with pytest.raises(LedgerError):
        l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id)
    l.set_measured(e.experiment_id, 1.0)
    l.transition(h.hypothesis_id, EvidenceLevel.VERIFIED, e.experiment_id)
    with pytest.raises(LedgerError):  # VERIFIED is terminal in every direction
        l.transition(h.hypothesis_id, EvidenceLevel.TESTED, e.experiment_id)
    # hand-edited log: a pre-measured experiment could never be written live
    q = tmp_path / "evil.jsonl"
    l2 = seed(q)
    h2 = hyp(l2)
    evil = Experiment(hypothesis_id=h2.hypothesis_id, correlation_id=CORR, provenance=PROV,
                      intervention="x", predicted_delta_ms=1.0, measured_delta_ms=9.9)
    with open(q, "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"type": "experiment", "data": evil.to_dict()}, sort_keys=True) + "\n")
    with pytest.raises(LedgerError):
        Ledger(q)
    # hand-edited log: evidence pointing at an unknown trace
    r = tmp_path / "orphan.jsonl"
    ghost = Evidence(correlation_id=CORR, provenance=PROV, kind="k", trace_id="ghost")
    r.write_text(json.dumps({"type": "evidence", "data": ghost.to_dict()}, sort_keys=True) + "\n",
                 encoding="utf-8")
    with pytest.raises(LedgerError):
        Ledger(r)
