"""Private, reproducible SmolVLA/T4 workload farm over a local TCP relay.

Relay impairments are application-level transport controls. They do not claim
kernel packet loss, physical route changes, or a separate client host.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import random
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from network_smolvla_run import SmolVLA, frames, run_block, serve
from reflex.collect import _sha256


def port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Relay:
    def __init__(self, upstream_port: int, relay_port: int, log: Path):
        self.upstream_port, self.log = upstream_port, log
        self.settings = {"forward_ms": 0, "reverse_ms": 0, "jitter_ms": 0,
                         "response_rate_bps": 0, "close_every": 0, "queue_ms": 0}
        self.count = 0
        self.lock = threading.Lock()
        relay = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_POST(self):
                rid = self.headers.get("X-Request-Id", "")
                length = int(self.headers.get("Content-Length", "-1"))
                if not rid or not 0 <= length <= 10_000_000:
                    self.send_error(400)
                    return
                ingress = time.monotonic_ns()
                body = self.rfile.read(length)
                with relay.lock:
                    relay.count += 1
                    number = relay.count
                    settings = dict(relay.settings)
                if settings["close_every"] and number % settings["close_every"] == 0:
                    self.close_connection = True
                    return
                rng = random.Random(rid)
                forward = max(0, settings["forward_ms"] + rng.uniform(
                    -settings["jitter_ms"], settings["jitter_ms"]))
                time.sleep((forward + settings["queue_ms"]) / 1000)
                conn = getattr(self, "upstream", None)
                if conn is None:
                    conn = http.client.HTTPConnection("127.0.0.1", relay.upstream_port, timeout=120)
                    self.upstream = conn
                try:
                    upstream_start = time.monotonic_ns()
                    conn.request("POST", "/infer", body,
                                 {"X-Request-Id": rid, "Connection": "keep-alive"})
                    response = conn.getresponse()
                    payload = response.read(10_000_001)
                    upstream_end = time.monotonic_ns()
                    time.sleep(max(0, settings["reverse_ms"] + rng.uniform(
                        -settings["jitter_ms"], settings["jitter_ms"])) / 1000)
                    response_start = time.monotonic_ns()
                    self.send_response(response.status)
                    self.send_header("Content-Length", str(len(payload)))
                    for header in ("X-Request-Id", "X-Server-Work-Ns", "X-Server-Run-Id"):
                        if response.getheader(header):
                            self.send_header(header, response.getheader(header))
                    self.end_headers()
                    rate = settings["response_rate_bps"]
                    for offset in range(0, len(payload), 1024):
                        chunk = payload[offset:offset + 1024]
                        self.wfile.write(chunk)
                        self.wfile.flush()
                        if rate:
                            time.sleep(len(chunk) * 8 / rate)
                    with relay.log.open("a", encoding="utf-8") as stream:
                        stream.write(json.dumps({"request_id": rid, "ingress_ns": ingress,
                                                 "upstream_start_ns": upstream_start,
                                                 "upstream_end_ns": upstream_end,
                                                 "response_write_start_ns": response_start,
                                                 "egress_ns": time.monotonic_ns(),
                                                 "bytes_in": len(body), "bytes_out": len(payload),
                                                 "clock_domain": "relay:local"}) + "\n")
                except (OSError, http.client.HTTPException, BrokenPipeError):
                    self.close_connection = True
                    conn.close()
                    self.upstream = None

            def finish(self):
                if getattr(self, "upstream", None):
                    self.upstream.close()
                super().finish()

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", relay_port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def set(self, settings: dict):
        with self.lock:
            self.settings = dict(settings)

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class Pressure:
    def __init__(self):
        self.stop = threading.Event()
        self.threads = []
        self.active = threading.Event()

    def start(self, gpu=False, cpu=False):
        self.close()
        if not (gpu or cpu):
            return
        self.stop = threading.Event()
        self.active = threading.Event()
        stop = self.stop

        def gpu_work():
            import torch
            a = torch.randn((6144, 6144), device="cuda")
            while not stop.is_set():
                a = a @ a
                torch.cuda.synchronize()
                self.active.set()
                a.clamp_(-1, 1)

        def cpu_work():
            value = 1
            while not stop.is_set():
                value = (value * 65537 + 17) % 2147483647

        self.threads = [threading.Thread(target=work, daemon=True)
                        for work, enabled in ((gpu_work, gpu), (cpu_work, cpu)) if enabled]
        for thread in self.threads:
            thread.start()
        if gpu and not self.active.wait(30):
            raise RuntimeError("GPU pressure did not become active")

    def close(self):
        if self.threads:
            self.stop.set()
            for thread in self.threads:
                thread.join(timeout=10)
                if thread.is_alive():
                    raise RuntimeError("pressure worker did not restore")
            self.threads = []


BASE = {"forward_ms": 0, "reverse_ms": 0, "jitter_ms": 0,
        "response_rate_bps": 0, "close_every": 0, "queue_ms": 0}
CASES = (
    ("forward_delay_mild", {"forward_ms": 120}, False, False),
    ("forward_delay", {"forward_ms": 350}, False, False),
    ("reverse_delay_mild", {"reverse_ms": 120}, False, False),
    ("reverse_delay", {"reverse_ms": 350}, False, False),
    ("jitter", {"forward_ms": 120, "jitter_ms": 100}, False, False),
    ("bandwidth_mild", {"response_rate_bps": 500_000}, False, False),
    ("bandwidth", {"response_rate_bps": 160_000}, False, False),
    ("relay_queue_mild", {"queue_ms": 70}, False, False),
    ("relay_queue", {"queue_ms": 180}, False, False),
    ("connection_churn", {}, False, False),
    ("cpu_pressure", {}, False, True),
    ("gpu_pressure", {}, True, False),
    ("network_gpu", {"reverse_ms": 250}, True, False),
    ("queue_gpu", {"queue_ms": 160}, True, False),
    ("close_churn", {"close_every": 5}, False, False),
)


def wait_ready(port_number: int):
    for _ in range(200):
        try:
            with socket.create_connection(("127.0.0.1", port_number), timeout=.2):
                return
        except OSError:
            time.sleep(.1)
    raise TimeoutError("service readiness failed")


def farm(corpus: Path, output: Path, *, requests=12, repetitions=2,
         production_requests=200, seed=71, deadline_s=4):
    if requests < 1 or repetitions < 1 or production_requests < 1 or deadline_s <= 0:
        raise ValueError("positive farm schedule required")
    output.mkdir(parents=True, exist_ok=False)
    public, private = output / "public", output / "private"
    public.mkdir()
    private.mkdir()
    (private / "provenance.json").write_text(json.dumps({
        "farm_sha256": _sha256(Path(__file__)),
        "runner_sha256": _sha256(Path(__file__).with_name("network_smolvla_run.py")),
        "corpus_sha256": _sha256(corpus / "main-1000.jsonl")}, indent=2), encoding="utf-8")
    backend = SmolVLA(corpus, trace_dir=public / "traces")
    frame_ids = list(frames(corpus))
    backend(frame_ids[0])
    server_port, relay_port = port(), port()
    server_log = public / "server.jsonl"
    service_stop = threading.Event()
    service = threading.Thread(target=serve, args=("127.0.0.1", server_port, server_log, backend),
                               kwargs={"stop_event": service_stop}, daemon=True)
    service.start()
    wait_ready(server_port)
    relay = Relay(server_port, relay_port, public / "relay.jsonl")
    pressure = Pressure()
    rng = random.Random(seed)
    assignments = []
    results = []
    block = 0

    def measure(case, arm, settings, gpu, cpu, *, persistent=True):
        nonlocal block
        block += 1
        phase = f"block-{block:04d}"
        relay.set({**BASE, **settings})
        pressure.start(gpu=gpu, cpu=cpu)
        readback = {"relay": dict(relay.settings), "gpu_worker_alive":
                    bool(gpu and pressure.active.is_set() and pressure.threads[0].is_alive()),
                    "cpu_worker_alive": bool(cpu and pressure.threads[-1].is_alive()),
                    "client_concurrency": 2, "payload_bytes": 1024,
                    "response_padding_bytes": 16384 if case.startswith("bandwidth") else 0,
                    "persistent": persistent}
        assignments.append({"phase": phase, "case": case, "arm": arm,
                            "configured": settings, "readback": readback})
        try:
            result = run_block("127.0.0.1", relay_port, public, phase, frame_ids,
                               requests, 2, 1024, deadline_s, seed=seed + block,
                               deep_every=1000 if block % 10 == 0 else 0,
                               persistent=persistent,
                               response_padding_bytes=readback["response_padding_bytes"])
            results.append({"phase": phase,
                            "counts": result["population"]["counts"],
                            "client_rtt": result["client_rtt"],
                            "server_work": result["server_work"],
                            "cuda_device": result["cuda_device"]})
        finally:
            pressure.close()
            relay.set(BASE)
            assignments[-1]["restored"] = dict(relay.settings) == BASE and not pressure.threads

    try:
        order = [(case, change, gpu, cpu, rep) for rep in range(repetitions)
                 for case, change, gpu, cpu in CASES]
        rng.shuffle(order)
        for case, change, gpu, cpu, rep in order:
            measure(case, "healthy", {}, False, False)
            measure(case, "incident", change, gpu, cpu,
                    persistent=case != "connection_churn")
            measure(case, "recovery", {}, False, False)
        regimes = [
            ("steady", {}, False, False, 1024, .3),
            ("burst", {"queue_ms": 150}, False, False, 4096, .02),
            ("capacity", {"response_rate_bps": 160_000}, False, False, 8192, .1),
            ("asymmetric", {"reverse_ms": 220, "jitter_ms": 60}, False, False, 1024, .1),
            ("endpoint", {}, True, True, 2048, .05),
            ("overlap", {"forward_ms": 120, "queue_ms": 150}, True, False, 4096, .02),
            ("drain", {}, False, False, 1024, .3),
        ]
        stages = [min(len(regimes) - 1, i * len(regimes) // production_requests)
                  for i in range(production_requests)]
        offsets = []
        elapsed = 0.0
        for i, stage in enumerate(stages):
            elapsed += regimes[stage][5] * (0.2 if i % 9 < 3 else 1)
            offsets.append(elapsed)
        sizes = [regimes[stage][4] for stage in stages]
        phase = f"block-{block + 1:04d}"
        active = -1
        transition_lock = threading.Lock()

        def transition(i):
            nonlocal active
            stage = stages[i]
            with transition_lock:
                if stage <= active:
                    return
                active = stage
                name, settings, gpu, cpu, *_ = regimes[stage]
                relay.set({**BASE, **settings})
                pressure.start(gpu=gpu, cpu=cpu)
                assignments.append({"phase": phase, "stage": stage, "case": name,
                                    "arm": "production", "configured": settings,
                                    "readback": {"relay": dict(relay.settings),
                                                 "gpu_worker_alive": bool(gpu and pressure.active.is_set() and pressure.threads[0].is_alive()),
                                                 "cpu_worker_alive": bool(cpu and pressure.threads[-1].is_alive())},
                                    "at_ns": time.monotonic_ns()})

        block += 1
        result = run_block("127.0.0.1", relay_port, public, phase, frame_ids,
                           production_requests, 4, 1024, deadline_s, seed=seed + block,
                           deep_every=25, release_offsets_s=offsets,
                           payload_sizes=sizes, on_release=transition)
        results.append({"phase": phase, "counts": result["population"]["counts"],
                        "client_rtt": result["client_rtt"],
                        "server_work": result["server_work"],
                        "cuda_device": result["cuda_device"]})
        pressure.close()
        relay.set(BASE)
        for assignment in assignments:
            if assignment["arm"] == "production":
                assignment["restored"] = dict(relay.settings) == BASE
    finally:
        pressure.close()
        relay.close()
        service_stop.set()
        service.join(timeout=10)
        (private / "assignments.json").write_text(json.dumps(assignments, indent=2), encoding="utf-8")
        (public / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        checksums = {str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in output.rglob("*") if path.is_file()}
        (output / "checksums.json").write_text(json.dumps(checksums, indent=2), encoding="utf-8")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--requests", type=int, default=12)
    parser.add_argument("--repetitions", type=int, default=2)
    parser.add_argument("--production-requests", type=int, default=200)
    parser.add_argument("--deadline-s", type=float, default=4)
    args = parser.parse_args()
    print(json.dumps(farm(args.corpus, args.output, requests=args.requests,
                          repetitions=args.repetitions,
                          production_requests=args.production_requests,
                          deadline_s=args.deadline_s)))


if __name__ == "__main__":
    main()
