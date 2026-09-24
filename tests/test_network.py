"""Real loopback traffic and request evidence, without privileged netem."""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

from reflex.network import compare, run, stats


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
