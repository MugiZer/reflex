"""Ticket 06 proofs: tournament benchmark vs slice-05, provenance/no-verify,
background-fit timing, intervention agreement, module hygiene."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import tournament
from reflex.corpus import FAMILIES  # eval side may use labels; reflex/ never does
from reflex.diagnose import STAGES
from reflex.fakegpu import generate
from reflex.ledger import EvidenceLevel, Ledger

N = 16
SEED, B1, B2 = 51, 151, 251
TRIPLES = ((51, 151, 251), (7, 77, 777), (1234, 4321, 9999))  # incident/baseline seeds; claim must hold on all three
# Acceptable-cause sets. Single-knob faults name one stage; batching_delay and
# preprocessing_interference move cpu gaps + cpu durations + queue depth off a
# single knob, and slice-05 itself reports close seconds there (cpu:preprocess
# z ratio < 1.6, cf. the ambiguity standard in test_diagnose), so either top
# counts. stalls names gpu: only GPU-efficiency levels move while no stage
# time does (slice-05 abstains); sync_serialization names scheduler: blocked_ns
# is the knob's direct effect, host gaps are documented-downstream of it.
ACCEPTABLE = {"cpu_starvation": ("cpu",), "launch_overhead": ("scheduler",),
              "bw_pressure": ("gpu",), "stalls": ("gpu",),
              "sync_serialization": ("scheduler",), "transfer_heavy": ("transport",),
              "batching_delay": ("cpu", "preprocess"),
              "queue_contention": ("queue",), "competing_workload": ("queue",),
              "kernel_regression": ("gpu",),
              "preprocessing_interference": ("cpu", "preprocess")}
STRICT = {k: (v[0],) for k, v in ACCEPTABLE.items()}
ORACLES = ({"name": "cpu_starvation", "seed": SEED, "profile": "cpu_starvation",
            "good": "isolate_submit", "bad": "revert_kernel_config",
            "expected": "cpu"},
           {"name": "kernel_regression", "seed": SEED, "profile": "kernel_regression",
            "good": "revert_kernel_config", "bad": "isolate_submit",
            "expected": "gpu"})


def _cases(seed=SEED, b1=B1, b2=B2):
    return [{"name": p, "incident": generate(seed, p, N),
             "baselines": [generate(b1, "healthy", N), generate(b2, "healthy", N)],
             "acceptable": ACCEPTABLE[p]} for p in FAMILIES]


def test_benchmark_beats_slice05(tmp_path: Path) -> None:
    assert set(ACCEPTABLE) == set(FAMILIES)  # full corpus, no shopping
    reps = []
    for ti, (seed, b1, b2) in enumerate(TRIPLES):
        rep = tournament.benchmark(_cases(seed, b1, b2), list(ORACLES), tmp_path / str(ti),
                                   heavy_timeout=120.0)
        assert rep["n"] == 11 and rep["beats_top1"] and rep["beats_top3"], (seed, rep)
        assert rep["tour_top1"] == 11 and rep["tour_top3"] == 11, seed
        assert rep["min_margin"] > 0.005, (seed, rep["min_margin"])  # decisive on every triple, no lucky draw
        reps.append(rep)
    rep = reps[0]
    # the baseline is the real slice-05 ranker, not a strawman: strong (9/11)
    # with exactly the two systematic misses this ticket closes.
    assert rep["base_top1"] == 9 and rep["base_top3"] == 10
    misses = sorted(r["name"] for r in rep["rows"] if not r["base_hit1"])
    assert misses == ["stalls", "sync_serialization"]  # primary triple only; other triples vary
    strict_tour = sum(r["tour_top1"] in STRICT[r["name"]] for r in rep["rows"])
    strict_base = sum(r["base_top1"] in STRICT[r["name"]] for r in rep["rows"])
    assert strict_tour > strict_base  # still beats under single-stage scoring
    # agreement with measured intervention benefit (rerun oracle, 2 faults):
    # per-model tops are REPORTED (voice_tops/voice_agree in every row); the
    # fused rank must match the intervention that measured well. Level-based
    # voices honestly dissent on cpu_starvation (SM collapse reads gpu-side),
    # which is why time-based voices dominate the fusion, not the report.
    by_name = {r["name"]: r for r in rep["rows"]}
    for oc in ORACLES:
        assert by_name[oc["name"]]["tour_top1"] == oc["expected"]
        assert set(by_name[oc["name"]]["voice_tops"]) == set(tournament.WEIGHTS)
    for a in rep["agreement"]:
        assert a["good_measured_ms"] > 0 and a["benefit_gap_ms"] > 0
    starve = by_name["cpu_starvation"]["voice_tops"]
    assert starve["matched"] == "cpu" and starve["structural"] == "cpu"
    assert by_name["kernel_regression"]["voice_tops"]["matched"] == "gpu"


def test_provenance_and_no_verify(tmp_path: Path) -> None:
    for fault in ("stalls", "sync_serialization"):
        led = Ledger(tmp_path / (fault + ".jsonl"))
        out = tournament.tournament(generate(SEED, fault, N),
                                    [generate(B1, "healthy", N),
                                     generate(B2, "healthy", N)], led)
        assert out["fixes"] == []
        assert {s for s, _ in out["ranking"]} == set(STAGES)
        assert set(out["voices"]) == set(tournament.WEIGHTS)
        assert all(h["cause"] in set(STAGES) | {"UNKNOWN"} for h in out["hypotheses"])
        assert led.hypotheses and all(h.status is EvidenceLevel.INFERRED
                                      for h in led.hypotheses.values())
        assert not led.experiments
        blob = json.dumps(led.snapshot(), sort_keys=True, default=str)
        assert "VERIFIED" not in blob and "TESTED" not in blob


def test_heavy_fits_off_fast_path(tmp_path: Path) -> None:
    _ = tmp_path
    incident, bases = generate(SEED, "kernel_regression", N), \
        [generate(B1, "healthy", N), generate(B2, "healthy", N)]
    t0 = time.time()
    fast = tournament.fast_voices(incident, bases)
    fast_wall = time.time() - t0
    assert fast_wall < 10  # loop-safe bound; typically < 1s
    t0 = time.time()
    tab = fast["table"]
    jobs = tournament.start_heavy(tab["X"], tab["y"])
    assert time.time() - t0 < 5  # submit never waits on a fit
    heavy = tournament.collect_heavy(jobs, tab["names"], timeout=120.0)
    assert not heavy["ebm"]["timed_out"] and not heavy["lgbm"]["timed_out"]
    tids = jobs["threads"]
    assert set(tids) == {"ebm", "lgbm"} and all(t != jobs["caller"] for t in tids.values())
    assert tournament.fast_voices(incident, bases)["enet"] == fast["enet"]  # deterministic
    voices = {k: fast[k] for k in tournament.WEIGHTS if k not in tournament.HEAVY}
    voices.update({k: heavy[k]["scores"] for k in tournament.HEAVY})
    merged = tournament.fuse(voices, fast["sinfo"]["multipliers"])
    assert merged[0][0] == "gpu"


def test_module_consumes_bundles_only() -> None:
    src = (ROOT / "reflex" / "tournament.py").read_text(encoding="utf-8")
    for bad in ("reflex.corpus", "from .corpus", "from . import corpus",
                "LABELS", "SEED_TABLE", "EXPECTED_METRIC"):
        assert bad not in src
    from reflex.corpus import label_importers
    assert label_importers() == []
