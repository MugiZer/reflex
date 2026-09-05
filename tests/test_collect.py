"""Collector proofs: kill-safety, checksums, resume, idempotent ingest, converters."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import collect as C


def _kineto_doc(fault, seed, n=4):
    # hand-built real-shaped doc per research/telemetry-adapters.md §3
    # (integer-us ts/dur, real cats, External-id, pid=device/tid=stream) —
    # never writer output, so converter proofs are not circular.
    evs = []
    for i in range(n):
        cid = f"{seed:08x}-{i:04d}"
        t = 1000 * i
        evs.append({"name": "cudaLaunchKernel", "cat": "cuda_runtime", "ph": "X",
                    "ts": t, "dur": 3, "pid": 1000, "tid": 1,
                    "args": {"External id": cid, "stream": 1}})
        evs.append({"name": "launch->kernel", "ph": "s",
                    "ts": t, "pid": 1000, "tid": 1, "id": i,
                    "args": {"External id": cid}})
        evs.append({"name": "k", "cat": "kernel", "ph": "X", "ts": t + 1,
                    "dur": 9, "pid": 0, "tid": 1,
                    "args": {"External id": cid}})
        evs.append({"name": "launch->kernel", "ph": "f",
                    "ts": t + 1, "pid": 0, "tid": 1, "id": i, "bp": "e",
                    "args": {"External id": cid}})
    return {"traceEvents": evs, "seed": seed, "fault": fault}


def _device(fault, seed):
    return {"trace.json": json.dumps(_kineto_doc(fault, seed)).encode()}


def test_kill_claims_nothing_then_resume_completes(tmp_path):
    root = tmp_path / "runs"
    out = C.collect(root, ("stalls",), (7,), device=_boom)
    assert out["done"] == [] and list(out["failed"]) == [("stalls", 7)]
    d = C.run_dir(root, "stalls", 7)
    assert (d / "manifest.json").exists()  # manifest-first: identity survives
    assert not (d / "DONE").exists()  # nothing claimed
    assert C.scan_todo(root, ("stalls",), (7,)) == [("stalls", 7)]
    out = C.collect(root, ("stalls",), (7,), device=_device)
    assert out["done"] == [("stalls", 7)] and not out["failed"]
    assert C.is_done(root, "stalls", 7)
    assert C.scan_todo(root, ("stalls",), (7,)) == []


def _boom(fault, seed):
    raise RuntimeError("colab preempted mid-run")


def test_tamper_invalidates_done_and_resume_repairs(tmp_path):
    root = tmp_path / "runs"
    C.collect(root, ("stalls",), (7,), device=_device)
    assert C.is_done(root, "stalls", 7)
    p = C.run_dir(root, "stalls", 7) / "trace.json"
    raw = bytearray(p.read_bytes())
    raw[100] ^= 0xFF  # single flipped byte on disk
    p.write_bytes(bytes(raw))
    assert not C.is_done(root, "stalls", 7)  # checksum gate catches it
    assert C.scan_todo(root, ("stalls",), (7,)) == [("stalls", 7)]
    C.collect(root, ("stalls",), (7,), device=_device)
    assert C.is_done(root, "stalls", 7)


def test_ingest_idempotent_and_rejects_corrupt(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("healthy", "stalls"), (7,), device=_device)
    first = C.ingest(root, ds)
    assert sorted(first["accepted"]) == ["healthy:7", "stalls:7"]
    assert first["rejected"] == {}
    again = C.ingest(root, ds)
    assert again["accepted"] == []  # idempotent: run_ids already present
    assert len(ds.read_text(encoding="utf-8").splitlines()) == 2
    C.collect(root, ("bw_pressure",), (8,),
              device=lambda f, s: {"trace.json": b"not json{{{"})
    bad = C.ingest(root, ds)  # transport-intact (checksums pass) but schema-invalid
    assert list(bad["rejected"]) == ["bw_pressure:8"]
    assert len(ds.read_text(encoding="utf-8").splitlines()) == 2  # dataset unchanged


def test_converters_real_shapes(tmp_path):
    b = C.kineto_to_bundle(_kineto_doc("stalls", 7))
    assert len(b["cpu_launch"]) == len(b["gpu_kernel"]) == 4
    assert b["flow_ids"] == sorted({g["correlation_id"] for g in b["gpu_kernel"]})
    assert b["synthetic"] is False
    broken = _kineto_doc("stalls", 7)
    del broken["traceEvents"][0]["ts"]
    with pytest.raises(ValueError):
        C.kineto_to_bundle(broken)  # missing required Chrome-trace field
    from reflex.fakegpu import generate, write_nsys_sqlite
    bundle = generate(7, "transfer_heavy", 4)
    db = tmp_path / "subset.db"
    write_nsys_sqlite(bundle, db)  # real writer output, not a hand mock
    back = C.nsys_subset_to_bundle(db)
    assert [g["correlation_id"] for g in back["gpu_kernel"]] == \
        [g["correlation_id"] for g in bundle["gpu_kernel"]]
    assert [g["duration_ns"] for g in back["gpu_kernel"]] == \
        [g["dur_ns"] for g in bundle["gpu_kernel"]]
    assert [t["bytes"] for t in back["transfer"]] == \
        [t["bytes"] for t in bundle["transfer"]]


def test_kineto_real_shape_us_frac_and_mapping():
    # hand-built real shape per research/telemetry-adapters.md §3: us-frac
    # string ts, External-id linkage, real cats, pid=device/tid=stream.
    doc = {"traceEvents": [
        {"name": "cudaLaunchKernel", "cat": "cuda_runtime", "ph": "X",
         "ts": "1000.500", "dur": "3.250", "pid": 1000, "tid": 1,
         "args": {"External id": 42, "stream": 7}},
        {"name": "launch->kernel", "ph": "s", "ts": "1000.500",
         "pid": 1000, "tid": 1, "id": 0, "args": {"External id": 42}},
        {"name": "attn_kernel", "cat": "kernel", "ph": "X",
         "ts": "1001.250", "dur": 9, "pid": 0, "tid": 7,
         "args": {"External id": 42}},
        {"name": "launch->kernel", "ph": "f", "ts": "1001.250",
         "pid": 0, "tid": 7, "id": 0, "bp": "e", "args": {"External id": 42}},
        {"name": "Memcpy HtoD", "cat": "gpu_memcpy", "ph": "X",
         "ts": "1001.500", "dur": 2, "pid": 0, "tid": 7,
         "args": {"External id": 42, "bytes": 4096}},
        {"name": "cudaStreamSynchronize", "cat": "cuda_sync", "ph": "X",
         "ts": 1010, "dur": 5, "pid": 1000, "tid": 1,
         "args": {"External id": 42}},
        {"name": "orphan", "cat": "kernel", "ph": "X",  # missing dur tolerated
         "ts": 1020, "pid": 0, "tid": 7, "args": {"External id": 43}},
    ]}
    b = C.kineto_to_bundle(doc)
    assert [c["correlation_id"] for c in b["cpu_launch"]] == ["42"]
    assert b["cpu_launch"][0]["start_ns"] == 1000500
    assert b["cpu_launch"][0]["dur_ns"] == 3250
    assert b["gpu_kernel"][0]["device_id"] == 0 and b["gpu_kernel"][0]["stream_id"] == 7
    assert b["transfer"][0]["args"]["bytes"] == 4096
    assert len(b["sync_edge"]) == 1
    assert b["gpu_kernel"][1]["dur_ns"] == 0  # missing optional dur -> 0
    assert sorted(b["flow_ids"]) == ["42", "43"]
    # flow-id fallback: s without External id still lands via top-level id
    fb = {"traceEvents": [{"name": "launch->kernel", "ph": "s", "ts": 5,
                           "pid": 1000, "tid": 1, "id": 99}]}
    assert C.kineto_to_bundle(fb)["flow_ids"] == ["99"]
    # required fields raise; optional (dur/args/cat) never raise
    for key in ("ts", "pid", "tid", "name", "ph"):
        bad = {"traceEvents": [dict(
            {"name": "k", "cat": "kernel", "ph": "X", "ts": 1,
             "pid": 0, "tid": 1, "args": {"External id": 1}}, **{})]}
        del bad["traceEvents"][0][key]
        with pytest.raises(ValueError):
            C.kineto_to_bundle(bad)


def test_kineto_writer_round_trip_and_dialect_removed(tmp_path):
    from reflex.fakegpu import generate, write_kineto_json
    import json as _json
    bundle = generate(7, "healthy", 4)
    doc = _json.loads(write_kineto_json(
        bundle, tmp_path / "w.json").read_text(encoding="utf-8"))
    back = C.kineto_to_bundle(doc)  # one dialect: own output re-parses
    cids = [g["correlation_id"] for g in bundle["gpu_kernel"]]
    assert [g["correlation_id"] for g in back["gpu_kernel"]] == cids
    assert sorted(back["flow_ids"]) == sorted(set(cids))
    assert not any(e.get("cat") in {"cuda_api", "memcpy", "sync", "flow"}
                   for e in doc["traceEvents"])  # old dialect gone
    old = {"traceEvents": [
        {"name": "k[launch]", "cat": "cuda_api", "ph": "X", "ts": 1000,
         "dur": 3, "pid": 1, "tid": 1, "args": {"correlation_id": "x"}}]}
    assert C.kineto_to_bundle(old)["cpu_launch"] == []  # rejected by absence


def test_manifest_software_stats_through_ingest(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    m = C.manifest("stalls", 7)  # unknown-tolerant defaults
    assert m["software"] == {"torch": "unknown", "cuda": "unknown",
                             "driver": "unknown", "nsys": "unknown"}
    assert m["stats"] == {"dropped_records": 0, "correlation_misses": 0}
    C.collect(root, ("stalls",), (7,), device=_device,
              software={"torch": "2.2", "cuda": "12.1",
                        "driver": "535", "nsys": "2024.5"},
              stats={"dropped_records": 2, "correlation_misses": 1})
    assert C.ingest(root, ds)["accepted"] == ["stalls:7"]
    rec = json.loads(ds.read_text(encoding="utf-8").splitlines()[0])
    assert rec["manifest"]["software"] == {"torch": "2.2", "cuda": "12.1",
                                           "driver": "535", "nsys": "2024.5"}
    assert rec["manifest"]["stats"] == {"dropped_records": 2,
                                        "correlation_misses": 1}


def test_pair_corpus_needs_healthy(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    ident = lambda: {"device": "d", "hardware": "h", "driver": "r", "cuda": "c",
                     "collector_version": C.COLLECTOR_VERSION}
    C.collect(root, ("healthy", "stalls", "bw_pressure"), (7,), device=_device,
              identity_provider=ident)
    C.collect(root, ("stalls",), (8,), device=_device,
              identity_provider=ident)  # orphan: no healthy:8
    C.ingest(root, ds)
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    pairs = C.pair_corpus(recs)
    hw = recs[0]["manifest"]["hardware"]  # derived, not a literal identity
    assert sorted(pairs) == sorted([f"bw_pressure:7@{hw}", f"stalls:7@{hw}"])
    assert pairs[f"stalls:7@{hw}"]["faulty"]["flow_ids"]


def test_pair_corpus_never_pairs_unknown_hardware(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("healthy", "stalls"), (7,), device=_device)  # default: unknown hw
    C.ingest(root, ds)
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    assert len(recs) == 2  # ingest accepts (transport integrity holds)
    assert C.pair_corpus(recs) == {}  # ...but unknown provenance never pairs


def test_identity_provider_capture_and_ingest(tmp_path):
    def fake_ident():  # literals live only here; asserts compare via exp
        return {"device": "dev-fake-1", "hardware": "hw-fake-1",
                "driver": "drv-fake-1", "cuda": "cu-fake-1",
                "collector_version": "cv-fake-1"}

    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("stalls",), (7,), device=_device,
              identity_provider=fake_ident)
    man = json.loads((C.run_dir(root, "stalls", 7) / "manifest.json")
                     .read_text(encoding="utf-8"))
    exp = fake_ident()
    for k in ("device", "hardware", "driver", "cuda", "collector_version"):
        assert man[k] == exp[k]
    out = C.ingest(root, ds)
    assert out["accepted"] == ["stalls:7"] and out["rejected"] == {}
    rec = json.loads(ds.read_text(encoding="utf-8").splitlines()[0])
    for k in ("device", "hardware", "driver", "cuda", "collector_version"):
        assert rec["manifest"][k] == exp[k]


def test_ingest_rejects_identity_less_manifest(tmp_path):
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("stalls",), (7,), device=_device)
    assert C.is_done(root, "stalls", 7)
    mp = C.run_dir(root, "stalls", 7) / "manifest.json"
    man = json.loads(mp.read_text(encoding="utf-8"))
    for k in ("hardware", "driver", "cuda"):  # real manifest, fields stripped
        man.pop(k)
    mp.write_text(json.dumps(man), encoding="utf-8")
    assert C.is_done(root, "stalls", 7)  # gate is artifact-side, still DONE
    out = C.ingest(root, ds)
    assert out["accepted"] == [] and list(out["rejected"]) == ["stalls:7"]
    assert "missing" in out["rejected"]["stalls:7"].lower()
    assert not ds.exists()  # nothing pooled


def test_coverage_gaps_fill_and_requery(tmp_path):
    import itertools

    def _prov(hw, ver):
        def p():
            return {"device": "dev-" + hw, "hardware": hw,
                    "driver": "drv", "cuda": "cu",
                    "collector_version": ver}
        return p

    pa1, pa2 = _prov("hw-A", "cv-1"), _prov("hw-A", "cv-2")
    pb1, pb2 = _prov("hw-B", "cv-1"), _prov("hw-B", "cv-2")
    hA, v1 = pa1()["hardware"], pa1()["collector_version"]
    hB, v2 = pb2()["hardware"], pb2()["collector_version"]
    target = list(itertools.product(["stalls"], [hA, hB], [v1, v2]))
    assert sorted(C.coverage_gaps(target, [])) == sorted(target)  # all missing
    root, ds = tmp_path / "runs", tmp_path / "dataset.jsonl"
    C.collect(root, ("stalls",), (7,), device=_device, identity_provider=pa1)
    C.collect(root, ("stalls",), (8,), device=_device, identity_provider=pa2)
    C.ingest(root, ds)
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    assert sorted(C.coverage_gaps(target, recs)) == sorted(
        [("stalls", hB, v1), ("stalls", hB, v2)])  # exactly the unfilled cells
    C.collect(root, ("stalls",), (9,), device=_device, identity_provider=pb1)
    C.collect(root, ("stalls",), (10,), device=_device, identity_provider=pb2)
    C.ingest(root, ds)  # append-only: picks up just the new seeds
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    assert C.coverage_gaps(target, recs) == []  # filled for real -> empty


def test_pair_corpus_never_pairs_across_hardware(tmp_path):
    def provA():
        return {"device": "dev-A", "hardware": "hw-A", "driver": "drv",
                "cuda": "cu", "collector_version": "cv-1"}

    def provB():
        return {"device": "dev-B", "hardware": "hw-B", "driver": "drv",
                "cuda": "cu", "collector_version": "cv-1"}

    def devA(f, s):
        return {"trace.json": json.dumps(_kineto_doc(f, s, n=4)).encode()}

    def devB(f, s):
        return {"trace.json": json.dumps(_kineto_doc(f, s, n=6)).encode()}

    hA, hB = provA()["hardware"], provB()["hardware"]
    ds = tmp_path / "dataset.jsonl"
    rA, rB = tmp_path / "runsA", tmp_path / "runsB"
    C.collect(rA, ("healthy", "stalls"), (7,), device=devA,
              identity_provider=provA)
    C.collect(rB, ("healthy", "stalls"), (7,), device=devB,
              identity_provider=provB)
    assert len(C.ingest(rA, ds)["accepted"]) == 2
    assert len(C.ingest(rB, ds)["accepted"]) == 2  # same fault:seed, other card
    recs = [json.loads(ln) for ln in ds.read_text(encoding="utf-8").splitlines()]
    assert len(recs) == 4  # both cards pooled, neither dropped
    pairs = C.pair_corpus(recs)
    assert sorted(pairs) == sorted([f"stalls:7@{hA}", f"stalls:7@{hB}"])
    for k, v in pairs.items():  # key hardware always matches pair hardware
        assert k.endswith("@" + v["hardware"])
    # content proves within-card pairing, not just key shape
    assert len(pairs[f"stalls:7@{hA}"]["faulty"]["gpu_kernel"]) == 4
    assert len(pairs[f"stalls:7@{hA}"]["healthy"]["gpu_kernel"]) == 4
    assert len(pairs[f"stalls:7@{hB}"]["faulty"]["gpu_kernel"]) == 6
    assert len(pairs[f"stalls:7@{hB}"]["healthy"]["gpu_kernel"]) == 6
    # exclusion: complementary faults split across cards never pair
    ds2 = tmp_path / "dataset2.jsonl"
    rC, rD = tmp_path / "runsC", tmp_path / "runsD"
    C.collect(rC, ("healthy",), (7,), device=devA, identity_provider=provA)
    C.collect(rD, ("stalls",), (7,), device=devB, identity_provider=provB)
    C.ingest(rC, ds2)
    C.ingest(rD, ds2)
    recs2 = [json.loads(ln) for ln in ds2.read_text(encoding="utf-8").splitlines()]
    assert C.pair_corpus(recs2) == {}  # same seed, different hardware: no pair


def test_nsys_command_builder():
    cmd = C.nsys_command(["python", "workload.py", "--n", "8"], "/out/run1")
    assert cmd[:4] == ["nsys", "profile", "--trace=cuda,nvtx,osrt", "--export=sqlite"]
    assert "--sample=none" in cmd and "--cpuctxsw=none" in cmd  # inference hygiene
    assert "--cudabacktrace=none" in cmd and "--cuda-memory-usage=false" in cmd
    assert cmd[-4:] == ["python", "workload.py", "--n", "8"]
    assert any(a.startswith("--output=/out/run1") for a in cmd)
    nvtx = C.nsys_command(["python", "w.py"], "/o", capture="nvtx")
    assert "--capture-range=nvtx" in nvtx and "--nvtx-capture=request@*" in nvtx


def test_real_nsys_schema_parses(tmp_path):
    # hand-built camelCase + StringIds per research/telemetry-adapters.md §2
    # (correlationId/deviceId/streamId, kernel names via nameId -> StringIds)
    # — never via our writer, so this is not circular.
    import sqlite3
    db = tmp_path / "real.db"
    con = sqlite3.connect(str(db))
    con.execute("CREATE TABLE StringIds (id INTEGER PRIMARY KEY, value TEXT)")
    con.execute("CREATE TABLE CUPTI_ACTIVITY_KIND_RUNTIME "
                "(start INTEGER, end INTEGER, globalTid INTEGER, "
                "correlationId INTEGER, nameId INTEGER)")
    con.execute("CREATE TABLE CUPTI_ACTIVITY_KIND_KERNEL "
                "(start INTEGER, end INTEGER, deviceId INTEGER, streamId INTEGER, "
                "correlationId INTEGER, nameId INTEGER, gridX INTEGER, blockX INTEGER)")
    con.execute("CREATE TABLE CUPTI_ACTIVITY_KIND_MEMCPY "
                "(start INTEGER, end INTEGER, deviceId INTEGER, streamId INTEGER, "
                "correlationId INTEGER, bytes INTEGER, copyKind INTEGER)")
    con.execute("CREATE TABLE CUPTI_ACTIVITY_KIND_SYNCHRONIZATION "
                "(start INTEGER, end INTEGER, streamId INTEGER, "
                "correlationId INTEGER, syncType INTEGER)")
    con.executemany("INSERT INTO StringIds VALUES (?, ?)",
                    [(7, "cudaLaunchKernel"), (9, "attn_kernel")])
    con.execute("INSERT INTO CUPTI_ACTIVITY_KIND_RUNTIME VALUES (1000, 1010, 55, 42, 7)")
    con.execute("INSERT INTO CUPTI_ACTIVITY_KIND_KERNEL VALUES "
                "(1100, 1200, 0, 3, 42, 9, 128, 256)")
    con.execute("INSERT INTO CUPTI_ACTIVITY_KIND_MEMCPY VALUES "
                "(1100, 1150, 0, 3, 43, 4096, 1)")
    con.execute("INSERT INTO CUPTI_ACTIVITY_KIND_SYNCHRONIZATION VALUES "
                "(1200, 1260, 3, 42, 2)")
    con.execute("INSERT INTO CUPTI_ACTIVITY_KIND_KERNEL VALUES "
                "(1300, 1350, 0, 3, NULL, 9, 64, 256)")  # uncorrelated: skipped
    con.commit()
    con.close()
    b = C.nsys_subset_to_bundle(db)
    assert [g["correlation_id"] for g in b["gpu_kernel"]] == ["42"]
    assert b["gpu_kernel"][0]["kernel_name"] == "attn_kernel"  # via StringIds
    assert b["gpu_kernel"][0]["dur_ns"] == 100  # end-start, not a stored column
    assert b["gpu_kernel"][0]["stream_id"] == 3
    assert b["transfer"][0]["kind"] == "HtoD"  # copyKind 1 mapped
    assert b["transfer"][0]["bytes"] == 4096
    assert b["cpu_launch"][0]["api_name"] == "cudaLaunchKernel"
    assert b["sync_edge"][0]["blocked_ns"] == 60
    assert b["synthetic"] is False


def _boom(fault, seed):
    raise RuntimeError("colab preempted mid-run")


def test_execution_and_context_identity(tmp_path):
    root = tmp_path / "runs"
    ident = lambda: {"device": "d", "hardware": "h", "driver": "r", "cuda": "c",
                     "collector_version": C.COLLECTOR_VERSION}
    C.collect(root, ("stalls",), (7,), device=_boom,
              identity_provider=ident)  # dies mid-run: attempt 1 manifest only
    m1 = json.loads((C.run_dir(root, "stalls", 7) / "manifest.json").read_text())
    assert not (C.run_dir(root, "stalls", 7) / "DONE").exists()
    C.collect(root, ("stalls",), (7,), device=_device,
              identity_provider=ident)  # resume completes: manifest rewritten
    m2 = json.loads((C.run_dir(root, "stalls", 7) / "manifest.json").read_text())
    assert m1["execution_id"] != m2["execution_id"]  # every attempt unique...
    assert m1["context_id"] == m2["context_id"]  # ...same experimental context
    other = dict(ident())
    other["hardware"] = "h2"
    C.collect(root, ("stalls",), (9,), device=_device,
              identity_provider=lambda: other)
    m3 = json.loads((C.run_dir(root, "stalls", 9) / "manifest.json").read_text())
    assert m3["context_id"] != m1["context_id"]  # context follows hardware


def test_manifest_captures_nsys_provenance():
    m = C.manifest("stalls", 7, nsys_version="2025.3.1", trace_variant="cuda",
                   perf_status="sampling-unavailable")
    assert (m["nsys_version"], m["trace_variant"], m["perf_status"]) == \
        ("2025.3.1", "cuda", "sampling-unavailable")
    d = C.manifest("stalls", 7)
    assert (d["nsys_version"], d["trace_variant"], d["perf_status"]) == \
        ("unknown", "cuda", "unknown")
    extra = {"nsys_version": "2025.3.1", "k": "v"}
    e = C.manifest("stalls", 7, extra=extra)
    assert e["nsys_version"] == "2025.3.1" and e["extra"] == {"k": "v"}
    assert extra == {"nsys_version": "2025.3.1", "k": "v"}  # caller dict untouched


def test_converted_bundle_boundary_documented():
    # Converted bundles flow through structural consumers without crashing,
    # and carry machine-readable coverage so counter/tensor/stall attribution
    # can check instead of assuming fakegpu vocabulary.
    from reflex import reconstruct as _R, select as _S
    b = C.kineto_to_bundle(_kineto_doc("stalls", 7))
    assert b["coverage"] == {"timeline": True, "counters": False,
                             "stalls": False, "tensors": False}
    assert not b["coverage"]["counters"]  # counter attribution must check this
    _R.build_graph(b)
    assert _S.outcome_of("timeline", b) in ("host_hot", "host_ok")


def test_vendor_kineto_trace_parses_exactly():
    # Byte-identical excerpt of real torch 2.14 CPU-profiler output
    # (aten::linear + fwdbwd s/f pair + thread_name marker + iteration
    # marker); trimmed to 5 events, nothing rewritten.
    doc = json.loads(
        '{"traceEvents": ['
        '{"ph": "X", "cat": "cpu_op", "name": "aten::linear", '
        '"pid": 38464, "tid": 144, "ts": 5614722402701.262, "dur": 32725.3, '
        '"args": {"External id": 1, "Record function id": 0, '
        '"Sequence number": 0, '
        '"Input type": ["float", "float", "float"], "Ev Idx": 0, '
        '"Input Dims": [[32, 1024], [1024, 1024], [1024]], '
        '"Input Strides": [[1024, 1], [1024, 1], [1]], '
        '"Concrete Inputs": ["", "", ""], "Fwd thread id": 0}}, '
        '{"ph": "s", "id": 6, "pid": 38464, "tid": 144, '
        '"ts": 5614722404096.562, "cat": "fwdbwd", "name": "fwdbwd"}, '
        '{"ph": "f", "id": 1, "pid": 38464, "tid": 144, '
        '"ts": 5614722449302.962, "cat": "fwdbwd", "name": "fwdbwd", '
        '"bp": "e"}, '
        '{"ph": "M", "name": "thread_name", "ts": 5614722395183.6, '
        '"pid": 38464, "tid": 144, "args": {"name": "thread 144 ()"}}, '
        '{"ph": "i", "s": "g", "name": "Iteration Start: PyTorch Profiler", '
        '"pid": "Traces", "tid": "Trace PyTorch Profiler", '
        '"ts": 5614722392926.9}], '
        '"displayTimeUnit": "ms", '
        '"baseTimeNanoseconds": 1782967788000000000}')
    b = C.kineto_to_bundle(doc)
    assert len(b["cpu_launch"]) == 1  # M/i markers ignored, not misfiled
    rec = b["cpu_launch"][0]
    assert rec["correlation_id"] == "1"  # External id linkage, real vendor key
    assert rec["start_ns"] == 5614722402701262  # us.frac -> ns, exact
    assert rec["dur_ns"] == 32725300
    assert rec["name"] == "aten::linear"
    assert rec["args"]["Input Dims"] == [[32, 1024], [1024, 1024], [1024]]
    assert rec["args"]["Input Strides"] == [[1024, 1], [1024, 1], [1]]
