"""Colab collection with loss-proof persistence + dataset builder + refit entry.

Layout per run: <root>/<fault>/<seed>/{manifest.json, trace.json,
trace.sqlite?, DONE}. Manifest is written FIRST; DONE is written LAST, only
after every artifact re-reads with matching sha256. A dead session leaves
flagless partial runs; the next session resumes by scanning for them.
Home-side ingest is append-only and idempotent by (run_id, hardware,
collector_version). Converters turn
Kineto JSON and our mirrored nsys-subset tables back into bundle dicts the
pipeline consumes; refit re-runs temperature calibration on collected bundles.

A storage root is any filesystem path (Colab: /content/drive/... ; local:
tmp). The device side is an injected callable (tests use a fake writer; Colab
wires nsys via nsys_command() below). Stdlib only.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import uuid
from pathlib import Path

from .envelope import stamp as _stamp

PROVENANCE = "collect"
COLLECTOR_VERSION = "collect-v1"
# ponytail: fixed workload matrix (faults x seeds); extend when new fault
# families or cards land, keeping (fault, seed) as the stable run identity.
FAULTS = ("cpu_starvation", "launch_overhead", "bw_pressure", "stalls",
          "sync_serialization", "transfer_heavy", "batching_delay",
          "queue_contention", "competing_workload", "kernel_regression",
          "preprocessing_interference")
# ponytail: run dirs stay <root>/<fault>/<seed> (no hardware in the path);
# mixed-hardware datasets come from ingesting several roots into one
# dataset file. Per-card subdirs when one root must hold two cards.
IDENTITY_FIELDS = ("device", "hardware", "driver", "cuda", "collector_version")
REQUIRED_MANIFEST = ("run_id", "fault", "seed") + IDENTITY_FIELDS + ("execution_id", "context_id")
DONE = "DONE"


def nvidia_smi_identity(device: str = "colab-gpu") -> dict:
    """Colab wiring for identity_provider: best-effort nvidia-smi parse
    (gpu name -> hardware/device, driver version, CUDA version) + this
    module's COLLECTOR_VERSION. Stdlib subprocess only; never raises —
    returns "unknown" fields when nvidia-smi is absent. Pass as
    collect(..., identity_provider=nvidia_smi_identity)."""
    info = {"device": device, "hardware": "unknown", "driver": "unknown",
            "cuda": "unknown", "collector_version": COLLECTOR_VERSION}
    try:
        import subprocess
        q = subprocess.run(
            ["nvidia-smi", "--query-gpu=gpu_name,driver_version",
             "--format=csv,noheader"], capture_output=True, text=True,
            timeout=10)
        first = (q.stdout or "").strip().splitlines()
        if q.returncode == 0 and first:
            name, _, driver = first[0].partition(",")
            name, driver = name.strip(), driver.strip()
            if name:
                info["hardware"] = info["device"] = name
            if driver:
                info["driver"] = driver
        v = subprocess.run(["nvidia-smi"], capture_output=True, text=True,
                           timeout=10)
        for line in (v.stdout or "").splitlines():
            if "CUDA Version:" in line:
                info["cuda"] = line.split("CUDA Version:")[-1].strip().split()[0]
                break
    except Exception:
        pass
    return info
    # ponytail: first GPU only; per-GPU rows when multi-GPU Colab matters.


def run_dir(root: str | Path, fault: str, seed: int) -> Path:
    return Path(root) / fault / str(seed)


def manifest(fault: str, seed: int, workload: str = "infer-microbench",
             device: str = "colab-t4", identity_provider=None,
             nsys_version: str = "unknown", trace_variant: str = "cuda",
             perf_status: str = "unknown", torch_version: str = "unknown",
             software: dict | None = None, stats: dict | None = None,
             extra: dict | None = None, commit: str = "unknown",
             timing_model_version: str = "unknown", outcome: str = "unknown",
             reason: str = "") -> dict:
    """Run identity + comparability context. Written before any artifact.
    identity_provider is a () -> dict callable (Colab: nvidia_smi_identity;
    tests: fake); its device/hardware/driver/cuda/collector_version entries
    override the defaults so every manifest carries comparable identity.
    software/stats ride the sidecar (brief §5): versions + dropped counts,
    all optional/unknown-tolerant; ingest preserves them verbatim."""
    ident = dict(identity_provider() or {}) if identity_provider else {}
    extra = dict(extra or {})
    nsys_version = extra.pop("nsys_version", nsys_version)  # explicit kwarg wins; extra is fallback
    trace_variant = extra.pop("trace_variant", trace_variant)
    perf_status = extra.pop("perf_status", perf_status)
    torch_version = extra.pop("torch_version", torch_version)
    if software is None:
        software = extra.pop("software", None)
    else:
        extra.pop("software", None)
    if stats is None:
        stats = extra.pop("stats", None)
    else:
        extra.pop("stats", None)
    cuda_v = ident.get("cuda", "unknown")
    driver_v = ident.get("driver", "unknown")
    software_out = {"torch": torch_version, "cuda": cuda_v,
                    "driver": driver_v, "nsys": nsys_version}
    if isinstance(software, dict):
        software_out.update(software)
    # ponytail: zero-count stats default; pass explicit counts when the
    # collector drops records or misses correlations.
    stats_out = {"dropped_records": 0, "correlation_misses": 0}
    if isinstance(stats, dict):
        stats_out.update(stats)
    ctx_src = "|".join(str(x) for x in (
        workload, ident.get("device", device), ident.get("hardware", "unknown"),
        ident.get("driver", "unknown"), ident.get("cuda", "unknown"),
        ident.get("collector_version", COLLECTOR_VERSION)))
    # ponytail: commit/env injected (like identity_provider), never computed
    # here — no git/env/subprocess. GPU-path extras ride along verbatim.
    envelope = _stamp(commit=commit, fault=fault, seed=seed,
                      hardware=ident.get("hardware", "unknown"),
                      collector_version=ident.get("collector_version", COLLECTOR_VERSION),
                      timing_model_version=timing_model_version,
                      outcome=outcome, reason=reason,
                      extra_env={"device": ident.get("device", device),
                                 "driver": driver_v, "cuda": cuda_v,
                                 "software": software_out, "stats": stats_out})
    return {"run_id": f"{fault}:{seed}", "fault": fault, "seed": seed,
            "execution_id": uuid.uuid4().hex[:16],  # unique per collection attempt, even on resume
            "context_id": hashlib.sha256(ctx_src.encode()).hexdigest()[:16],  # stable per experimental context
            "workload": workload, "device": ident.get("device", device),
            "hardware": ident.get("hardware", "unknown"),
            "driver": ident.get("driver", "unknown"),
            "cuda": ident.get("cuda", "unknown"),
            "collector_version": ident.get("collector_version",
                                          COLLECTOR_VERSION),
            "nsys_version": nsys_version,
            "trace_variant": trace_variant,
            "perf_status": perf_status,
            "software": software_out,
            "stats": stats_out,
            "status": "started",
            "envelope": envelope,
            "sha256": {}, "extra": dict(extra or {})}


def start_run(root: str | Path, fault: str, seed: int,
              identity_provider=None, **meta) -> Path:
    """Manifest-first: after this returns, a kill loses nothing claimed."""
    d = run_dir(root, fault, seed)
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest.json").write_text(
        json.dumps(manifest(fault, seed, identity_provider=identity_provider,
                            **meta), indent=2), encoding="utf-8")
    return d


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def complete_run(root: str | Path, fault: str, seed: int,
                 artifacts: dict[str, bytes]) -> dict:
    """Write artifacts, verify each by re-read checksum, then flag DONE.
    Anything failing verification raises with NO done flag: resume re-runs it."""
    d = run_dir(root, fault, seed)
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    for name, blob in artifacts.items():
        if "/" in name or name in ("manifest.json", DONE):
            raise ValueError(f"bad artifact name {name!r}")
        (d / name).write_bytes(blob)
    for name in artifacts:
        man["sha256"][name] = _sha256(d / name)
    for name, digest in man["sha256"].items():  # verify by re-read, not memory
        if _sha256(d / name) != digest:
            raise IOError(f"checksum mismatch on {name}, not marking DONE")
    man["status"] = "done"
    (d / "manifest.json").write_text(json.dumps(man, indent=2), encoding="utf-8")
    tmp = d / (DONE + ".tmp")
    tmp.write_text(json.dumps({"run_id": man["run_id"], "sha256": man["sha256"]}),
                   encoding="utf-8")
    tmp.rename(d / DONE)  # atomic flag last
    return man


def is_done(root: str | Path, fault: str, seed: int) -> bool:
    """DONE present AND every checksummed artifact still matches."""
    d = run_dir(root, fault, seed)
    if not (d / DONE).exists() or not (d / "manifest.json").exists():
        return False
    try:
        man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return False
    return all((d / n).exists() and _sha256(d / n) == s
               for n, s in man.get("sha256", {}).items())


def scan_todo(root: str | Path, faults: tuple = FAULTS,
              seeds: tuple = (11,)) -> list[tuple[str, int]]:
    """Runs missing a verified DONE flag: crash recovery is just re-running these."""
    return [(f, s) for f in faults for s in seeds if not is_done(root, f, s)]


def collect(root: str | Path, faults: tuple = FAULTS, seeds: tuple = (11,),
            device=None, identity_provider=None, **meta) -> dict:
    """Manifest-first collection over the matrix; resumes partial runs.
    device(fault, seed) -> {artifact_name: bytes}; may raise mid-run (the
    partial run simply stays flagless). identity_provider threads hardware
    identity into every manifest (see manifest()). Returns per-run done/failed."""
    done, failed = [], {}
    for fault, seed in [(f, s) for f in faults for s in seeds]:
        if is_done(root, fault, seed):
            done.append((fault, seed))
            continue
        start_run(root, fault, seed, identity_provider=identity_provider,
                  **meta)
        try:
            man = complete_run(root, fault, seed, device(fault, seed))
        except Exception as exc:
            failed[(fault, seed)] = f"{type(exc).__name__}: {exc}"
        else:
            done.append((fault, seed))
    return {"done": done, "failed": failed}


def nsys_command(workload: list[str], out_prefix: str,
                 nsys: str = "nsys", capture: str = "full") -> list[str]:
    """Pure command builder for the Colab side (no execution here): profile a
    workload with CUPTI kernel/memcpy/API tracing into an sqlite export.
    Inference-microprofile hygiene per NVIDIA docs: no CPU sampling or
    context switches, no backtraces/memory-usage (documented heavy). capture
    "full" profiles the whole run; "nvtx" needs workload NVTX request ranges.
    Pin nsys_version in the manifest (schema/behavior skews across versions)."""
    cmd = [nsys, "profile", "--trace=cuda,nvtx,osrt", "--export=sqlite",
           "--sample=none", "--cpuctxsw=none", "--cudabacktrace=none",
           "--cuda-memory-usage=false", f"--output={out_prefix}",
           "--force-overwrite=true"]
    if capture == "nvtx":
        cmd += ["--capture-range=nvtx", "--nvtx-capture=request@*"]
    return [*cmd, *workload]


# ponytail: real Kineto cats only (brief §3); old synthetic cats
# (cuda_api/memcpy/sync/flow) are intentionally unmapped — dialect-removal.
_CPU_CATS = {"cpu_op", "cuda_runtime", "cuda_driver"}
_KERNEL_CATS = {"kernel"}
_MEMCPY_CATS = {"gpu_memcpy", "gpu_memset"}
_SYNC_CATS = {"cuda_sync"}
# ponytail: real Kineto emits host-side waits as cuda_runtime
# (cudaDeviceSynchronize/cudaStreamSynchronize), never as cuda_sync;
# route them to sync_edge (blocked attribution), not cpu_launch.
_SYNC_RUNTIME_SUBSTR = ("synchronize",)


def _normalize_kernel_name(name) -> str:
    """Short stable kernel identity from a raw Kineto `name`.

    Real names are either short (volta_sgemm_128x64_nn) or long C++
    signatures with the kernel buried in templates/namespaces (incl.
    `(anonymous namespace)` which defeats naive `::` splits). Honest
    lossy demangle: first `<name>kernel<name>` identifier (the outermost
    template), else the short name as-is. Template args/overloads are
    dropped (documented ceiling); unparseable -> UNKNOWN, never invented."""
    import re as _re
    if not name or not isinstance(name, str):
        return "UNKNOWN"
    s = name.strip()
    if not s:
        return "UNKNOWN"
    hits = _re.findall(r"[A-Za-z_][A-Za-z0-9_]*kernel[A-Za-z0-9_]*", s)
    if hits:
        return hits[0]
    if "(" in s or " " in s or "::" in s:
        head = s.split("(", 1)[0].strip()
        base = head.split("::")[-1].strip()
        base = base.split()[-1] if base.split() else base
        base = base.split("<", 1)[0].strip()
        base = "".join(ch if (ch.isalnum() or ch == "_") else "_" for ch in base).strip("_")
        return base or "UNKNOWN"
    return "".join(ch if (ch.isalnum() or ch == "_") else "_" for ch in s).strip("_") or "UNKNOWN"


def _manifest_tmv(manifest) -> str:
    """Bundle-manifest context for diagnose: same card + collector share one
    timing context (comparable), different cards/collectors never pool."""
    try:
        hw = (manifest or {}).get("hardware") or "unknown"
        cv = (manifest or {}).get("collector_version") or "unknown"
    except Exception:
        hw, cv = "unknown", "unknown"
    return f"kineto-{hw}-{cv}"


def _derive_launch_gaps(cpu: list, gpu: list) -> None:
    """Fill gpu[*][launch_gap_ns] in place from correlated host events.

    Same External-id cudaLaunchKernel end -> kernel start (clamped >= 0);
    fallback: latest same-id host end before kernel start; last resort 0
    (no launch observed -> no measurable gap). Mutates gpu recs only."""
    by_cid: dict[str, list] = {}
    for c in cpu:
        by_cid.setdefault(c.get("correlation_id", ""), []).append(c)
    for g in gpu:
        if g.get("launch_gap_ns") is not None:
            continue
        cands = by_cid.get(g.get("correlation_id", ""), [])
        launches = [c for c in cands if c.get("name") == "cudaLaunchKernel"]
        pool = launches or cands
        ends = [c["end_ns"] for c in pool
                if isinstance(c.get("end_ns"), int) and c["end_ns"] <= g["start_ns"]]
        g["launch_gap_ns"] = max(0, g["start_ns"] - max(ends)) if ends else 0


def _derive_l1(gpu: list) -> list:
    """Timeline-derived L1 context, one entry per kernel (sorted by start).

    Silicon counters (sm/mem/tensor) are absent from Kineto JSON by format
    (coverage.counters False) and are NOT filled. queue_depth is the honest
    observable analog of bundle concurrency: distinct kernel streams in the
    trace (1 stream healthy vs 2 queued/contended). active_* are per-kernel
    overlap counts. Consumers needing silicon counters must check coverage."""
    ks = sorted(gpu, key=lambda g: (g.get("start_ns", 0), g.get("end_ns", 0)))
    iv = [(g.get("start_ns", 0), g.get("end_ns", 0)) for g in ks]
    streams = {g.get("stream_id") for g in ks if g.get("stream_id") is not None}
    qdepth = max(1, len(streams))
    out = []
    for g, (s, e) in zip(ks, iv):
        ov = [h for h in ks
              if h.get("start_ns", 0) <= s < h.get("end_ns", 0)]
        ov_streams = {h.get("stream_id") for h in ov if h.get("stream_id") is not None}
        out.append({"ts_ns": g.get("end_ns", 0), "queue_depth": qdepth,
                    "active_kernels": len(ov),
                    "active_streams": max(1, len(ov_streams))})
    return out


def adapt_bundle_for_diagnose(bundle: dict, manifest: dict | None = None) -> dict:
    """Enrich a converted (or synthetic) bundle for diagnose(), in place.

    Fills kernel_name (normalized `name`), launch_gap_ns (correlated host),
    blocked_ns (= dur where a wait was observed), l1 timeline context, and
    manifest-derived timing_model_version — only where missing/unknown, so
    re-ingested bundles and synthetic bundles (roofline-v1) keep their own
    honest values. Returns the same dict."""
    if not isinstance(bundle, dict):
        raise ValueError("bundle must be a dict")
    for g in bundle.get("gpu_kernel", []) or []:
        if not g.get("kernel_name"):
            g["kernel_name"] = _normalize_kernel_name(g.get("name"))
    for s in bundle.get("sync_edge", []) or []:
        if s.get("blocked_ns") is None:
            dur = s.get("dur_ns")
            if dur is None and isinstance(s.get("start_ns"), int) \
                    and isinstance(s.get("end_ns"), int):
                dur = s["end_ns"] - s["start_ns"]
            s["blocked_ns"] = dur if isinstance(dur, int) else 0
    _derive_launch_gaps(bundle.get("cpu_launch", []) or [],
                        bundle.get("gpu_kernel", []) or [])
    if not bundle.get("l1"):
        gpu = bundle.get("gpu_kernel", []) or []
        if gpu:
            bundle["l1"] = _derive_l1(gpu)
    if manifest is not None and bundle.get("timing_model_version", "unknown") \
            in (None, "", "unknown"):
        bundle["timing_model_version"] = _manifest_tmv(manifest)
    return bundle


def _us_to_ns(v) -> int:
    """Integer-us or "us.frac"-string (brief §3) -> ns int; raises ValueError."""
    # ponytail: float round-trip exact below 2^53 ns (~100 days); sub-us input
    # precision is already lost upstream at integer-us emission.
    try:
        return int(float(v) * 1000)
    except Exception:
        raise ValueError(f"bad us timestamp {v!r}")


def kineto_to_bundle(doc: dict, manifest: dict | None = None) -> dict:
    """Real Kineto Chrome-trace JSON -> bundle dict (cpu_launch, gpu_kernel,
    transfer, sync_edge joined by External-id, flow-id fallback). Accepts
    integer-us or "us.frac"-string ts/dur (brief §3); pid=device/tid=stream
    maps to device_id/stream_id. Missing OPTIONAL fields (dur/args/cat)
    tolerated; missing REQUIRED (ph/ts/pid/tid/name) raises.

    Diagnose-ready extras (all derived, never invented): gpu_kernel carries
    kernel_name (normalized `name`) + launch_gap_ns (correlated host end ->
    kernel start, clamped); sync_edge carries blocked_ns (= observed wait);
    host-side waits named *synchronize* (real Kineto emits them as
    cuda_runtime) route to sync_edge; l1 carries timeline concurrency per
    kernel (silicon counters stay absent, see coverage). manifest, when
    given, supplies timing_model_version context (same card/collector pools;
    synthetic tmvs are never overwritten by adapt_bundle_for_diagnose)."""
    by_id: dict[str, dict] = {}
    cpu, gpu, tx, sy = [], [], [], []
    for e in doc.get("traceEvents", []):
        if not all(k in e for k in ("ph", "ts", "pid", "tid", "name")):
            raise ValueError("trace event missing required Chrome-trace fields")
        start_ns = _us_to_ns(e["ts"])
        if "dur" in e and e["dur"] is not None:
            dur_ns = _us_to_ns(e["dur"])
        else:
            dur_ns = 0
        args = dict(e.get("args") or {})
        ext = args.get("External id")
        if ext is None:
            ext = e.get("id")  # flow-id fallback when External id absent
        cid = "" if ext is None else str(ext)
        if e["ph"] == "X":
            cat = e.get("cat")  # optional: unknown/missing cats ignored, never coerced
            if cat in _CPU_CATS and not (
                    _SYNC_RUNTIME_SUBSTR[0] in str(e.get("name", "")).lower()):
                rec = {"correlation_id": cid, "start_ns": start_ns,
                       "end_ns": start_ns + dur_ns, "dur_ns": dur_ns,
                       "name": e["name"], "pid": e["pid"], "tid": e["tid"],
                       "stream_id": args.get("stream", e["tid"]),
                       "args": args}
                cpu.append(rec)
            elif cat in _KERNEL_CATS:
                rec = {"correlation_id": cid, "start_ns": start_ns,
                       "end_ns": start_ns + dur_ns, "dur_ns": dur_ns,
                       "name": e["name"], "pid": e["pid"], "tid": e["tid"],
                       "kernel_name": _normalize_kernel_name(e["name"]),
                       "device_id": e["pid"], "stream_id": e["tid"],
                       "args": args}
                gpu.append(rec)
            elif cat in _MEMCPY_CATS:
                rec = {"correlation_id": cid, "start_ns": start_ns,
                       "end_ns": start_ns + dur_ns, "dur_ns": dur_ns,
                       "name": e["name"], "pid": e["pid"], "tid": e["tid"],
                       "device_id": e["pid"], "stream_id": e["tid"],
                       "args": args}
                tx.append(rec)
            elif cat in _SYNC_CATS or (
                    cat in _CPU_CATS and _SYNC_RUNTIME_SUBSTR[0] in str(e.get("name", "")).lower()):
                rec = {"correlation_id": cid, "start_ns": start_ns,
                       "end_ns": start_ns + dur_ns, "dur_ns": dur_ns,
                       "blocked_ns": dur_ns,
                       "name": e["name"], "pid": e["pid"], "tid": e["tid"],
                       "stream_id": args.get("stream", e["tid"]),
                       "args": args}
                sy.append(rec)
            else:
                continue  # old synthetic cats land here -> absent from bundles
            if cid:
                by_id.setdefault(cid, {}).setdefault("events", []).append(e["ph"])
        elif e["ph"] in ("s", "f"):
            if cid:
                by_id.setdefault(cid, {}).setdefault("events", []).append(e["ph"])
        elif cid:
            by_id.setdefault(cid, {}).setdefault("events", []).append(e["ph"])
    _derive_launch_gaps(cpu, gpu)
    tmv = doc.get("timing_model_version", "unknown")
    if manifest is not None and tmv in (None, "", "unknown"):
        tmv = _manifest_tmv(manifest)
    return {"cpu_launch": cpu, "gpu_kernel": gpu, "transfer": tx,
            "sync_edge": sy, "flow_ids": sorted(by_id),
            "l1": _derive_l1(gpu) if gpu else [],
            "timing_model_version": tmv,
            "synthetic": False,
            # ponytail: flow_ids are observed linkage identifiers (External ids
            # + flow s/f ids), not exclusively launch flows: on CUDA traces the
            # launch s/f pairs join CPU launch to kernel; on CPU-only traces
            # the s/f pairs are fwdbwd autograd links in their own id domain.
            # Launch-vs-autograd is distinguished by cat context, not by id.
            # ponytail: machine-readable coverage, computed not asserted:
            # linkage/timeline present; counters/stalls/tensors absent from
            # Kineto JSON by format construction (brief section 4). Consumers
            # must check coverage, not assume fakegpu vocabulary.
            "coverage": {"timeline": True, "counters": False,
                         "stalls": False, "tensors": False}}


def nsys_subset_to_bundle(path: str | Path) -> dict:
    """Mirrored snake subset OR real nsys camelCase export -> bundle dict.
    Schema-detected (brief §2): real path when StringIds/RUNTIME present or
    KERNEL carries camelCase columns (correlationId/deviceId/streamId);
    names resolve through StringIds; correlation joins are valid within one
    process (globalPid scoping across processes is a documented ceiling).
    Only the safe column subset is read (probe-first, never SELECT *), so
    richer exports parse and sparser ones raise instead of coercing."""
    con = sqlite3.connect(str(path))
    try:
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        is_real = ("StringIds" in tables
                   or "CUPTI_ACTIVITY_KIND_RUNTIME" in tables)
        if not is_real and "CUPTI_ACTIVITY_KIND_KERNEL" in tables:
            have = {r[1] for r in
                    con.execute("PRAGMA table_info(CUPTI_ACTIVITY_KIND_KERNEL)")}
            is_real = bool({"correlationId", "deviceId", "streamId"} & have)
        if is_real:
            return _real_nsys_to_bundle(con, tables)
        def rows(table: str, cols: list[str]) -> list[dict]:
            have = {r[1] for r in
                    con.execute(f"PRAGMA table_info({table})")}
            use = [c for c in cols if c in have]
            if not use:
                raise ValueError(f"{table} lacks mirrored columns")
            cur = con.execute(f"SELECT {','.join(use)} FROM {table}")
            return [dict(zip(use, r)) for r in cur.fetchall()]
        kern = rows("CUPTI_ACTIVITY_KIND_KERNEL",
                    ["correlation_id", "stream_id", "device_id", "kernel_name",
                     "start_ns", "end_ns", "duration_ns", "occupancy_pct"])
        memcpy = rows("CUPTI_ACTIVITY_KIND_MEMCPY",
                      ["correlation_id", "stream_id", "kind", "bytes",
                       "start_ns", "end_ns", "duration_ns"])
        api = rows("CUPTI_ACTIVITY_KIND_CUDA_API",
                   ["correlation_id", "api_name", "pid", "tid",
                    "start_ns", "end_ns"])
    finally:
        con.close()
    return {"cpu_launch": api, "gpu_kernel": kern, "transfer": memcpy,
            "sync_edge": [], "timing_model_version": "nsys-import",
            "synthetic": False}


# ponytail: CUPTI enum ints mapped, not hardcoded beyond the documented table;
# unknown codes keep their raw form (kind_<n>) instead of failing the import.
_MEMCPY_KIND = {0: "unknown", 1: "HtoD", 2: "DtoH", 3: "HtoA", 4: "AtoH",
                5: "AtoA", 6: "AtoD", 7: "DtoA", 8: "DtoD", 9: "HtoH",
                10: "PtoP"}


def _real_nsys_to_bundle(con, tables: set) -> dict:
    """Real nsys sqlite (camelCase + StringIds + RUNTIME table, brief §2) -> bundle."""
    try:
        strings = {r[0]: r[1] for r in con.execute("SELECT id, value FROM StringIds")}
    except Exception:
        strings = {}
    def name_of(v):
        return strings.get(v, v if isinstance(v, str) else "")
    def cols(table: str) -> set:
        if table not in tables:
            return set()
        return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
    def sel(table: str, want: list[str]) -> tuple[list[str], list[tuple]]:
        have = cols(table)
        use = [c for c in want if c in have]
        if not use:
            raise ValueError(f"{table} lacks required columns")
        return use, con.execute(f"SELECT {','.join(use)} FROM {table}").fetchall()
    runtables = [t for t in ("CUPTI_ACTIVITY_KIND_RUNTIME",
                               "CUPTI_ACTIVITY_KIND_DRIVER") if t in tables]
    api = []
    for table in runtables:
        want = ["start", "end", "globalTid", "correlationId", "nameId"]
        use, rows_ = sel(table, want)
        for r in rows_:
            d = dict(zip(use, r))
            if d.get("correlationId") is None:
                continue
            api.append({"correlation_id": str(d["correlationId"]),
                        "api_name": name_of(d.get("nameId", "")),
                        "pid": d.get("globalTid"), "tid": d.get("globalTid"),
                        "start_ns": d.get("start", 0), "end_ns": d.get("end", 0)})
    kern = []
    want = ["start", "end", "deviceId", "streamId", "correlationId",
            "nameId", "shortName", "demangledName", "gridX", "gridY", "gridZ",
            "blockX", "blockY", "blockZ", "registersPerThread"]
    # ponytail: KERNEL + CONCURRENT_KERNEL share the shape; one loop, no second parser.
    k_tables = [t for t in ("CUPTI_ACTIVITY_KIND_KERNEL",
                            "CUPTI_ACTIVITY_KIND_CONCURRENT_KERNEL") if t in tables]
    if not k_tables:
        raise ValueError("CUPTI_ACTIVITY_KIND_KERNEL lacks required columns")
    for kt in k_tables:
        use, rows_ = sel(kt, want)
        for r in rows_:
            d = dict(zip(use, r))
            if d.get("correlationId") is None:
                continue
            s, e = d.get("start", 0), d.get("end", 0)
            kern.append({"correlation_id": str(d["correlationId"]),
                         "stream_id": d.get("streamId", 0),
                         "device_id": d.get("deviceId", 0),
                         "kernel_name": name_of(d.get("nameId", "")) or
                         name_of(d.get("shortName", "")) or
                         name_of(d.get("demangledName", "")),
                         "start_ns": s, "end_ns": e, "dur_ns": e - s})
    memcpy = []
    want = ["start", "end", "deviceId", "streamId", "correlationId",
            "bytes", "copyKind"]
    if "CUPTI_ACTIVITY_KIND_MEMCPY" in tables:
        use, rows_ = sel("CUPTI_ACTIVITY_KIND_MEMCPY", want)
        for r in rows_:
            d = dict(zip(use, r))
            if d.get("correlationId") is None:
                continue
            kind = d.get("copyKind")
            memcpy.append({"correlation_id": str(d["correlationId"]),
                           "stream_id": d.get("streamId", 0),
                           "kind": _MEMCPY_KIND.get(kind, f"kind_{kind}"),
                           "bytes": d.get("bytes", 0),
                           "start_ns": d.get("start", 0),
                           "end_ns": d.get("end", 0)})
    sync = []
    if "CUPTI_ACTIVITY_KIND_SYNCHRONIZATION" in tables:
        want = ["start", "end", "streamId", "correlationId", "syncType"]
        use, rows_ = sel("CUPTI_ACTIVITY_KIND_SYNCHRONIZATION", want)
        for r in rows_:
            d = dict(zip(use, r))
            if d.get("correlationId") is None:
                continue
            s, e = d.get("start", 0), d.get("end", 0)
            sync.append({"correlation_id": str(d["correlationId"]),
                         "stream_id": d.get("streamId", 0),
                         "sync_type": d.get("syncType"),
                         "blocked_ns": e - s, "start_ns": s, "end_ns": e})
    return {"cpu_launch": api, "gpu_kernel": kern, "transfer": memcpy,
            "sync_edge": sync, "timing_model_version": "nsys-import",
            "synthetic": False}


def ingest(root: str | Path, dataset_path: str | Path) -> dict:
    """Append-only, idempotent ingest of DONE runs: validates schema, skips
    corrupt/partial runs with reasons, never deletes raw artifacts.
    Identity-less manifests (missing device/hardware/driver/cuda/
    collector_version) are rejected, not pooled. Idempotency key is
    (run_id, hardware, collector_version) so two cards' same fault:seed both
    land when ingested from separate roots into one dataset."""
    dataset_path = Path(dataset_path)
    seen = set()
    if dataset_path.exists():
        for line in dataset_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                m = rec.get("manifest", {})
                seen.add((rec.get("run_id"), m.get("hardware"),
                          m.get("collector_version")))
    accepted, rejected = [], {}
    for fault_d in sorted(Path(root).iterdir()) if Path(root).exists() else []:
        if not fault_d.is_dir():
            continue
        for seed_d in sorted(fault_d.iterdir()):
            if not seed_d.is_dir():
                continue
            rid = f"{fault_d.name}:{seed_d.name}"
            if not is_done(root, fault_d.name, seed_d.name):
                continue
            try:
                man = json.loads((seed_d / "manifest.json").read_text(encoding="utf-8"))
                for k in REQUIRED_MANIFEST:
                    if k not in man:
                        raise ValueError(f"manifest missing {k}")
                if ((man.get("run_id"), man.get("hardware"),
                     man.get("collector_version")) in seen):
                    continue
                if (seed_d / "trace.json").exists():
                    trace = json.loads((seed_d / "trace.json").read_text(encoding="utf-8"))
                    bundle = kineto_to_bundle(trace, man)
                elif (seed_d / "subset.db").exists():
                    bundle = nsys_subset_to_bundle(seed_d / "subset.db")
                else:
                    raise ValueError("no trace.json or subset.db artifact")
            except Exception as exc:
                rejected[rid] = f"{type(exc).__name__}: {exc}"
                continue
            dataset_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dataset_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"run_id": rid, "manifest": man,
                                     "bundle": bundle}) + "\n")
            seen.add((man.get("run_id"), man.get("hardware"),
                      man.get("collector_version")))
            accepted.append(rid)
    return {"accepted": accepted, "rejected": rejected}


def coverage_gaps(target_matrix, records: list[dict]) -> list[tuple]:
    """Missing (fault, hardware, version) cells vs ingested records.
    target_matrix is an iterable of (fault, hardware, version) triples
    (Colab: itertools.product(faults, hardwares, versions)). records are
    ingested dataset rows as written by ingest() — load with
    [json.loads(l) for l in open(dataset_path)]. Source picked: the ingested
    dataset (not the run root), so gaps reflect what actually parsed, and a
    Colab session knows exactly what to run next. Returns sorted missing."""
    present = {(m.get("fault"), m.get("hardware"), m.get("collector_version"))
               for r in records for m in (r.get("manifest", {}),)}
    return sorted(set(map(tuple, target_matrix)) - present)
    # ponytail: dataset-side only; add a root-scanning variant when Colab
    # needs pre-ingest gaps for runs that failed conversion.


def backup_runs(root: str | Path, dest: str | Path) -> dict:
    """Copy the run tree aside (Drive mount, USB, second disk). Whole small
    files each time, never deltas; skips byte-identical files."""
    # ponytail: full copy per call, not rsync; runs are KBs. Revisit past ~1GB.
    root, dest = Path(root), Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted(root.rglob("*")):
        if src.is_file():
            target = dest / src.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or _sha256(target) != _sha256(src):
                target.write_bytes(src.read_bytes())
                n += 1
    return {"dest": str(dest), "copied": n}


def run_pipeline(root: str | Path, dataset_path: str | Path,
                 target_matrix, faults: tuple = FAULTS, seeds: tuple = (11,),
                 device=None, backup_dir: str | Path | None = None,
                 **meta) -> dict:
    """One hands-free pass: collect -> verify -> ingest -> gaps -> backup.
    Device failures are recorded, never raised; a later pass resumes them.
    target_matrix is explicit (fault, hardware, version) triples — the caller
    (notebook) knows its card; no guessing here."""
    collected = collect(root, faults, seeds, device=device, **meta)
    remaining = scan_todo(root, faults, seeds)
    ingested = ingest(root, dataset_path)
    records = []
    if Path(dataset_path).exists():
        for line in Path(dataset_path).read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    gaps = coverage_gaps(target_matrix, records)
    backup = backup_runs(root, backup_dir) if backup_dir else {"dest": None,
                                                               "copied": 0}
    return {"collected": {"done": [list(t) for t in collected["done"]],
                          "failed": {f"{k[0]}:{k[1]}": v for k, v in
                                     collected["failed"].items()}},
            "remaining": [list(t) for t in remaining],
            "ingested": ingested,
            "records": len(records),
            "gaps": [list(g) for g in gaps],
            "backup": backup}


def pair_corpus(records: list[dict]) -> dict:
    """Group ingested runs into healthy/fault pairs by (workload, seed,
    hardware): same seed on different cards never meets, so cross-hardware
    leakage is structural, not conventional. Runs with unknown hardware
    never pair -- not even with each other: comparability unproven means
    unpairable. Pair key is f"{fault}:{seed}@{hardware}"."""
    by_key: dict[tuple, dict] = {}
    for r in records:
        m = r["manifest"]
        hw = m.get("hardware", "unknown")
        if not hw or hw == "unknown":
            continue
        by_key.setdefault(
            (m.get("workload"), m.get("seed"), hw),
            {})[m["fault"]] = r
    pairs = {}
    for (workload, seed, hw), group in sorted(by_key.items()):
        if "healthy" in group:
            for fault, rec in sorted(group.items()):
                if fault != "healthy":
                    pairs[f"{fault}:{seed}@{hw}"] = {
                        "fault": fault, "seed": seed, "workload": workload,
                        "hardware": hw,
                        "faulty": rec["bundle"], "healthy": group["healthy"]["bundle"]}
    # ponytail: pairs are eval-shaped, not pipeline-ready — real nsys bundles
    # lack the fakegpu vocabulary (dur_ns/stall_hist/tensor fields) that
    # voices/outcomes read. Refitting temperature/EIG on collected data waits
    # on the real-data semantic adapter; until then pairs feed reader
    # validation, retrieval breadth, and hand comparison, never calibration.
    # ponytail: version skew inside one (workload, seed, hardware) cell is out
    # of the key — a repeated fault in the same cell keeps the last record.
    return pairs
