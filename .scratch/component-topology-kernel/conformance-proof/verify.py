#!/usr/bin/env python3
"""Family-neutral conformance compiler prototype; standard library only."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "recipe-contract"
OUT = Path(__file__).resolve().parent / "artifacts"
EPSILON = 1e-12


class Rejection(Exception):
    def __init__(self, category: str, reason: str):
        self.category, self.reason = category, reason
        super().__init__(reason)


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def set_path(value: dict, path: str, replacement: object) -> None:
    parts = path.split(".")
    current: object = value
    for part in parts[:-1]:
        if "[" in part:
            key, index = part[:-1].split("[")
            current = current[key][int(index)]  # type: ignore[index]
        else:
            current = current[part]  # type: ignore[index]
    leaf = parts[-1]
    if "[" in leaf:
        key, index = leaf[:-1].split("[")
        current[key][int(index)] = replacement  # type: ignore[index]
    else:
        current[leaf] = replacement  # type: ignore[index]


def material_lambda(name: str) -> float:
    values = {"softwood": 0.12, "mineral-wool": 0.04, "galvanized-steel": 50.0,
              "gypsum": 0.25, "sheathing": 0.13}
    if name not in values:
        raise Rejection("incomplete", f"No conductivity registered for material '{name}'.")
    return values[name]


def primitive_area(kind: str, p: dict) -> float:
    # Shapes are represented by their exact cross-sectional material area.  This
    # is enough for conformance topology audits; the production worker supplies
    # the true polygons and numerical solve.
    if kind == "standard.rectangle":
        return p["width"] * p["depth"]
    if kind in {"standard.c", "standard.z"}:
        depth, flange, gauge, lip = (p[k] for k in ("depth", "flangeWidth", "gauge", "lipWidth"))
        if min(depth, flange, gauge, lip) < 0 or gauge <= 0 or depth <= 2 * gauge:
            raise Rejection("invalid", f"{kind} dimensions are impossible.")
        return gauge * (depth + 2 * flange + 2 * lip - 4 * gauge)
    if kind == "standard.hat":
        depth, top, base, gauge = (p[k] for k in ("depth", "topFlangeWidth", "baseFlangeWidth", "gauge"))
        if min(depth, top, base, gauge) <= 0 or depth <= gauge:
            raise Rejection("invalid", "standard.hat dimensions are impossible.")
        return gauge * (2 * depth + top + base - 4 * gauge)
    raise Rejection("unsupported", f"Primitive '{kind}' is not registered.")


def resolve(raw: dict) -> dict:
    recipe = raw.get("recipe", raw)
    if "fixtureBase" not in recipe:
        return copy.deepcopy(recipe)
    base = load(recipe["fixtureBase"])
    base = copy.deepcopy(base.get("recipe", base))
    for path, replacement in recipe.get("patch", {}).items():
        set_path(base, path, replacement)
    return base


def audit(recipe: dict) -> dict:
    if recipe.get("topologyModule", {}).get("id") != "repeating-parallel-profile-wall-2d":
        raise Rejection("unsupported", "Only the registered repeating 2-D topology module is admissible.")
    pitch = recipe.get("periodicity", {}).get("value")
    if not isinstance(pitch, (int, float)) or pitch <= 0:
        raise Rejection("invalid", "Positive periodicity is required.")
    rows = recipe.get("rows", [])
    if not 1 <= len(rows) <= 2:
        raise Rejection("unsupported", "The 2-D module supports one or two parallel rows.")
    depth = sum(layer.get("thickness", {}).get("value") or 0 for layer in recipe.get("layers", []))
    if depth <= 0:
        raise Rejection("incomplete", "A positive host-layer depth is required.")
    steel_or_wood_area = 0.0
    conductance_area = 0.0
    seen = []
    for row in rows:
        member = row.get("member", {})
        primitive = member.get("primitive", {})
        kind, parameters = primitive.get("kind"), primitive.get("parameters", {})
        if row.get("orientation") not in (None, "parallel-to-section") or member.get("orientation") not in (None, "parallel-to-section"):
            raise Rejection("unsupported", "Crossed framing is not representable by this 2-D module.")
        origin = row.get("originY", {}).get("value")
        offset = row.get("offsetX", {}).get("value")
        if origin is None or offset is None:
            raise Rejection("incomplete", "Each row needs originY and offsetX.")
        member_depth = parameters.get("depth")
        if member_depth is None:
            raise Rejection("incomplete", "Member depth is missing and cannot be compiled.")
        if origin < 0 or origin + member_depth > depth + EPSILON:
            raise Rejection("invalid", "A component lies outside its host layers.")
        area = primitive_area(kind, parameters)
        if area >= pitch * depth:
            raise Rejection("invalid", "A member cannot consume the entire representative cell.")
        # Same-depth rows overlap only when their phase is identical.  This
        # conservative rule catches unmodelled interpenetration before solve.
        for other_origin, other_depth, other_offset in seen:
            if max(origin, other_origin) < min(origin + member_depth, other_origin + other_depth) - EPSILON and abs((offset - other_offset) % pitch) < EPSILON:
                raise Rejection("invalid", "Rows overlap in the representative cell.")
        seen.append((origin, member_depth, offset))
        steel_or_wood_area += area
        conductance_area += area * material_lambda(member.get("material", {}).get("value"))
    cell_area = pitch * depth
    filler_area = cell_area - steel_or_wood_area
    if filler_area <= EPSILON:
        raise Rejection("invalid", "No non-overlapping cavity/host region remains.")
    filler_lambda = material_lambda(recipe["layers"][0]["material"]["value"])
    conductance_area += filler_area * filler_lambda
    # Deterministic parallel-path proxy.  It is deliberately labelled proxy;
    # it verifies compiler conservation, not physical/numerical validation.
    u_value = conductance_area / cell_area / depth
    return {"pitchM": pitch, "hostDepthM": depth, "cellAreaM2": cell_area,
            "memberAreaM2": steel_or_wood_area, "fillerAreaM2": filler_area,
            "areaResidualM2": cell_area - steel_or_wood_area - filler_area,
            "interfaces": len(rows) * 2, "periodicPairs": 1,
            "uValueProxyWm2K": u_value,
            "meshConvergence": "not-proven-by-compiler-proxy",
            "heatBalance": "not-proven-by-compiler-proxy"}


def run_case(name: str) -> dict:
    raw = load(name)
    expected = raw.get("expect")
    started = time.perf_counter()
    try:
        result = audit(resolve(raw))
        if expected:
            raise AssertionError(f"Expected {expected['category']} rejection, but compiled.")
        return {"case": name, "outcome": "accepted", "runtimeMs": round((time.perf_counter()-started)*1000, 3), "audit": result}
    except Rejection as error:
        if not expected or error.category != expected["category"]:
            raise AssertionError(f"{name}: {error.category}: {error.reason}") from error
        outcome = "blocked" if error.category == "incomplete" else "rejected"
        if expected.get("outcome") != outcome:
            raise AssertionError(f"{name}: expected {expected['outcome']} but got {outcome}")
        return {"case": name, "outcome": outcome, "runtimeMs": round((time.perf_counter()-started)*1000, 3), "category": error.category, "reason": error.reason}


def main() -> int:
    accepted = ["valid-timber-framing.json", "valid-single-c-row.json", "valid-aligned-c-rows.json", "valid-staggered-c-rows.json", "valid-z-profile-regression.json"]
    rejected = ["invalid-crossed-framing.json", "invalid-missing-critical-input.json", "invalid-unknown-primitive.json"]
    cases = [run_case(name) for name in accepted + rejected]
    canonical = json.dumps(cases, sort_keys=True, separators=(",", ":"))
    summary = {"schemaVersion": "conformance-proof/v1", "compiler": "family-neutral-proxy/v1",
               "decision": "not-proven", "reason": "The accepted compiler audits topology only; the prerequisite worker does not solve every registered primitive or emit L2 numerical artifacts.",
               "cases": cases, "canonicalCasesSha256": hashlib.sha256(canonical.encode()).hexdigest()}
    OUT.mkdir(exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": summary["decision"], "cases": len(cases), "summary": str(OUT / "summary.json")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())


