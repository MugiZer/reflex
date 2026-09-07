"""Issue #12: every stamped line carries the envelope (commit/fault/seed/env/failure_signature)."""
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pass2.luna_pass2_controller import ControllerConfig, append_log
from reflex import collect as C
from reflex.envelope import stamp
from reflex.ledger import Ledger, Trace

SHA = "a" * 40


def _check(env, *, fault, seed, commit=SHA, outcome="ok", reason="r"):
    assert set(env) == {"commit", "fault", "seed", "env", "failure_signature"}
    assert (env["commit"], env["fault"], env["seed"]) == (commit, fault, seed)
    assert {"hardware", "collector_version", "timing_model_version"} <= set(env["env"])
    assert env["failure_signature"] == {"outcome": outcome, "reason": reason}


def test_stamp_shape():
    _check(stamp(commit=SHA, fault="f", seed=1, hardware="h",
                 collector_version="c", timing_model_version="t",
                 outcome="ok", reason="r"), fault="f", seed=1)


def test_ledger_line_carries_envelope(tmp_path):
    p = tmp_path / "l.jsonl"
    Ledger(p, commit=SHA, fault="cpu_starvation", seed=11, hardware="h",
           collector_version="c", timing_model_version="t",
           outcome="ok", reason="r").append_trace(
        Trace(correlation_id="c1", provenance="p", kernel_name="k"))
    _check(json.loads(p.read_text(encoding="utf-8").splitlines()[-1])["envelope"],
           fault="cpu_starvation", seed=11)


def test_manifest_carries_envelope():
    m = C.manifest("stalls", 7, identity_provider=lambda: {
        "device": "d", "hardware": "h", "driver": "drv",
        "cuda": "cu", "collector_version": "c"},
        commit=SHA, timing_model_version="t", outcome="ok", reason="r")
    _check(m["envelope"], fault="stalls", seed=7)
    assert m["envelope"]["env"]["device"] == "d"  # GPU-path extras ride along


def test_pass2_log_carries_envelope(tmp_path):
    cfg = ControllerConfig(program="A", log_dir=tmp_path / "logs")
    start, end = datetime.now(UTC), datetime.now(UTC)
    append_log(cfg, "p-1", "failure", start, end, 1.0, "boom",
               commit=SHA, hardware="h", collector_version="c",
               timing_model_version="t")
    line = (tmp_path / "logs" / "program-a-operations.jsonl").read_text(
        encoding="utf-8").splitlines()[-1]
    _check(json.loads(line)["envelope"], fault="p-1", seed=None,
           outcome="failure", reason="boom")
