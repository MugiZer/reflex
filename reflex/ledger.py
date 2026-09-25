"""Versioned Trace/Incident schema + immutable typed evidence ledger (JSONL)."""
from __future__ import annotations

import json
import hashlib
import os
import time
import uuid
from dataclasses import asdict, dataclass, field, replace
from enum import Enum
from pathlib import Path

from . import envelope as _envelope

SCHEMA_VERSION = 2
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
    if v not in (1, SCHEMA_VERSION):
        raise LedgerError(f"unsupported schema_version {v!r}")
    return v


def _jsonable(payload: dict) -> dict:
    try:
        return json.loads(json.dumps(payload, sort_keys=True, allow_nan=False))
    except (TypeError, ValueError):
        raise LedgerError("payload must be JSON-serializable")


def _level(v: EvidenceLevel | str) -> EvidenceLevel:
    try:
        return v if isinstance(v, EvidenceLevel) else EvidenceLevel(str(v))
    except ValueError:
        raise LedgerError(f"bad level {v!r}")


def _nid() -> str:
    return uuid.uuid4().hex


def canonical_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def require_fields(value: dict, fields) -> None:
    if not isinstance(value, dict) or any(key not in value for key in fields):
        raise LedgerError(f"required fields: {', '.join(fields)}")


def validate_network_gate(h, exp, evidence, level) -> dict:
    """Recompute promotion from immutable plan and resolved observations."""
    if not exp or exp.domain != "network" or h.hypothesis_id not in exp.plan["claims"]:
        raise LedgerError("network gate needs linked experiment")
    if any(e.kind == "supersession" and e.incident_id == h.incident_id and
           h.hypothesis_id in e.payload["claims"] for e in evidence.values()):
        raise LedgerError("claim superseded")
    results = [e for e in evidence.values() if e.kind == "experiment_result" and
               e.incident_id == h.incident_id and e.payload["experiment_id"] == exp.experiment_id]
    if len(results) != 1:
        raise LedgerError("one execution result required")
    result = results[0].payload
    if result["plan_hash"] != canonical_hash(exp.plan):
        raise LedgerError("certificate plan mismatch")
    resolved = {}
    for key in ("manipulation", "assignment", "coverage", "carryover", "effect", "mediator", "rivals"):
        refs = result.get(key, [])
        resolved[key] = []
        for ref in refs:
            ev = evidence.get(ref)
            if not ev or ev.incident_id != h.incident_id or ev.domain != "network":
                raise LedgerError("certificate reference outside incident")
            if ev.payload.get("experiment_id") != exp.experiment_id:
                raise LedgerError("reused experiment evidence")
            resolved[key].append(ev.payload)
    manip = resolved["manipulation"]
    assignment = resolved["assignment"]
    if result.get("execution") != "executed" or not manip or not assignment:
        raise LedgerError("TESTED needs executed contrast and readback")
    if any(m.get("actual") != exp.plan["exposure"].get(m.get("arm")) for m in manip):
        raise LedgerError("manipulation not established")
    if [a.get("arm") for a in assignment] != exp.plan["schedule"]:
        raise LedgerError("assignment schedule mismatch")
    if sorted(m.get("block") for m in manip) != list(range(len(assignment))):
        raise LedgerError("missing manipulation readbacks")
    if level == EvidenceLevel.TESTED:
        return result
    if result.get("scope") != h.scope or exp.plan["scope"] != h.scope:
        raise LedgerError("certificate scope mismatch")
    if not all(resolved[k] for k in ("coverage", "carryover", "effect")):
        raise LedgerError("verification checks missing")
    if any(p.get("drops") != 0 or not p.get("complete") or not p.get("clock_valid")
           for p in resolved["coverage"]):
        raise LedgerError("verification coverage/clock incomplete")
    if any(p.get("initial_state") is None or not p.get("washed_out") or p.get("interference") != "controlled"
           for p in resolved["carryover"]):
        raise LedgerError("uncontrolled carryover/interference")
    contract = evidence[h.scope["contract_id"]].payload
    from .network_analysis import compare_blocks
    for effect in resolved["effect"]:
        allocation=evidence.get(effect.get("allocation_id"))
        if not allocation or allocation.kind != "error_allocation" or allocation.incident_id != h.incident_id or allocation.payload.get("experiment_id") != exp.experiment_id or allocation.payload["look"] != effect["look"]:
            raise LedgerError("experiment inferential allocation missing or reused")
        measurements = [e.payload for e in evidence.values() if e.kind == "experiment_observation" and
                        e.incident_id == h.incident_id and e.payload.get("experiment_id") == exp.experiment_id and
                        e.payload.get("category") == "block_outcome"]
        measured_by_arm = {arm: [p["block_summary"] for p in measurements if p["arm"] == arm]
                           for arm in ("control", "treatment")}
        if effect["reference"] != measured_by_arm["treatment"] or effect["current"] != measured_by_arm["control"]:
            raise LedgerError("effect populations differ from executed blocks")
        calculated = compare_blocks(effect["reference"], effect["current"], contract, effect["look"],
                                    effect_scale=2 if exp.plan.get("assignment_scheme")=="natural" else 1)
        if calculated != effect["comparison"] or not calculated["regression"]:
            raise LedgerError("material population effect not established")
        if exp.plan.get("assignment_scheme") == "paired_randomized":
            from .network_analysis import paired_schedule, randomization_test
            if exp.plan["schedule"] != paired_schedule(len(exp.plan["schedule"])//2, exp.plan["seed"]):
                raise LedgerError("recorded schedule differs from frozen randomization")
            randomized = randomization_test([p["value"] for p in measured_by_arm["control"]],
                                            [p["value"] for p in measured_by_arm["treatment"]], seed=exp.plan["seed"])
            if effect.get("randomization") != randomized or randomized["p_value"] > calculated["spent_alpha"]:
                raise LedgerError("assignment-respecting test does not support effect")
        elif exp.plan.get("assignment_scheme") == "natural":
            roles=("exogeneity","overlap","stability","no_simultaneous_change","parallel_trends")
            support=exp.plan.get("natural_support",{})
            if set(support) != set(roles):
                raise LedgerError("natural contrast lacks supported identification assumptions")
            current_raw={ref for ev in evidence.values() if ev.incident_id == h.incident_id and ev.kind == "reference"
                         for ref in ev.payload["inputs"]}
            for role in roles:
                facts=[evidence.get(ref) for ref in support[role]]
                if not facts:
                    raise LedgerError("natural assumption evidence missing")
                for fact in facts:
                    if not fact or fact.incident_id != h.incident_id or fact.kind != "fact" or fact.payload.get("role") != role or not fact.payload.get("basis"):
                        raise LedgerError("natural assumptions need scoped supporting facts")
                    inputs=fact.payload.get("inputs",[])
                    if not inputs or not set(inputs) <= current_raw:
                        raise LedgerError("natural assumptions cannot be asserted as booleans")
            if contract["estimand"] != "half difference in differences of bounded block outcomes":
                raise LedgerError("natural contrast estimand must disclose scaling")
            for measurement in measurements:
                natural=measurement.get("natural")
                if not natural or any(not 0 <= natural.get(k,-1) <= 1 for k in ("before","after")):
                    raise LedgerError("matched natural before/after outcomes missing")
                expected=(natural["after"]-natural["before"]+1)/2
                if measurement["block_summary"]["value"] != expected:
                    raise LedgerError("natural effect does not match before/after records")
        else:
            raise LedgerError("verification requires a supported assignment scheme")
    if h.scope["claim_type"] != "intervention_effect":
        if not resolved["mediator"] or not resolved["rivals"]:
            raise LedgerError("mechanism needs mediator and discriminating rival checks")
        from .network_analysis import progress_view
        for check in resolved["mediator"] + resolved["rivals"]:
            require_fields(check, ("control_inputs", "treatment_inputs", "interval_kind", "tolerance", "prediction"))
            groups = []
            for key in ("control_inputs", "treatment_inputs"):
                rows = {}
                for ref in check[key]:
                    ev = evidence.get(ref)
                    if not ev or ev.kind != "event" or ev.domain != "network" or ref not in check.get("inputs", []):
                        raise LedgerError("missing direct mediator/rival observations")
                    rows[ref] = ev.payload
                intervals = [f for f in progress_view(rows)["intervals"] if f["kind"] == check["interval_kind"] and not f["limitations"]]
                if not intervals:
                    raise LedgerError("mediator/rival boundaries not observed")
                groups.append(sum(f["duration"] for f in intervals)/len(intervals))
            change = groups[1]-groups[0]
            if check["prediction"] == "decrease":
                if change >= -check["tolerance"]:
                    raise LedgerError("mediator did not change as predicted")
            elif check["prediction"] == "equivalent":
                require_fields(check, ("comparison", "reference", "current", "contract_id", "look", "allocation_id", "scale"))
                rival_contract=evidence.get(check["contract_id"])
                allocation=evidence.get(check["allocation_id"])
                if not rival_contract or rival_contract.kind != "comparison_contract" or rival_contract.incident_id != h.incident_id or not allocation or allocation.kind != "error_allocation" or allocation.payload.get("experiment_id") != exp.experiment_id or allocation.payload["contract_id"] != check["contract_id"] or allocation.payload["look"] != check["look"]:
                    raise LedgerError("rival equivalence lacks allocated frozen contrast")
                if check["scale"] <= 0:
                    raise LedgerError("rival outcome normalization must be positive")
                for key in ("reference","current"):
                    for block in check[key]:
                        if not block.get("inputs") or not set(block["inputs"]) <= set(check["inputs"]):
                            raise LedgerError("rival block lacks observed inputs")
                        intervals=[f for f in progress_view({ref:evidence[ref].payload for ref in block["inputs"]})["intervals"]
                                   if f["kind"] == check["interval_kind"] and not f["limitations"]]
                        if not intervals or block["value"] != sum(f["duration"] for f in intervals)/len(intervals)/check["scale"]:
                            raise LedgerError("rival block differs from measured intervals")
                recomputed=compare_blocks(check["reference"],check["current"],rival_contract.payload,check["look"])
                if recomputed != check["comparison"]:
                    raise LedgerError("rival equivalence certificate differs from derivation")
                band = recomputed.get("interval")
                if band:
                    band=[bound*check["scale"] for bound in band]
                if not band or band[0] < -check["tolerance"] or band[1] > check["tolerance"]:
                    raise LedgerError("rival equivalence not established")
            else:
                raise LedgerError("unsupported discriminating prediction")
        if {p.get("rival") for p in resolved["rivals"]} != set(exp.plan["rivals"]):
            raise LedgerError("rival pathways unresolved")
    if h.scope["claim_type"] == "historical_responsibility":
        historical = result.get("historical_inputs", [])
        if not historical or any(ref not in h.scope["support"] for ref in historical):
            raise LedgerError("recurrence cannot verify missing history")
    return result


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
    domain: str = "legacy"
    error_budget: float = .05

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.incident_id, "incident_id")
        _req(self.provenance, "provenance")
        object.__setattr__(self, "trace_ids", tuple(self.trace_ids))
        if not 0 < self.error_budget < 1:
            raise LedgerError("incident error budget must be in (0,1)")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["trace_ids"] = list(self.trace_ids)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Incident:
        return cls(incident_id=d.get("incident_id") or _nid(), provenance=d.get("provenance", ""),
                   title=d.get("title", ""), trace_ids=tuple(d.get("trace_ids") or ()),
                   domain=d.get("domain", "legacy"),
                   error_budget=d.get("error_budget", .05),
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
    domain: str = "legacy"

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
                   incident_id=d.get("incident_id", ""), ts_ns=d.get("ts_ns", 0),
                   synthetic=bool(d.get("synthetic", False)),
                   domain=d.get("domain", "legacy"),
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
    domain: str = "legacy"
    scope: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.hypothesis_id, "hypothesis_id")
        _req(self.incident_id, "incident_id")
        _req(self.provenance, "provenance")
        _req(self.cause, "cause")
        object.__setattr__(self, "status", _level(self.status))
        object.__setattr__(self, "scope", _jsonable(self.scope))
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
                   domain=d.get("domain", "legacy"), scope=d.get("scope", {}),
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
    domain: str = "legacy"
    plan: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _ver(self.schema_version)
        _req(self.experiment_id, "experiment_id")
        _req(self.hypothesis_id, "hypothesis_id")
        _req(self.correlation_id, "correlation_id")
        _req(self.provenance, "provenance")
        _req(self.intervention, "intervention")
        object.__setattr__(self, "plan", _jsonable(self.plan))
        if self.domain != "network" and (self.predicted_delta_ms is None or isinstance(self.predicted_delta_ms, bool)):
            raise LedgerError("predicted_delta_ms is required before execution")
        _jsonable(self.to_dict())

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> Experiment:
        return cls(experiment_id=d.get("experiment_id") or _nid(), hypothesis_id=d.get("hypothesis_id", ""),
                   correlation_id=d.get("correlation_id", ""), provenance=d.get("provenance", ""),
                   intervention=d.get("intervention", ""), predicted_delta_ms=d.get("predicted_delta_ms"),
                   measured_delta_ms=d.get("measured_delta_ms"), ts_ns=d.get("ts_ns") or time.monotonic_ns(),
                   domain=d.get("domain", "legacy"), plan=d.get("plan", {}),
                   schema_version=_ver(d.get("schema_version")))


class Ledger:
    """Write-ahead JSONL event log; __init__ replays the file, so load order
    == write order and replay reproduces identical state."""

    def __init__(self, path: str | Path, *, commit: str = "unknown", fault: str = "unknown",
                 seed: int | None = None, hardware: str = "unknown",
                 collector_version: str = "unknown", timing_model_version: str = "unknown",
                 outcome: str = "unknown", reason: str = "") -> None:
        self._path = Path(path)
        # ponytail: envelope context injected at construction; _commit stamps
        # every line. No git/env/subprocess here — callers pass strings in.
        self._env_args = {"commit": commit, "fault": fault, "seed": seed,
                          "hardware": hardware, "collector_version": collector_version,
                          "timing_model_version": timing_model_version,
                          "outcome": outcome, "reason": reason}
        self.traces: dict[str, Trace] = {}
        self.incidents: dict[str, Incident] = {}
        self.evidence: dict[str, Evidence] = {}
        self.hypotheses: dict[str, Hypothesis] = {}
        self.experiments: dict[str, Experiment] = {}
        self.incomplete_tail = False
        self._valid_bytes = 0
        if self._path.exists():
            with self._path.open("rb") as fh:
                for line in fh:
                    if not line.endswith(b"\n"):
                        self.incomplete_tail = True
                        break
                    if line.strip():
                        e = json.loads(line)
                        self._validate(e["type"], e["data"])
                        self._apply(e["type"], e["data"])
                    self._valid_bytes = fh.tell()

    def repair_incomplete_tail(self):
        """Preserve torn bytes before truncating to the last committed newline."""
        if not self.incomplete_tail:
            return None
        backup=self._path.with_name(self._path.name+".incomplete-"+uuid.uuid4().hex)
        digest=hashlib.sha256()
        with self._path.open("rb") as source, backup.open("xb") as target:
            source.seek(self._valid_bytes)
            for chunk in iter(lambda:source.read(65536),b""):
                digest.update(chunk)
                target.write(chunk)
            target.flush()
            os.fsync(target.fileno())
        with self._path.open("r+b") as target:
            target.truncate(self._valid_bytes)
            target.flush()
            os.fsync(target.fileno())
        self.incomplete_tail=False
        return {"reason":"incomplete final append preserved; its execution status is unknown",
                "backup":str(backup),"sha256":digest.hexdigest(),"committed_bytes":self._valid_bytes}

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
        if h.domain == "network":
            if (h.status, to) not in ((EvidenceLevel.INFERRED, EvidenceLevel.TESTED),
                                     (EvidenceLevel.TESTED, EvidenceLevel.VERIFIED)):
                raise LedgerError("network reassessment must append supersession evidence")
            validate_network_gate(h, exp, self.evidence, to)
            return
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
        self._validate(etype, data)
        if self.incomplete_tail:
            raise LedgerError("incomplete tail: preserve and repair log before appending")
        table = {"trace": (self.traces, "trace_id"), "incident": (self.incidents, "incident_id"),
                 "evidence": (self.evidence, "record_id"), "hypothesis": (self.hypotheses, "hypothesis_id")}
        if etype in table:
            mapping, key = table[etype]
            if data[key] in mapping and mapping[data[key]].to_dict() == data:
                return mapping[data[key]]
        line = json.dumps({"type": etype, "data": data,
                           "envelope": _envelope.stamp(**self._env_args)}, sort_keys=True, allow_nan=False)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        return self._apply(etype, data)

    def _validate(self, etype: str, data: dict) -> None:
        _jsonable(data)
        domain = data.get("domain", "legacy")
        if domain not in ("network", "legacy", "gpu"):
            raise LedgerError("unknown domain")
        incident = self.incidents.get(data.get("incident_id"))
        if incident and (incident.domain == "network") != (domain == "network"):
            raise LedgerError("incident domain mismatch")
        if domain != "network":
            if etype == "experiment":
                h = self.hypotheses.get(data.get("hypothesis_id"))
                if h and h.domain == "network":
                    raise LedgerError("network experiment must select network contract")
            return
        if data.get("schema_version") != 2:
            raise LedgerError("network requires schema version 2")
        if etype == "evidence":
            if data.get("level") not in ("OBSERVED", "INFERRED"):
                raise LedgerError("evidence cannot assert TESTED or VERIFIED")
            from .network_capture import validate_payload
            validate_payload(data["kind"], data["payload"])
            payload = data["payload"]
            if data["kind"] == "comparison_contract" and data["record_id"] not in self.evidence:
                if incident is None:
                    raise LedgerError("comparison contract requires an incident")
                allocated=sum(e.payload["alpha"] for e in self.evidence.values() if
                              e.incident_id == incident.incident_id and e.kind == "comparison_contract")
                if allocated+payload["alpha"] > incident.error_budget+1e-12:
                    raise LedgerError("contract allocations exceed frozen incident error budget")
            if data["kind"] == "error_allocation":
                require_fields(payload,("contract_id","look","alpha","inputs"))
                contract=self.evidence.get(payload["contract_id"])
                if not contract or contract.kind != "comparison_contract" or contract.incident_id != data["incident_id"]:
                    raise LedgerError("error allocation requires current frozen contract")
                existing=[e for e in self.evidence.values() if e.incident_id == data["incident_id"] and e.kind == "error_allocation" and e.payload["contract_id"] == payload["contract_id"]]
                if data["record_id"] not in self.evidence and payload["look"] != len(existing)+1:
                    raise LedgerError("error allocation cannot reset or skip scheduled looks")
                k=payload["look"]
                if k < 1 or payload["alpha"] != contract.payload["alpha"]/(k*(k+1)):
                    raise LedgerError("invalid sequential error allocation")
            for ref in payload.get("inputs", []):
                ev = self.evidence.get(ref)
                if ev is None or ev.domain != "network" or ev.incident_id not in ("", data["incident_id"]):
                    raise LedgerError("invalid evidence input or cross-incident reference")
            if data["kind"] == "experiment_result":
                exp = self.experiments.get(payload["experiment_id"])
                if exp is None or exp.domain != "network":
                    raise LedgerError("result before network plan")
                h = self.hypotheses[exp.hypothesis_id]
                if h.incident_id != data["incident_id"] or payload["plan_hash"] != canonical_hash(exp.plan):
                    raise LedgerError("result scope/plan mismatch")
        elif etype == "hypothesis":
            if not incident:
                raise LedgerError("claim needs incident")
            scope = data.get("scope", {})
            require_fields(scope, ("mechanism", "location", "contract_id", "outcome", "regime", "assumptions", "support", "alternatives", "claim_type"))
            contract = self.evidence.get(scope["contract_id"])
            if not contract or contract.incident_id != incident.incident_id or contract.kind != "comparison_contract":
                raise LedgerError("claim needs same-incident comparison contract")
            for ref in scope["support"]:
                ev = self.evidence.get(ref)
                if not ev or ev.incident_id != incident.incident_id or ev.kind == "summary" or ev.payload.get("kind") == "historical_advice":
                    raise LedgerError("claim support must be current incident evidence")
        elif etype == "experiment":
            h = self.hypotheses.get(data.get("hypothesis_id"))
            if not h or h.domain != "network":
                raise LedgerError("network experiment needs network claim")
            old = self.experiments.get(data["experiment_id"])
            if old and old.to_dict() != data:
                raise LedgerError("network plan is immutable; append result evidence")
            plan = data.get("plan", {})
            require_fields(plan, ("contract_id", "claims", "eligible_population", "exposure", "predictions", "rivals", "threshold", "assignment_unit", "replication_unit", "schedule", "seed", "washout", "budget", "readback", "restoration", "scope"))
            if h.hypothesis_id not in plan["claims"] or plan["contract_id"] != h.scope["contract_id"]:
                raise LedgerError("experiment claim/contract mismatch")
            if not plan["schedule"] or plan["threshold"] < 0:
                raise LedgerError("bounded schedule and material threshold required")
            if set(plan["schedule"]) != {"control", "treatment"}:
                raise LedgerError("both control and treatment arms required")
            for claim in plan["claims"]:
                linked = self.hypotheses.get(claim)
                if not linked or linked.incident_id != h.incident_id or linked.scope["contract_id"] != plan["contract_id"]:
                    raise LedgerError("all experiment claims must share incident and contract")

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
