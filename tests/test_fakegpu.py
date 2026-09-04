"""Ticket 02 proofs: determinism, per-preset signatures, schema+L3 flags, trace validity."""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.fakegpu import PRESETS, generate, write_kineto_json, write_nsys_sqlite, to_ledger
from reflex.ledger import Ledger

SEED, N = 11, 8


def _mean(xs):
    return sum(xs) / len(xs)


def _cpu_gap(b):
    s = [c["start_ns"] for c in b["cpu_launch"]]
    return _mean([j - i for i, j in zip(s, s[1:])])


def _cpu_dur(b):
    return _mean([c["end_ns"] - c["start_ns"] for c in b["cpu_launch"]])


SIGNS = {  # preset -> (metric(bundle), check vs healthy)
    "cpu_starvation": (_cpu_gap, lambda p, h: p > h),
    "launch_overhead": (lambda b: _mean([g["launch_gap_ns"] for g in b["gpu_kernel"]]), lambda p, h: p > h),
    "bw_pressure": (lambda b: _mean([g["dur_ns"] for g in b["gpu_kernel"]]), lambda p, h: p > h),
    "stalls": (lambda b: sum(r["stall_hist"]["long_scoreboard"] for r in b["l3_pc"]), lambda p, h: p > h),
    "sync_serialization": (lambda b: _mean([s["blocked_ns"] for s in b["sync_edge"]]), lambda p, h: p > h),
    "transfer_heavy": (lambda b: _mean([t["bytes"] for t in b["transfer"]]), lambda p, h: p > h),
    "batching_delay": (lambda b: _mean([r["queue_depth"] for r in b["l1"]]), lambda p, h: p > h),
    "queue_contention": (lambda b: max(r["active_streams"] for r in b["l1"]), lambda p, h: p > h),
    "competing_workload": (lambda b: _mean([r["active_kernels"] for r in b["l1"]]), lambda p, h: p > h),
    "kernel_regression": (lambda b: _mean([g["dur_ns"] for g in b["gpu_kernel"]]), lambda p, h: p > h),
    "preprocessing_interference": (_cpu_dur, lambda p, h: p > h),
}


def test_same_seed_byte_equivalent_diff_seed_diverges(tmp_path: Path) -> None:
    a, b, c = generate(SEED, "launch_overhead", N), generate(SEED, "launch_overhead", N), generate(SEED + 1, "launch_overhead", N)
    assert a == b and a != c  # real generated bundles, no hardcoded hash
    pa, pb, pc = (tmp_path / f"{n}.json" for n in "abc")
    write_kineto_json(a, pa)
    write_kineto_json(b, pb)
    write_kineto_json(c, pc)
    assert pa.read_bytes() == pb.read_bytes() and pa.read_bytes() != pc.read_bytes()
    da, db = tmp_path / "a.db", tmp_path / "b.db"
    write_nsys_sqlite(a, da)
    write_nsys_sqlite(b, db)
    assert da.read_bytes() == db.read_bytes()
    qa = sqlite3.connect(str(da))
    qa.row_factory = sqlite3.Row
    try:
        dump_a = [dict(r) for r in qa.execute("SELECT * FROM CUPTI_ACTIVITY_KIND_KERNEL ORDER BY correlation_id")]
    finally:
        qa.close()
    assert len(dump_a) == N and len({r["correlation_id"] for r in dump_a}) == N


def test_every_preset_produces_its_signature() -> None:
    assert set(SIGNS) | {"healthy"} == set(PRESETS)  # all 11 fault families covered
    healthy = generate(SEED, "healthy", N)
    for name, (metric, check) in SIGNS.items():
        assert check(metric(generate(SEED, name, N)), metric(healthy)), name
    sync = generate(SEED, "sync_serialization", N)
    assert all(s["serialized"] for s in sync["sync_edge"])
    assert not any(s["serialized"] for s in generate(SEED, "healthy", N)["sync_edge"])


def test_records_validate_against_ledger_schema_l3_flagged(tmp_path: Path) -> None:
    p = tmp_path / "ledger.jsonl"
    bundle = generate(SEED, "stalls", N)
    ledger = Ledger(p)
    to_ledger(bundle, ledger)  # construction inside validates every record at the boundary
    assert len(ledger.traces) == N
    assert ledger.traces and all(t.correlation_id and t.stream_id >= 1 for t in ledger.traces.values())
    l3 = [e for e in ledger.evidence.values() if e.kind.startswith("l3_")]
    assert len(l3) == 3 * N and all(e.synthetic and e.payload.get("synthetic") is True for e in l3)
    assert all(e.synthetic and e.correlation_id for e in ledger.evidence.values())
    want = ledger.snapshot()
    assert Ledger(p).snapshot() == want  # restart readback identical


def test_kineto_is_valid_chrome_trace_with_flow_links(tmp_path: Path) -> None:
    bundle = generate(SEED, "bw_pressure", N)
    p = write_kineto_json(bundle, tmp_path / "trace.json")
    doc = json.loads(p.read_text(encoding="utf-8"))
    evs = doc["traceEvents"]
    assert evs and all({"ph", "ts", "pid", "tid", "name"} <= set(e) for e in evs)
    cids = {g["correlation_id"] for g in bundle["gpu_kernel"]}
    starts = [e for e in evs if e["ph"] == "s"]
    ends = [e for e in evs if e["ph"] == "f"]
    assert starts and len(starts) == len(ends) == N
    assert {e["id"] for e in starts} == {e["id"] for e in ends} == cids
    cpu = {e["args"]["correlation_id"] for e in evs if e["ph"] == "X" and e["cat"] == "cuda_api"}
    gpu = {e["args"]["correlation_id"] for e in evs if e["ph"] == "X" and e["cat"] == "kernel"}
    assert cpu == gpu == cids  # every CPU launch linked to its GPU kernel
    assert doc["displayTimeUnit"] == "us"  # classic chrome-trace clock, not ns
    assert max(e["ts"] for e in evs) < max(g["start_ns"] for g in bundle["gpu_kernel"])


def test_nsys_subset_mirrors_cupti_tables(tmp_path: Path) -> None:
    bundle = generate(SEED, "transfer_heavy", N)
    p = write_nsys_sqlite(bundle, tmp_path / "subset.db")
    con = sqlite3.connect(str(p))
    try:
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"CUPTI_ACTIVITY_KIND_KERNEL", "CUPTI_ACTIVITY_KIND_MEMCPY",
                "CUPTI_ACTIVITY_KIND_CUDA_API"} <= tables
        cols = {r[1] for r in con.execute("PRAGMA table_info(CUPTI_ACTIVITY_KIND_KERNEL)")}
        assert {"correlation_id", "stream_id", "device_id", "kernel_name",
                "start_ns", "end_ns", "synthetic"} <= cols
        n_k = con.execute("SELECT COUNT(*) FROM CUPTI_ACTIVITY_KIND_KERNEL").fetchone()[0]
        n_m = con.execute("SELECT COUNT(*) FROM CUPTI_ACTIVITY_KIND_MEMCPY").fetchone()[0]
        n_a = con.execute("SELECT COUNT(*) FROM CUPTI_ACTIVITY_KIND_CUDA_API").fetchone()[0]
        assert (n_k, n_m, n_a) == (N, N, N)
        assert con.execute("SELECT COUNT(*) FROM CUPTI_ACTIVITY_KIND_KERNEL WHERE synthetic != 1").fetchone()[0] == 0
        joins = con.execute("""SELECT COUNT(*) FROM CUPTI_ACTIVITY_KIND_KERNEL k
            JOIN CUPTI_ACTIVITY_KIND_CUDA_API a USING (correlation_id)""").fetchone()[0]
        assert joins == N  # correlation IDs join host launch to device activity
    finally:
        con.close()


def test_knob_specificity_not_aliased() -> None:
    """A swapped knob mapping must fail: each fault moves its own metric only."""
    M = 32
    healthy = generate(SEED, "healthy", M)
    h_dur = _mean([g["dur_ns"] for g in healthy["gpu_kernel"]])
    h_gap = _mean([g["launch_gap_ns"] for g in healthy["gpu_kernel"]])
    bw = generate(SEED, "bw_pressure", M)
    assert _mean([g["dur_ns"] for g in bw["gpu_kernel"]]) > h_dur
    assert _mean([g["launch_gap_ns"] for g in bw["gpu_kernel"]]) == h_gap  # same draws, gap untouched
    lo = generate(SEED, "launch_overhead", M)
    assert _mean([g["launch_gap_ns"] for g in lo["gpu_kernel"]]) > h_gap
    assert _mean([g["dur_ns"] for g in lo["gpu_kernel"]]) == h_dur  # same draws, dur untouched
    starve = generate(SEED, "cpu_starvation", M)
    assert _cpu_dur(starve) == _cpu_dur(healthy)  # starve delays issue, not CPU work itself
    assert _cpu_gap(starve) > _cpu_gap(healthy)


def test_all_presets_validate_and_flagged(tmp_path: Path) -> None:
    for name in PRESETS:
        p = tmp_path / f"{name}.jsonl"
        ledger = Ledger(p)
        traces = to_ledger(generate(SEED, name, N), ledger)
        assert len(traces) == N, name
        assert all(t.synthetic for t in traces), name
        assert all(e.synthetic and e.correlation_id for e in ledger.evidence.values()), name
        assert Ledger(p).snapshot() == ledger.snapshot(), name  # restart readback per preset


def test_sqlite_diverges_and_mirrors_values(tmp_path: Path) -> None:
    a = generate(SEED, "transfer_heavy", N)
    c = generate(SEED + 1, "transfer_heavy", N)
    pa, pc = tmp_path / "a.db", tmp_path / "c.db"
    write_nsys_sqlite(a, pa)
    write_nsys_sqlite(c, pc)
    assert pa.read_bytes() != pc.read_bytes()
    con = sqlite3.connect(str(pa))
    try:
        for g in a["gpu_kernel"]:
            row = con.execute("""SELECT duration_ns, start_ns, end_ns FROM CUPTI_ACTIVITY_KIND_KERNEL
                WHERE correlation_id = ?""", (g["correlation_id"],)).fetchone()
            assert tuple(row) == (g["dur_ns"], g["start_ns"], g["end_ns"])
        for t in a["transfer"]:
            n = con.execute("SELECT bytes FROM CUPTI_ACTIVITY_KIND_MEMCPY WHERE correlation_id = ?",
                            (t["correlation_id"],)).fetchone()[0]
            assert n == t["bytes"]
    finally:
        con.close()
