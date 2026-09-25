import json

import pytest

from reflex.ledger import Evidence, Incident, Ledger, LedgerError
from reflex.network_capture import event, ingest


class ExperimentExecutor:
    def __init__(self,fail=False,hang=False,restoration_path=None):
        self.fail,self.hang,self.restoration_path=fail,hang,restoration_path
    def observe(self,*args): return {"queue":0,"interference":"controlled"}
    def washout(self,*args): return True
    def apply(self,*args):
        if self.hang:
            import time
            time.sleep(100)
        if self.fail: raise OSError("no permission")
    def readback(self,plan,block,arm): return plan["exposure"][arm]
    def measure(self,plan,block,arm):
        return {"outcome":int(arm=="control"),"coverage":{"complete":True,"drops":0,"clock_valid":True}}
    def restore(self,*args):
        if self.restoration_path:
            from pathlib import Path
            Path(self.restoration_path).write_text("restored")
        return {"status":"restored"}


def frozen_contract():
    return dict(target="deliveries", outcome="deadline", exposure="rate", comparable=["payload"],
                mediators=["backlog"], reference_ids=[], selection="confirmatory", frozen_at=1,
                dependence={"model":"independent_blocks", "basis":"isolated reset resources"},
                estimand="equal-block rate", threshold=.1, alpha=.05,
                weights={"reference":[.5,.5],"current":[.5,.5]}, regime="test", units="probability")


def test_investigator_replay_report_and_label_quarantine(tmp_path):
    from reflex.network import investigate
    from reflex.report import render_network, validate_network_report
    path = tmp_path / "l"
    links = [{"relation":"delivery", "identity":"d", "certainty":"explicit"}]
    rows = [("event", event("source", i, "clock", at, boundary, links=links,
              coverage={"complete":True,"drops":0})) for i,(at,boundary) in enumerate(
              [(1,"complete_readable"),(10,"consume")])]
    first = investigate(path, "i", contract=frozen_contract(), observations=rows)
    assert first["claims"] and all(c["level"] == "INFERRED" for c in first["claims"])
    assert investigate(path,"i") == first
    ledger = Ledger(path)
    report = render_network(ledger,"i")
    assert validate_network_report(report,ledger,"i")["valid"]
    with pytest.raises(ValueError):
        validate_network_report(report.replace("INFERRED","VERIFIED"),ledger,"i")
    (tmp_path/"fault.txt").write_text("wireless contention")
    assert investigate(path,"i") == first
    (tmp_path/"fault.txt").write_text("physical loss")
    assert investigate(path,"i") == first


def test_network_imports_do_not_load_gpu_ml():
    import subprocess
    import sys
    code = "import sys; import reflex.network, reflex.select, reflex.verify, reflex.report; assert not any(m in sys.modules for m in ['torch','sklearn','lightgbm','mapie','reflex.memory','reflex.fakegpu'])"
    result = subprocess.run([sys.executable,"-c",code],capture_output=True,text=True)
    assert result.returncode == 0, result.stderr


def test_restart_preserves_budget_and_uncertain_acquisition(tmp_path):
    from reflex.network import investigate
    path=tmp_path/"l"
    budget={"seconds":7,"bytes":2048,"perturbation":0}
    investigate(path,"i",contract=frozen_contract(),budgets=budget,max_actions=1)
    ledger=Ledger(path)
    ingest(ledger,"acquisition_plan",{"acquisition_id":"interrupted","bounds":budget,"inputs":[]},"i")
    result=investigate(path,"i")
    assert result["closure"]["remaining_budget"]=={"seconds":0,"bytes":0,"perturbation":0}
    assert result==investigate(path,"i")
    with pytest.raises(ValueError,match="budget is frozen"):
        investigate(path,"i",budgets={**budget,"seconds":100})


def test_acquisition_epochs_bundles_and_caps():
    from reflex.select import choose_acquisition
    action = dict(id="capture",scope="client",epoch=1,inputs=[],distinctions=["outcome_boundary"],
                  capabilities=["ready"],prerequisites=[],coverage="complete-data",
                  outcomes=[{"basis":"boundary_semantics","changes":["outcome_boundary"]}],
                  resources=[{"key":["client","source","filter",1],"bounds":{"seconds":1,"bytes":100,"perturbation":0}}])
    budget = {"seconds":10,"bytes":1000,"perturbation":0}
    decide = lambda actions,caps,acquired: choose_acquisition(actions,["outcome_boundary"],caps,acquired,budget)
    choice = decide([action],["ready"],set())["choice"]
    assert choice
    assert not decide([action],[],set())["choice"]
    assert not decide([action],["ready"],{choice["acquisition_id"]})["choice"]
    assert decide([{**action,"epoch":2}],["ready"],{choice["acquisition_id"]})["choice"]
    unknown = {**action,"resources":[{"key":["x"]}]}
    assert not decide([unknown],["ready"],set())["choice"]


@pytest.mark.parametrize("hang",[False,True])
def test_network_experiment_failure_restores_without_promotion(tmp_path,hang):
    from reflex.ledger import Hypothesis, Experiment, EvidenceLevel
    from reflex.verify import execute_network_experiment
    ledger = Ledger(tmp_path/"l")
    ledger.open_incident(Incident(incident_id="i",provenance="test",domain="network"))
    cid = ingest(ledger,"comparison_contract",frozen_contract(),"i")
    scope = dict(mechanism="load sensitivity",location="composite",contract_id=cid,outcome="deadline",
                 regime="test",assumptions=[],support=[],alternatives=["unknown"],claim_type="intervention_effect")
    h = ledger.propose_hypothesis(Hypothesis(incident_id="i",provenance="test",domain="network",scope=scope))
    plan = dict(contract_id=cid,claims=[h.hypothesis_id],eligible_population="all",exposure={"control":10,"treatment":5},
                predictions=["less delay"],rivals=[],threshold=.1,assignment_unit="time block",replication_unit="reset resource",
                schedule=["control","treatment"],seed=1,washout={"timeout_s":1},budget={"seconds":2},readback="rate",restoration="rate=10",scope=scope)
    exp = Experiment(hypothesis_id=h.hypothesis_id,correlation_id="e",provenance="test",intervention="rate",
                     domain="network",plan=plan)
    executor=ExperimentExecutor(fail=not hang,hang=hang,restoration_path=str(tmp_path/"restored"))
    import time
    started=time.monotonic()
    result=execute_network_experiment(ledger,exp,executor)
    assert result["restoration"]["status"] == "restored" and result["execution"] == "attempted"
    assert (tmp_path/"restored").read_text()=="restored"
    assert time.monotonic()-started < 8
    with pytest.raises(LedgerError):
        ledger.transition(h.hypothesis_id,EvidenceLevel.TESTED,exp.experiment_id)
    assert Ledger(tmp_path/"l").snapshot() == ledger.snapshot()


def test_verified_broad_effect_requires_executed_population_records(tmp_path):
    from reflex.ledger import Hypothesis, Experiment, EvidenceLevel
    from reflex.verify import execute_network_experiment, paired_schedule
    from reflex.report import render_network
    ledger=Ledger(tmp_path/"l")
    ledger.open_incident(Incident(incident_id="i",provenance="test",domain="network"))
    contract=frozen_contract()
    contract["weights"]={"reference":[1/40]*40,"current":[1/40]*40}
    cid=ingest(ledger,"comparison_contract",contract,"i")
    scope=dict(mechanism="broad intervention effect",location="composite",contract_id=cid,outcome="deadline",
               regime="test",assumptions=["independent reset blocks"],support=[],alternatives=["unknown mechanism"],claim_type="intervention_effect")
    h=ledger.propose_hypothesis(Hypothesis(incident_id="i",provenance="test",domain="network",scope=scope))
    plan=dict(contract_id=cid,claims=[h.hypothesis_id],eligible_population="all",exposure={"control":10,"treatment":5},
              predictions=["less delay"],rivals=[],threshold=.1,assignment_unit="resource block",replication_unit="reset resource",
              schedule=paired_schedule(40,1),assignment_scheme="paired_randomized",seed=1,
              washout={"timeout_s":1},budget={"seconds":60},readback="rate",restoration="rate=10",scope=scope)
    exp=Experiment(hypothesis_id=h.hypothesis_id,correlation_id="e",provenance="test",intervention="rate",domain="network",plan=plan)
    execute_network_experiment(ledger,exp,ExperimentExecutor())
    ledger.transition(h.hypothesis_id,EvidenceLevel.TESTED,exp.experiment_id)
    ledger.transition(h.hypothesis_id,EvidenceLevel.VERIFIED,exp.experiment_id)
    assert "VERIFIED" in render_network(Ledger(tmp_path/"l"),"i")
    # A copied certificate cannot establish a different mechanism or another incident.
    other=ledger.propose_hypothesis(Hypothesis(incident_id="i",provenance="test",domain="network",scope={**scope,"mechanism":"wireless contention"}))
    with pytest.raises(LedgerError): ledger.transition(other.hypothesis_id,EvidenceLevel.TESTED,exp.experiment_id)


@pytest.mark.parametrize("boundaries,expected",[
    ([("queue_enqueue",1),("queue_dequeue",20)],"queue_wait"),
    ([("relay_ingress",1),("relay_release",20)],"relay_release"),
    ([("complete_readable",1),("consume",20)],"late_consumption"),
    ([("link_assign",1),("access",20)],"wireless_access_wait"),
])
def test_incident_scope_degrades_with_missing_boundaries(tmp_path,boundaries,expected):
    from reflex.network import investigate
    links=[{"relation":"delivery","identity":"d","certainty":"explicit"}]
    observations=[("event",event("boot",i,"local",at,boundary,links=links,
                   coverage={"complete":True,"drops":0})) for i,(boundary,at) in enumerate(boundaries)]
    rich=investigate(tmp_path/"rich","i",contract=frozen_contract(),observations=observations)
    assert expected in {c["scope"]["mechanism"] for c in rich["claims"]}
    assert all(c["level"] == "INFERRED" for c in rich["claims"])
    reduced=investigate(tmp_path/"reduced","i",contract=frozen_contract(),observations=observations[:1])
    assert not reduced["claims"]
    assert "unknown" in reduced["closure"]["unresolved"]


def test_torn_tail_repair_keeps_raw_bytes(tmp_path):
    path=tmp_path/"l"
    ledger=Ledger(path)
    ledger.open_incident(Incident(incident_id="i",provenance="test"))
    with path.open("ab") as fh: fh.write(b'{"unfinished":')
    ledger=Ledger(path)
    recovery=ledger.repair_incomplete_tail()
    from pathlib import Path
    assert Path(recovery["backup"]).read_bytes() == b'{"unfinished":'
    ledger.open_incident(Incident(incident_id="j",provenance="test"))
    assert set(Ledger(path).incidents) == {"i","j"}


def test_network_identity_shared_and_conflict(tmp_path):
    path = tmp_path / "ledger.jsonl"
    ledger = Ledger(path)
    for name in ("a", "b"):
        ledger.open_incident(Incident(incident_id=name, provenance="test", domain="network"))
    row = event("boot:socket", 1, "boot:mono", 10, "retransmit")
    rid = ingest(ledger, "event", row, "a")
    ingest(ledger, "event", row, "b")
    count = len(path.read_text().splitlines())
    ingest(ledger, "event", row, "b")
    assert len(path.read_text().splitlines()) == count
    assert len([e for e in ledger.evidence.values() if e.kind == "event"]) == 1
    with pytest.raises(LedgerError):
        ingest(ledger, "event", {**row, "time": 20}, "a")
    assert Ledger(path).snapshot() == ledger.snapshot()


def test_network_domain_cannot_be_omitted_or_promoted(tmp_path):
    ledger = Ledger(tmp_path / "l")
    ledger.open_incident(Incident(incident_id="i", provenance="test", domain="network"))
    with pytest.raises(LedgerError):
        ledger.append_evidence(Evidence(correlation_id="x", provenance="test", incident_id="i", kind="fact"))
    with pytest.raises(LedgerError):
        ledger.append_evidence(Evidence(correlation_id="x", provenance="test", incident_id="i",
                                       domain="network", level="VERIFIED", kind="fact"))
    with pytest.raises((LedgerError, ValueError)):
        ingest(ledger, "fact", {"bad": float("nan")}, "i")


def test_torn_tail_reported_committed_corruption_rejected(tmp_path):
    path = tmp_path / "l"
    Ledger(path).open_incident(Incident(incident_id="i", provenance="test"))
    with path.open("ab") as fh:
        fh.write(b'{"type":')
    recovered = Ledger(path)
    assert recovered.incomplete_tail and "i" in recovered.incidents
    with pytest.raises(LedgerError, match="incomplete tail"):
        recovered.open_incident(Incident(provenance="test"))
    with path.open("ab") as fh:
        fh.write(b"\n")
    with pytest.raises(json.JSONDecodeError):
        Ledger(path)
