"""Real loopback traffic and request evidence, without privileged netem."""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

from reflex.network import compare, run, stats


def test_source_formats_and_fail_closed():
    import struct
    from reflex.network_capture import (parse_iw,parse_perf,parse_probe,parse_qlog,read_normalized,
                                        tcp_info,counter_delta,timestamp_controls,parse_tshark,TSHARK_FIELDS)
    from reflex.network_analysis import progress_view, mechanism_predictions
    fixtures = Path(__file__).parent / "fixtures" / "network"
    coverage={"complete":True,"drops":0}
    ap = dict((str(i),p) for i,(_,p) in enumerate(read_normalized(fixtures/"ap-events.jsonl")))
    view=progress_view(ap)
    assert {i["kind"]:i["duration"] for i in view["intervals"]} == {"link_assignment_wait":10,"access_wait":80}
    assert mechanism_predictions(ap)["wireless_access_wait"]["result"] == "supports"
    for row in ap.values(): row["coverage"]={"complete":False,"drops":None}
    assert mechanism_predictions(ap)["wireless_access_wait"]["result"] == "unresolved"
    assert len(list(parse_perf((fixtures/"perf.txt").read_text(),"p","clock",coverage))) == 2
    assert len(list(parse_probe((fixtures/"probe.txt").read_text(),"p",coverage))) == 2
    counters=parse_iw((fixtures/"iw.txt").read_text())
    assert counters["tx retries"]["value"] == 3
    assert counter_delta(counters,{"tx retries":{"value":1,"unit":"counter"}})["tx retries"] is None
    qlog=json.loads((fixtures/"qlog.json").read_text())
    assert len(list(parse_qlog(qlog,"q"))) == 3
    with pytest.raises(ValueError): list(parse_qlog({**qlog,"qlog_version":"99"},"q"))
    assert "snd_cwnd" not in tcp_info(bytes(8))
    assert tcp_info(bytes(104))["snd_cwnd"] == 0
    with pytest.raises(ValueError): tcp_info(bytes(7))
    raw=struct.pack("=qqqqqq",1,2,0,0,3,4)
    stamps=timestamp_controls(raw,"system","nic")
    assert [s["clock"] for s in stamps] == ["system","nic"]
    packet="\t".join(TSHARK_FIELDS)+"\n"+"\t".join(["1","123.4","100","1.1.1.1","2.2.2.2","0","4294967295","1","20","0x10",""])+"\n"
    assert len(list(parse_tshark(packet,"s","c",{},coverage))) == 1
    with pytest.raises(ValueError): list(parse_tshark("wrong\n","s","c",{},coverage))
    with pytest.raises(ValueError): list(parse_perf("truncated", "p","clock",coverage))


def test_qlog_cli_ingestion_retains_provenance_and_coverage(tmp_path):
    from reflex.network import main
    from reflex.ledger import Ledger
    path=tmp_path/"ledger"
    fixture=Path(__file__).parent/"fixtures"/"network"/"qlog.json"
    assert main(["ingest","--ledger",str(path),"--incident","i","--input",str(fixture),"--format","qlog"])==0
    ledger=Ledger(path)
    assert len([e for e in ledger.evidence.values() if e.kind=="event"])==3
    imported=next(e for e in ledger.evidence.values() if e.payload.get("kind")=="import_coverage")
    assert imported.payload["sha256"] and imported.payload["omitted"]==0


def test_hindsight_pin_selects_local_history_without_new_identity(tmp_path):
    from reflex.collect import begin_artifacts,finalize_artifacts
    from reflex.network_capture import capture,event,ingest,ingest_capture
    from reflex.ledger import Ledger,Incident
    source=tmp_path/"source"
    begin_artifacts(source,{"domain":"network"})
    rows=[event("boot",i,"clock",100+i,"consume") for i in range(4)]
    (source/"closed.jsonl").write_text("".join(json.dumps({"version":"network-v2","kind":"event","payload":p})+"\n" for p in rows))
    finalize_artifacts(source,["closed.jsonl"],coverage={"complete":False,"drops":None})
    config={"source_directory":str(source),"seconds":5,"max_bytes":4096,
            "pin_request":{"source_instance":"boot","segments":["closed.jsonl"],"sequence":[1,2]}}
    pinned=capture("normalized",config,tmp_path/"pin")
    assert pinned["status"]=="pinned"
    ledger=Ledger(tmp_path/"l")
    ledger.open_incident(Incident(incident_id="i",domain="network",provenance="test"))
    original=ingest(ledger,"event",rows[1],"i")
    assert original in ingest_capture(ledger,tmp_path/"pin","i")
    assert len([e for e in ledger.evidence.values() if e.kind=="event"])==2
    config["pin_request"]["sequence"]=[50,60]
    late=capture("normalized",config,tmp_path/"expired")
    assert late["status"]=="evidence expired or never recorded"


def test_persistent_scheduled_traffic_and_dispatch_loss(tmp_path):
    from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
    import threading
    class Handler(BaseHTTPRequestHandler):
        protocol_version="HTTP/1.1"
        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            time.sleep(.03)
            self.send_response(200)
            self.send_header("Content-Length","16")
            self.end_headers()
            self.wfile.write(b"R"*16)
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        result=run("127.0.0.1",server.server_port,tmp_path,"schedule",1,20,16,16,1,
                   persistent=True,concurrency=2,interval_s=.001,deadline_s=.01)
        assert result["summary"]["requests"] == 20
        assert result["summary"]["population"]["counts"]["not_submitted"] > 0
        assert result["summary"]["completed"] > 0
        assert result["context"]["server_id"] is None
        from reflex.network_capture import ingest_workload
        from reflex.ledger import Ledger,Incident
        ledger=Ledger(tmp_path/"ledger")
        ledger.open_incident(Incident(incident_id="i",provenance="test",domain="network"))
        ingest_workload(ledger,tmp_path/"schedule-manifest.json","i",arm="current")
        population=next(e for e in ledger.evidence.values() if e.kind=="population")
        assert population.payload["summary"]["counts"]["eligible"] == 20
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.parametrize("fault",["loss","queue","cpu","route","bandwidth","reverse","queue-loss","novel"])
def test_linux_namespace_incidents(tmp_path,fault):
    import os
    import shutil
    if sys.platform != "linux" or not hasattr(os,"geteuid") or os.geteuid()!=0:
        pytest.skip("privileged Linux network namespace integration unavailable")
    if any(shutil.which(tool) is None for tool in ("ip","tc","bash","python3","taskset")):
        pytest.skip("required Linux namespace tools unavailable")
    root=Path(__file__).resolve().parents[1]
    result=subprocess.run(["bash",str(root/"scripts/network_experiment.sh"),fault,str(tmp_path/"run"),"8"],
                           cwd=root,capture_output=True,text=True,timeout=180)
    assert result.returncode == 0,result.stderr
    assert (tmp_path/"run/private/fault.txt").exists()
    assert not (tmp_path/"run/fault.txt").exists()
    summary=json.loads((tmp_path/"run/incident.json").read_text())
    assert summary["summary"]["requests"] == 8
    diagnosis=json.loads((tmp_path/"run/diagnosis.json").read_text())
    assert diagnosis["closure"]["open_world"] and all(c["level"] != "VERIFIED" for c in diagnosis["claims"])


@pytest.mark.parametrize("source",["AP","NIC","INFRASTRUCTURE"])
def test_physical_normalized_source_profile(source):
    import os
    from reflex.network_capture import read_normalized
    configured=os.environ.get(f"ROOT_PHYSICAL_{source}_EXPORT")
    if not configured:
        pytest.skip(f"physical {source} source/export not supplied; fixtures are not physical validation")
    records=list(read_normalized(configured))
    assert any(kind=="source" and p["probe"]["status"]=="available" for kind,p in records)
    boundaries={p["boundary"] for kind,p in records if kind=="event"}
    required={"AP":{"eligible","link_assign","access"},"NIC":{"ingress","egress"},
              "INFRASTRUCTURE":{"queue_enqueue","queue_dequeue"}}[source]
    assert required <= boundaries


def test_capture_export_checksum_and_budget(tmp_path):
    from reflex.collect import begin_artifacts,finalize_artifacts
    from reflex.network_capture import export_capture,import_capture_stream,pin_closed_segments
    directory=tmp_path/"source"
    begin_artifacts(directory,{"domain":"network","version":"network-v2","profile":"route","source_id":"s"})
    (directory/"raw.txt").write_text("[]")
    finalize_artifacts(directory,["raw.txt"],coverage={"complete":False,"drops":None})
    lines=[]
    export_capture(directory,lines.append)
    copied=import_capture_stream(lines,tmp_path/"copy",100)
    assert copied["sha256"]
    with pytest.raises(ValueError,match="budget"):
        import_capture_stream(lines,tmp_path/"small",1)
    pinned=pin_closed_segments(directory,["raw.txt"],tmp_path/"pin",1)
    assert pinned["lost"] == ["raw.txt"]


def test_native_coverage_metadata_is_not_fabricated():
    from reflex.network_capture import source_coverage
    assert not source_coverage("packets","complete","","")["complete"]
    assert source_coverage("packets","complete","","(pcap:0,ifdrop:0)")["complete"]
    assert not source_coverage("packets","complete","","(pcap:2,ifdrop:0)")["complete"]
    assert source_coverage("probe","complete","state 1 2 3 4 5\n@events: 1\n","")["complete"]
    assert not source_coverage("probe","complete","state 1 2 3 4 5\n@events: 2\n","")["complete"]


def test_isolated_executor_requires_real_rate_readback_and_measured_washout(tmp_path):
    from reflex.network import IsolatedNetworkExecutor
    with pytest.raises(ValueError):
        IsolatedNetworkExecutor({"namespace":"production","interface":"eth0","directory":str(tmp_path)})
    executor=IsolatedNetworkExecutor({"namespace":"rootnet-123","interface":"rn-s-123","directory":str(tmp_path)})
    queues=[{"kind":"tbf","backlog":200,"options":{"rate":125000}}]
    commands=[]
    def command(args):
        commands.append(args)
        return json.dumps(queues)
    executor.command=command
    plan={"exposure":{"control":{"kind":"rate","bits_per_second":1_000_000}}}
    executor.apply(plan,0,"control")
    assert "1000000bit" in commands[-1]
    assert executor.readback(plan,0,"control") == plan["exposure"]["control"]
    queues[0]["options"]["rate"]=100
    assert executor.readback(plan,0,"control") != plan["exposure"]["control"]
    assert not executor.washout(plan,0,.03)
    queues[0]["backlog"]=0
    assert executor.washout(plan,0,.03)


def test_isolated_executor_keeps_censored_population_bounds(tmp_path,monkeypatch):
    from reflex.network import IsolatedNetworkExecutor
    executor=IsolatedNetworkExecutor({"namespace":"rootnet-123","interface":"rn-s-123",
                                      "directory":str(tmp_path),"host":"127.0.0.1","port":1})
    executor.current={"kind":"pacing","interval_s":.001}
    monkeypatch.setattr("reflex.network.run",lambda *a,**kw:{"summary":{"population":{"counts":
                         {"eligible":10,"missed":2,"unknown_deadline":6}}}})
    measured=executor.measure({"seed":1},0,"control")
    assert measured["outcome_bounds"]==[.2,.8]
    assert not measured["coverage"]["complete"]


def test_tail_stats():
    values = [1.0] * 99 + [101.0]
    got = stats(values)
    assert got["p50_ms"] == 1
    assert got["mad_ms"] == 0
    assert got["p99_ms"] > got["p95_ms"] == 1
    assert got["p99_minus_p50_ms"] > 0


def test_failed_requests_keep_censored_evidence(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        unused_port = sock.getsockname()[1]
    doc = run("127.0.0.1", unused_port, tmp_path, "failed", 1, 2, 16, 16, .1)
    assert doc["summary"]["errors"] == 2
    assert doc["summary"]["client_rtt"]["n"] == 0
    assert doc["summary"]["attempt_total"]["n"] == 2
    assert doc["context"]["server_id"] is None


def test_real_http_pair_and_server_control(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    root = Path(__file__).resolve().parents[1]
    log = tmp_path / "server.jsonl"
    proc = subprocess.Popen([sys.executable, "-m", "reflex.network", "serve",
                             "--port", str(port), "--response-bytes", "4096",
                             "--log", str(log)], cwd=root)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=.1):
                    break
            except OSError:
                time.sleep(.05)
        else:
            pytest.fail("server did not start")
        kw = dict(host="127.0.0.1", port=port, out=tmp_path, seed=19,
                  requests=20, request_bytes=128, response_bytes=4096, timeout_s=2)
        healthy = run(phase="healthy", **kw)
        incident = run(phase="incident", slow_every=5, slow_ms=40, **kw)
        recovery = run(phase="recovery", **kw)
        assert all(doc["summary"]["completed"] == 20 for doc in (healthy, incident, recovery))
        delta = compare(tmp_path / "healthy.json", tmp_path / "incident.json")
        assert delta["delta_ms"]["server_work"]["p99_ms"] > 20
        assert incident["summary"]["server_work"]["p50_ms"] < 20
        assert compare(tmp_path / "healthy.json", tmp_path / "recovery.json")["healthy"] == "healthy"
        rows = [json.loads(line) for line in (tmp_path / "incident.jsonl").read_text().splitlines()]
        server_rows = [json.loads(line) for line in log.read_text().splitlines()]
        assert {r["request_id"] for r in rows} <= {r["request_id"] for r in server_rows}
        assert all(r["client_rtt_ns"] >= r["server_work_ns"] >= 0 for r in rows)
        assert all(r["unobserved_rtt_ns"] == r["client_rtt_ns"] - r["server_work_ns"] for r in rows)
        assert all(r["clock_domain"].startswith("client:") for r in rows)
        assert all(r["clock_domain"].startswith("server:") for r in server_rows)
        changed = json.loads((tmp_path / "incident.json").read_text())
        changed["context"]["response_bytes"] = 99
        (tmp_path / "changed.json").write_text(json.dumps(changed))
        with pytest.raises(ValueError, match="incomparable runs"):
            compare(tmp_path / "healthy.json", tmp_path / "changed.json")
    finally:
        proc.terminate()
        proc.wait(timeout=5)
