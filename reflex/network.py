"""Small HTTP experiment for end-to-end inference latency evidence.

Durations are measured within one clock domain. Client and server monotonic
timestamps are retained for re-analysis but are never subtracted across hosts.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import platform
import random
import socket
import statistics
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .envelope import git_commit

VERSION = "network-v1"


def _quantile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * fraction
    lo = int(pos)
    return ordered[lo] + (ordered[min(lo + 1, len(ordered) - 1)] - ordered[lo]) * (pos - lo)


def stats(values: list[float]) -> dict:
    """Descriptive only; p99 needs enough requests to be useful."""
    p50, p95, p99 = (_quantile(values, p) for p in (0.5, 0.95, 0.99))
    return {"n": len(values), "p50_ms": p50,
            "mad_ms": statistics.median(abs(x - p50) for x in values) if values else None,
            "p95_ms": p95, "p99_ms": p99,
            "p95_minus_p50_ms": p95 - p50 if values else None,
            "p99_minus_p50_ms": p99 - p50 if values else None}


def _write_jsonl(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")


def server(host: str, port: int, response_bytes: int, log: Path | None = None) -> None:
    if not 0 < response_bytes <= 10_000_000:
        raise ValueError("response_bytes must be in 1..10000000")
    body = b"R" * response_bytes
    lock = threading.Lock()
    server_id = uuid.uuid4().hex

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            if self.path != "/infer":
                self.send_error(404)
                return
            request_id = self.headers.get("X-Request-Id", "")
            try:
                length = int(self.headers.get("Content-Length", "-1"))
                slow_ms = float(self.headers.get("X-Server-Slow-Ms", "0"))
                if not request_id or not 0 <= length <= 10_000_000 or not 0 <= slow_ms <= 10_000:
                    raise ValueError("invalid request")
            except ValueError:
                self.send_error(400)
                return
            handler_start_ns = time.monotonic_ns()
            payload = self.rfile.read(length)
            work_start_ns = time.monotonic_ns()
            if slow_ms:
                time.sleep(slow_ms / 1000)
            work_end_ns = time.monotonic_ns()
            sent_ns = None
            error = None
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-Request-Id", request_id)
                self.send_header("X-Server-Work-Ns", str(work_end_ns - work_start_ns))
                self.send_header("X-Server-Run-Id", server_id)
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()
                sent_ns = time.monotonic_ns()
            except (BrokenPipeError, ConnectionResetError) as exc:
                error = type(exc).__name__
            if log:
                row = {"request_id": request_id, "handler_start_ns": handler_start_ns,
                       "work_start_ns": work_start_ns, "work_end_ns": work_end_ns,
                       "sent_ns": sent_ns, "request_bytes": len(payload),
                       "response_bytes": len(body), "error": error,
                       "clock_domain": f"server:{socket.gethostname()}:{os.getpid()}:{server_id}"}
                with lock:
                    _write_jsonl(log, row)

        def log_message(self, fmt, *args):
            pass

    with ThreadingHTTPServer((host, port), Handler) as httpd:
        httpd.serve_forever()


def _request(host: str, port: int, request_id: str, payload: bytes,
             response_bytes: int, slow_ms: float, timeout_s: float) -> dict:
    row = {"request_id": request_id, "client_prepare_start_ns": time.monotonic_ns(),
           "client_send_start_ns": None, "client_receive_end_ns": None,
           "client_finish_ns": None, "server_work_ns": None,
           "server_id": None, "status": "error", "error": None}
    conn = None
    try:
        # The prepared payload is fixed per run; this interval still records
        # request setup and allows a future real encoder to replace it.
        headers = {"X-Request-Id": request_id, "X-Server-Slow-Ms": str(slow_ms)}
        row["client_send_start_ns"] = time.monotonic_ns()
        conn = http.client.HTTPConnection(host, port, timeout=timeout_s)
        conn.request("POST", "/infer", body=payload, headers=headers)
        response = conn.getresponse()
        reply = response.read()
        row["client_receive_end_ns"] = time.monotonic_ns()
        if response.status != 200 or response.getheader("X-Request-Id") != request_id:
            raise ValueError("response correlation/status mismatch")
        if reply != b"R" * response_bytes:
            raise ValueError("response body mismatch")
        row["response_bytes"] = len(reply)
        row["server_work_ns"] = int(response.getheader("X-Server-Work-Ns"))
        row["server_id"] = response.getheader("X-Server-Run-Id")
        if not row["server_id"]:
            raise ValueError("missing server identity")
        row["status"] = "ok"
    except (OSError, ValueError, http.client.HTTPException) as exc:
        row["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        row["client_finish_ns"] = time.monotonic_ns()
        if conn:
            conn.close()
    row["client_prepare_ns"] = row["client_send_start_ns"] - row["client_prepare_start_ns"]
    row["client_rtt_ns"] = (row["client_receive_end_ns"] - row["client_send_start_ns"]
                            if row["client_receive_end_ns"] else None)
    row["client_total_ns"] = row["client_finish_ns"] - row["client_prepare_start_ns"]
    # This remainder includes transport, server ingress/egress, and any
    # unmeasured server work. It is never described as one-way network time.
    row["unobserved_rtt_ns"] = (max(0, row["client_rtt_ns"] - row["server_work_ns"])
                                 if row["client_rtt_ns"] is not None and row["server_work_ns"] is not None else None)
    return row


def run(host: str, port: int, out: Path, phase: str, seed: int, requests: int,
        request_bytes: int, response_bytes: int, timeout_s: float,
        slow_every: int = 0, slow_ms: float = 0) -> dict:
    if requests < 1 or not 0 <= request_bytes <= 10_000_000 or not 0 < response_bytes <= 10_000_000:
        raise ValueError("invalid workload size")
    if slow_every < 0 or slow_ms < 0 or (slow_ms and not slow_every):
        raise ValueError("invalid server slowdown")
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{phase}.jsonl"
    if path.exists():
        raise FileExistsError(path)
    payload = random.Random(seed).randbytes(request_bytes)
    context = {"collector_version": VERSION, "host": host, "port": port,
               "seed": seed, "requests": requests, "request_bytes": request_bytes,
               "response_bytes": response_bytes, "payload_sha256": hashlib.sha256(payload).hexdigest(),
               "timeout_s": timeout_s, "client_host": socket.gethostname(),
               "platform": platform.platform(), "python": platform.python_version(),
               "commit": git_commit()}
    rows = []
    for i in range(requests):
        row = _request(host, port, f"{seed}:{phase}:{i}", payload, response_bytes,
                       slow_ms if slow_every and i % slow_every == 0 else 0, timeout_s)
        row["index"] = i
        row["phase"] = phase
        row["clock_domain"] = f"client:{context['client_host']}:{phase}:{seed}"
        _write_jsonl(path, row)
        rows.append(row)
    summary = summarize(rows)
    server_ids = {r["server_id"] for r in rows if r["server_id"]}
    context["server_id"] = next(iter(server_ids)) if len(server_ids) == 1 else None
    if len(server_ids) > 1:
        raise ValueError("server changed during run")
    doc = {"phase": phase, "context": context, "summary": summary,
           "requests_path": path.name, "server_slow_every": slow_every,
           "server_slow_ms": slow_ms,
           "path_model": {"client_prepare": "client clock",
                          "client_rtt": {"server_work": "server duration",
                                         "unobserved_rtt": "transport + ingress/egress + uninstrumented work"}},
           "clock_note": "Only same-endpoint durations are compared; no one-way latency is inferred. Completed-request percentiles exclude errors; attempt_total includes them."}
    (out / f"{phase}.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")
    return doc


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if r["status"] == "ok"]
    fields = ("client_prepare_ns", "client_rtt_ns", "server_work_ns",
              "unobserved_rtt_ns", "client_total_ns")
    return {"requests": len(rows), "completed": len(ok), "errors": len(rows) - len(ok),
            "attempt_total": stats([r["client_total_ns"] / 1e6 for r in rows]),
            **{field.removesuffix("_ns"): stats([r[field] / 1e6 for r in ok if r[field] is not None])
               for field in fields}}


def compare(healthy: Path, incident: Path) -> dict:
    a, b = (json.loads(p.read_text(encoding="utf-8")) for p in (healthy, incident))
    context_a, context_b = a["context"], b["context"]
    if not context_a.get("server_id") or not context_b.get("server_id"):
        raise ValueError("incomparable runs: server identity unobserved")
    keys = ("collector_version", "host", "port", "seed", "requests", "request_bytes",
            "response_bytes", "payload_sha256", "timeout_s", "client_host", "platform",
            "python", "commit", "server_id")
    mismatch = [key for key in keys if context_a[key] != context_b[key]]
    if mismatch:
        raise ValueError(f"incomparable runs: {', '.join(mismatch)}")
    return {"healthy": a["phase"], "incident": b["phase"], "context": context_a,
            "healthy_summary": a["summary"], "incident_summary": b["summary"],
            "delta_ms": {field: {metric: (b["summary"][field][metric] - a["summary"][field][metric]
                                            if a["summary"][field][metric] is not None and
                                            b["summary"][field][metric] is not None else None)
                                 for metric in ("p50_ms", "mad_ms", "p95_ms", "p99_ms",
                                                "p95_minus_p50_ms", "p99_minus_p50_ms")}
                         for field in ("attempt_total", "client_prepare", "client_rtt",
                                       "server_work", "unobserved_rtt", "client_total")},
            "unknown": "unobserved_rtt includes network and uninstrumented server intervals"}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--response-bytes", type=int, default=65536)
    p.add_argument("--log", type=Path)
    p = sub.add_parser("run")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--phase", required=True)
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--requests", type=int, default=200)
    p.add_argument("--request-bytes", type=int, default=1024)
    p.add_argument("--response-bytes", type=int, default=65536)
    p.add_argument("--timeout-s", type=float, default=5)
    p.add_argument("--server-slow-every", type=int, default=0)
    p.add_argument("--server-slow-ms", type=float, default=0)
    p = sub.add_parser("compare")
    p.add_argument("healthy", type=Path)
    p.add_argument("incident", type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "serve":
        server(args.host, args.port, args.response_bytes, args.log)
    elif args.cmd == "run":
        print(json.dumps(run(args.host, args.port, args.out, args.phase, args.seed,
                             args.requests, args.request_bytes, args.response_bytes,
                             args.timeout_s, args.server_slow_every,
                             args.server_slow_ms)["summary"], indent=2))
    else:
        print(json.dumps(compare(args.healthy, args.incident), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
