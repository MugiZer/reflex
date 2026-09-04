"""Versioned Trace/Incident schema + immutable typed evidence ledger (JSONL)."""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field, replace
from enum import Enum
from pathlib import Path

SCHEMA_VERSION = 1
UNKNOWN = "UNKNOWN"
UNMODELED = "UNMODELED"


class LedgerError(ValueError):
    """Boundary/transition violation; the store is unchanged when raised."""


class EvidenceLevel(str, Enum):
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    TESTED = "TESTED"
    VERIFIED = "VERIFIED"


_HYPO_LEVELS = (EvidenceLevel.INFERRED, EvidenceLevel.TESTED, EvidenceLevel.VERIFIED)


def _req(value: str, name: str) -> str:
    if not value or not str(value).strip():
        raise LedgerError(f"{name} is required")
    return str(value)


def _ver(v: int) -> int:
    if v != SCHEMA_VERSION:
        raise LedgerError(f"unsupported schema_version {v!r}")
    return v


def _jsonable(payload: dict) -> dict:
    try:
        return json.loads(json.dumps(payload, sort_keys=True))
    except (TypeError, ValueError):
        raise LedgerError("payload must be JSON-serializable")


def _level(v: EvidenceLevel | str) -> EvidenceLevel:
    try:
        return v if isinstance(v, EvidenceLevel) else EvidenceLevel(str(v))
    except ValueError:
        raise LedgerError(f"bad level {v!r}")


def _nid() -> str:
    return uuid.uuid4().hex


@dataclass(frozen=True)
class Trace:
    """One observation→action step. CUPTI-linkable: correlation_id joins host
    launch to device activity; stream/device/kernel fields stay zero/empty
    until a real collector fills them."""

    trace_id: str = field(default_factory=_nid)
    correlation_id: str = ""
    provenance: str = ""
    stage: str = "gpu_inference"
    duration_ns: int = 0
    ts_ns: int = field(default_factory=time.monotonic_ns)  # ponytail: monotonic only; add wall_ts when cross-process clocks matter
    kernel_name: str = ""
    stream_id: int = 0
    device_id: int = 0
    start_ns: int = 0
    end_ns: int = 0
    synthetic: bool = False  # general provenance flag; real collectors leave False
    schema_version: int = SCHEMA_VERSION

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.trace_id, "trace_id")
        _req(self.correlation_id, "correlation_id")
        _req(self.provenance, "provenance")
        if self.duration_ns < 0:
            raise LedgerError("duration_ns must be >= 0")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> Trace:
        return cls(**{**d, "schema_version": _ver(d.get("schema_version"))})


@dataclass(frozen=True)
class Incident:
    incident_id: str = field(default_factory=_nid)
    provenance: str = ""
    title: str = ""
    trace_ids: tuple = ()
    schema_version: int = SCHEMA_VERSION

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.incident_id, "incident_id")
        _req(self.provenance, "provenance")
        object.__setattr__(self, "trace_ids", tuple(self.trace_ids))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["trace_ids"] = list(self.trace_ids)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Incident:
        return cls(incident_id=d.get("incident_id") or _nid(), provenance=d.get("provenance", ""),
                   title=d.get("title", ""), trace_ids=tuple(d.get("trace_ids") or ()),
                   schema_version=_ver(d.get("schema_version")))


@dataclass(frozen=True)
class Evidence:
    record_id: str = field(default_factory=_nid)
    correlation_id: str = ""
    provenance: str = ""
    level: EvidenceLevel = EvidenceLevel.OBSERVED
    kind: str = ""
    payload: dict = field(default_factory=dict)
    trace_id: str = ""
    incident_id: str = ""
    ts_ns: int = field(default_factory=time.monotonic_ns)
    synthetic: bool = False
    schema_version: int = SCHEMA_VERSION

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.record_id, "record_id")
        _req(self.correlation_id, "correlation_id")
        _req(self.provenance, "provenance")
        _req(self.kind, "kind")
        object.__setattr__(self, "level", _level(self.level))
        object.__setattr__(self, "payload", _jsonable(self.payload))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["level"] = self.level.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Evidence:
        return cls(record_id=d.get("record_id") or _nid(), correlation_id=d.get("correlation_id", ""),
                   provenance=d.get("provenance", ""), level=_level(d.get("level", "OBSERVED")),
                   kind=d.get("kind", ""), payload=d.get("payload") or {}, trace_id=d.get("trace_id", ""),
                   incident_id=d.get("incident_id", ""), ts_ns=d.get("ts_ns") or time.monotonic_ns(),
                   synthetic=bool(d.get("synthetic", False)),
                   schema_version=_ver(d.get("schema_version")))


@dataclass(frozen=True)
class Hypothesis:
    """Lifecycle: propose at INFERRED; INFERRED→TESTED needs a linked
    experiment; TESTED→VERIFIED needs it executed (measured set);
    TESTED→INFERRED is refuted. Everything else is illegal."""

    hypothesis_id: str = field(default_factory=_nid)
    incident_id: str = ""
    provenance: str = ""
    cause: str = UNKNOWN
    status: EvidenceLevel = EvidenceLevel.INFERRED
    correlation_id: str = ""
    schema_version: int = SCHEMA_VERSION

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.hypothesis_id, "hypothesis_id")
        _req(self.incident_id, "incident_id")
        _req(self.provenance, "provenance")
        _req(self.cause, "cause")
        object.__setattr__(self, "status", _level(self.status))
        if self.status not in _HYPO_LEVELS:
            raise LedgerError("hypotheses live in INFERRED/TESTED/VERIFIED (OBSERVED is evidence-only)")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Hypothesis:
        return cls(hypothesis_id=d.get("hypothesis_id") or _nid(), incident_id=d.get("incident_id", ""),
                   provenance=d.get("provenance", ""), cause=d.get("cause", UNKNOWN),
                   status=_level(d.get("status", "INFERRED")), correlation_id=d.get("correlation_id", ""),
                   schema_version=_ver(d.get("schema_version")))


@dataclass(frozen=True)
class Experiment:
    experiment_id: str = field(default_factory=_nid)
    hypothesis_id: str = ""
    correlation_id: str = ""
    provenance: str = ""
    intervention: str = ""
    predicted_delta_ms: float | None = None  # prediction recorded before execution
    measured_delta_ms: float | None = None  # set after execution via set_measured
    ts_ns: int = field(default_factory=time.monotonic_ns)
    schema_version: int = SCHEMA_VERSION

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.experiment_id, "experiment_id")
        _req(self.hypothesis_id, "hypothesis_id")
        _req(self.correlation_id, "correlation_id")
        _req(self.provenance, "provenance")
        _req(self.intervention, "intervention")
        if self.predicted_delta_ms is None or isinstance(self.predicted_delta_ms, bool):
            raise LedgerError("predicted_delta_ms is required before execution")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> Experiment:
        return cls(experiment_id=d.get("experiment_id") or _nid(), hypothesis_id=d.get("hypothesis_id", ""),
                   correlation_id=d.get("correlation_id", ""), provenance=d.get("provenance", ""),
                   intervention=d.get("intervention", ""), predicted_delta_ms=d.get("predicted_delta_ms"),
                   measured_delta_ms=d.get("measured_delta_ms"), ts_ns=d.get("ts_ns") or time.monotonic_ns(),
                   schema_version=_ver(d.get("schema_version")))


class Ledger:
    """Write-ahead JSONL event log; __init__ replays the file, so load order
    == write order and replay reproduces identical state."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self.traces: dict[str, Trace] = {}
        self.incidents: dict[str, Incident] = {}
        self.evidence: dict[str, Evidence] = {}
        self.hypotheses: dict[str, Hypothesis] = {}
        self.experiments: dict[str, Experiment] = {}
        if self._path.exists():
            for line in self._path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    e = json.loads(line)
                    self._apply(e["type"], e["data"])

    def snapshot(self) -> dict:
        return {k: {i: r.to_dict() for i, r in sorted(getattr(self, k).items())}
                for k in ("traces", "incidents", "evidence", "hypotheses", "experiments")}

    def append_trace(self, rec: Trace) -> Trace:
        self._dup(self.traces, rec.trace_id, rec)
        return self._commit("trace", rec.to_dict())

    def open_incident(self, rec: Incident) -> Incident:
        self._dup(self.incidents, rec.incident_id, rec)
        return self._commit("incident", rec.to_dict())

    def append_evidence(self, rec: Evidence) -> Evidence:
        self._dup(self.evidence, rec.record_id, rec)
        if rec.trace_id and rec.trace_id not in self.traces:
            raise LedgerError(f"unknown trace_id {rec.trace_id!r}")
        if rec.incident_id and rec.incident_id not in self.incidents:
            raise LedgerError(f"unknown incident_id {rec.incident_id!r}")
        return self._commit("evidence", rec.to_dict())

    def propose_hypothesis(self, rec: Hypothesis) -> Hypothesis:
        if rec.status is not EvidenceLevel.INFERRED:
            raise LedgerError("proposals enter at INFERRED")
        self._dup(self.hypotheses, rec.hypothesis_id, rec)
        if rec.incident_id not in self.incidents:
            raise LedgerError(f"unknown incident_id {rec.incident_id!r}")
        return self._commit("hypothesis", rec.to_dict())

    def record_experiment(self, rec: Experiment) -> Experiment:
        if rec.measured_delta_ms is not None:
            raise LedgerError("record prediction first; use set_measured after execution")
        if rec.hypothesis_id not in self.hypotheses:
            raise LedgerError(f"unknown hypothesis_id {rec.hypothesis_id!r}")
        if rec.experiment_id in self.experiments:
            raise LedgerError(f"duplicate experiment_id {rec.experiment_id!r}")
        return self._commit("experiment", rec.to_dict())

    def set_measured(self, experiment_id: str, measured_ms: float) -> Experiment:
        if measured_ms is None or isinstance(measured_ms, bool):
            raise LedgerError("measured_ms must be a number")
        exp = self.experiments.get(experiment_id)
        if exp is None:
            raise LedgerError(f"unknown experiment_id {experiment_id!r}")
        return self._commit("experiment", replace(exp, measured_delta_ms=float(measured_ms)).to_dict())

    def transition(self, hypothesis_id: str, to: EvidenceLevel | str, experiment_id: str | None = None) -> Hypothesis:
        h = self.hypotheses.get(hypothesis_id)
        if h is None:
            raise LedgerError(f"unknown hypothesis_id {hypothesis_id!r}")
        to = _level(to)
        self._check(h, to, experiment_id)
        return self._commit("transition", {"hypothesis_id": hypothesis_id, "from": h.status.value,
                                           "to": to.value, "experiment_id": experiment_id})

    @staticmethod
    def _dup(mapping: dict, key: str, rec: object) -> None:
        if key in mapping and mapping[key] != rec:
            raise LedgerError(f"duplicate id {key!r}")

    def _check(self, h: Hypothesis, to: EvidenceLevel, experiment_id: str | None) -> None:
        exp = self.experiments.get(experiment_id) if experiment_id else None
        linked = exp is not None and exp.hypothesis_id == h.hypothesis_id
        if h.status is EvidenceLevel.INFERRED and to is EvidenceLevel.TESTED and linked:
            return
        if h.status is EvidenceLevel.TESTED and to is EvidenceLevel.VERIFIED and linked \
                and exp.measured_delta_ms is not None:
            return
        if h.status is EvidenceLevel.TESTED and to is EvidenceLevel.INFERRED:
            return
        if h.status is EvidenceLevel.INFERRED and to is EvidenceLevel.TESTED:
            raise LedgerError("TESTED needs a linked experiment for this hypothesis")
        if to is EvidenceLevel.VERIFIED:
            raise LedgerError("VERIFIED needs an executed experiment with measured effect (never confidence alone)")
        raise LedgerError(f"illegal transition {h.status.value} -> {to.value}")

    def _commit(self, etype: str, data: dict):
        line = json.dumps({"type": etype, "data": data}, sort_keys=True)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "a", encoding="utf-8") as fh:
            # ponytail: no fsync/lock; single local writer. Upgrade: fsync + file lock for multi-writer/crash safety.
            fh.write(line + "\n")
        return self._apply(etype, data)

    def _apply(self, etype: str, data: dict):
        if etype == "trace":
            rec = Trace.from_dict(data)
            self._dup(self.traces, rec.trace_id, rec)
            self.traces[rec.trace_id] = rec
            return rec
        if etype == "incident":
            rec = Incident.from_dict(data)
            self._dup(self.incidents, rec.incident_id, rec)
            self.incidents[rec.incident_id] = rec
            return rec
        if etype == "evidence":
            rec = Evidence.from_dict(data)
            self._dup(self.evidence, rec.record_id, rec)
            if rec.trace_id and rec.trace_id not in self.traces:
                raise LedgerError(f"log divergence: unknown trace_id {rec.trace_id!r}")
            if rec.incident_id and rec.incident_id not in self.incidents:
                raise LedgerError(f"log divergence: unknown incident_id {rec.incident_id!r}")
            self.evidence[rec.record_id] = rec
            return rec
        if etype == "hypothesis":
            rec = Hypothesis.from_dict(data)
            if rec.status is not EvidenceLevel.INFERRED:
                raise LedgerError("log divergence: proposal not at INFERRED")
            self._dup(self.hypotheses, rec.hypothesis_id, rec)
            self.hypotheses[rec.hypothesis_id] = rec
            return rec
        if etype == "experiment":
            rec = Experiment.from_dict(data)
            if rec.experiment_id not in self.experiments:
                if rec.measured_delta_ms is not None:
                    raise LedgerError("log divergence: experiment recorded already measured")
                if rec.hypothesis_id not in self.hypotheses:
                    raise LedgerError(f"log divergence: unknown hypothesis_id {rec.hypothesis_id!r}")
            # ponytail: updates (set_measured events) accepted on id match; no tamper-evidence — logs are trusted single-writer output
            self.experiments[rec.experiment_id] = rec
            return rec
        if etype == "transition":
            h = self.hypotheses.get(data["hypothesis_id"])
            if h is None or h.status.value != data["from"]:
                raise LedgerError("log divergence: transition base mismatch")
            self._check(h, _level(data["to"]), data.get("experiment_id"))
            rec = replace(h, status=_level(data["to"]))
            self.hypotheses[rec.hypothesis_id] = rec
            return rec
        raise LedgerError(f"unknown event type {etype!r}")
