"""Ticket 03 proofs: real asyncio loop, real overflow, real trigger, real calibration, restart."""
import asyncio
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.ledger import Ledger
from reflex.runtime import Runtime, calibrate


def test_loop_runs_at_target_tick(tmp_path: Path) -> None:
    rt = Runtime(tmp_path / "l.jsonl", ring_capacity=32, tick_ms=2.0)
    stats = asyncio.run(rt.run(10))
    assert stats["ticks"] == 10 and len(stats["intervals_ms"]) == 10
    assert stats["elapsed_s"] >= 10 * 0.002  # monotonic floor: never faster than target
    assert stats["elapsed_s"] < 10 * 0.002 + 2.0  # never blocks far past target
    assert sum(stats["intervals_ms"]) / 10 >= 2.0


def test_overflow_drops_without_blocking_and_records(tmp_path: Path) -> None:
    p = tmp_path / "l.jsonl"
    rt = Runtime(p, ring_capacity=4, tick_ms=1.0)
    t0 = time.monotonic()
    stats = asyncio.run(rt.run(10))
    assert time.monotonic() - t0 < 2.0  # pressure never blocks the loop
    assert stats["dropped"] == 6 and rt.ring.dropped == 6 and len(rt.ring) == 4
    drops = [e for e in Ledger(p).evidence.values() if e.kind == "ring_drop"]
    assert sum(d.payload["dropped"] for d in drops) == 6


def test_trigger_preserves_pre_and_post_windows(tmp_path: Path) -> None:
    rt = Runtime(tmp_path / "l.jsonl", ring_capacity=4, tick_ms=1.0)
    out = asyncio.run(rt.run_with_trigger(10, trigger_at=5, post_window=3))
    assert len(out["pre"]) == 4  # bounded ring: last 4 obs before trigger
    assert len(out["post"]) == 3  # short post-trigger window
    assert [o["correlation_id"] for o in out["pre"]][-1].endswith("-0005")
    assert [o["correlation_id"] for o in out["post"]] == [
        f"00000007-{i:04d}" for i in (6, 7, 8)]  # correlated continuation, no gap


def test_calibration_deltas_and_best_rate(tmp_path: Path) -> None:
    ledger = Ledger(tmp_path / "l.jsonl")
    rep = asyncio.run(calibrate(ledger, {"fast": 0.008, "slow": 0.030},
                                [1.0, 0.5, 0.1], ticks=30, tick_ms=1.0))
    slow, fast = rep["slow"]["deltas"], rep["fast"]["deltas"]
    assert slow[1.0]["d_mean_ms"] > fast[1.0]["d_mean_ms"] > 0  # real paired cost ordering
    assert slow[1.0]["d_mean_ms"] > slow[0.1]["d_mean_ms"]  # sampling less perturbs less
    assert rep["slow"]["best_rate"] == 0.1 and rep["fast"]["best_rate"] == 0.1  # least-perturbing useful
    cal = [e for e in ledger.evidence.values() if e.kind == "calibration"]
    assert len(cal) == 6 and all("d_mean_ms" in e.payload for e in cal)


def test_restart_loses_only_unflushed(tmp_path: Path) -> None:
    p = tmp_path / "l.jsonl"
    rt = Runtime(p, ring_capacity=16, tick_ms=1.0)
    asyncio.run(rt.run(6, flush_every=3))  # 6 flushed via two flushes
    n_flushed = len(Ledger(p).evidence)
    assert n_flushed == 6 and len(rt.ring) == 0
    asyncio.run(rt.run(4))  # 4 unflushed, live only in ring
    assert len(rt.ring) == 4
    rt2 = Runtime(p, ring_capacity=16, tick_ms=1.0)  # restart: new process, same file
    assert len(rt2.ring) == 0  # unflushed window lost
    assert len(Ledger(p).evidence) == n_flushed  # flushed records survive intact
    assert Ledger(p).snapshot() == rt.ledger.snapshot()
