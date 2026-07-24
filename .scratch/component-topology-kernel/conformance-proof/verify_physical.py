#!/usr/bin/env python3
"""Compile and physically verify every Ticket 04 conformance recipe."""
from __future__ import annotations

import hashlib
import json
import platform
import shutil
import sys
import time
from pathlib import Path

import ngsolve
import shapely
from shapely.geometry import MultiPolygon, box

from compiler import CompileFailure, compile_recipe, load_recipe_fixture
from numerical_solver import MATERIAL_PACK, MATERIAL_PACK_PATH, solve_refinement
from primitive_plugins import (
    PrimitiveGeometry,
    PrimitivePlugin,
    create_standard_primitive_registry,
)


ROOT = Path(__file__).resolve().parent
CONTRACT_FIXTURES = ROOT.parent / "recipe-contract"
LOCAL_FIXTURES = ROOT / "fixtures"
ARTIFACTS = ROOT / "artifacts" / "physical-conformance"
EXPECTED_RESULTS = ROOT / "expected-stable-results.json"
# The pilot uses a fourth level because the first timber sequence is
# non-monotone; Ticket 03 requires an extra refinement in that situation.
MESH_SIZES_M = (0.02, 0.01, 0.005, 0.0025)
THRESHOLDS = {
    "mesh_relative_change": 0.005,
    "solver_residual": 1e-8,
    "hot_cold_balance": 0.005,
    "periodic_balance": 0.001,
    "repeat_cell_stability": 0.005,
}
BOUNDARY_CONDITIONS = {
    "exteriorTemperatureC": 0.0,
    "interiorTemperatureC": 20.0,
    "surfaceResistanceModel": "none-dirichlet-benchmark",
    "orientation": "exterior-to-interior",
}
VALIDATION_PACK = {
    "packId": "ticket-04-numerical-generality",
    "version": "1.0.0",
    "meshSizesM": list(MESH_SIZES_M),
    "thresholds": THRESHOLDS,
    "boundaryConditions": BOUNDARY_CONDITIONS,
    "requiredRecipeBoundaryProfiles": {
        "exterior": "external-wall",
        "interior": "internal",
        "left": "periodic",
        "right": "periodic",
    },
}
ACCEPTED_CASES = {
    "timber": "valid-timber-framing.json",
    "single-c": "valid-single-c-row.json",
    "aligned-c": "valid-aligned-c-rows.json",
    "staggered-c": "valid-staggered-c-rows.json",
    "z-regression": "valid-z-profile-regression.json",
}
REJECTED_CASES = {
    "crossed-framing": CONTRACT_FIXTURES / "invalid-crossed-framing.json",
    "point-fixing": LOCAL_FIXTURES / "invalid-point-fixing.json",
    "unknown-primitive": CONTRACT_FIXTURES / "invalid-unknown-primitive.json",
    "out-of-host": LOCAL_FIXTURES / "invalid-out-of-host.json",
    "disconnected-member": LOCAL_FIXTURES / "invalid-disconnected-member.json",
    "missing-critical-input": CONTRACT_FIXTURES / "invalid-missing-critical-input.json",
}


def canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: object) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def file_sha256(path: Path) -> str:
    data = path.read_bytes()
    try:
        data = data.decode("utf-8").replace("\r\n", "\n").encode("utf-8")
    except UnicodeDecodeError:
        pass
    return hashlib.sha256(data).hexdigest()


def runtime_manifest() -> dict:
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "shapely": shapely.__version__,
        "ngsolve": ngsolve.__version__,
    }


def source_manifest(registry) -> dict:
    source_files = (
        ROOT / "compiler.py",
        ROOT / "primitive_plugins.py",
        ROOT / "numerical_solver.py",
        ROOT / "verify_physical.py",
        ROOT.parent / "worker-spike" / "numerical_utils.py",
        ROOT.parent / "worker-spike" / "requirements.txt",
        ROOT.parent / "recipe-contract" / "recipe.schema.json",
        MATERIAL_PACK_PATH,
    )
    return {
        "schemaVersion": "conformance-source-manifest/v1",
        "files": {
            str(path.relative_to(ROOT.parents[2])).replace("\\", "/"): file_sha256(path)
            for path in source_files
        },
        "primitiveRegistry": registry.manifest,
        "materialPack": {
            "packId": MATERIAL_PACK["packId"],
            "version": MATERIAL_PACK["version"],
            "conductivityUnit": MATERIAL_PACK["conductivityUnit"],
            "sha256": file_sha256(MATERIAL_PACK_PATH),
        },
        "validationPack": VALIDATION_PACK,
        "runtime": runtime_manifest(),
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def flux_metrics(refinement: dict) -> dict:
    recovered = refinement["fluxes_w_per_m"]["hdiv_recovered_outward"]
    reactions = refinement["fluxes_w_per_m"]["dirichlet_reaction"]
    hot = reactions["interior"]
    cold = -reactions["exterior"]
    through = max(abs(hot), abs(cold), 1e-12)
    return {
        "hot_in_w_per_m": hot,
        "cold_out_w_per_m": cold,
        "periodic_net_out_w_per_m": recovered["periodic-left"]
        + recovered["periodic-right"],
        "hot_cold_relative_imbalance": abs(hot - cold) / through,
        "periodic_relative_imbalance": abs(
            recovered["periodic-left"] + recovered["periodic-right"]
        )
        / through,
    }


def run_accepted(case_id: str, fixture_name: str, registry, manifest: dict) -> dict:
    folder = ARTIFACTS / case_id
    recipe = load_recipe_fixture(CONTRACT_FIXTURES / fixture_name, CONTRACT_FIXTURES)
    single = compile_recipe(recipe, registry, repeats=1)
    double = compile_recipe(recipe, registry, repeats=2)
    required_profiles = VALIDATION_PACK["requiredRecipeBoundaryProfiles"]
    if single.boundary_profiles != required_profiles or double.boundary_profiles != required_profiles:
        raise AssertionError(
            f"{case_id}: recipe boundary profiles are not bound by this validation pack"
        )
    recipe_json = recipe
    single_json = single.canonical_json()
    double_json = double.canonical_json()
    write_json(folder / "request.json", recipe_json)
    write_json(folder / "canonical-single-cell.json", single_json)
    write_json(folder / "canonical-double-cell.json", double_json)
    write_json(folder / "manifest.json", manifest)

    refinements = []
    previous_u = None
    for mesh_size in MESH_SIZES_M:
        started = time.perf_counter()
        refinement = solve_refinement(
            single,
            mesh_size,
            BOUNDARY_CONDITIONS["exteriorTemperatureC"],
            BOUNDARY_CONDITIONS["interiorTemperatureC"],
        )
        refinement["runtime_s"] = time.perf_counter() - started
        refinement["relative_change"] = (
            None if previous_u is None else abs(refinement["u_value_w_m2k"] - previous_u) / abs(previous_u)
        )
        refinement["evidence_gates"] = flux_metrics(refinement)
        refinements.append(refinement)
        previous_u = refinement["u_value_w_m2k"]

    started = time.perf_counter()
    double_refinement = solve_refinement(
        double,
        MESH_SIZES_M[-1],
        BOUNDARY_CONDITIONS["exteriorTemperatureC"],
        BOUNDARY_CONDITIONS["interiorTemperatureC"],
    )
    double_refinement["runtime_s"] = time.perf_counter() - started
    double_refinement["evidence_gates"] = flux_metrics(double_refinement)
    final = refinements[-1]
    final_flux = final["evidence_gates"]
    repeat_difference = abs(
        final["u_value_w_m2k"] - double_refinement["u_value_w_m2k"]
    ) / abs(final["u_value_w_m2k"])
    gates = {
        "topology_audit": all(
            single.topology_audit[key] <= 1e-11
            for key in ("gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2")
        )
        and single.topology_audit["sliver_count"] == 0,
        "mesh_convergence": final["relative_change"] <= THRESHOLDS["mesh_relative_change"],
        "solver_residual": final["free_dof_solver_residual"] <= THRESHOLDS["solver_residual"],
        "hot_cold_balance": final_flux["hot_cold_relative_imbalance"]
        <= THRESHOLDS["hot_cold_balance"],
        "periodic_balance": final_flux["periodic_relative_imbalance"]
        <= THRESHOLDS["periodic_balance"],
        "repeat_cell_stability": repeat_difference <= THRESHOLDS["repeat_cell_stability"],
    }
    stable_result = {
        "caseId": case_id,
        "status": "passed" if all(gates.values()) else "failed",
        "topologyAudit": single.topology_audit,
        "refinements": [
            {key: value for key, value in refinement.items() if key != "runtime_s"}
            for refinement in refinements
        ],
        "doubleCell": {
            key: value for key, value in double_refinement.items() if key != "runtime_s"
        },
        "oneTwoCellRelativeDifference": repeat_difference,
        "gates": gates,
        "sourceManifest": manifest,
        "hashes": {
            "recipeSha256": sha256(recipe_json),
            "singleCellSha256": sha256(single_json),
            "doubleCellSha256": sha256(double_json),
            "registrySha256": sha256(registry.manifest),
            "materialPackSha256": file_sha256(MATERIAL_PACK_PATH),
            "validationPackSha256": sha256(VALIDATION_PACK),
            "sourceManifestSha256": sha256(manifest),
        },
    }
    stable_result["hashes"]["stableResultSha256"] = sha256(stable_result)
    result = {
        **stable_result,
        "runtimeEvidence": {
            "singleCellRefinementSeconds": [run["runtime_s"] for run in refinements],
            "doubleCellSeconds": double_refinement["runtime_s"],
        },
    }
    write_json(folder / "result.json", result)
    if result["status"] != "passed":
        failed = [name for name, passed in gates.items() if not passed]
        raise AssertionError(f"{case_id} failed evidence gates: {failed}")
    return result


def run_rejected(case_id: str, fixture_path: Path, registry) -> dict:
    raw = json.loads(fixture_path.read_text(encoding="utf-8"))
    expected = raw["expect"]
    recipe = load_recipe_fixture(fixture_path, CONTRACT_FIXTURES)
    try:
        compile_recipe(recipe, registry)
    except CompileFailure as error:
        outcome = "blocked" if error.category == "incomplete" else "rejected"
        if (
            error.category != expected["category"]
            or outcome != expected["outcome"]
            or error.reason != expected["reason"]
        ):
            raise AssertionError(
                f"{case_id}: expected {expected}, got "
                f"{error.category}/{outcome}/{error.reason}"
            ) from error
        result = {
            "caseId": case_id,
            "status": outcome,
            "category": error.category,
            "reason": error.reason,
            "recipeSha256": sha256(recipe),
        }
        write_json(ARTIFACTS / case_id / "rejection.json", result)
        return result
    raise AssertionError(f"{case_id}: unsupported recipe compiled successfully")


def compile_disconnected_fixture(parameters: dict) -> PrimitiveGeometry:
    left = box(0, 0, parameters["depth"] / 3, parameters["width"])
    right = box(
        2 * parameters["depth"] / 3,
        0,
        parameters["depth"],
        parameters["width"],
    )
    polygon = MultiPolygon((left, right))
    return PrimitiveGeometry(polygon, polygon.boundary, "perfect-contact")


def disconnected_fixture_registry(standard_registry):
    plugin = PrimitivePlugin(
        "fixture.disconnected",
        "1.0.0",
        ("width", "depth"),
        {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
        compile_disconnected_fixture,
    )
    return standard_registry.registered_with(plugin, "disconnected-rejection-fixture/v1")


def main() -> int:
    if ARTIFACTS.exists():
        shutil.rmtree(ARTIFACTS)
    registry = create_standard_primitive_registry()
    manifest = source_manifest(registry)
    accepted = [
        run_accepted(case_id, fixture_name, registry, manifest)
        for case_id, fixture_name in ACCEPTED_CASES.items()
    ]
    rejected = [
        run_rejected(
            case_id,
            fixture_path,
            disconnected_fixture_registry(registry)
            if case_id == "disconnected-member"
            else registry,
        )
        for case_id, fixture_path in REJECTED_CASES.items()
    ]
    requirements = (ROOT.parent / "worker-spike" / "requirements.txt").read_text(encoding="utf-8")
    actual_expected_results = {
        "environmentScope": {
            "pythonImplementation": platform.python_implementation(),
            "pythonVersion": platform.python_version(),
            "platform": platform.platform(),
        },
        "sourceManifestSha256": sha256(manifest),
        "acceptedStableResultSha256": {
            result["caseId"]: result["hashes"]["stableResultSha256"] for result in accepted
        },
        "rejectedDiagnostics": {
            result["caseId"]: {
                "status": result["status"],
                "category": result["category"],
                "reason": result["reason"],
            }
            for result in rejected
        },
    }
    if not EXPECTED_RESULTS.exists():
        raise AssertionError(
            "Missing frozen expected results. Review and add this manifest:\n"
            + json.dumps(actual_expected_results, indent=2, sort_keys=True)
        )
    expected_results = json.loads(EXPECTED_RESULTS.read_text(encoding="utf-8"))
    if actual_expected_results != expected_results:
        raise AssertionError(
            "Stable conformance results differ from the frozen manifest.\nExpected:\n"
            + json.dumps(expected_results, indent=2, sort_keys=True)
            + "\nActual:\n"
            + json.dumps(actual_expected_results, indent=2, sort_keys=True)
        )
    summary = {
        "schemaVersion": "physical-conformance-proof/v1",
        "decision": "proven-with-contract-changes",
        "acceptedCases": [
            {
                "caseId": result["caseId"],
                "status": result["status"],
                "uValueWm2K": result["refinements"][-1]["u_value_w_m2k"],
                "stableResultSha256": result["hashes"]["stableResultSha256"],
            }
            for result in accepted
        ],
        "rejectedCases": rejected,
        "thresholds": THRESHOLDS,
        "environment": {
            **runtime_manifest(),
            "requirementsSha256": hashlib.sha256(requirements.encode("utf-8")).hexdigest(),
        },
        "sourceManifestSha256": sha256(manifest),
        "expectedResultsSha256": file_sha256(EXPECTED_RESULTS),
    }
    write_json(ARTIFACTS / "summary.json", summary)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
