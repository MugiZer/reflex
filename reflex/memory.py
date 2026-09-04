"""Ticket 12: persistent incident memory, hybrid retrieval, rule-first cascade.

Ledger-compatible JSONL store of versioned incident records (context,
comparator symptoms, hypotheses, measurements+cost, interventions+measured
effects, verification status, cause/fix). Hybrid retrieval = structured
feature match + TF-IDF semantic + graph/topology rerank on the reconstruct
vocabulary (regressed_stage). Advisory seam only: reuse proposes priors,
never verification. Learning is offline records only (no online update API).
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, field_validator
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .diagnose import STAGES
from .reconstruct import build_graph, diff_critical_path
from .ledger import SCHEMA_VERSION, UNKNOWN

PROVENANCE = "memory"
VERSION = "roofline-v1"  # version scope for rules + context match
THRESHOLD = 0.20  # ponytail: fixed floor; fit from incident volume when retrieval logs exist
_SHRINK_K = 2.0  # ponytail: fixed prior strength; refit when intervention outcomes accumulate
_W = (0.5, 0.3, 0.2)  # structured / semantic / graph weights

Tier = Literal["VERIFIED", "TESTED", "INFERRED"]
_TIERS = ("VERIFIED", "TESTED", "INFERRED")


class IncidentRecord(BaseModel):
    incident_id: str
    provenance: str = PROVENANCE
    timing_model_version: str = VERSION
    kernels: list[str] = []
    n_ops: int = 0
    symptoms: dict[str, dict[str, float]] = {}
    regressed_stage: str = "other"
    flags: dict = {}
    text: str = ""
    hypotheses: list[dict] = []
    interventions: list[dict] = []
    verification: Tier = "INFERRED"
    cause: str = UNKNOWN
    fix: str = ""
    support: int = 0
    retracted: bool = False
    schema_version: int = SCHEMA_VERSION

    @field_validator("verification")
    @classmethod
    def _tier(cls, v: str) -> str:
        if v not in _TIERS:
            raise ValueError(f"bad tier {v!r}")
        return v


def describe(bundle: dict, baselines: list[dict], healthy: dict) -> dict:
    """Query/record feature view off real bundles (diagnose + reconstruct only)."""
    from .diagnose import compare, rank  # local: keep import graph shallow
    comp = compare(bundle, baselines)
    ranking = rank(comp["surfaces"])
    symptoms = {st: {"z": s["z"], "delta": s["delta"]} for st, s in comp["surfaces"].items()}
    try:
        reg = diff_critical_path(build_graph(bundle), build_graph(healthy))["regressed_stage"]
    except Exception:
        reg = ranking[0][0] if ranking else "other"
    top = [st for st, _, _ in ranking[:2]]
    flags = {"serialized": any(s.get("serialized") for s in bundle.get("sync_edge", [])),
             "qdepth": sum(r.get("queue_depth", 0) for r in bundle.get("l1", [])) / max(1, len(bundle.get("l1", [])))}
    ctx = comp["context"]
    text = " ".join([reg, *top, *ctx["kernels"]])
    return {"timing_model_version": ctx["timing_model_version"], "kernels": list(ctx["kernels"]),
            "n_ops": ctx["n_ops"], "symptoms": symptoms, "regressed_stage": reg,
            "flags": flags, "text": text, "ranking": ranking}


def record_from_ledger(ledger, incident_id: str, view: dict, support: int = 1) -> IncidentRecord:
    """Build a storable record from ledger hypotheses/experiments + a describe() view."""
    hypos = [h for h in ledger.hypotheses.values() if h.incident_id == incident_id]
    if not hypos:
        raise ValueError(f"no hypotheses for {incident_id!r}")
    order = {"INFERRED": 0, "TESTED": 1, "VERIFIED": 2}
    hypos.sort(key=lambda h: order[h.status.value])
    top = hypos[-1]
    exps = [e for e in ledger.experiments.values()
            if e.hypothesis_id in {h.hypothesis_id for h in hypos} and e.measured_delta_ms is not None]
    ivs = [{"intervention": e.intervention, "predicted_ms": e.predicted_delta_ms,
            "measured_ms": e.measured_delta_ms,
            "recovery": (e.measured_delta_ms / e.predicted_delta_ms) if abs(e.predicted_delta_ms or 0) > 1e-9 else 0.0}
           for e in exps]
    best = max(ivs, key=lambda d: d["measured_ms"]) if ivs else None
    text = " ".join([str(top.cause), (best or {}).get("intervention", ""), view.get("text", "")])
    return IncidentRecord(incident_id=incident_id, timing_model_version=view["timing_model_version"],
                          kernels=list(view["kernels"]), n_ops=view["n_ops"], symptoms=dict(view["symptoms"]),
                          regressed_stage=view.get("regressed_stage", "other"), flags=dict(view.get("flags", {})),
                          text=text, hypotheses=[{"cause": h.cause, "status": h.status.value} for h in hypos],
                          interventions=ivs, verification=top.status.value,  # type: ignore[typeddict-item]
                          cause=top.cause, fix=best["intervention"] if best and best["measured_ms"] > 0 else "",
                          support=support)


class MemoryStore:
    """Append-only JSONL incident store (+ sidecar offline-learning log). No online/policy API."""

    def __init__(self, path: str | Path, learning_path: str | Path | None = None) -> None:
        self._path = Path(path)
        p = self._path
        self._learn = Path(learning_path) if learning_path else p.with_suffix(".learning.jsonl")
        self._recs: dict[str, IncidentRecord] = {}
        if self._path.exists():
            for line in self._path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = IncidentRecord.model_validate_json(line)
                    self._recs[r.incident_id] = r

    def save(self, rec: IncidentRecord) -> IncidentRecord:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "a", encoding="utf-8") as fh:
            # ponytail: no fsync/lock; single local writer like the ledger. Add lock when multi-builder writes share a store.
            fh.write(rec.model_dump_json() + "\n")
        self._recs[rec.incident_id] = rec
        return rec

    def all(self) -> list[IncidentRecord]:
        return list(self._recs.values())

    def get(self, incident_id: str) -> IncidentRecord:
        return self._recs[incident_id]

    def retract(self, incident_id: str, reason: str) -> IncidentRecord:
        if not (reason and reason.strip()):
            raise ValueError("retraction needs a reason")
        r = self.get(incident_id).model_copy(update={"retracted": True})
        self._recs[incident_id] = r
        # ponytail: full-file rewrite, not journalling; fine for local incident
        # volumes — add append-ahead log if retract races concurrent readers.
        self._path.write_text("".join(x.model_dump_json() + "\n" for x in self._recs.values()), encoding="utf-8")
        append_learning(self, {"kind": "offline_retraction", "incident_id": incident_id,
                               "reason": reason.strip(), "cause": r.cause})
        return r


def _symvec(symptoms: dict) -> list[float]:
    return [float(symptoms.get(st, {}).get("z", 0.0)) for st in STAGES]


def structured_score(query: dict, rec: IncidentRecord) -> float:
    ver = 1.0 if query.get("timing_model_version") == rec.timing_model_version else 0.0
    a, b = set(query.get("kernels", [])), set(rec.kernels)
    jac = len(a & b) / len(a | b) if (a | b) else 0.0
    qv, rv = _symvec(query.get("symptoms", {})), _symvec(rec.symptoms)
    den = math.sqrt(sum(x * x for x in qv)) * math.sqrt(sum(x * x for x in rv))
    cos = sum(x * y for x, y in zip(qv, rv)) / den if den > 0 else 0.0
    return 0.4 * ver + 0.3 * jac + 0.3 * max(0.0, cos)


def semantic_scores(query_text: str, recs: list[IncidentRecord]) -> list[float]:
    corpus = [r.text or "" for r in recs]
    if not recs or not any(corpus) or not query_text:
        return [0.0] * len(recs)
    try:
        vec = TfidfVectorizer().fit(corpus + [query_text])
        m = cosine_similarity(vec.transform([query_text]), vec.transform(corpus))[0]
        return [float(v) for v in m]
    except ValueError:
        return [0.0] * len(recs)


def graph_score(query: dict, rec: IncidentRecord) -> float:
    q, r = query.get("regressed_stage"), rec.regressed_stage
    return 1.0 if q and q == r else 0.0


def _rule_serialized(q: dict) -> dict | None:
    if q.get("timing_model_version") == VERSION and q.get("flags", {}).get("serialized") \
            and q.get("symptoms", {}).get("scheduler", {}).get("z", 0) > 2.0:
        return {"cause": "sync_serialization", "fix": "remove_competing"}
    return None


def _rule_kernel(q: dict) -> dict | None:
    syms = q.get("symptoms", {})
    top = max(syms, key=lambda s: (syms[s].get("z", 0), syms[s].get("delta", 0))) if syms else ""
    if q.get("timing_model_version") == VERSION and not q.get("flags", {}).get("serialized") \
            and top == "gpu" and syms["gpu"].get("z", 0) > 2.0:
        return {"cause": "kernel_regression", "fix": "revert_kernel_config"}
    return None


RULES = (("serialized-sync-v1", _rule_serialized), ("kernel-regression-v1", _rule_kernel))


def difference_card(query: dict, rec: IncidentRecord, parts: dict) -> dict:
    qsym, rsym = query.get("symptoms", {}), rec.symptoms

    def _close(a: float, b: float) -> bool:  # relative tolerance: z scales vary 10x across faults
        return abs(a - b) <= max(1.0, 0.25 * max(abs(a), abs(b)))

    matches = [f"{st} z={qsym[st]['z']:+.2f} vs {rsym[st]['z']:+.2f}"
               for st in STAGES if st in qsym and st in rsym and _close(qsym[st]["z"], rsym[st]["z"])
               and abs(rsym[st].get("z", 0)) > 2.0]
    mism = [f"{st} z={qsym.get(st, {}).get('z', 0):+.2f} vs {rsym.get(st, {}).get('z', 0):+.2f}"
            for st in STAGES if not _close(qsym.get(st, {}).get("z", 0), rsym.get(st, {}).get("z", 0))]
    if set(query.get("kernels", [])) != set(rec.kernels):
        mism.append(f"kernels {sorted(query.get('kernels', []))} vs {sorted(rec.kernels)}")
    if query.get("timing_model_version") != rec.timing_model_version:
        mism.append(f"timing {query.get('timing_model_version')} vs {rec.timing_model_version}")
    unknowns = [st for st in STAGES
                if abs(qsym.get(st, {}).get("z", 0)) <= 2.0 and abs(rsym.get(st, {}).get("z", 0)) <= 2.0]
    risk = "low" if rec.verification == "VERIFIED" and not mism and \
        query.get("regressed_stage") == rec.regressed_stage else "high"
    need = ([f"rerun {i['intervention']} and measure end-to-end delta" for i in rec.interventions[:1]]
            or ["run a controlled intervention and measure end-to-end delta"])
    need += [f"confirm stage {st} with a matched-baseline rerun" for st in
             [m.split()[0] for m in mism[:2] if m.split()[0] in STAGES]]
    return {"why_retrieved": "score=%.3f (struct=%.3f, sem=%.3f, graph=%.1f); regressed %s vs %s" % (
        parts["score"], parts["structured"], parts["semantic"], parts["graph"],
        query.get("regressed_stage"), rec.regressed_stage),
        "matches": matches, "mismatches": mism, "unknowns": unknowns,
        "verification_quality": f"{rec.verification} support={rec.support} retracted={rec.retracted}",
        "transfer_risk": f"{risk}: {'verified+matching topology' if risk == 'low' else 'unverified or topology/context mismatch'}",
        "evidence_still_needed": need}


def retrieve(query: dict, store: MemoryStore, top_k: int = 3, gated: bool = True) -> list[dict]:
    cands = [r for r in store.all() if not r.retracted]  # eligibility before ranking; retracted never ranked
    sems = semantic_scores(query.get("text", ""), cands)
    out = []
    for r, sem in zip(cands, sems):
        st, gr = structured_score(query, r), graph_score(query, r)
        score = _W[0] * st + _W[1] * sem + _W[2] * gr
        parts = {"score": score, "structured": st, "semantic": sem, "graph": gr}
        authority = r.verification == "VERIFIED" or not gated
        out.append({"record": r, "score": score, "parts": parts,
                    "card": difference_card(query, r, parts),
                    "cause": r.cause if authority else None,
                    "authority": "cause+fix" if authority else "context-only"})
    out.sort(key=lambda d: d["score"], reverse=True)
    return out[:top_k]


def recall(query: dict, store: MemoryStore) -> dict:
    for name, fn in RULES:  # rule-first: small version-scoped high-precision rules
        hit = fn(query)
        if hit:
            return {"path": f"rule:{name}", "cause": hit["cause"], "fix": hit["fix"], "card": None, "priors": {}}
    hits = retrieve(query, store)
    if hits and hits[0]["score"] >= THRESHOLD:
        top = hits[0]
        cause_authority = top["authority"] == "cause+fix"
        return {"path": "retrieval", "cause": top["cause"],
                "fix": top["record"].fix if cause_authority else "",  # fix rides with cause authority, never alone
                "card": top["card"], "priors": shrunk_priors(top["record"], query),
                "score": top["score"], "incident_id": top["record"].incident_id}
    return {"path": "fallthrough", "cause": UNKNOWN, "fix": "", "card": None, "priors": {}}


def shrunk_priors(rec: IncidentRecord, query: dict) -> dict:
    """Shrink measured intervention effects toward neutral (0) on mismatch/low support."""
    match = structured_score(query, rec)
    factor = (rec.support / (rec.support + _SHRINK_K)) * (0.5 + 0.5 * match)
    return {i["intervention"]: {"raw_ms": i["measured_ms"], "shrunk_ms": i["measured_ms"] * factor,
                                "factor": factor} for i in rec.interventions}


def propose_learning(rec: IncidentRecord, note: str = "") -> dict:
    return {"kind": "offline_learning_proposal", "incident_id": rec.incident_id, "cause": rec.cause,
            "fix": rec.fix, "verification": rec.verification, "support": rec.support, "note": note}


def append_learning(store: MemoryStore, proposal: dict) -> dict:
    store._learn.parent.mkdir(parents=True, exist_ok=True)
    with open(store._learn, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(proposal, sort_keys=True) + "\n")
    return proposal
