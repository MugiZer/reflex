"""Versioned network source records and bounded native acquisitions."""
from __future__ import annotations

import json
import math
import csv
import io
import struct
import socket
import subprocess
import shutil
import sys
import time
import uuid
from pathlib import Path

from .ledger import Evidence, LedgerError, canonical_hash, require_fields

VERSION = "network-v2"
BOUNDARIES = frozenset(("release", "ready", "submit", "socket_accept", "write_complete",
    "egress", "ingress", "readable", "complete_readable", "consume", "complete", "cancel",
    "outcome", "retransmit", "ack_emit", "ack_arrive", "recovery", "queue_enqueue",
    "queue_dequeue", "switch_ingress", "switch_egress", "relay_ingress", "relay_release",
    "relay_egress", "runnable", "running", "blocked", "preempt", "eligible", "link_assign",
    "access", "retry", "delivery", "route", "socket_state", "flow_control", "migration", "packet_capture"))


def validate_payload(kind, p):
    json.dumps(p, allow_nan=False)
    if kind == "event":
        require_fields(p, ("source_instance", "sequence", "clock", "time", "boundary", "values",
                           "units", "links", "limitations", "coverage", "artifact"))
        if not p["source_instance"] or not isinstance(p["sequence"], int) or p["sequence"] < 0:
            raise LedgerError("source instance and nonnegative sequence required")
        if p["boundary"] not in BOUNDARIES or not p["clock"]:
            raise LedgerError("unsupported boundary or absent clock")
        if not isinstance(p["time"], (float, int)) or not math.isfinite(p["time"]):
            raise LedgerError("finite local timestamp required")
        if not isinstance(p.get("uncertainty",0),(int,float)) or p.get("uncertainty",0) < 0:
            raise LedgerError("nonnegative timestamp uncertainty required")
        if not isinstance(p["links"], list) or not isinstance(p["limitations"], list):
            raise LedgerError("links and limitations must be lists")
        for link in p["links"]:
            require_fields(link, ("relation", "identity", "certainty"))
            if link["certainty"] not in ("explicit", "bounded", "inferred"):
                raise LedgerError("unknown association certainty")
        require_fields(p["coverage"], ("complete", "drops"))
        if p["units"].get("time") not in ("ns","us","ms","s"):
            raise LedgerError("explicit timestamp units required")
        drops=p["coverage"]["drops"]
        if drops is not None and (not isinstance(drops,int) or isinstance(drops,bool) or drops < 0):
            raise LedgerError("drops must be a nonnegative count or unknown")
        if p["coverage"]["complete"] is True and drops != 0:
            raise LedgerError("complete coverage conflicts with unknown/lost events")
    elif kind == "comparison_contract":
        require_fields(p, ("target", "outcome", "exposure", "comparable", "mediators", "reference_ids",
                           "selection", "frozen_at", "dependence", "estimand", "threshold", "alpha",
                           "weights", "regime", "units"))
        if set(p["comparable"]) & set(p["mediators"]):
            raise LedgerError("cannot match on proposed mediator")
        if p["exposure"] in p["comparable"]:
            raise LedgerError("cannot match away exposure")
        if not 0 < p["alpha"] < 1 or p["threshold"] < 0 or p["selection"] not in ("exploratory", "confirmatory"):
            raise LedgerError("invalid inferential allocation/selection")
    elif kind == "experiment_result":
        require_fields(p, ("experiment_id", "plan_hash", "execution", "inputs", "scope"))
    elif kind == "supersession":
        require_fields(p, ("claims", "reason", "inputs"))
    elif kind == "source":
        require_fields(p, ("endpoint", "instance", "source", "version", "clock", "boundaries", "identity_precision",
                           "sampling", "intervals", "drops", "retention", "resolution", "access", "probe"))
    elif kind == "topology":
        require_fields(p,("incidence","intervals","endpoint_bounds","resources","epochs","additivity_basis","inputs"))
    elif kind not in ("episode", "fact", "acquisition_plan", "acquisition_result", "closure", "summary",
                       "population", "experiment_observation", "error_allocation", "reference", "clock_mapping"):
        raise LedgerError(f"unsupported network record kind {kind}")


def event(source, sequence, clock, at, boundary, values=None, links=(), *, units=None,
          coverage=None, limitations=(), artifact=None, uncertainty=0):
    p = dict(source_instance=source, sequence=sequence, clock=clock, time=at, boundary=boundary,
             values=values or {}, units=units or {"time":"ns"}, links=list(links),
             coverage=coverage or {"complete": False, "drops": None},
             limitations=list(limitations), artifact=artifact, uncertainty=uncertainty)
    validate_payload("event", p)
    return p


def ingest(ledger, kind, payload, incident_id=""):
    validate_payload(kind, payload)
    identity = ([payload["source_instance"], payload["sequence"]] if kind == "event"
                else [incident_id, kind, payload])
    record_id = canonical_hash(identity)[:32]
    # Raw identity is shared; incident views reference it without cloning the observation.
    owner = "" if kind == "event" else incident_id
    rec = Evidence(record_id=record_id, correlation_id=record_id, provenance=VERSION,
                   kind=kind, payload=payload, incident_id=owner, domain="network", ts_ns=0)
    ledger.append_evidence(rec)
    if kind == "event" and incident_id:
        ingest(ledger, "reference", {"inputs": [record_id]}, incident_id)
    return record_id


def read_normalized(path):
    """Documented normalized JSONL v2; unknown fields never become observations."""
    with Path(path).open(encoding="utf-8") as fh:
        for position, line in enumerate(fh):
            row = json.loads(line)
            if row.get("version") != VERSION or row.get("kind") not in ("event", "source", "clock_mapping", "topology", "population"):
                raise LedgerError(f"unsupported export at record {position}")
            validate_payload(row["kind"], row["payload"])
            yield row["kind"], row["payload"]


def read_legacy(path, source):
    with Path(path).open(encoding="utf-8") as fh:
        for seq, line in enumerate(fh):
            row = json.loads(line)
            boundary = "consume" if "client_finish_ns" in row else "write_complete"
            timestamp = row.get("client_finish_ns", row.get("sent_ns"))
            if timestamp is None:
                continue
            values = {k: row[k] for k in ("client_rtt_ns", "server_work_ns", "status", "request_bytes", "response_bytes") if k in row}
            yield event(source, seq, row["clock_domain"], timestamp, boundary, values,
                        [{"relation": "delivery", "identity": row["request_id"], "certainty": "explicit"}],
                        units={"time": "ns"}, limitations=["legacy: intended release, transport and coverage unavailable"],
                        artifact={"record": seq})


def ingest_workload(ledger, manifest_path, incident_id, *, arm, max_records=4096):
    from .collect import artifact_path, _sha256
    path=Path(manifest_path)
    manifest=json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("domain") != "network" or manifest.get("version") != VERSION:
        raise ValueError("unsupported workload manifest")
    ids=[]
    omitted=0
    for name,digest in manifest.get("sha256",{}).items():
        artifact=artifact_path(path.parent,name)
        if _sha256(artifact) != digest:
            raise ValueError("workload artifact checksum mismatch")
        if name.endswith("-events.jsonl"):
            for kind,payload in read_normalized(artifact):
                if len(ids)>=max_records:
                    omitted+=1
                    continue
                if not manifest["event_coverage"]["complete"] or manifest["event_coverage"]["dropped"]:
                    payload["coverage"]={"complete":False,"drops":manifest["event_coverage"]["dropped"]}
                    payload["limitations"].append("application event export coverage incomplete")
                ids.append(ingest(ledger,kind,payload,incident_id))
    if omitted:
        ingest(ledger,"fact",{"kind":"analysis_retention_limit","omitted_events":omitted,
                              "retained_events":len(ids),"raw_manifest":str(path),"inputs":[],
                              "limitation":"unselected detail remains in raw artifacts; absence outside retained view is unknown"},incident_id)
    population=manifest.get("population")
    if population is not None:
        ids.append(ingest(ledger,"population",{"arm":arm,"summary":population,
            "context":manifest["context"],"inputs":[],
            "block":None,"inference_limit":"workload completion blocks do not establish independent replication"},incident_id))
    return ids


def ingest_file(ledger, path, incident_id, *, format="normalized", max_records=4096):
    from .collect import _sha256
    path=Path(path)
    digest=_sha256(path)
    if format == "qlog":
        if path.stat().st_size > 64*1024*1024:
            raise ValueError("qlog JSON exceeds 64 MiB parser cap; export bounded segments")
        rows=(("event",row) for row in parse_qlog(json.loads(path.read_text()),digest))
    elif format == "legacy":
        rows=(("event",row) for row in read_legacy(path,digest))
    elif format == "normalized":
        rows=read_normalized(path)
    else:
        raise ValueError("unknown evidence format")
    ids=[]
    omitted=0
    for kind,row in rows:
        if len(ids)>=max_records:
            omitted+=1
            continue
        ids.append(ingest(ledger,kind,row,incident_id))
    ingest(ledger,"fact",{"kind":"import_coverage","format":format,"artifact":str(path),"sha256":digest,
                           "retained":len(ids),"omitted":omitted,"inputs":ids,
                           "limitation":"unretained records cannot support absence claims" if omitted else "source-specific limits remain"},incident_id)
    return ids


def tcp_info(raw):
    """Linux tcp_info prefix through total_retrans (104 bytes), never guess extensions."""
    import base64
    result = {"raw": base64.b64encode(raw).decode(), "size": len(raw), "abi": "linux-tcp-info-prefix-104"}
    if len(raw) < 8:
        raise ValueError("truncated TCP_INFO")
    result["state"] = raw[0]
    fields = ("rto_us", "ato_us", "snd_mss", "rcv_mss", "unacked", "sacked", "lost",
              "retrans", "fackets", "last_data_sent_ms", "last_ack_sent_ms", "last_data_recv_ms",
              "last_ack_recv_ms", "pmtu", "rcv_ssthresh", "rtt_us", "rttvar_us", "snd_ssthresh",
              "snd_cwnd", "advmss", "reordering", "rcv_rtt_us", "rcv_space", "total_retrans")
    for index, name in enumerate(fields):
        offset = 8 + 4 * index
        if len(raw) >= offset + 4:
            result[name] = struct.unpack_from("=I", raw, offset)[0]
    return result


def sample_socket(sock, source, sequence, clock, connection):
    if not sys.platform.startswith("linux"):
        return {"available": False, "reason": "Linux TCP_INFO ABI required"}
    start = time.monotonic_ns()
    raw = sock.getsockopt(socket.IPPROTO_TCP, socket.TCP_INFO, 256)
    return event(source, sequence, clock, time.monotonic_ns(), "socket_state", tcp_info(raw),
                 [{"relation": "connection", "identity": connection, "certainty": "explicit"}],
                 units={"time": "ns"}, limitations=["snapshot; transitions between reads unknown"],
                 artifact={"sample_start_ns": start})


TSHARK_FIELDS = ("frame.number", "frame.time_epoch", "frame.len", "ip.src", "ip.dst", "tcp.stream",
                "tcp.seq_raw", "tcp.ack_raw", "tcp.len", "tcp.flags", "tcp.analysis.retransmission")


def parse_tshark(text, source, clock, artifact, coverage):
    rows = csv.DictReader(io.StringIO(text), delimiter="\t")
    if tuple(rows.fieldnames or ()) != TSHARK_FIELDS:
        raise ValueError("unsupported tshark field layout")
    for row in rows:
        if not row["frame.number"] or not row["frame.time_epoch"]:
            raise ValueError("missing packet identity/time")
        values = {"frame_bytes": int(row["frame.len"]), "src": row["ip.src"], "dst": row["ip.dst"]}
        for field in ("tcp.seq_raw", "tcp.ack_raw", "tcp.len"):
            if row[field]:
                values[field] = int(row[field])
        values["flags"] = row["tcp.flags"]
        values["dissector_retransmission_annotation"] = bool(row["tcp.analysis.retransmission"])
        links = [{"relation": "connection", "identity": f"{source}:tcp:{row['tcp.stream']}", "certainty": "inferred"}] if row["tcp.stream"] else []
        yield event(source, int(row["frame.number"]), clock, float(row["frame.time_epoch"]), "packet_capture",
                    values, links, units={"time": "s", "frame_bytes": "bytes"}, artifact=artifact,
                    coverage=coverage, limitations=["capture boundary; offload/coalescing possible; labels are dissector inferences"])


def parse_perf(text, source, clock, coverage):
    """perf script -F comm,pid,tid,cpu,time,event,trace text."""
    import re
    pattern = re.compile(r"^\s*(.*?)\s+(\d+)/(\d+)\s+\[(\d+)\]\s+([\d.]+):\s+(sched:\w+):\s+(.*)$")
    for seq, line in enumerate(text.splitlines()):
        if not line.strip() or line.startswith("#"):
            continue
        if "LOST" in line:
            yield event(source, seq, clock, 0, "socket_state", {"lost_event_report": line},
                        coverage={"complete": False, "drops": None}, limitations=["scheduler coverage lost"])
            continue
        match = pattern.match(line)
        if not match:
            raise ValueError("unsupported perf script row")
        comm, pid, tid, cpu, at, name, detail = match.groups()
        fields = dict(re.findall(r"(\w+)=([^\s]+)", detail))
        if name in ("sched:sched_wakeup", "sched:sched_wakeup_new"):
            boundary, target = "runnable", fields.get("pid")
        elif name == "sched:sched_switch":
            boundary, target = "running", fields.get("next_pid")
        else:
            raise ValueError("unsupported scheduler event")
        if target is None:
            raise ValueError("scheduler event missing target thread")
        yield event(source, seq, clock, float(at), boundary, {**fields, "comm": comm, "cpu": int(cpu)},
                    [{"relation": "thread", "identity": f"{source}:{target}", "certainty": "explicit"}],
                    units={"time": "s"}, coverage=coverage, limitations=["does not establish message readiness"])


def parse_iw(text):
    import re
    result = {}
    allowed = {"rx bytes", "tx bytes", "rx packets", "tx packets", "tx retries", "tx failed",
               "signal", "channel active time", "channel busy time", "channel receive time", "channel transmit time"}
    for line in text.splitlines():
        match = re.match(r"\s*([^:]+):\s*(-?\d+)\s*(.*)", line)
        if match and match[1].strip() in allowed:
            result[match[1].strip()] = {"value": int(match[2]), "unit": match[3].strip() or "counter"}
    if not result:
        raise ValueError("no supported iw counters")
    return result


def counter_delta(before, after):
    return {k: (after[k]["value"] - before[k]["value"]
                if k in before and after[k]["unit"] == before[k]["unit"] and after[k]["value"] >= before[k]["value"] else None)
            for k in after}


def parse_qlog(document, source):
    if document.get("qlog_version") != "0.3" or document.get("qlog_format", "JSON") != "JSON":
        raise ValueError("supported qlog profile: 0.3 JSON")
    sequence = 0
    for trace_index, trace in enumerate(document["traces"]):
        common = trace.get("common_fields", {})
        clock = f"{source}:qlog:{trace_index}:{common.get('reference_time', 'unspecified')}"
        for row in trace["events"]:
            if not isinstance(row, dict) or not {"time", "name", "data"} <= row.keys():
                raise ValueError("unsupported qlog event layout")
            name, data = row["name"], row["data"]
            mapping = {"transport:packet_sent": "egress", "transport:packet_received": "ingress",
                       "recovery:packet_lost": "recovery", "transport:parameters_set": "flow_control",
                       "connectivity:connection_id_updated": "migration"}
            if name not in mapping:
                continue
            values = {"qlog_event": name, "data": data}
            links = [{"relation": "connection", "identity": f"{source}:{trace_index}", "certainty": "explicit"}]
            for frame in data.get("frames", []):
                if frame.get("frame_type") == "stream":
                    links.append({"relation": "stream_range", "identity": [frame["stream_id"], frame["offset"], frame["offset"] + frame["length"]], "certainty": "explicit"})
            yield event(source, sequence, clock, row["time"], mapping[name], values, links,
                        units={"time": "ms"}, limitations=["qlog transport events; application framing requires explicit joins"])
            sequence += 1


def timestamp_controls(ancillary, source_clock, hardware_clock=None):
    """Decode Linux SCM_TIMESTAMPING 64-bit timespec triples; clock identities stay separate."""
    if len(ancillary) != 48:
        raise ValueError("unsupported timestamping ABI")
    result = []
    for index in (0, 2):
        seconds, nanos = struct.unpack_from("=qq", ancillary, index * 16)
        if not 0 <= nanos < 1_000_000_000:
            raise ValueError("invalid timespec")
        if seconds or nanos:
            result.append({"time_ns": seconds * 1_000_000_000 + nanos,
                           "clock": source_clock if index == 0 else hardware_clock,
                           "generation": "software" if index == 0 else "raw_hardware"})
    return result


def enable_timestamping(sock, *, hardware=False):
    """Linux timestamping for callers owning recvmsg/error-queue consumption."""
    if not sys.platform.startswith("linux"):
        return {"available":False,"reason":"Linux socket timestamping required"}
    option = getattr(socket,"SO_TIMESTAMPING",37)
    flags = (1 << 1) | (1 << 3) | (1 << 4) | (1 << 7)
    if hardware:
        flags |= (1 << 0) | (1 << 2) | (1 << 6)
    try:
        sock.setsockopt(socket.SOL_SOCKET,option,flags)
        actual = sock.getsockopt(socket.SOL_SOCKET,option)
    except OSError as exc:
        return {"available":False,"reason":str(exc)}
    return {"available":actual == flags,"flags":actual,"option":option,
            "limitations":["requested hardware flags do not establish device support or clock mapping",
                            "transmit ID and byte association must be retained from error queue"]}


def receive_timestamped(sock, size, source_clock, hardware_clock=None, *, error_queue=False):
    if not sys.platform.startswith("linux") or not hasattr(sock,"recvmsg"):
        raise OSError("recvmsg timestamp source unavailable")
    flags = getattr(socket,"MSG_ERRQUEUE",0x2000) if error_queue else 0
    data, controls, message_flags, peer = sock.recvmsg(size,4096,flags)
    stamps, errors = [], []
    for level, kind, raw in controls:
        if level == socket.SOL_SOCKET and kind in (37,65):
            stamps.extend(timestamp_controls(raw,source_clock,hardware_clock))
        elif level in (socket.SOL_IP,getattr(socket,"SOL_IPV6",41)) and len(raw) >= 16:
            errno, origin, typ, code, pad, info, identity = struct.unpack_from("=IBBBBII",raw)
            errors.append({"errno":errno,"origin":origin,"type":typ,"code":code,"info":info,"timestamp_id":identity})
    return {"data":data,"peer":peer,"timestamps":stamps,"error_queue":errors,
            "control_truncated":bool(message_flags & getattr(socket,"MSG_CTRUNC",8)),
            "generation_semantics":"kernel software or device timestamp; not application completion"}


def clock_bracket(clock_read, source_clock, target_clock, samples=8):
    """Bracket a same-host external clock read in monotonic time, retaining read uncertainty."""
    if not 1 <= samples <= 1000:
        raise ValueError("bounded sample count required")
    brackets = []
    for _ in range(samples):
        before = time.monotonic_ns()
        source = clock_read()
        after = time.monotonic_ns()
        brackets.append({"source_time":source,"target_interval":[before,after]})
    return {"source":source_clock,"target":target_clock,"brackets":brackets,
            "limitation":"instant offset brackets; future drift/rate bounds require external evidence"}


def pin_closed_segments(directory, names, destination, byte_cap):
    """Checksummed closed segments only; active capture files cannot be pinned."""
    from .collect import artifact_path, _sha256
    directory, destination = Path(directory), Path(destination)
    manifest = json.loads((directory/"manifest.json").read_text())
    if manifest.get("status") != "done":
        raise ValueError("active segments cannot be pinned")
    destination.mkdir(parents=True,exist_ok=False)
    retained, lost, used = [], [], 0
    for name in names:
        source = artifact_path(directory,name)
        expected = manifest.get("sha256",{}).get(name)
        if expected is None or _sha256(source) != expected:
            raise ValueError("unverified closed segment")
        size = source.stat().st_size
        if used+size > byte_cap:
            lost.append(name)
            continue
        target = artifact_path(destination,name)
        shutil.copyfile(source,target)
        if _sha256(target) != expected:
            raise ValueError("segment changed during pin")
        retained.append({"name":name,"sha256":expected,"bytes":size})
        used += size
    result={"retained":retained,"lost":lost,"bytes":used,"coverage":manifest.get("coverage"),
            "unavailable_predecessors":"only recorded retained segments can be recovered"}
    (destination/"pin.json").write_text(json.dumps(result),encoding="utf-8")
    return result


PROFILES = {
    "socket": {"tool": "ss", "boundaries": ["socket_state"]},
    "packets": {"tool": "dumpcap", "boundaries": ["packet_capture"]},
    "scheduler": {"tool": "perf", "boundaries": ["runnable", "running", "blocked"]},
    "route": {"tool": "ip", "boundaries": ["route"]},
    "wireless": {"tool": "iw", "boundaries": []},
    "probe": {"tool": "bpftrace", "boundaries": ["socket_state", "retransmit"]},
    "normalized": {"tool": None, "boundaries": sorted(BOUNDARIES)},
    "qlog": {"tool": None, "boundaries": ["ingress", "egress", "recovery", "flow_control", "migration"]},
}


def acquisition_catalog(endpoints, epoch, inputs):
    """Finite source catalog, expanded only for explicitly configured endpoint access and caps."""
    distinctions={"socket":["proximate_mechanism"],"packets":["outcome_boundary","proximate_mechanism"],
                  "scheduler":["outcome_boundary"],"route":["initiating_location"],
                  "wireless":["proximate_mechanism"],"probe":["outcome_boundary","proximate_mechanism"]}
    rows=[]
    for endpoint in endpoints:
        for profile,config in endpoint.get("sources",{}).items():
            if profile not in distinctions:
                continue
            row={"id":f"{endpoint['id']}-{profile}","profile":profile,"scope":endpoint["id"],
                 "epoch":epoch,"inputs":list(inputs),"distinctions":distinctions[profile],
                 "capabilities":[f"{endpoint['id']}:{profile}"],"capability_key":f"{endpoint['id']}:{profile}","prerequisites":[],"config":config,
                 "coverage":config.get("coverage_requirement"),
                 "outcomes":[{"basis":"boundary_semantics","changes":distinctions[profile],
                              "predicate":"joined observed boundaries refine supported region",
                              "inconclusive":"missing identity, coverage, framing, clock bounds or remote endpoint"}],
                 "resources":[{"key":[endpoint["id"],profile,config.get("filter"),epoch,config.get("interface"),config.get("pid")],
                               "bounds":config.get("cost_bounds")}],"endpoint":endpoint.get("ssh")}
            rows.append(row)
    return rows


def probe_profile(name):
    profile = PROFILES[name]
    tool = profile["tool"]
    if tool is None:
        return {"available": True, "mode": "ingest", "version": VERSION}
    if not sys.platform.startswith("linux") or not shutil.which(tool):
        return {"available": False, "reason": f"Linux {tool} unavailable"}
    probe = subprocess.run([tool, "--version" if tool in ("dumpcap", "bpftrace", "perf") else "-V"],
                           capture_output=True, text=True, timeout=5)
    return {"available": probe.returncode == 0, "version": (probe.stdout + probe.stderr)[:2048],
            "reason": "tool probe only; attachment permissions checked on acquisition"}


def capture_command(profile, config, out):
    seconds = config["seconds"]
    if not isinstance(seconds, (int, float)) or not 0 < seconds <= 3600:
        raise ValueError("capture requires bounded duration <= 3600s")
    interface = config.get("interface", "")
    if profile in ("packets", "wireless") and (not interface or interface.startswith("-")):
        raise ValueError("explicit interface required")
    if profile == "packets":
        return ["dumpcap", "-i", interface, "-f", config.get("filter", "tcp"), "-a", f"duration:{seconds}",
                "-a", f"filesize:{config['max_bytes']//1024}", "-w", str(out / "packets.pcapng")]
    if profile == "scheduler":
        return ["perf", "sched", "record", "-o", str(out / "sched.data"), "-p", str(int(config["pid"])),
                "--", "sleep", str(seconds)]
    if profile == "socket":
        return ["ss", "-tinmpe"]
    if profile == "route":
        return ["ip", "-j", "route", "show"]
    if profile == "wireless":
        return ["iw", "dev", interface, "station", "dump"]
    if profile == "probe":
        options=[]
        if config.get("readability"):
            if not Path("/sys/kernel/btf/vmlinux").is_file():
                raise OSError("BTF unavailable for rich receive profile")
            options.append("-DROOT_RICH")
        if config.get("queue"):
            if int(config.get("ifindex",0)) <= 0:
                raise ValueError("queue profile requires selected interface index")
            options.append("-DROOT_QDISC")
        return ["bpftrace", *options, str(Path(__file__).with_name("network_probe.bt")),
                str(int(config["pid"])), str(int(seconds)), str(int(config.get("ifindex",0)))]
    raise ValueError("profile has no live command")


def capture(profile, config, directory, cancel=None):
    from .collect import begin_artifacts, finalize_artifacts
    directory = Path(directory)
    if profile == "normalized" and config.get("pin_request"):
        return pin_history(config,directory)
    availability = probe_profile(profile)
    if not availability["available"]:
        return {"status": "unavailable", **availability}
    if not 1024 <= config.get("max_bytes", 0) <= 1_073_741_824:
        raise ValueError("explicit byte cap required")
    command = capture_command(profile, config, directory)
    begin_artifacts(directory, {"domain": "network", "version": VERSION, "source_id": uuid.uuid4().hex,
                                 "profile": profile, "config": config, "tool": availability, "command": command})
    start = time.monotonic()
    status = "complete"
    with (directory / "raw.txt").open("wb") as stdout, (directory / "stderr.txt").open("wb") as stderr:
        process = subprocess.Popen(command, stdout=stdout, stderr=stderr)
        try:
            while process.poll() is None:
                size = sum(p.stat().st_size for p in directory.iterdir() if p.is_file())
                if cancel and cancel.is_set():
                    status = "cancelled"
                    break
                if time.monotonic() - start > config["seconds"] + 2 or size > config["max_bytes"]:
                    status = "budget exhausted"
                    break
                time.sleep(.02)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    if process.returncode:
        status = "failed" if status == "complete" else status
    names = [p.name for p in directory.iterdir() if p.name != "manifest.json"]
    coverage=source_coverage(profile,status,(directory/"raw.txt").read_text(errors="replace"),
                             (directory/"stderr.txt").read_text(errors="replace"))
    manifest = finalize_artifacts(directory, names, coverage=coverage)
    return {"status": status, "manifest": manifest, "elapsed_s": time.monotonic()-start,
            "bytes": sum((directory/n).stat().st_size for n in names)}


def pin_history(config, directory):
    """Local/SSH hindsight over closed endpoint segments, selected in source-local coordinates."""
    from .collect import begin_artifacts,finalize_artifacts,artifact_path,_sha256
    started=time.monotonic()
    source=Path(config["source_directory"])
    manifest=json.loads((source/"manifest.json").read_text())
    if manifest.get("status") != "done":
        raise ValueError("hindsight needs closed, checksummed segments")
    request=config["pin_request"]
    if not request.get("source_instance") or not 1024 <= config["max_bytes"] <= 1_073_741_824:
        raise ValueError("source-scoped pin and byte cap required")
    if not 0 < config.get("seconds",0) <= 3600:
        raise ValueError("bounded hindsight deadline required")
    begin_artifacts(directory,{"domain":"network","version":VERSION,"source_id":uuid.uuid4().hex,
                              "profile":"normalized","config":config,"tool":{"version":VERSION}})
    used=matched=lost=0
    first=last=None
    with (Path(directory)/"raw.txt").open("w",encoding="utf-8") as output:
        for name in request["segments"]:
            path=artifact_path(source,name)
            if name not in manifest["sha256"] or _sha256(path)!=manifest["sha256"][name]:
                raise ValueError("unverified hindsight segment")
            for kind,row in read_normalized(path):
                if time.monotonic()-started > config["seconds"]:
                    raise TimeoutError("hindsight analysis deadline")
                if kind != "event" or row["source_instance"] != request["source_instance"]:
                    continue
                sequence=request.get("sequence")
                if sequence and not sequence[0] <= row["sequence"] <= sequence[1]:
                    continue
                window=request.get("time")
                if window and (row["clock"] != request.get("clock") or not window[0] <= row["time"] <= window[1]):
                    continue
                identities=request.get("identities",[])
                if identities and not any(link["identity"] in identities and link["certainty"]=="explicit" for link in row["links"]):
                    continue
                matched+=1
                text=json.dumps({"version":VERSION,"kind":"event","payload":row})+"\n"
                size=len(text.encode())
                if used+size > config["max_bytes"]:
                    lost+=1
                    continue
                output.write(text)
                used+=size
                first=row["sequence"] if first is None else min(first,row["sequence"])
                last=row["sequence"] if last is None else max(last,row["sequence"])
    coverage={"complete":False,"drops":lost or None,"matched":matched,"retained_sequence":[first,last],
              "reason":"historical source coverage applies; expired/unrecorded predecessors cannot be recreated"}
    finished=finalize_artifacts(directory,["raw.txt"],coverage=coverage)
    return {"status":"pinned" if matched else "evidence expired or never recorded","manifest":finished,
            "elapsed_s":time.monotonic()-started,"bytes":used}


def source_coverage(profile,status,stdout,stderr):
    import re
    result={"complete":False,"drops":None,"scope":"selected source/filter during acquisition",
            "reason":"source loss/coverage metadata unavailable"}
    if status != "complete":
        return {**result,"reason":status}
    if profile in ("socket","route","wireless"):
        return {"complete":True,"drops":0,"scope":"returned snapshot only; between-read transitions unobserved"}
    if profile == "packets":
        counters=re.findall(r"pcap:\s*(\d+)\s*,\s*ifdrop:\s*(\d+)",stderr)
        if counters:
            dropped=sum(int(a)+int(b) for a,b in counters)
            return {"complete":dropped==0,"drops":dropped,"scope":"capture interface/filter; offload semantics remain"}
    if profile == "probe":
        expected=re.search(r"@events:\s*(\d+)",stdout)
        observed=sum(line.split(" ",1)[0] in ("state","retransmit","receive","queue-in","queue-out") for line in stdout.splitlines())
        if expected:
            dropped=max(0,int(expected[1])-observed)
            complete=dropped==0 and int(expected[1])==observed and not re.search(r"lost|drop",stderr,re.I)
            return {"complete":complete,"drops":dropped if complete or dropped else None,
                    "scope":"attached, filtered probes; process filters can exclude softirq execution"}
    return result


def remote_capture(endpoint, profile, config, remote_directory, timeout=60):
    """Fixed SSH entry; endpoint configuration is supplied by the operator."""
    import shlex
    if not endpoint or endpoint.startswith("-") or any(c.isspace() for c in endpoint):
        raise ValueError("invalid SSH endpoint")
    args = ["python3", "-m", "reflex.network", "capture", "--profile", profile,
            "--config", json.dumps(config), "--out", remote_directory]
    return subprocess.run(["ssh", "-oBatchMode=yes", "-oConnectTimeout=5", endpoint,
                           shlex.join(args)], capture_output=True, text=True, timeout=timeout)


def remote_probe(endpoint,profile):
    import shlex
    if not endpoint or endpoint.startswith("-") or any(c.isspace() for c in endpoint):
        raise ValueError("invalid SSH endpoint")
    try:
        result=subprocess.run(["ssh","-oBatchMode=yes","-oConnectTimeout=5",endpoint,
                               shlex.join(["python3","-m","reflex.network","probe","--profile",profile])],
                               capture_output=True,text=True,timeout=10)
        if result.returncode:
            return {"available":False,"reason":"remote probe failed"}
        return json.loads(result.stdout)
    except (OSError,ValueError,subprocess.SubprocessError) as exc:
        return {"available":False,"reason":str(exc)}


def export_capture(directory, write):
    """Stream closed verified artifacts through the same CLI, in bounded base64 chunks."""
    import base64
    from .collect import _sha256,artifact_path
    directory=Path(directory)
    manifest=json.loads((directory/"manifest.json").read_text())
    if manifest.get("domain") != "network" or manifest.get("status") != "done":
        raise ValueError("only completed network artifacts can be exported")
    write(json.dumps({"manifest":manifest})+"\n")
    for name,digest in manifest["sha256"].items():
        path=artifact_path(directory,name)
        if _sha256(path) != digest:
            raise ValueError("export checksum mismatch")
        with path.open("rb") as fh:
            for chunk in iter(lambda:fh.read(32768),b""):
                write(json.dumps({"name":name,"data":base64.b64encode(chunk).decode()})+"\n")
        write(json.dumps({"name":name,"closed":True})+"\n")


def import_capture_stream(lines,directory,byte_cap):
    import base64
    from .collect import artifact_path,begin_artifacts,finalize_artifacts
    iterator=iter(lines)
    first=json.loads(next(iterator))
    manifest=first["manifest"]
    if manifest.get("domain") != "network" or manifest.get("status") != "done":
        raise ValueError("invalid remote manifest")
    directory=Path(directory)
    begin_artifacts(directory,{k:v for k,v in manifest.items() if k not in ("sha256","status")})
    used=0
    closed=set()
    for line in iterator:
        if len(line)>65536:
            raise ValueError("oversized remote chunk")
        row=json.loads(line)
        name=row["name"]
        if name not in manifest["sha256"] or name in closed:
            raise ValueError("unexpected or reopened remote artifact")
        path=artifact_path(directory,name)
        if row.get("closed"):
            path.touch(exist_ok=True)
            closed.add(name)
        else:
            data=base64.b64decode(row["data"],validate=True)
            used+=len(data)
            if used>byte_cap:
                raise ValueError("remote export byte budget exhausted")
            with path.open("ab") as fh:
                fh.write(data)
    if closed != set(manifest["sha256"]):
        raise ValueError("incomplete remote export")
    from .collect import _sha256
    if any(_sha256(artifact_path(directory,n)) != digest for n,digest in manifest["sha256"].items()):
        raise ValueError("remote artifact checksum mismatch")
    return finalize_artifacts(directory,sorted(closed),coverage=manifest["coverage"])


def fetch_remote_capture(endpoint,remote_directory,local_directory,byte_cap,timeout=60):
    import shlex
    import tempfile
    import threading
    if not endpoint or endpoint.startswith("-") or any(c.isspace() for c in endpoint):
        raise ValueError("invalid SSH endpoint")
    args=["python3","-m","reflex.network","export","--directory",remote_directory]
    with tempfile.TemporaryFile() as errors:
        process=subprocess.Popen(["ssh","-oBatchMode=yes","-oConnectTimeout=5",endpoint,shlex.join(args)],
                                 stdout=subprocess.PIPE,stderr=errors,text=True)
        timer=threading.Timer(timeout,process.kill)
        timer.start()
        try:
            manifest=import_capture_stream(iter(lambda:process.stdout.readline(65537),""),local_directory,byte_cap)
            if process.wait(timeout=5):
                raise OSError("remote export failed")
            return manifest
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()


def ingest_capture(ledger, directory, incident_id):
    from .collect import _sha256, artifact_path
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("domain") != "network" or manifest.get("version") != VERSION:
        raise ValueError("not a network evidence manifest")
    for name, digest in manifest["sha256"].items():
        if _sha256(artifact_path(directory, name)) != digest:
            raise ValueError("artifact checksum mismatch")
    profile, source = manifest["profile"], manifest["source_id"]
    coverage = manifest["coverage"]
    ingest(ledger,"source",{"endpoint":manifest.get("endpoint","capture endpoint"),"instance":source,
           "source":profile,"version":manifest.get("tool",{}).get("version","unknown"),"clock":source+":source-local",
           "boundaries":PROFILES[profile]["boundaries"],"identity_precision":"profile-specific; see event links",
           "sampling":manifest["config"],"intervals":coverage.get("intervals",[]),"drops":coverage.get("drops"),
           "retention":"closed artifact","resolution":None,"access":"native tool privileges",
           "probe":manifest.get("tool"),"coverage":coverage,"artifact":manifest["sha256"]},incident_id)
    if coverage.get("reason") in ("failed","cancelled","budget exhausted"):
        return [ingest(ledger,"fact",{"kind":"unavailable_source","profile":profile,
                                      "coverage":coverage,"artifact":manifest["sha256"],"inputs":[]},incident_id)]
    text = (directory / "raw.txt").read_text(encoding="utf-8", errors="strict")
    rows = []
    if profile == "wireless":
        rows = [event(source, 0, source+":local", 0, "socket_state", parse_iw(text),
                      limitations=["station counters do not establish contention"], coverage=coverage)]
    elif profile == "route":
        routes = json.loads(text)
        if not isinstance(routes, list):
            raise ValueError("ip route JSON array required")
        rows = [event(source, 0, source+":local", 0, "route", {"routes": routes},
                      limitations=["current local route; historical flow path unavailable"], coverage=coverage)]
    elif profile == "packets":
        command = ["tshark", "-r", str(directory / "packets.pcapng"), "-T", "fields", "-E", "header=y"]
        for field in TSHARK_FIELDS:
            command += ["-e", field]
        parsed = subprocess.run(command, capture_output=True, text=True, timeout=manifest["config"]["seconds"]+10, check=True)
        rows = parse_tshark(parsed.stdout, source, source+":capture", manifest["sha256"], coverage)
    elif profile == "scheduler":
        parsed = subprocess.run(["perf", "script", "--show-lost-events", "-i", str(directory/"sched.data"), "-F", "comm,pid,tid,cpu,time,event,trace"],
                                capture_output=True, text=True, timeout=manifest["config"]["seconds"]+10, check=True)
        lost="LOST" in parsed.stdout or "lost" in parsed.stderr.lower()
        coverage={"complete":not lost,"drops":None if lost else 0,
                  "scope":"recorded scheduler filters; perf lost-event records included"}
        rows = parse_perf(parsed.stdout, source, source+":perf", coverage)
    elif profile == "probe":
        rows = parse_probe(text, source, coverage)
    elif profile == "socket":
        rows = parse_ss(text, source, coverage)
    elif profile == "normalized":
        rows=(row for kind,row in read_normalized(directory/"raw.txt") if kind=="event")
    else:
        raise ValueError("unsupported live artifact parser")
    result=[]
    limit=manifest.get("config",{}).get("max_analysis_records",4096)
    if not isinstance(limit,int) or not 0 <= limit <= 100000:
        raise ValueError("analysis record cap must be in 0..100000")
    for row in rows:
        if len(result)>=limit:
            ingest(ledger,"fact",{"kind":"analysis_retention_limit","retained_events":limit,
                                   "raw_manifest":str(directory/"manifest.json"),"inputs":[],
                                   "limitation":"remaining raw artifact not analyzed; no absence claim beyond retained view"},incident_id)
            break
        if profile != "normalized":
            row["artifact"]={"sha256":manifest["sha256"],"record":row["sequence"],
                             "parser":profile+":"+VERSION,"tool":manifest.get("tool")}
        result.append(ingest(ledger,"event",row,incident_id))
    return result


def parse_probe(text, source, coverage):
    if "root-probe-v1" not in text:
        raise ValueError("unsupported probe output")
    for seq, line in enumerate(text.splitlines()):
        fields = line.split()
        if fields and fields[0] == "receive":
            if len(fields) != 6:
                raise ValueError("truncated receive probe")
            yield event(source,seq,source+":monotonic",int(fields[1]),"readable",
                        {"copied_seq":int(fields[4]),"rcv_nxt":int(fields[5])},
                        [{"relation":"connection","identity":f"{source}:{fields[2]}:{fields[3]}","certainty":"explicit"}],
                        units={"time":"ns","copied_seq":"tcp_sequence_mod_2^32","rcv_nxt":"tcp_sequence_mod_2^32"},
                        coverage=coverage,limitations=["contiguous TCP receive progress; message/TLS completion requires explicit framing"])
            continue
        if fields and fields[0] in ("queue-in","queue-out"):
            if len(fields) != 4:
                raise ValueError("truncated queue probe")
            yield event(source,seq,source+":monotonic",int(fields[1]),
                        "queue_enqueue" if fields[0] == "queue-in" else "queue_dequeue",{"token":fields[3]},
                        [{"relation":"resource","identity":f"{source}:{fields[2]}","certainty":"explicit"}],
                        units={"time":"ns"},coverage=coverage,
                        limitations=["skb association needs flow mapping; capture loss/address reuse can break pairing"])
            continue
        if not fields or fields[0] not in ("state", "retransmit"):
            continue
        if len(fields) != (6 if fields[0] == "state" else 4):
            raise ValueError("truncated probe event")
        values = {"pid": int(fields[2])}
        if fields[0] == "state":
            values.update(old_state=int(fields[4]), new_state=int(fields[5]))
        yield event(source, seq, source+":monotonic", int(fields[1]),
                    "socket_state" if fields[0] == "state" else "retransmit", values,
                    [{"relation": "socket_address", "identity": fields[3], "certainty": "inferred"}],
                    units={"time": "ns"}, coverage=coverage,
                    limitations=["address reuse possible; process filter may omit softirq events"])


def parse_ss(text, source, coverage):
    import re
    connection = None
    for seq, line in enumerate(text.splitlines()):
        if line.startswith("State"):
            continue
        parts = line.split()
        if len(parts) >= 5 and parts[0] in ("ESTAB", "SYN-SENT", "CLOSE-WAIT", "LISTEN", "FIN-WAIT-1", "TIME-WAIT"):
            connection = {"state": parts[0], "recv_queue": int(parts[1]), "send_queue": int(parts[2]),
                          "local": parts[3], "peer": parts[4]}
        elif connection and line[:1].isspace():
            values = dict(connection)
            for key in ("cwnd", "rtt", "bytes_sent", "bytes_acked", "bytes_received", "notsent"):
                found = re.search(r"\b"+key+r":([\d.]+)", line)
                if found:
                    values[key] = float(found[1])
            yield event(source, seq, source+":local", 0, "socket_state", values,
                        coverage=coverage, limitations=["snapshot; tuple identity lacks socket lifetime"])
            connection = None
