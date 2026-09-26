import json
import http.client
import socket
import subprocess
import sys
import time
from pathlib import Path

from scripts.network_smolvla_run import run_block
from reflex.ledger import Incident, Ledger
from reflex.network_capture import ingest_workload


def test_loopback_protocol_and_root_ingest(tmp_path):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    code = (
        "from pathlib import Path\n"
        "from scripts.network_smolvla_run import serve\n"
        "class Fake:\n"
        " def __call__(self, frame_id, deep=False):\n"
        "  return {'action': [[0.25]], 'action_sha256': 'real-test-action', "
        "'action_shape': [1, 1], 'cuda_device_ms': None, "
        "'preprocess_ns': 100, 'inference_postprocess_ns': 200}\n"
        f"serve('127.0.0.1', {port}, Path({str(tmp_path / 'server.jsonl')!r}), Fake())\n"
    )
    server = subprocess.Popen([sys.executable, "-c", code], cwd=Path(__file__).resolve().parents[1])
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.05)
        else:
            raise AssertionError("service did not become ready")
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
        body = json.dumps({"request_id": "direct", "frame_id": "f-1"}).encode()
        connection.request("POST", "/infer", body, {"X-Request-Id": "direct"})
        response = connection.getresponse()
        assert response.status == 200
        assert json.loads(response.read())["action"] == [[0.25]]
        connection.close()
        result = run_block("127.0.0.1", port, tmp_path, "healthy", ["f-1", "f-2"],
                           8, 2, 1024, 2.0, persistent=True, deep_every=4,
                           response_padding_bytes=128)
        assert result["population"]["counts"]["ok"] == 8
        manifest = json.loads((tmp_path / "healthy-manifest.json").read_text())
        assert "fault" not in json.dumps(manifest)
        rows = [json.loads(line) for line in (tmp_path / "healthy.jsonl").read_text().splitlines()]
        assert len({r["request_id"] for r in rows}) == 8
        assert all(r["action_sha256"] == "real-test-action" for r in rows)
        assert all(r["response_bytes"] >= 128 for r in rows)
        assert all(r["server_work_ns"] >= 0 for r in rows)
        for _ in range(100):
            server_rows = [json.loads(line) for line in (tmp_path / "server.jsonl").read_text().splitlines()]
            if len(server_rows) >= 9:
                break
            time.sleep(0.01)
        by_id = {r["request_id"]: r for r in server_rows}
        assert all(by_id[r["request_id"]]["action_sha256"] == r["action_sha256"] for r in rows)
        ledger = Ledger(tmp_path / "ledger.jsonl")
        ledger.open_incident(Incident(incident_id="smoke", domain="network", provenance="test"))
        assert ingest_workload(ledger, tmp_path / "healthy-manifest.json", "smoke", arm="reference")
    finally:
        server.terminate()
        server.wait(timeout=10)
