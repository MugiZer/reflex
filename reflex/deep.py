"""Ticket 09: gated deep-GPU escalation ladder on synthetic evidence.

Ladder (each level gated; INFERRED/OBSERVED only, never VERIFIED):
  A: PC/stall-to-source attribution — differential healthy-vs-fault stall
     histograms per suspect kernel + duration excess, ranked to source
     regions in CUPTI/HPCToolkit vocabulary (function + pc_offset + SASS;
     source_file/line stay None until silicon lineinfo maps them).
  B: tensor/operator lift — faulty-vs-healthy l3_lineage diff; recovers the
     responsible *earlier* tensor transformation, not the final kernel.
  C: producer/dependency slice — reconstruct graph neighborhood of the
     suspect center, for residual ambiguity only.

Entry gate consumes a localized suspect kernel set in reconstruct's
vocabulary (correlation_ids, "gpu:<cid>" node ids, or an extract_suspect
dict). Gate refusal raises GateRefusal; insufficient evidence returns an
abstain result with a mapping fallback (never a stronger claim). Every
conclusion carries synthetic=True: fake-GPU-derived, NOT silicon-actionable.
Stdlib only.
"""
from __future__ import annotations

from .reconstruct import build_graph, extract_suspect

OBSERVED, INFERRED = "OBSERVED", "INFERRED"

# ponytail: fixed suspect bound (3 covers localized kernels); raise only when
# real triage localizes wider. Fixed stall weight (1000 ns/sample) ranking
# only; fit from silicon when durations and stalls need joint calibration —
# until then stall-count noise can outrank small duration excess.
MAX_SUSPECT = 3
DEFAULT_MAX_SAMPLES = 100_000
STALL_NS_PER_SAMPLE = 1000


class GateRefusal(ValueError):
    """A level's entry gate does not hold; the level must not run."""


def _index(bundle: dict, key: str) -> dict:
    return {r["correlation_id"]: r for r in bundle.get(key, [])}


def _kern(bundle: dict) -> dict:
    return _index(bundle, "gpu_kernel")


def _pc(bundle: dict) -> dict:
    return _index(bundle, "l3_pc")


def _lin(bundle: dict) -> dict:
    return _index(bundle, "l3_lineage")


def normalize_suspect(suspect) -> list[str]:
    """Accept reconstruct-vocabulary suspect sets: correlation_ids,
    "gpu:<cid>" node ids, or an extract_suspect dict (uses its center)."""
    if isinstance(suspect, str):
        suspect = [suspect]
    elif isinstance(suspect, dict):
        if "center" in suspect:
            suspect = [suspect["center"]]
        else:
            for key in ("kernel_cids", "cids"):
                if key in suspect:
                    suspect = suspect[key]
                    break
            else:
                raise GateRefusal("suspect dict needs 'center' or 'kernel_cids'")
    cids = [c.split("gpu:", 1)[1] if isinstance(c, str) and c.startswith("gpu:") else c
            for c in suspect]
    if any(not isinstance(c, str) or not c for c in cids):
        raise GateRefusal("suspect set must be correlation_ids in reconstruct vocabulary")
    return list(dict.fromkeys(cids))


def _max_samples(budget) -> int:
    if budget is None:
        return DEFAULT_MAX_SAMPLES
    if isinstance(budget, (int, float)):
        return int(budget)
    return int(budget.get("max_samples", DEFAULT_MAX_SAMPLES))


def _require_suspect_size(cids: list[str]) -> list[str]:
    if not 1 <= len(cids) <= MAX_SUSPECT:
        raise GateRefusal(f"suspect set must be 1..{MAX_SUSPECT} kernels, got {len(cids)}")
    return cids


def check_entry(faulty: dict, healthy: dict, suspect, budget=None) -> list[str]:
    """Shared entry gate: bounded suspect set, reconstruct vocabulary,
    reproducible matched pair, overhead budget, unresolved intra-kernel
    hypotheses. Returns normalized cids or raises GateRefusal."""
    cids = normalize_suspect(suspect)
    # ponytail: fixed bound, not a cost model; model per-level probe cost when
    # real profilers bill non-uniformly.
    cids = _require_suspect_size(cids)
    fk, hk = _kern(faulty), _kern(healthy)
    if unknown := [c for c in cids if c not in fk]:
        raise GateRefusal(f"suspect outside reconstruct vocabulary: {unknown}")
    if faulty.get("seed") is not None and faulty.get("seed") != healthy.get("seed"):
        raise GateRefusal("healthy/faulty seeds differ: execution not reproducible")
    if [c for c in cids if c not in hk]:
        raise GateRefusal("suspect missing from healthy bundle: need a matched pair")
    fp = _pc(faulty)
    cost = sum(int(fp[c].get("n_samples", 0)) for c in cids if c in fp)
    if cost > _max_samples(budget):
        raise GateRefusal(f"PC-sampling overhead {cost} exceeds budget {_max_samples(budget)}")
    dur = [fk[c]["dur_ns"] - hk[c]["dur_ns"] for c in cids]
    hp = _pc(healthy)
    stall = [sum(fp[c].get("stall_hist", {}).get(k, 0) - hp[c].get("stall_hist", {}).get(k, 0)
                 for k in set(fp[c].get("stall_hist", {})) | set(hp[c].get("stall_hist", {})))
             for c in cids if c in fp and c in hp]
    if max(dur + [0]) <= 0 and max(stall + [0]) <= 0:
        raise GateRefusal("no unresolved intra-kernel hypothesis (no kernel dur/stall excess)")
    return cids


def fallback_note(kind: str) -> dict:
    """HPCToolkit-style mapping note / SASS stub + abstention. The only
    honest output when sampling is unavailable or insufficient."""
    return {"mapping_note":
            "HPCToolkit-style pc->source mapping unavailable on synthetic stubs: "
            "on silicon map function+pc_offset via cubin lineinfo (nvdisasm/cuobjdump); "
            "operator lineage needs profiler aten mapping, not stub tags.",
            "sass_stub": "HMMA.1688 (synthetic stub row: vocabulary only, not silicon SASS)",
            "claim": "abstain", "kind": kind, "synthetic": True}


def level_a(faulty: dict, healthy: dict, suspect, budget=None) -> dict:
    """Differential stall histograms + duration excess -> ranked source regions.
    Stall class alone never suffices: sufficient_for_validation requires a
    discriminating per-region winner with pc/source mapping."""
    cids = check_entry(faulty, healthy, suspect, budget)
    fk, hk, fp, hp = _kern(faulty), _kern(healthy), _pc(faulty), _pc(healthy)
    regions, class_totals = [], {}
    for c in cids:
        f, h = fp.get(c), hp.get(c)
        dur_excess = fk[c]["dur_ns"] - hk[c]["dur_ns"]
        if f is None or h is None:
            regions.append({"correlation_id": c, "function": fk[c]["kernel_name"],
                            "pc_offset": None, "sass": None, "source_region": None,
                            "source_file": None, "line": None,
                            "dur_excess_ns": dur_excess, "stall_delta": {},
                            "total_stall_delta": 0, "pc_missing": True,
                            "score": float(dur_excess), "synthetic": True})
            continue
        delta = {k: f.get("stall_hist", {}).get(k, 0) - h.get("stall_hist", {}).get(k, 0)
                 for k in set(f.get("stall_hist", {})) | set(h.get("stall_hist", {}))}
        for k, v in delta.items():
            class_totals[k] = class_totals.get(k, 0) + v
        tot = sum(delta.values())
        pc = f.get("pc_offset", 0)
        regions.append({"correlation_id": c, "function": f.get("func", fk[c]["kernel_name"]),
                        "pc_offset": pc, "sass": f.get("sass"),
                        "source_region": f"{f.get('func', '')}@0x{pc:x} [{f.get('sass', '')}]",
                        "source_file": None, "line": None,  # silicon cubin lineinfo maps these
                        "dur_excess_ns": dur_excess, "stall_delta": delta,
                        "total_stall_delta": tot, "pc_missing": False,
                        "score": float(dur_excess + STALL_NS_PER_SAMPLE * tot),
                        "synthetic": True})
    regions.sort(key=lambda r: r["score"], reverse=True)
    if all(r["pc_missing"] for r in regions):
        fb = fallback_note("l3_pc")
        return {"level_a": True, "evidence_level": OBSERVED, "synthetic": True,
                "regions": [], "stall_class": None, "discriminates": False,
                "sufficient_for_validation": False, "probes_used": 0, "fallback": fb,
                "note": "synthetic-derived abstention: no usable l3_pc sampling; " + fb["mapping_note"]}
    scores = [r["score"] for r in regions]
    top = regions[0]
    discriminates = top["score"] > 0 and (len(regions) == 1 or scores[0] > scores[1])
    sufficient = bool(discriminates and not top["pc_missing"])
    return {"level_a": True, "evidence_level": INFERRED, "synthetic": True,
            "regions": regions,
            "stall_class": max(class_totals, key=lambda k: (class_totals[k], k)) if class_totals else None,
            "discriminates": discriminates, "sufficient_for_validation": sufficient,
            "probes_used": sum(int(fp[c].get("n_samples", 0)) for c in cids if c in fp),
            "note": "synthetic-derived ranking, NOT silicon-actionable"}


def level_b(faulty: dict, healthy: dict, suspect, a_result: dict, budget=None) -> dict:
    """Faulty-vs-healthy lineage diff; recovers the responsible *earlier*
    tensor transformation, not the final kernel. Abstains with the mapping
    fallback when lineage is stripped or indistinguishable."""
    if not isinstance(a_result, dict) or not a_result.get("level_a"):
        raise GateRefusal("level B requires a completed level A result (ladder order A->B->C)")
    cids = check_entry(faulty, healthy, suspect, budget)
    fl, hl = _lin(faulty), _lin(healthy)
    if any(c not in fl for c in cids):
        fb = fallback_note("l3_lineage")
        return {"level_b": True, "evidence_level": OBSERVED, "synthetic": True,
                "recovers_transform": False, "responsible_cid": None,
                "tensor_transformation": None, "claim": "abstain", "fallback": fb,
                "note": "synthetic-derived abstention: lineage stripped for suspect kernels; " + fb["mapping_note"]}
    order = [r["correlation_id"] for r in faulty.get("l3_lineage", [])]
    diffs = [c for c in order if c in hl and c in fl and
             {k: fl[c].get(k) for k in ("aten_op", "shapes", "dtype", "module_stack")} !=
             {k: hl[c].get(k) for k in ("aten_op", "shapes", "dtype", "module_stack")}]
    if not diffs:
        fb = fallback_note("l3_lineage")
        return {"level_b": True, "evidence_level": OBSERVED, "synthetic": True,
                "recovers_transform": False, "responsible_cid": None,
                "tensor_transformation": None, "claim": "abstain", "fallback": fb,
                "note": "synthetic-derived abstention: lineage indistinguishable; " + fb["mapping_note"]}
    first = diffs[0]  # earliest lineage diff; incidental early diffs can misattribute —
    # upgrade to producer-edge linkage when lineage carries it (real layout preset first).
    t = fl[first]
    return {"level_b": True, "evidence_level": INFERRED, "synthetic": True,
            "recovers_transform": True, "responsible_cid": first,
            "tensor_transformation": {"aten_op": t.get("aten_op"), "shapes": t.get("shapes"),
                                      "dtype": t.get("dtype"), "module_stack": t.get("module_stack"),
                                      "origin_tag": t.get("origin_tag")},
            "final_kernel_cids": cids,
            "note": "synthetic-derived upstream transform, NOT silicon-actionable"}


def level_c(faulty: dict, suspect, b_result: dict, radius: int = 2) -> dict:
    """Producer/dependency slice around the suspect center for residual
    ambiguity. Pure reconstruct read: dependency neighborhood + upstream
    producer chain in start_ns order."""
    # ponytail: fixed radius=2; widen only when residual ambiguity demonstrably lives farther out.
    if not isinstance(b_result, dict) or not b_result.get("level_b"):
        raise GateRefusal("level C requires a completed level B result (ladder order A->B->C)")
    cids = normalize_suspect(suspect)
    cids = _require_suspect_size(cids)
    center = f"gpu:{cids[0]}"
    graph = build_graph(faulty)
    if center not in graph["nodes"]:
        raise GateRefusal(f"center {center} outside reconstruct vocabulary")
    sub = extract_suspect(graph, center, radius=radius)
    kmap = _kern(faulty)
    t0 = kmap[cids[0]]["start_ns"]
    chain = sorted(
        ({"correlation_id": n.split("gpu:", 1)[1], "kernel_name": kmap[n.split('gpu:', 1)[1]]["kernel_name"],
          "stream_id": kmap[n.split("gpu:", 1)[1]]["stream_id"]}
         for n in sub["nodes"] if n.startswith("gpu:") and n != center
         and n.split("gpu:", 1)[1] in kmap and kmap[n.split("gpu:", 1)[1]]["start_ns"] < t0),
        key=lambda r: kmap[r["correlation_id"]]["start_ns"])
    return {"level_c": True, "evidence_level": OBSERVED, "synthetic": True,
            "center": center, "producer_chain": chain,
            "slice_nodes": len(sub["nodes"]), "slice_edges": len(sub["edges"]),
            "note": "synthetic-derived dependency slice, NOT silicon-actionable"}


def compiler_probe(suspect, a_result=None, enable_compiler_probe: bool = False) -> dict:
    """Deferred compiler-probe rescue. Disabled by default; even when opted
    in it reports INFERRED at most — a probe suggestion, never validation."""
    if not enable_compiler_probe:
        raise GateRefusal("compiler-probe rescue is disabled by default; "
                          "pass enable_compiler_probe=True to opt in")
    return {"compiler_probe": True, "evidence_level": INFERRED, "synthetic": True,
            "suggestion": "synthetic-only probe stub (e.g. ptxas arch/launch-bound "
                          "sweep); validates nothing on silicon",
            "suspect": normalize_suspect(suspect)}


def run_ladder(faulty: dict, healthy: dict, suspect, budget=None,
               enable_compiler_probe: bool = False) -> dict:
    """Gated A->B->C run; stops the moment evidence suffices for validation.
    The compiler probe is never on the default path."""
    a = level_a(faulty, healthy, suspect, budget)
    if a.get("sufficient_for_validation"):
        return {"stop_level": "A", "level_a": a, "synthetic": True}
    b = level_b(faulty, healthy, suspect, a, budget)
    if b.get("recovers_transform"):
        return {"stop_level": "B", "level_a": a, "level_b": b, "synthetic": True}
    c = level_c(faulty, suspect, b)
    return {"stop_level": "C", "level_a": a, "level_b": b, "level_c": c, "synthetic": True}
