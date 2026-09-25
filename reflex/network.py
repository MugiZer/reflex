"""Small HTTP experiment for end-to-end inference latency evidence.

Durations are measured within one clock domain. Client and server monotonic
timestamps are retained for re-analysis but are never subtracted across hosts.
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
import statistics
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from collections import Counter

from .envelope import git_commit

VERSION = "network-v2"
_ACTIVE_ACQUISITIONS = {}


def application_event(collector, source, sequence, clock, delivery_id, boundary, *, at=None, **values):
    from .network_capture import event
    row = event(source, sequence, clock, time.monotonic_ns() if at is None else at, boundary,
                values, [{"relation": "delivery", "identity": delivery_id, "certainty": "explicit"}],
                units={"time": "ns"}, coverage={"complete": True, "drops": 0})
    collector.push(row)
    return row


def relay(host,port,upstream_host,upstream_port,log,*,credits=2,period_s=.05):
    """Controlled HTTP relay workload; investigator inputs contain boundary events, not policy labels."""
    from .runtime import BoundedDrain
    import itertools
    if credits < 1 or period_s <= 0:
        raise ValueError("positive relay credit budget required")
    source=uuid.uuid4().hex
    clock="relay:"+source
    sequence=itertools.count()
    drain=BoundedDrain(lambda p:_write_jsonl(log,{"version":VERSION,"kind":"event","payload":p}))
    condition=threading.Condition()
    state={"credits":credits,"epoch":time.monotonic()}

    class Handler(BaseHTTPRequestHandler):
        protocol_version="HTTP/1.1"

        def do_POST(self):
            delivery=self.headers.get("X-Request-Id") or uuid.uuid4().hex
            try:
                length=int(self.headers.get("Content-Length","-1"))
                if not 0 <= length <= 10_000_000:
                    raise ValueError("invalid relay request size")
                body=self.rfile.read(length)
                application_event(drain,source,next(sequence),clock,delivery,"relay_ingress")
                with condition:
                    while True:
                        now=time.monotonic()
                        if now-state["epoch"] >= period_s:
                            state.update(credits=credits,epoch=now)
                        if state["credits"]:
                            state["credits"]-=1
                            break
                        condition.wait(max(.001,period_s-(now-state["epoch"])))
                application_event(drain,source,next(sequence),clock,delivery,"relay_release")
                upstream=http.client.HTTPConnection(upstream_host,upstream_port,timeout=5)
                try:
                    upstream.request("POST","/infer",body=body,headers={"X-Request-Id":delivery,"Connection":"close"})
                    response=upstream.getresponse()
                    payload=response.read(10_000_001)
                    if len(payload)>10_000_000:
                        raise ValueError("relay response exceeds workload bound")
                    self.send_response(response.status)
                    self.send_header("Content-Length",str(len(payload)))
                    self.send_header("X-Request-Id",delivery)
                    self.send_header("Connection","close")
                    for name in ("X-Server-Work-Ns","X-Server-Run-Id"):
                        if response.getheader(name):
                            self.send_header(name,response.getheader(name))
                    self.end_headers()
                    self.wfile.write(payload)
                    self.wfile.flush()
                    application_event(drain,source,next(sequence),clock,delivery,"relay_egress")
                finally:
                    upstream.close()
            except (OSError,ValueError,http.client.HTTPException):
                self.close_connection=True

        def log_message(self,*args):
            return

    try:
        with ThreadingHTTPServer((host,port),Handler) as httpd:
            httpd.serve_forever()
    finally:
        coverage=drain.close()
        log.with_suffix(".coverage.json").write_text(json.dumps(coverage),encoding="utf-8")


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
    from .runtime import BoundedDrain
    if not 0 < response_bytes <= 10_000_000:
        raise ValueError("response_bytes must be in 1..10000000")
    body = b"R" * response_bytes
    server_id = uuid.uuid4().hex
    drain = BoundedDrain(lambda row: _write_jsonl(log, row)) if log else None

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
                self.send_header("Connection", self.headers.get("Connection", "close"))
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()
                sent_ns = time.monotonic_ns()
            except (BrokenPipeError, ConnectionResetError) as exc:
                error = type(exc).__name__
            if log:
                row = {"request_id": request_id, "handler_start_ns": handler_start_ns,
                       "work_start_ns": work_start_ns, "work_end_ns": work_end_ns,
                       "userspace_flush_complete_ns": sent_ns, "request_bytes": len(payload),
                       "response_bytes": len(body), "error": error,
                       "clock_domain": f"server:{socket.gethostname()}:{os.getpid()}:{server_id}"}
                drain.push(row)

        def log_message(self, fmt, *args):
            pass

    try:
        with ThreadingHTTPServer((host, port), Handler) as httpd:
            httpd.serve_forever()
    finally:
        if drain:
            coverage = drain.close()
            log.with_suffix(".coverage.json").write_text(json.dumps(coverage), encoding="utf-8")


def _request(host: str, port: int, request_id: str, payload: bytes,
             response_bytes: int, slow_ms: float, timeout_s: float, *, connection=None,
             connection_id=None, hook=None, transport_collector=None, clock=None) -> dict:
    row = {"request_id": request_id, "client_prepare_start_ns": time.monotonic_ns(),
           "client_send_start_ns": None, "client_receive_end_ns": None,
           "client_finish_ns": None, "server_work_ns": None,
           "server_id": None, "status": "error", "error": None}
    conn = connection
    try:
        # The prepared payload is fixed per run; this interval still records
        # request setup and allows a future real encoder to replace it.
        headers = {"X-Request-Id": request_id, "X-Server-Slow-Ms": str(slow_ms),
                   "Connection": "keep-alive" if connection else "close"}
        row["client_send_start_ns"] = time.monotonic_ns()
        if hook:
            hook("submit", at=row["client_send_start_ns"])
        row["connection_id"] = connection_id if conn is not None and conn.sock is not None and connection_id else uuid.uuid4().hex
        if conn is None:
            conn = http.client.HTTPConnection(host, port, timeout=timeout_s)
        row["connection_start_ns"] = time.monotonic_ns()
        if conn.sock is None:
            conn.connect()
        row["connection_end_ns"] = time.monotonic_ns()
        if transport_collector:
            from .network_capture import sample_socket
            sample=sample_socket(conn.sock,request_id+":tcp",0,clock,row["connection_id"])
            if "boundary" in sample:
                transport_collector(sample)
        row["socket_write_start_ns"] = time.monotonic_ns()
        conn.request("POST", "/infer", body=payload, headers=headers)
        row["socket_write_complete_ns"] = time.monotonic_ns()
        if transport_collector:
            sample=sample_socket(conn.sock,request_id+":tcp",1,clock,row["connection_id"])
            if "boundary" in sample:
                transport_collector(sample)
        if hook:
            hook("write_complete", at=row["socket_write_complete_ns"], bytes=len(payload))
        response = conn.getresponse()
        reply = response.read(response_bytes+1)
        row["client_receive_end_ns"] = time.monotonic_ns()
        if hook:
            hook("consume", at=row["client_receive_end_ns"], bytes=len(reply))
        if response.status != 200 or response.getheader("X-Request-Id") not in (None, request_id):
            raise ValueError("response correlation/status mismatch")
        if reply != b"R" * response_bytes:
            raise ValueError("response body mismatch")
        row["response_bytes"] = len(reply)
        work = response.getheader("X-Server-Work-Ns")
        row["server_work_ns"] = int(work) if work is not None else None
        row["server_id"] = response.getheader("X-Server-Run-Id")
        row["status"] = "ok"
        if hook:
            hook("complete", at=row["client_receive_end_ns"])
    except (OSError, ValueError, http.client.HTTPException) as exc:
        row["error"] = f"{type(exc).__name__}: {exc}"
        row["status"] = "timeout" if isinstance(exc, TimeoutError) else "error"
        if conn:
            conn.close()
    finally:
        row["client_finish_ns"] = time.monotonic_ns()
        if conn and connection is None:
            conn.close()
    row["client_prepare_ns"] = row["client_send_start_ns"] - row["client_prepare_start_ns"]
    row["client_rtt_ns"] = (row["client_receive_end_ns"] - row["client_send_start_ns"]
                            if row["client_receive_end_ns"] else None)
    row["client_total_ns"] = row["client_finish_ns"] - row["client_prepare_start_ns"]
    # This remainder includes transport, server ingress/egress, and any
    # unmeasured server work. It is never described as one-way network time.
    residual = (row["client_rtt_ns"] - row["server_work_ns"]
                if row["client_rtt_ns"] is not None and row["server_work_ns"] is not None else None)
    row["raw_residual_ns"] = residual
    row["unobserved_rtt_ns"] = residual if residual is not None and residual >= 0 else None
    row["limitations"] = ([] if row["server_id"] else ["remote identity/boundaries unavailable"])
    if residual is not None and residual < 0:
        row["limitations"].append("invalid residual nesting or clock rate")
    row["client_connect_request_start_ns"] = row.pop("client_send_start_ns")
    row["userspace_body_read_complete_ns"] = row.pop("client_receive_end_ns")
    return row


def run(host: str, port: int, out: Path, phase: str, seed: int, requests: int,
        request_bytes: int, response_bytes: int, timeout_s: float,
        slow_every: int = 0, slow_ms: float = 0, *, persistent=False, concurrency=1,
        interval_s=None, deadline_s=None, cancel=None, tcp_info=False) -> dict:
    from .runtime import BoundedDrain
    from .network_analysis import Population, DurationSketch, join_runs
    if requests < 1 or not 0 <= request_bytes <= 10_000_000 or not 0 < response_bytes <= 10_000_000:
        raise ValueError("invalid workload size")
    if slow_every < 0 or slow_ms < 0 or (slow_ms and not slow_every):
        raise ValueError("invalid server slowdown")
    if concurrency < 1 or timeout_s <= 0 or (interval_s is not None and interval_s <= 0) or (deadline_s is not None and deadline_s <= 0) or any(
            not math.isfinite(value) for value in (timeout_s,slow_ms,interval_s if interval_s is not None else 1,deadline_s if deadline_s is not None else 1)):
        raise ValueError("invalid schedule")
    if not phase or any(c in phase for c in "/\\:") or phase in (".", ".."):
        raise ValueError("phase must be a flat name")
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
    execution = uuid.uuid4().hex
    clock = f"client:{context['client_host']}:{execution}"
    context.update(execution_id=execution, connection_mode="persistent" if persistent else "fresh",
                   schedule="intended release" if interval_s else "completion driven; feedback dependent",
                   concurrency=concurrency, interval_s=interval_s,tcp_info_requested=tcp_info,
                   tcp_info_available=platform.system() == "Linux" if tcp_info else None)
    drain = BoundedDrain(lambda row: _write_jsonl(path, row))
    from .runtime import HindsightRing
    ring = HindsightRing(256, byte_limit=1_048_576, pin_bytes=1_048_576)
    event_path = out / f"{phase}-events.jsonl"
    event_drain = BoundedDrain(lambda p: _write_jsonl(event_path, {"version": VERSION, "kind": "event", "payload": p}))
    manifest_path = out / f"{phase}-manifest.json"
    manifest_path.write_text(json.dumps({"version": VERSION, "domain": "network", "status": "collecting",
                                         "execution_id": execution, "context": context}), encoding="utf-8")
    local = threading.local()
    connections, server_ids = [], set()
    rows = []  # bounded compatibility sample; denominators below are independent of it
    population = Population(execution+":0", capacity=512)
    totals, duration_totals = Counter(), DurationSketch()
    closed_runs = {"prefix":0,"suffix":0,"max_run":0,"all_missed":True}
    block_number = 0
    population_path = out / f"{phase}-populations.jsonl"
    population_drain = BoundedDrain(lambda row: _write_jsonl(population_path, row))
    accounting_lock = threading.Lock()
    slots = threading.BoundedSemaphore(concurrency)
    started = time.monotonic_ns()

    def perform(i, release, dispatched=True):
        nonlocal population, block_number, closed_runs
        identity = f"{execution}:{i}"
        sequence = 0

        def hook(boundary, **values):
            nonlocal sequence
            p = application_event(ring, identity, sequence, clock, identity, boundary, **values)
            sequence += 1
            event_drain.push(p)

        hook("release", at=release, scheduled=interval_s is not None)
        if dispatched and not (cancel and cancel.is_set()):
            if persistent and not hasattr(local, "conn"):
                local.conn = http.client.HTTPConnection(host, port, timeout=timeout_s)
                local.identity = uuid.uuid4().hex
                with accounting_lock:
                    connections.append(local.conn)
            row = _request(host, port, identity, payload, response_bytes,
                           slow_ms if slow_every and i % slow_every == 0 else 0, timeout_s,
                           connection=getattr(local, "conn", None), connection_id=getattr(local, "identity", None), hook=hook,
                           transport_collector=event_drain.push if tcp_info else None,clock=clock)
            if persistent:
                local.identity=row["connection_id"]
        else:
            now = time.monotonic_ns()
            row = dict(request_id=identity, status="cancelled" if cancel and cancel.is_set() else "not_submitted",
                       client_finish_ns=now, client_total_ns=now-release, server_id=None)
        hook("outcome", at=row["client_finish_ns"], status=row["status"])
        row.update(index=i, phase=phase, clock_domain=clock, intended_release_ns=release,
                   deadline_ns=release + int((deadline_s or timeout_s) * 1e9), delivery_id=identity,
                   submitted="client_connect_request_start_ns" in row, request_bytes=request_bytes)
        with accounting_lock:
            if population.counts["eligible"] == 512:
                population_drain.push(population.summary())
                totals.update(population.counts)
                duration_totals.merge(population.sketch)
                closed_runs = join_runs(closed_runs,population.summary())
                block_number += 1
                population = Population(f"{execution}:{block_number}", capacity=512)
            population.add(row)
            if len(rows) < 1024:
                rows.append(row)
            if row.get("server_id"):
                server_ids.add(row["server_id"])
        drain.push(row)

    def dispatched(i,release):
        try:
            perform(i,release)
        finally:
            slots.release()

    try:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            pending = []
            for i in range(requests):
                release = started + int(i * interval_s * 1e9) if interval_s else time.monotonic_ns()
                if interval_s:
                    time.sleep(max(0, (release-time.monotonic_ns()) / 1e9))
                available = slots.acquire(blocking=interval_s is None)
                if available:
                    for finished in pending:
                        if finished.done():
                            finished.result()
                    pending = [f for f in pending if not f.done()]
                    pending.append(pool.submit(dispatched, i, release))
                else:
                    perform(i, release, False)
            for future in pending:
                future.result()
    finally:
        for conn in connections:
            conn.close()
        coverage = drain.close()
        event_coverage = event_drain.close()
        population_drain.push(population.summary())
        population_coverage = population_drain.close()
    totals.update(population.counts)
    duration_totals.merge(population.sketch)
    population_summary = population.summary()
    population_summary.update(counts=dict(totals), durations=duration_totals.to_dict(),
                              logical_deliveries=totals["eligible"], **join_runs(closed_runs,population_summary))
    population_summary.update(sample_scope="last bounded accounting block", blocks=block_number+1,
                              order="terminal accounting order; scheduled order requires retained identities")
    summary = summarize(rows)
    counts = totals
    summary.update(requests=counts["eligible"], completed=counts["ok"], errors=counts["eligible"]-counts["ok"],
                   population=population_summary, detail_coverage=coverage, event_coverage=event_coverage,
                   population_coverage=population_coverage,
                   ring_dropped=ring.dropped, compatibility_sample_limit=1024)
    context["server_id"] = next(iter(server_ids)) if len(server_ids) == 1 else None
    context["server_ids"] = sorted(server_ids)
    doc = {"phase": phase, "context": context, "summary": summary,
           "requests_path": path.name,
           "path_model": {"client_prepare": "client clock",
                          "client_rtt": {"server_work": "server duration",
                                         "unobserved_rtt": "transport + ingress/egress + uninstrumented work"}},
           "clock_note": "Only same-endpoint durations are compared; no one-way latency is inferred. Completed-request percentiles exclude errors; attempt_total includes them."}
    (out / f"{phase}.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")
    from .collect import _sha256
    manifest_path.write_text(json.dumps({"version": VERSION, "domain": "network", "status": "done",
        "execution_id": execution, "context": context, "coverage": coverage, "event_coverage": event_coverage,
        "population":population_summary,
        "sha256": {p.name:_sha256(p) for p in (path,event_path,population_path) if p.exists()}}), encoding="utf-8")
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
    keys = ("request_bytes", "response_bytes", "timeout_s")
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
            "comparison_support": "descriptive workload contrast; formal claims require a frozen comparison contract",
            "unknown": "unobserved_rtt includes network and uninstrumented server intervals"}


def investigate(ledger_path, incident_id, *, contract=None, observations=(), actions=(),
                budgets=None, acquisition_directory=None, max_actions=8, cancel=None, executors=None):
    from .ledger import Ledger, Incident, Hypothesis, EvidenceLevel, canonical_hash, Experiment
    from .network_capture import ingest, capture, ingest_capture, probe_profile
    from .network_analysis import progress_view, mechanism_predictions, compare_blocks, compare_population_summaries
    from .select import choose_acquisition
    from .report import network_projection
    ledger = Ledger(ledger_path)
    recovery = ledger.repair_incomplete_tail()
    if incident_id not in ledger.incidents:
        ledger.open_incident(Incident(incident_id=incident_id, domain="network", provenance=VERSION))
    elif ledger.incidents[incident_id].domain != "network":
        raise ValueError("not a network incident")
    if recovery:
        ingest(ledger,"fact",{**recovery,"inputs":[]},incident_id)
    contracts = [e for e in ledger.evidence.values() if e.incident_id == incident_id and e.kind == "comparison_contract"]
    if contract is not None:
        cid = ingest(ledger, "comparison_contract", contract, incident_id)
    elif contracts:
        cid, contract = contracts[-1].record_id, contracts[-1].payload
    else:
        raise ValueError("investigation needs explicit comparison contract")
    configurations=[e.payload for e in ledger.evidence.values() if e.incident_id==incident_id and
                    e.kind=="fact" and e.payload.get("kind")=="investigation_config"]
    if configurations:
        saved=configurations[-1]
        if budgets is not None and budgets != saved["budgets"]:
            raise ValueError("incident budget is frozen; use a new incident for a new allocation")
        budgets=saved["budgets"]
        actions=actions or saved["actions"]
        max_actions=saved["max_actions"]
    if not actions and contract.get("endpoints"):
        from .network_capture import acquisition_catalog
        actions=acquisition_catalog(contract["endpoints"],contract["regime"],[])
    for kind, payload in observations:
        ingest(ledger, kind, payload, incident_id)
    budgets = dict(budgets or {"seconds": 30, "bytes": 10_000_000, "perturbation": 0})
    ingest(ledger,"fact",{"kind":"investigation_config","budgets":budgets,"actions":actions,
                           "max_actions":max_actions,"inputs":[]},incident_id)
    mine = lambda kind: [e for e in ledger.evidence.values() if e.incident_id == incident_id and e.kind == kind]
    completed = {e.payload["acquisition_id"] for e in mine("acquisition_result")}
    for plan in mine("acquisition_plan"):
        if plan.payload["acquisition_id"] not in completed:
            ingest(ledger, "acquisition_result", {"acquisition_id": plan.payload["acquisition_id"],
                   "status": "unknown execution after restart; reconcile before retry",
                   "actual": plan.payload["bounds"], "inputs": [plan.record_id]}, incident_id)
    for result in mine("acquisition_result"):
        for key in budgets:
            budgets[key] -= result.payload["actual"].get(key, 0)
    acquired = {e.payload["acquisition_id"] for e in mine("acquisition_result")}
    active = _ACTIVE_ACQUISITIONS.setdefault(str(Path(ledger_path).resolve()), {})
    for iteration in range(max_actions+1):
        references = {ref for e in mine("reference") for ref in e.payload["inputs"]}
        records = {rid: ledger.evidence[rid].payload for rid in references if ledger.evidence[rid].kind == "event"}
        from .network_analysis import required_data_readiness
        from .network_capture import event
        for mapping in contract.get("message_mappings",[]):
            readiness=required_data_readiness(records,mapping)
            if readiness["ready"] is None:
                continue
            dependencies=sorted(set(readiness["inputs"]+mapping["inputs"]))
            derived=event("derived:"+canonical_hash([mapping,dependencies]),0,readiness["clock"],readiness["ready"],
                          "complete_readable",{"required_range":mapping["required_range"]},
                          [{"relation":"delivery","identity":mapping["delivery"],"certainty":"explicit"}],
                          units={"time":readiness["units"]},coverage={"complete":True,"drops":0})
            derived.update(inputs=dependencies,derivation="contiguous-readable-v1")
            rid=ingest(ledger,"event",derived,incident_id)
            records[rid]=derived
            references.add(rid)
        view = progress_view(records)
        view["thresholds"]=contract.get("boundary_thresholds",{})
        view_id = ingest(ledger, "episode", {**view, "inputs": sorted(references)}, incident_id)
        from .network_analysis import topology_bounds,stratified_comparison,prior_advice
        for topology in mine("topology"):
            inference=topology_bounds(topology.payload)
            ingest(ledger,"fact",{"kind":"conditional_topology","inference":inference,"inputs":[topology.record_id]},incident_id)
        historical=prior_advice(ledger,{"regime":contract["regime"]},[a.get("profile") for a in actions])
        historical=[p for p in historical if p["prior_incident"] != incident_id]
        if historical:
            ingest(ledger,"fact",{"kind":"historical_advice","advice":historical,"inputs":[]},incident_id)
        predictions = mechanism_predictions(records, view)
        for name, prediction in predictions.items():
            if prediction["result"] == "contradicts":
                ingest(ledger,"fact",{**prediction,"inputs":prediction["inputs"],
                                       "qualification":"contradiction applies only to covered intervals, not every stochastic occurrence"},incident_id)
            if prediction["result"] != "supports":
                continue
            fid = ingest(ledger, "fact", {**prediction, "inputs": prediction["inputs"]}, incident_id)
            hid = hashlib.sha256(f"{incident_id}:{cid}:{name}:{fid}".encode()).hexdigest()[:32]
            if hid not in ledger.hypotheses:
                ledger.propose_hypothesis(Hypothesis(hypothesis_id=hid, incident_id=incident_id, domain="network",
                    provenance=VERSION, cause=name, correlation_id=hid,
                    scope=dict(mechanism=name, location=prediction["scope"], contract_id=cid,
                               outcome=contract["outcome"], regime=contract["regime"], assumptions=prediction["assumptions"],
                               support=[fid], alternatives=prediction["alternatives"], claim_type="mechanism_contribution")))
        populations = mine("population")
        summaries = [p for p in populations if "summary" in p.payload]
        if summaries:
            descriptive = compare_population_summaries(
                [p.payload for p in summaries if p.payload["arm"] == "reference"],
                [p.payload for p in summaries if p.payload["arm"] == "current"],contract)
            ingest(ledger,"fact",{"kind":"descriptive_population_change","comparison":descriptive,
                                   "inputs":sorted(p.record_id for p in summaries)},incident_id)
        usable = [p for p in populations if p.payload.get("block") is not None]
        if usable:
            ref = [p.payload["block"] for p in usable if p.payload.get("arm") == "reference"]
            cur = [p.payload["block"] for p in usable if p.payload.get("arm") == "current"]
            previous = [e for e in mine("error_allocation") if e.payload["contract_id"] == cid]
            signature = sorted(p.record_id for p in usable)
            same = next((e for e in previous if e.payload.get("inputs") == signature), None)
            look = same.payload["look"] if same else len(previous)+1
            result = compare_blocks(ref, cur, contract, look)
            if not same:
                ingest(ledger, "error_allocation", {"inputs": signature, "look": look, "alpha": result["spent_alpha"], "contract_id": cid}, incident_id)
            ingest(ledger, "fact", {"kind": "population_comparison", "comparison": result, "inputs": signature}, incident_id)
            if contract.get("target_weights") or contract.get("numeric_bins"):
                conditional=stratified_comparison(ref,cur,contract)
                ingest(ledger,"fact",{"kind":"conditional_population_comparison","comparison":conditional,
                                       "inputs":signature},incident_id)
        for exp in list(ledger.experiments.values()):
            h = ledger.hypotheses[exp.hypothesis_id]
            if h.incident_id != incident_id or exp.domain != "network":
                continue
            from .ledger import LedgerError
            for status in (EvidenceLevel.TESTED, EvidenceLevel.VERIFIED):
                if h.status == status:
                    continue
                try:
                    h = ledger.transition(h.hypothesis_id, status, exp.experiment_id)
                except LedgerError:
                    break
        if cancel and cancel.is_set():
            reason = "cancelled"
            break
        requested=contract.get("requested_claims",[])
        current_claims=[h for h in ledger.hypotheses.values() if h.incident_id == incident_id and h.scope.get("contract_id")==cid and
                        h.status == EvidenceLevel.VERIFIED and not any(h.hypothesis_id in e.payload["claims"] for e in mine("supersession"))]
        if requested and all(any(all(h.scope.get(k)==v for k,v in target.items()) for h in current_claims) for target in requested):
            reason="adequate scope"
            break
        if any(value <= 0 for key,value in budgets.items() if key != "perturbation"):
            reason = "resource budget exhausted"
            break
        if len(acquired) >= max_actions:
            reason = "acquisition count budget exhausted"
            break
        capabilities=[]
        for action in actions:
            if not action.get("profile"):
                continue
            if action.get("endpoint"):
                from .network_capture import remote_probe
                capability=remote_probe(action["endpoint"],action["profile"])
            else:
                capability=probe_profile(action["profile"])
            if capability["available"]:
                capabilities.append(action.get("capability_key",action["profile"]))
        capabilities += list(executors or {})
        decision = choose_acquisition(actions, contract.get("scope_priority",["outcome_boundary", "proximate_mechanism", "initiating_location"]),
                                      capabilities, acquired, budgets, active=active,
                                      scope_priority=tuple(contract.get("scope_priority",["outcome_boundary","proximate_mechanism","initiating_location"])))
        if not decision["choice"]:
            reason = decision["reason"]
            break
        selected = decision["choice"]
        pid = ingest(ledger, "acquisition_plan", {**selected, "decision": decision, "inputs": sorted(references)}, incident_id)
        actual = dict(seconds=0., bytes=0, perturbation=0.)
        results = []
        for action_id in selected["bundle"]:
            action = next(a for a in actions if a["id"] == action_id)
            keys = [canonical_hash(r["key"]) for r in action["resources"]]
            if keys and all(key in active for key in keys):
                for key in keys:
                    for ref in active[key]["inputs"]:
                        ingest(ledger, "reference", {"inputs": [ref]}, incident_id)
                results.append("reused shared acquisition")
                continue
            if action.get("experiment"):
                from .verify import execute_network_experiment
                exp = Experiment.from_dict(action["experiment"])
                executor = (executors or {}).get(action_id)
                if executor is None:
                    raise ValueError("scoped experiment executor unavailable")
                result = execute_network_experiment(ledger, exp, executor, cancel=cancel)
                results.append(result["execution"])
                actual["seconds"] += result["elapsed_s"]
                actual["perturbation"] += selected["bounds"]["perturbation"]
                continue
            if acquisition_directory is None:
                raise ValueError("acquisition directory required")
            output = Path(acquisition_directory) / (selected["acquisition_id"]+"-"+canonical_hash(action_id)[:16])
            try:
                if action.get("endpoint"):
                    from .network_capture import remote_capture,fetch_remote_capture
                    remote_dir=action["config"]["remote_directory"]+"/"+selected["acquisition_id"]
                    remote=remote_capture(action["endpoint"],action["profile"],action["config"],remote_dir,
                                          timeout=action["config"]["seconds"]+10)
                    if remote.returncode:
                        raise OSError("remote capture failed: "+remote.stderr[:1024])
                    result=json.loads(remote.stdout)
                    if result.get("manifest"):
                        result["manifest"]=fetch_remote_capture(action["endpoint"],remote_dir,output,
                                                                 action["config"]["max_bytes"])
                else:
                    result = capture(action["profile"], action["config"], output, cancel)
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                result = {"status":f"unavailable acquisition: {exc}","elapsed_s":0,"bytes":0}
            results.append(result["status"])
            actual["seconds"] += result.get("elapsed_s", 0)
            actual["bytes"] += result.get("bytes", 0)
            # If no direct perturbation measure exists, charge the admitted bound.
            actual["perturbation"] = selected["bounds"]["perturbation"]
            if result.get("manifest"):
                try:
                    acquired_ids = ingest_capture(ledger, output, incident_id)
                    for key in keys:
                        active[key] = {"inputs": acquired_ids, "artifact": str(output)}
                except (OSError, ValueError, subprocess.SubprocessError) as exc:
                    results.append(f"inconclusive parse: {exc}")
        ingest(ledger, "acquisition_result", {"acquisition_id": selected["acquisition_id"], "status": results,
                                              "actual": actual, "inputs": [pid]}, incident_id)
        acquired.add(selected["acquisition_id"])
        for key in budgets:
            budgets[key] -= actual[key]
    ingest(ledger, "closure", {"reason": reason, "inputs": [view_id], "remaining_budget": budgets,
                               "unresolved": [name for name,p in predictions.items() if p["result"] == "unresolved"],
                               "open_world": True}, incident_id)
    projection = network_projection(ledger, incident_id)
    ingest(ledger, "summary", {"context": {"regime": contract["regime"]}, "projection": projection,
                               "inputs": [], "historical_advice_only": True}, incident_id)
    return projection


class IsolatedNetworkExecutor:
    """Finite controls for the owned namespace harness; production supplies its own executor."""

    def __init__(self, config):
        import re
        self.config = dict(config)
        for key, prefix in (("namespace", "rootnet-"), ("interface", "rn-s-")):
            if not re.fullmatch(prefix + r"[0-9]+", config[key]):
                raise ValueError("executor requires a harness-owned namespace/interface")
        self.directory = Path(config["directory"])
        self.directory.mkdir(parents=True, exist_ok=True)
        self.load = None

    def command(self, args):
        result = subprocess.run(["ip", "netns", "exec", self.config["namespace"], *args],
                                capture_output=True, text=True, timeout=5, check=True)
        with (self.directory / "readbacks.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"args":args,"stdout":result.stdout,"stderr":result.stderr})+"\n")
        return result.stdout

    def observe(self, plan, block):
        queues = json.loads(self.command(["tc", "-j", "-s", "qdisc", "show", "dev", self.config["interface"]]))
        return {"queues":queues, "interference":"unknown",
                "limitation":"namespace isolation does not exclude shared host CPU interference"}

    def stop_load(self):
        import os
        import signal
        path = self.directory / "load.json"
        if path.exists():
            identity = json.loads(path.read_text())
            proc = Path(f"/proc/{identity['pid']}/stat")
            # A fresh restoration worker may run after the original worker was killed.
            if proc.exists() and proc.read_text().rsplit(")",1)[1].split()[19] == identity["start"]:
                os.kill(identity["pid"], signal.SIGTERM)
            path.unlink()
        if self.load is not None:
            try:
                self.load.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.load.kill()
                self.load.wait(timeout=2)
            self.load = None

    def washout(self, plan, block, timeout):
        self.stop_load()
        self.command(["tc", "qdisc", "replace", "dev", self.config["interface"], "root", "fq"])
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            queues = self.observe(plan, block)["queues"]
            if queues and all(q.get("backlog") == 0 for q in queues):
                return True
            time.sleep(.02)
        return False

    def apply(self, plan, block, arm):
        exposure = plan["exposure"][arm]
        kind = exposure["kind"]
        if kind == "rate":
            rate = exposure["bits_per_second"]
            if not isinstance(rate,int) or not 1000 <= rate <= 10_000_000_000:
                raise ValueError("invalid bounded link rate")
            self.command(["tc", "qdisc", "replace", "dev", self.config["interface"], "root", "tbf",
                          "rate",f"{rate}bit","burst","32768","latency","1000ms"])
        elif kind in ("competing_load", "scheduling"):
            if exposure["enabled"]:
                if kind == "competing_load":
                    args = ["python3","-m","reflex.network","run","--host",self.config["host"],
                            "--port",str(self.config["port"]),"--out",str(self.directory),
                            "--phase",f"load-{block}","--requests","100000","--concurrency","8","--persistent"]
                else:
                    cpu = int(self.config["cpu"])
                    args = ["taskset","-c",str(cpu),"python3","-c","while True: sum(range(100000))"]
                self.load = subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                start = Path(f"/proc/{self.load.pid}/stat").read_text().rsplit(")",1)[1].split()[19]
                (self.directory/"load.json").write_text(json.dumps({"pid":self.load.pid,"start":start}))
        elif kind == "route":
            choice = exposure["via"]
            if choice not in ("198.19.7.2", "198.19.8.2"):
                raise ValueError("route outside harness")
            subprocess.run(["ip","route","replace","198.19.10.2/32","via",choice],check=True,timeout=5)
        elif kind != "pacing":
            raise ValueError("unsupported harness control")
        self.current = exposure

    def readback(self, plan, block, arm):
        exposure = plan["exposure"][arm]
        kind = exposure["kind"]
        if kind == "rate":
            queues = self.observe(plan,block)["queues"]
            rates = [q.get("options",{}).get("rate") for q in queues if q.get("kind") == "tbf"]
            return {"kind":kind,"bits_per_second":rates[0]*8 if len(rates)==1 and isinstance(rates[0],(int,float)) else None}
        if kind == "route":
            rows=json.loads(subprocess.run(["ip","-j","route","get","198.19.10.2"],check=True,
                                          capture_output=True,text=True,timeout=5).stdout)
            return {"kind":kind,"via":rows[0].get("gateway") if rows else None}
        if kind in ("competing_load","scheduling"):
            return {"kind":kind,"enabled":self.load is not None and self.load.poll() is None}
        return {"kind":"pacing","interval_s":self.current["interval_s"]}

    def measure(self, plan, block, arm):
        doc = run(self.config["host"],self.config["port"],self.directory,f"block-{block}",plan["seed"],
                  self.config.get("requests",40),1024,65536,2,concurrency=2,persistent=True,
                  interval_s=self.current.get("interval_s"),deadline_s=self.config.get("deadline_s",.1))
        counts=doc["summary"]["population"]["counts"]
        lower=counts.get("missed",0)/counts["eligible"]
        upper=(counts.get("missed",0)+counts.get("unknown_deadline",0))/counts["eligible"]
        return {"outcome":lower,"outcome_bounds":[lower,upper],
                "coverage":{"complete":lower==upper,"drops":0,"clock_valid":True,
                            "scope":"eligible workload outcomes; deadline censoring remains in the bounds"}}

    def restore(self, plan):
        self.stop_load()
        self.command(["tc","qdisc","replace","dev",self.config["interface"],"root","fq"])
        subprocess.run(["ip","route","replace","198.19.10.2/32","via","198.19.7.2"],check=True,timeout=5)
        return {"status":"restored","state":self.observe(plan,-1)}


def isolated_contrast(ledger_path, incident_id, config, kind, pairs=3):
    """Run a registered broad contrast; limited host isolation cannot verify a narrow mechanism."""
    from .ledger import Ledger, Hypothesis, Experiment, EvidenceLevel, LedgerError
    from .network_capture import ingest
    from .verify import execute_network_experiment, paired_schedule
    if not isinstance(pairs,int) or not 1 <= pairs <= 100:
        raise ValueError("bounded paired schedule required")
    ledger=Ledger(ledger_path)
    contracts=[e for e in ledger.evidence.values() if e.incident_id==incident_id and e.kind=="comparison_contract"]
    cid=contracts[-1].record_id
    scope={"mechanism":"broad intervention effect","location":"isolated workload","contract_id":cid,
           "outcome":contracts[-1].payload["outcome"],"regime":contracts[-1].payload["regime"],
           "assumptions":["shared host interference remains unresolved"],"support":[],
           "alternatives":["unknown mechanism"],"claim_type":"intervention_effect"}
    hypothesis=ledger.propose_hypothesis(Hypothesis(incident_id=incident_id,provenance=VERSION,domain="network",scope=scope))
    exposures={"rate":({"bits_per_second":1_000_000},{"bits_per_second":100_000_000}),
               "route":({"via":"198.19.7.2"},{"via":"198.19.8.2"}),
               "pacing":({"interval_s":.001},{"interval_s":.02}),
               "competing_load":({"enabled":True},{"enabled":False}),
               "scheduling":({"enabled":True},{"enabled":False})}
    before,after=exposures[kind]
    plan={"contract_id":cid,"claims":[hypothesis.hypothesis_id],"eligible_population":"all scheduled deliveries",
          "exposure":{"control":{"kind":kind,**before},"treatment":{"kind":kind,**after}},
          "predictions":["broad workload deadline effect"],"rivals":[],"threshold":.05,
          "assignment_unit":"whole resource block","replication_unit":"reset connections and drained queue",
          "schedule":paired_schedule(pairs,71),"assignment_scheme":"paired_randomized","seed":71,
          "washout":{"timeout_s":3},"budget":{"seconds":pairs*120},"readback":"native resource state",
          "restoration":"owned qdisc fq and original route; stop owned competing process","scope":scope}
    exp=Experiment(hypothesis_id=hypothesis.hypothesis_id,correlation_id="harness-contrast",provenance=VERSION,
                   intervention=kind,domain="network",plan=plan)
    result=execute_network_experiment(ledger,exp,IsolatedNetworkExecutor(config))
    for level in (EvidenceLevel.TESTED,EvidenceLevel.VERIFIED):
        try:
            ledger.transition(hypothesis.hypothesis_id,level,exp.experiment_id)
        except LedgerError as exc:
            ingest(ledger,"fact",{"gate":level.value,"reason":str(exc),"inputs":[]},incident_id)
            break
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--response-bytes", type=int, default=65536)
    p.add_argument("--log", type=Path)
    p = sub.add_parser("relay")
    p.add_argument("--host",default="127.0.0.1")
    p.add_argument("--port",type=int,default=8766)
    p.add_argument("--upstream-host",default="127.0.0.1")
    p.add_argument("--upstream-port",type=int,default=8765)
    p.add_argument("--log",type=Path,required=True)
    p.add_argument("--credits",type=int,default=2)
    p.add_argument("--period-s",type=float,default=.05)
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
    p.add_argument("--persistent", action="store_true")
    p.add_argument("--concurrency", type=int, default=1)
    p.add_argument("--interval-s", type=float)
    p.add_argument("--deadline-s", type=float)
    p.add_argument("--tcp-info", action="store_true")
    p = sub.add_parser("compare")
    p.add_argument("healthy", type=Path)
    p.add_argument("incident", type=Path)
    p = sub.add_parser("capture")
    p.add_argument("--profile", required=True)
    p.add_argument("--config", required=True, help="JSON with explicit duration and byte caps")
    p.add_argument("--out", type=Path, required=True)
    p = sub.add_parser("export")
    p.add_argument("--directory", type=Path, required=True)
    p = sub.add_parser("probe")
    p.add_argument("--profile",required=True)
    p = sub.add_parser("isolated-contrast")
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--incident",required=True)
    p.add_argument("--config",required=True)
    p.add_argument("--kind",choices=("rate","route","pacing","competing_load","scheduling"),required=True)
    for command in ("ingest", "investigate", "resume", "report"):
        p = sub.add_parser(command)
        p.add_argument("--ledger", type=Path, required=True)
        p.add_argument("--incident", required=True)
        if command == "ingest":
            p.add_argument("--input", type=Path, required=True)
            p.add_argument("--arm", choices=("reference","current"), default="current")
            p.add_argument("--format",choices=("normalized","qlog","legacy"),default="normalized")
        if command == "investigate":
            p.add_argument("--contract", type=Path, required=True)
            p.add_argument("--actions", type=Path)
            p.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "serve":
        server(args.host, args.port, args.response_bytes, args.log)
    elif args.cmd == "relay":
        relay(args.host,args.port,args.upstream_host,args.upstream_port,args.log,credits=args.credits,period_s=args.period_s)
    elif args.cmd == "run":
        print(json.dumps(run(args.host, args.port, args.out, args.phase, args.seed,
                             args.requests, args.request_bytes, args.response_bytes,
                             args.timeout_s, args.server_slow_every,
                             args.server_slow_ms, persistent=args.persistent, concurrency=args.concurrency,
                             interval_s=args.interval_s, deadline_s=args.deadline_s,tcp_info=args.tcp_info)["summary"], indent=2))
    elif args.cmd == "compare":
        print(json.dumps(compare(args.healthy, args.incident), indent=2))
    elif args.cmd == "capture":
        from .network_capture import capture
        print(json.dumps(capture(args.profile, json.loads(args.config), args.out), indent=2))
    elif args.cmd == "export":
        import sys
        from .network_capture import export_capture
        export_capture(args.directory,sys.stdout.write)
    elif args.cmd == "probe":
        from .network_capture import probe_profile
        print(json.dumps(probe_profile(args.profile)))
    elif args.cmd == "isolated-contrast":
        print(json.dumps(isolated_contrast(args.ledger,args.incident,json.loads(args.config),args.kind)))
    elif args.cmd == "ingest":
        from .ledger import Ledger, Incident
        from .network_capture import ingest, ingest_file, ingest_workload, ingest_capture
        ledger = Ledger(args.ledger)
        if args.incident not in ledger.incidents:
            ledger.open_incident(Incident(incident_id=args.incident, provenance=VERSION, domain="network"))
        if args.input.is_dir():
            try:
                ingest_capture(ledger,args.input,args.incident)
            except (OSError,ValueError,subprocess.SubprocessError) as exc:
                ingest(ledger,"fact",{"kind":"unavailable_parse","reason":str(exc),"artifact":str(args.input),
                                       "inputs":[]},args.incident)
        elif args.input.name.endswith("-manifest.json"):
            ingest_workload(ledger,args.input,args.incident,arm=args.arm)
        else:
            ingest_file(ledger,args.input,args.incident,format=args.format)
    elif args.cmd in ("investigate", "resume"):
        contract = json.loads(args.contract.read_text()) if args.cmd == "investigate" else None
        actions = json.loads(args.actions.read_text()) if args.cmd == "investigate" and args.actions else []
        print(json.dumps(investigate(args.ledger, args.incident, contract=contract, actions=actions,
                                     acquisition_directory=getattr(args,"out",None)), indent=2))
    elif args.cmd == "report":
        from .ledger import Ledger
        from .report import render_network
        print(render_network(Ledger(args.ledger), args.incident))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
