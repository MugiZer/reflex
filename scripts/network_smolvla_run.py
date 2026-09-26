"""Persistent SmolVLA HTTP service and Root-compatible network workload runner.

The service accepts only frame IDs in the frozen corpus. The padding field is
transport load, not a model input. Fault assignments are never sent to it.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import math
import os
import platform
import random
import socket
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.network import VERSION, _write_jsonl, application_event, stats  # noqa: E402
from reflex.network_analysis import Population  # noqa: E402
from reflex.runtime import BoundedDrain  # noqa: E402
from reflex.collect import _sha256  # noqa: E402


def frames(corpus: Path) -> dict:
    path = corpus / "main-1000.jsonl"
    return {row["frame_id"]: row for row in
            (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()[1:])}


class SmolVLA:
    """One model, dataset, and frozen processors for the service lifetime."""

    def __init__(self, corpus: Path, trace_dir: Path | None = None):
        import torch
        from lerobot.datasets.lerobot_dataset import LeRobotDataset
        from lerobot.policies.factory import make_pre_post_processors
        from lerobot.policies.smolvla.modeling_smolvla import SmolVLAPolicy
        from scripts.smolvla_run import CHECKPOINT, CHECKPOINT_REV, DATASET, DATASET_REV

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA unavailable; refusing to claim T4 evidence")
        self.torch, self.device = torch, "cuda"
        self.trace_dir = trace_dir
        self.corpus = frames(corpus)
        self.instruction = json.loads((corpus / "main-1000.jsonl").read_text(
            encoding="utf-8").splitlines()[0])["instruction"]
        self.policy = SmolVLAPolicy.from_pretrained(CHECKPOINT, revision=CHECKPOINT_REV)
        self.policy.to("cuda", dtype=torch.float32)
        self.policy.eval()
        self.preprocess, self.postprocess = make_pre_post_processors(
            self.policy.config, CHECKPOINT,
            preprocessor_overrides={"device_processor": {"device": "cuda"}})
        self.dataset = LeRobotDataset(DATASET, revision=DATASET_REV,
                                      video_backend="pyav")
        episodes = [int(e) for e in self.dataset.hf_dataset["episode_index"]]
        self.starts = {}
        for index, episode in enumerate(episodes):
            self.starts.setdefault(episode, index)
        self.episodes = episodes
        self.lock = threading.Lock()

    def __call__(self, frame_id: str, deep: bool = False) -> dict:
        from contextlib import nullcontext
        import tempfile
        torch = self.torch
        frame = self.corpus[frame_id]
        episode, local = frame["episode_idx"], frame["frame_idx"]
        index = self.starts[episode] + local
        if self.episodes[index] != episode:
            raise ValueError("frozen frame outside dataset episode")
        with self.lock:
            self.policy.reset()
            start_ns = time.monotonic_ns()
            sample = self.dataset[index]
            if sample.get("task") != self.instruction:
                raise ValueError("dataset task drifted from frozen instruction")
            rename = {"observation.images.top": "observation.images.camera1",
                      "observation.images.wrist": "observation.images.camera2"}
            batch = self.preprocess({rename.get(k, k): v for k, v in sample.items()})
            batch = {k: v.to(self.device) if torch.is_tensor(v) else v
                     for k, v in batch.items()}
            preprocess_end_ns = time.monotonic_ns()
            event_a = torch.cuda.Event(enable_timing=True)
            event_b = torch.cuda.Event(enable_timing=True)
            profiler = None
            if deep:
                from torch.profiler import profile, ProfilerActivity
                profiler = profile(activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
                                   record_shapes=True)
            context = profiler if profiler else nullcontext()
            with context:
                with torch.inference_mode():
                    event_a.record()
                    action = self.postprocess(self.policy.select_action(batch))
                    event_b.record()
            event_b.synchronize()
            inference_end_ns = time.monotonic_ns()
            array = action.detach().float().cpu().numpy()
            result = {"action": array.tolist(), "action_sha256": hashlib.sha256(
                array.tobytes()).hexdigest(), "action_shape": list(array.shape),
                "preprocess_ns": preprocess_end_ns - start_ns,
                "inference_postprocess_ns": inference_end_ns - preprocess_end_ns,
                "cuda_device_ms": event_a.elapsed_time(event_b)}
            if profiler:
                if self.trace_dir:
                    self.trace_dir.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(suffix=".json", delete=False,
                                                 dir=self.trace_dir) as handle:
                    result["trace_path"] = handle.name
                profiler.export_chrome_trace(result["trace_path"])
                result["trace_sha256"] = _sha256(Path(result["trace_path"]))
            return result


def serve(host: str, port: int, log: Path, backend, *, token: str | None = None,
          stop_event: threading.Event | None = None):
    if host not in ("127.0.0.1", "::1", "localhost") and not token:
        raise ValueError("non-loopback service requires a token")
    service_id = uuid.uuid4().hex
    drain = BoundedDrain(lambda row: _write_jsonl(log, row))

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            if self.path != "/infer":
                self.send_error(404)
                return
            request_id = self.headers.get("X-Request-Id", "")
            if token and self.headers.get("Authorization") != f"Bearer {token}":
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "-1"))
                if not request_id or not 0 < length <= 10_000_000:
                    raise ValueError("invalid identity or size")
                start = time.monotonic_ns()
                payload = json.loads(self.rfile.read(length))
                frame_id = payload["frame_id"]
                if payload["request_id"] != request_id or not isinstance(frame_id, str):
                    raise ValueError("identity mismatch")
                if not isinstance(payload.get("padding", ""), str):
                    raise ValueError("invalid padding")
                reply_padding = payload.get("response_padding_bytes", 0)
                if not isinstance(reply_padding, int) or not 0 <= reply_padding <= 1_000_000:
                    raise ValueError("invalid response padding")
                deep = bool(payload.get("deep", False))
                work_start = time.monotonic_ns()
                result = backend(frame_id, deep)
                work_end = time.monotonic_ns()
                body = json.dumps({"request_id": request_id, "frame_id": frame_id,
                                   "service_id": service_id, **result,
                                   "padding": "x" * reply_padding}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-Request-Id", request_id)
                self.send_header("X-Server-Work-Ns", str(work_end - work_start))
                self.send_header("X-Server-Run-Id", service_id)
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()
                sent = time.monotonic_ns()
                drain.push({"request_id": request_id, "frame_id": frame_id,
                            "service_id": service_id, "handler_start_ns": start,
                            "work_start_ns": work_start, "work_end_ns": work_end,
                            "userspace_flush_complete_ns": sent,
                            "request_bytes": length, "response_bytes": len(body),
                            "connection_identity": f"{self.client_address[0]}:{self.client_address[1]}",
                            "clock_domain": f"server:{socket.gethostname()}:{service_id}",
                            **{k: result.get(k) for k in ("cuda_device_ms", "preprocess_ns",
                                                        "inference_postprocess_ns", "action_sha256",
                                                        "trace_path", "trace_sha256")}})
            except (KeyError, ValueError, TypeError) as exc:
                self.send_error(400, str(exc))
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as exc:
                drain.push({"request_id": request_id, "frame_id": locals().get("frame_id"),
                            "service_id": service_id, "error": f"{type(exc).__name__}: {exc}",
                            "clock_domain": f"server:{socket.gethostname()}:{service_id}"})
                self.send_error(500)

        def log_message(self, *args):
            pass

    try:
        with ThreadingHTTPServer((host, port), Handler) as server:
            if stop_event is not None:
                def stop_when_requested():
                    stop_event.wait()
                    server.shutdown()
                threading.Thread(target=stop_when_requested, daemon=True).start()
            server.serve_forever()
    finally:
        log.with_suffix(".coverage.json").write_text(json.dumps(drain.close()), encoding="utf-8")


def run_block(host: str, port: int, out: Path, phase: str, frame_ids: list[str],
              requests: int, concurrency: int, payload_bytes: int, deadline_s: float,
              *, seed: int = 0, token: str | None = None, deep_every: int = 0,
              persistent: bool = True, interval_s: float | None = None,
              release_offsets_s: list[float] | None = None,
              payload_sizes: list[int] | None = None, on_release=None,
              response_padding_bytes: int = 0) -> dict:
    if (requests < 1 or concurrency < 1 or not 0 <= payload_bytes <= 9_000_000
            or not math.isfinite(deadline_s) or deadline_s <= 0 or deep_every < 0
            or not 0 <= response_padding_bytes <= 1_000_000
            or (interval_s is not None and (not math.isfinite(interval_s) or interval_s <= 0))):
        raise ValueError("invalid workload bounds")
    if not frame_ids or not phase or any(c in phase for c in "/\\:"):
        raise ValueError("invalid frame list or phase")
    if release_offsets_s is not None and (len(release_offsets_s) != requests or
                                         any(not math.isfinite(x) or x < 0 for x in release_offsets_s)):
        raise ValueError("invalid release schedule")
    if payload_sizes is not None and (len(payload_sizes) != requests or
                                      any(not 0 <= x <= 9_000_000 for x in payload_sizes)):
        raise ValueError("invalid payload schedule")
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{phase}.jsonl"
    if path.exists():
        raise FileExistsError(path)
    execution = uuid.uuid4().hex
    clock = f"client:{socket.gethostname()}:{execution}"
    local = threading.local()
    connections = []
    lock = threading.Lock()
    rows = []
    population = Population(execution, capacity=requests)
    event_path = out / f"{phase}-events.jsonl"
    detail = BoundedDrain(lambda row: _write_jsonl(path, row))
    events = BoundedDrain(lambda row: _write_jsonl(event_path, {"version": VERSION,
                                      "kind": "event", "payload": row}))
    chosen = [random.Random(seed + i).choice(frame_ids) for i in range(requests)]
    start = time.monotonic_ns()

    def one(i: int):
        rid = f"{execution}:{i}"
        frame_id = chosen[i]
        release = (start + int(release_offsets_s[i] * 1e9) if release_offsets_s is not None
                   else start + int(i * interval_s * 1e9) if interval_s else time.monotonic_ns())
        if interval_s or release_offsets_s is not None:
            time.sleep(max(0, (release - time.monotonic_ns()) / 1e9))
        if on_release:
            on_release(i)
        sequence = 0
        def hook(boundary, **values):
            nonlocal sequence
            application_event(events, rid, sequence, clock, rid,
                              boundary, **values)
            sequence += 1
        hook("release", at=release)
        body = json.dumps({"request_id": rid, "frame_id": frame_id,
                           "padding": "x" * (payload_sizes[i] if payload_sizes else payload_bytes),
                           "response_padding_bytes": response_padding_bytes,
                           "deep": bool(deep_every and i % deep_every == 0)}).encode()
        if not hasattr(local, "conn") or not persistent:
            local.conn = http.client.HTTPConnection(host, port, timeout=deadline_s * 3)
            local.connection_id = uuid.uuid4().hex
            with lock:
                connections.append(local.conn)
        conn = local.conn
        row = {"request_id": rid, "delivery_id": rid, "frame_id": frame_id,
               "connection_id": local.connection_id, "index": i, "phase": phase,
               "clock_domain": clock, "intended_release_ns": release,
               "deadline_ns": release + int(deadline_s * 1e9),
               "request_bytes": len(body), "status": "error"}
        try:
            row["connection_start_ns"] = time.monotonic_ns()
            if conn.sock is None:
                conn.connect()
            row["connection_end_ns"] = time.monotonic_ns()
            if platform.system() == "Linux":
                from reflex.network_capture import sample_socket
                sample = sample_socket(conn.sock, rid + ":tcp", 0, clock, local.connection_id)
                if "boundary" in sample:
                    events.push(sample)
            row["client_connect_request_start_ns"] = time.monotonic_ns()
            hook("submit", at=row["client_connect_request_start_ns"])
            headers = {"X-Request-Id": rid, "Connection": "keep-alive" if persistent else "close"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            conn.request("POST", "/infer", body, headers)
            row["socket_write_complete_ns"] = time.monotonic_ns()
            hook("write_complete", at=row["socket_write_complete_ns"], bytes=len(body))
            if platform.system() == "Linux":
                sample = sample_socket(conn.sock, rid + ":tcp", 1, clock, local.connection_id)
                if "boundary" in sample:
                    events.push(sample)
            response = conn.getresponse()
            result = json.loads(response.read(10_000_001))
            row["userspace_body_read_complete_ns"] = time.monotonic_ns()
            hook("consume", at=row["userspace_body_read_complete_ns"])
            if (response.status != 200 or response.getheader("X-Request-Id") != rid
                    or result["request_id"] != rid or result["frame_id"] != frame_id
                    or len(result.get("padding", "")) != response_padding_bytes):
                raise ValueError("response identity/status mismatch")
            row.update(status="ok", server_id=result["service_id"],
                       server_work_ns=int(response.getheader("X-Server-Work-Ns")),
                       cuda_device_ms=result.get("cuda_device_ms"),
                       action_sha256=result["action_sha256"],
                       action_shape=result["action_shape"],
                       response_bytes=len(json.dumps(result).encode()))
        except (OSError, ValueError, KeyError, http.client.HTTPException) as exc:
            row["error"] = f"{type(exc).__name__}: {exc}"
            row["status"] = "timeout" if isinstance(exc, TimeoutError) else "error"
            conn.close()
            local.connection_id = uuid.uuid4().hex
        finally:
            row["client_finish_ns"] = time.monotonic_ns()
            if not persistent:
                conn.close()
        row["client_total_ns"] = row["client_finish_ns"] - release
        row["client_rtt_ns"] = (row["userspace_body_read_complete_ns"] - row["client_connect_request_start_ns"]
                                if row.get("userspace_body_read_complete_ns") else None)
        residual = (row["client_rtt_ns"] - row["server_work_ns"] if row.get("server_work_ns") is not None else None)
        row["raw_residual_ns"] = residual
        row["unobserved_rtt_ns"] = residual if residual is not None and residual >= 0 else None
        row["limitations"] = ["RTT remainder includes transport and uninstrumented server work"]
        hook("outcome", at=row["client_finish_ns"], status=row["status"])
        detail.push(row)
        with lock:
            rows.append(row)

    try:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            list(pool.map(one, range(requests)))
    finally:
        for conn in connections:
            conn.close()
        coverage, event_coverage = detail.close(), events.close()
    for row in sorted(rows, key=lambda row: row["client_finish_ns"]):
        population.add(row)
    summary = population.summary()
    context = {"collector_version": VERSION, "host": host, "port": port,
               "runner_sha256": _sha256(Path(__file__)),
               "requests": requests, "concurrency": concurrency,
               "payload_bytes": payload_bytes if payload_sizes is None else "variable",
               "response_padding_bytes": response_padding_bytes,
               "deadline_s": deadline_s,
               "connection_mode": "persistent" if persistent else "fresh",
               "interval_s": interval_s, "seed": seed, "execution_id": execution,
               "client_host": socket.gethostname(),
               "server_ids": sorted({r["server_id"] for r in rows if r.get("server_id")})}
    manifest = {"version": VERSION, "domain": "network", "status": "done",
                "execution_id": execution, "context": context, "coverage": coverage,
                "event_coverage": event_coverage, "population": summary,
                "sha256": {p.name: _sha256(p) for p in (path, event_path)}}
    (out / f"{phase}-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"phase": phase, "population": summary,
            "client_rtt": stats([r["client_rtt_ns"] / 1e6 for r in rows if r["status"] == "ok"]),
            "server_work": stats([r["server_work_ns"] / 1e6 for r in rows if r["status"] == "ok"]),
            "cuda_device": stats([r["cuda_device_ms"] for r in rows if r["status"] == "ok" and r.get("cuda_device_ms") is not None]),
            "manifest": str(out / f"{phase}-manifest.json")}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    service = commands.add_parser("serve")
    service.add_argument("--host", default="127.0.0.1")
    service.add_argument("--port", type=int, default=8765)
    service.add_argument("--corpus", type=Path, required=True)
    service.add_argument("--log", type=Path, required=True)
    service.add_argument("--trace-dir", type=Path)
    client = commands.add_parser("run")
    client.add_argument("--host", default="127.0.0.1")
    client.add_argument("--port", type=int, default=8765)
    client.add_argument("--corpus", type=Path, required=True)
    client.add_argument("--out", type=Path, required=True)
    client.add_argument("--phase", required=True)
    client.add_argument("--requests", type=int, default=40)
    client.add_argument("--concurrency", type=int, default=2)
    client.add_argument("--payload-bytes", type=int, default=1024)
    client.add_argument("--response-padding-bytes", type=int, default=0)
    client.add_argument("--deadline-s", type=float, default=4.0)
    client.add_argument("--seed", type=int, default=11)
    client.add_argument("--deep-every", type=int, default=0)
    client.add_argument("--interval-s", type=float)
    client.add_argument("--fresh", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "serve":
        token = os.environ.get("REFLEX_SERVICE_TOKEN")
        args.log.parent.mkdir(parents=True, exist_ok=True)
        serve(args.host, args.port, args.log,
              SmolVLA(args.corpus, trace_dir=args.trace_dir), token=token)
    else:
        result = run_block(args.host, args.port, args.out, args.phase, list(frames(args.corpus)),
                           args.requests, args.concurrency, args.payload_bytes, args.deadline_s,
                           seed=args.seed, token=os.environ.get("REFLEX_SERVICE_TOKEN"),
                           deep_every=args.deep_every, persistent=not args.fresh,
                           interval_s=args.interval_s,
                           response_padding_bytes=args.response_padding_bytes)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
