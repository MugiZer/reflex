"""Real-VLA-trace replay: captured Kineto trace -> bundle -> real Diagnose path.

Needs SMOLVLA_TRACE=<path to a real trace.json> (downloaded from a T4 run);
skips otherwise. Falsifies, in order: H1 (converter rejects real GPU events),
H3 (Diagnose refuses real context), and reports H2 (launch-gap linkage).
"""
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import collect as C
from reflex import diagnose as D

TRACE = os.environ.get("SMOLVLA_TRACE", "")
needs_trace = pytest.mark.skipif(not TRACE, reason="no SMOLVLA_TRACE artifact")


def _manifest() -> dict:
    ident = {"device": "Tesla T4", "hardware": "Tesla T4",
             "driver": "580.82", "cuda": "12.8",
             "collector_version": "collect-v1"}
    return C.manifest("healthy", 11, workload="smolvla-replay-v1",
                      identity_provider=lambda: dict(ident),
                      trace_variant="kineto", perf_status="profiled",
                      software={"torch": "replay-test"},
                      commit="replay-test")


def _bundles():
    doc = json.loads(Path(TRACE).read_text(encoding="utf-8"))
    man = _manifest()
    incident = C.adapt_bundle_for_diagnose(C.kineto_to_bundle(doc, man), man)
    baseline = C.adapt_bundle_for_diagnose(C.kineto_to_bundle(doc, man), man)
    return incident, baseline


@needs_trace
def test_real_trace_parses_to_populated_bundle():
    incident, _ = _bundles()
    assert incident["coverage"]["timeline"] is True
    assert len(incident["gpu_kernel"]) > 0, "H1: no GPU kernels converted"
    assert len(incident["cpu_launch"]) > 0, "H1: no CPU launches converted"
    print(f"\nkernels={len(incident['gpu_kernel'])} "
          f"cpu={len(incident['cpu_launch'])} "
          f"transfer={len(incident['transfer'])} "
          f"sync={len(incident['sync_edge'])}")


@needs_trace
def test_real_bundle_adapts_with_context():
    incident, _ = _bundles()
    assert incident["timing_model_version"] not in (None, "", "unknown")
    assert all(g.get("kernel_name") for g in incident["gpu_kernel"])
    gaps = [g.get("launch_gap_ns") for g in incident["gpu_kernel"]]
    linked = sum(1 for x in gaps if x is not None)
    print(f"\ntmv={incident['timing_model_version']} "
          f"launch-linked={linked}/{len(gaps)}")


@needs_trace
def test_real_bundles_meet_real_diagnose():
    incident, baseline = _bundles()
    out = D.compare_real(incident, [baseline])
    assert "surfaces" in out and out["surfaces"], "H3: no surfaces"
    zs = {st: round(s["z"], 3) for st, s in out["surfaces"].items()}
    print(f"\nstage-z (null comparison, expect ~0): {zs}")
