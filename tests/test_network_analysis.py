import pytest

from reflex.network_analysis import (DurationSketch, Population, compare_blocks, complete_range,
    composite_residual, local_interval, mapped_interval, range_union, topology_bounds)


def contract(n=200):
    return dict(target="eligible deliveries", outcome="deadline", exposure="route", comparable=["payload"],
                mediators=["concurrency"], reference_ids=[], selection="confirmatory", frozen_at=10,
                dependence={"model": "independent_blocks", "basis": "reset isolated resource between blocks"},
                estimand="fixed weighted block miss rate", threshold=.1, alpha=.05,
                weights={"reference": [1/n]*n, "current": [1/n]*n}, regime="r", units="probability")


def blocks(n, value, prefix):
    return [dict(value=value, start=20+i, regime="r", unit=f"{prefix}{i}") for i in range(n)]


def test_sketch_roundtrip_merge_and_collapse():
    a = DurationSketch(bins=8)
    for x in (0, 1, 2, 10, 100000):
        a.add(x)
    b = DurationSketch.from_dict(a.to_dict())
    assert b.to_dict() == a.to_dict()
    assert b.quantile(.2)["collapsed"]
    b.merge(a)
    assert b.sketch.count == 10
    c = DurationSketch()
    for i in range(1, 101):
        c.add(i)
    q = c.quantile(.5)
    assert q["lower"] <= 50 <= q["upper"]
    with pytest.raises(ValueError):
        c.merge(a)


def test_population_censoring_identity_and_denominator():
    p = Population("b")
    for i, (status, end) in enumerate((("ok", 5), ("ok", 15), ("timeout", 5), ("timeout", 15))):
        row = dict(request_id=str(i), status=status, client_finish_ns=end, deadline_ns=10, client_total_ns=end)
        p.add(row)
        p.add(row)
    assert p.counts["eligible"] == 4
    assert p.counts["missed"] == 2
    assert p.counts["unknown_deadline"] == 1
    assert p.sketch.sketch.count == 2


def test_drought_and_threshold_summaries_cross_block_boundary():
    from reflex.network_analysis import join_runs
    summaries=[]
    for number,times in enumerate(([10,20],[90,100])):
        pop=Population(str(number),thresholds_ms=(.000005,))
        for at in times:
            pop.add({"request_id":str(at),"status":"ok","clock_domain":"c","client_finish_ns":at,
                     "deadline_ns":at+1,"client_total_ns":10})
        summaries.append(pop.summary())
    joined=join_runs(*summaries)
    assert joined["drought"]=={"first":10,"last":100,"max_ns":70,"clock":"c","ordered":True}
    assert sum(joined["threshold_exceedance"].values())==4
    summaries[1]["drought"]["clock"]="restarted"
    assert not join_runs(*summaries)["drought"]["ordered"]


def test_block_bound_material_selection_and_dependence():
    c = contract()
    a, b = blocks(200, 0, "a"), blocks(200, 1, "b")
    assert compare_blocks(a, b, c)["regression"]
    assert not compare_blocks(a, a, c)["regression"]
    assert not compare_blocks(a, b, {**c, "selection": "exploratory"})["regression"]
    assert not compare_blocks(a, b, {**c, "frozen_at": 999})["regression"]
    assert not compare_blocks(a, b, {**c, "dependence": {}})["regression"]
    with pytest.raises(ValueError):
        compare_blocks(a, b, {**c, "comparable": ["concurrency"]})


def test_censored_block_contrast_and_seeded_normal_tail_control():
    import random
    rng=random.Random(123)
    c=contract()
    alarms=0
    for _ in range(50):
        a=blocks(200,0,"a")
        b=blocks(200,0,"b")
        for p in a+b:
            p["value"]=int(rng.random()<.2)
        alarms += compare_blocks(a,b,c)["regression"]
    assert alarms <= 2  # fixed acceptance tolerance, declared before these seeded repetitions
    a,b=blocks(200,0,"a"),blocks(200,1,"b")
    for p in b: p["value_bounds"]=[0,1]
    result=compare_blocks(a,b,c)
    assert result["observed_difference_bounds"]==[0,1]
    assert result["difference"] is None and not result["regression"]


def test_natural_difference_in_differences_keeps_original_effect_units():
    # Normalized changes: treatment -0.4 -> 0.3; control +0.2 -> 0.6.
    result=compare_blocks(blocks(200,.3,"treatment"),blocks(200,.6,"control"),contract(),effect_scale=2)
    assert result["difference"] == pytest.approx(.6)


def test_clock_and_byte_boundaries():
    a, b = {"clock": "a", "time": 10}, {"clock": "b", "time": 1000}
    assert local_interval(a, b)["interval"] is None
    assert mapped_interval(a, b, None)["interval"] is None
    assert composite_residual([100,100], [20,20], (.9,1.1), nested=True)["interval"] == [78,82]
    assert composite_residual([10,10], [20,20], nested=True)["interval"] is None
    assert composite_residual([100,100], [20,20])["interval"] is None
    assert range_union([[0,10],[0,10],[8,12]]) == [[0,12]]
    assert not complete_range([0,20], [[0,10],[11,20]])


def test_topology_reports_group_not_sparse_answer():
    table = dict(additivity_basis="fixed route, measured additive means", epochs=["r"],
                 incidence=[[1,1]], intervals=[[10,10]], endpoint_bounds=[[0,0]], resources=["x","y"],
                 groups={"both": ["x","y"]})
    out = topology_bounds(table)
    assert out["bounds"] == {"x":[0,10], "y":[0,10], "both":[10,10]}
    assert out["indistinguishable"] == [("x","y")]
    assert topology_bounds({**table, "additivity_basis": None})["status"] == "unsupported model"


def test_changed_dependence_masking_and_no_additive_attribution():
    from reflex.network_analysis import joint_outcomes
    a=[(1,11),(11,1)]
    b=[(1,1),(11,11)]
    assert sorted(x for x,y in a) == sorted(x for x,y in b)
    assert sorted(y for x,y in a) == sorted(y for x,y in b)
    assert joint_outcomes(a,5)["simultaneous_exceedance"] == 0
    assert joint_outcomes(b,5)["simultaneous_exceedance"] == .5
    assert joint_outcomes([(80,100)],50)["completion_mean"] == joint_outcomes([(0,100)],50)["completion_mean"]


def test_overlapping_queue_tokens_do_not_hide_long_wait():
    from reflex.network_capture import event
    from reflex.network_analysis import progress_view,mechanism_predictions
    rows={}
    for i,(boundary,at,token) in enumerate([("queue_enqueue",0,"A"),("queue_enqueue",100,"B"),
                                          ("queue_dequeue",101,"A"),("queue_dequeue",102,"B")]):
        rows[str(i)]=event("s",i,"c",at,boundary,{"token":token},
                           [{"relation":"resource","identity":"q","certainty":"explicit"}],
                           coverage={"complete":True,"drops":0})
    view=progress_view(rows)
    assert sorted(f["duration"] for f in view["intervals"])==[2,101]
    view["thresholds"]={"queue_sojourn":{"value":50,"units":"ns"}}
    assert mechanism_predictions(rows,view)["queue_wait"]["result"]=="supports"


def test_readiness_refuses_mixed_units():
    from reflex.network_analysis import required_data_readiness
    from reflex.network_capture import event
    rows={}
    for i,(at,unit,byte_range) in enumerate([(100,"ns",[0,5]),(.2,"us",[5,10])]):
        rows[str(i)]=event("s",i,"c",at,"readable",links=[
            {"relation":"connection","identity":"conn","certainty":"explicit"},
            {"relation":"stream_range","identity":[0,*byte_range],"certainty":"explicit"}],
            units={"time":unit},coverage={"complete":True,"drops":0})
    mapping={"certainty":"explicit","framing_observed":True,"connection":"conn","stream":0,
             "required_range":[0,10],"inputs":["0"]}
    assert required_data_readiness(rows,mapping)["ready"] is None
def test_timestamp_uncertainty_survives_progress_and_claim_gates():
    from reflex.network_capture import event
    from reflex.network_analysis import progress_view, mechanism_predictions, mapped_interval
    link=[{"relation":"delivery","identity":"d","certainty":"explicit"}]
    rows={"a":event("s",1,"c",10,"release",links=link,uncertainty=8,coverage={"complete":True,"drops":0}),
          "b":event("s",2,"c",20,"submit",links=link,uncertainty=8,coverage={"complete":True,"drops":0})}
    view=progress_view(rows)
    assert view["intervals"][0]["duration_bounds"] == [-6,26]
    view["thresholds"]={"dispatch_delay":{"value":15,"units":"ns"}}
    assert mechanism_predictions(rows,view)["endpoint_dispatch"]["result"] == "unresolved"
    mapped=mapped_interval(rows["a"],{**rows["b"],"clock":"other","time":120},
                           {"source":"c","target":"other","valid":[0,30],"scale":[1,1],"offset":[100,100],"inputs":["calibration"]})
    assert mapped["interval"] == [-6,26]
