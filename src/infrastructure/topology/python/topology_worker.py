#!/usr/bin/env python3
"""Production JSONL entrypoint for the proven 2-D topology stack.

TypeScript owns process lifecycle and immutable publication. This worker owns
all registry resolution, geometry compilation, Boolean audit, meshing, solving,
and numerical/reproducibility evidence.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import tempfile
import time
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parent
KERNEL_ROOT = PACKAGE_ROOT / "kernel"
REQUIREMENTS_PATH = PACKAGE_ROOT / "requirements.lock.txt"
if str(KERNEL_ROOT) not in sys.path:
    sys.path.insert(0, str(KERNEL_ROOT))

import ngsolve  # noqa: E402
import shapely  # noqa: E402
from compiler import CompileFailure, compile_recipe  # noqa: E402
from numerical_solver import MATERIAL_PACK_PATH, NumericalFailure, solve_refinement  # noqa: E402
from primitive_plugins import (  # noqa: E402
    PrimitivePlugin,
    compile_rectangle,
    create_standard_primitive_registry,
)


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
MATERIAL_PACK_SHA256 = "0063b56fe7238789d666682944abfd2f8a866b700879b953bca9fe51065b4f7b"
VALIDATION_PACK_SHA256 = "2b580ba2d66e03ea06f3a0d2165bcb557fa188e40580a571ca0b26d85bce808c"
SOURCE_MANIFEST_SHA256 = "ce2329bd4ccbac71729addcd11f328ef4b35478767e3089d10bd290d772a3718"
REQUIREMENTS_SHA256 = "66325fc5d019f70bee2d37155e0e4f741472c8801d3e49d4d42e82cb17f53619"
PINNED_BUNDLE = {
    "moduleId": "repeating-parallel-profile-wall-2d",
    "moduleVersion": "1.0.0-draft",
    "registryHash": "97a73f5e277bc0971aec1d4ae62f2668447ff7cca587c5dc18f1ed51b3a21f12",
    "packHash": "ce5b0c473dc6ccca8d295ae095548271c6ba821a99681b593104bdd002500cc9",
    "runtimeHash": "b741ef6c97cec8a826ea89dc7d2c654d5b9a8b5d17eedb118d6acf4b4d8efbd6",
}


class ProtocolFailure(Exception):
    def __init__(self, outcome: str, code: str, message: str, phase: str):
        self.outcome = outcome
        self.code = code
        self.message = message
        self.phase = phase
        super().__init__(message)


def canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: object) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def registry():
    vendor_block = PrimitivePlugin(
        "vendor.block",
        "1.0.0",
        ("width", "depth"),
        {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
        compile_rectangle,
    )
    return create_standard_primitive_registry().registered_with(
        vendor_block, "production-primitives-1.0.0-draft"
    )


def verify_pinned_runtime() -> dict:
    actual_requirements_hash = hashlib.sha256(
        REQUIREMENTS_PATH.read_text(encoding="utf-8").encode("utf-8")
    ).hexdigest()
    identity = {
        "python": platform.python_version(),
        "pythonImplementation": platform.python_implementation(),
        "platform": platform.platform(),
        "shapely": shapely.__version__,
        "ngsolve": ngsolve.__version__,
        "requirementsSha256": actual_requirements_hash,
    }
    required = {
        "python": "3.12.10",
        "pythonImplementation": "CPython",
        "platform": "Windows-11-10.0.26200-SP0",
        "shapely": "2.1.2",
        "ngsolve": "6.2.2506",
        "requirementsSha256": REQUIREMENTS_SHA256,
    }
    if identity != required:
        raise ProtocolFailure(
            "rejected",
            "incompatible_runtime_identity",
            "The Python topology runtime does not match the pinned release identity.",
            "runtime-validation",
        )
    return identity


def validate_request(request: object) -> dict:
    if not isinstance(request, dict) or request.get("schema") != "topology-analysis.request.v1":
        raise ProtocolFailure(
            "rejected", "unsupported_protocol", "Unsupported topology request protocol.", "request-validation"
        )
    required_strings = (
        "requestId",
        "correlationId",
        "idempotencyKey",
        "sourceRevisionId",
        "sourceAssemblyGroupId",
        "recipeHash",
        "artifactDestination",
    )
    if any(not isinstance(request.get(name), str) or not request[name] for name in required_strings):
        raise ProtocolFailure(
            "rejected", "invalid_request", "Topology request identities are incomplete.", "request-validation"
        )
    if request.get("bundle") != PINNED_BUNDLE:
        raise ProtocolFailure(
            "rejected",
            "incompatible_bundle_identity",
            "Topology module, registry, pack, or runtime identity is incompatible.",
            "bundle-resolution",
        )
    recipe = request.get("recipe")
    if not isinstance(recipe, dict) or sha256(recipe) != request["recipeHash"]:
        raise ProtocolFailure(
            "rejected", "recipe_hash_mismatch", "Immutable Recipe hash does not match its payload.", "request-validation"
        )
    validate_recipe_authorities(recipe)
    return request


def validate_recipe_authorities(recipe: dict) -> None:
    allowed_recipe_fields = {
        "schemaVersion",
        "topologyModule",
        "periodicity",
        "projectedArea",
        "layers",
        "rows",
        "cavities",
        "thermalBreaks",
        "boundaries",
    }
    unknown_recipe_fields = sorted(set(recipe) - allowed_recipe_fields)
    if unknown_recipe_fields:
        raise ProtocolFailure(
            "rejected",
            "unknown_recipe_semantics",
            f"Recipe contains unknown semantics: {unknown_recipe_fields}.",
            "request-validation",
        )
    authored_values = [recipe.get("periodicity"), recipe.get("projectedArea")]
    for layer in recipe.get("layers", []):
        authored_values.extend((layer.get("thickness"), layer.get("material")))
    for row in recipe.get("rows", []):
        authored_values.extend(
            (
                row.get("offsetX"),
                row.get("originY"),
                row.get("member", {}).get("material"),
            )
        )
    boundaries = recipe.get("boundaries", {})
    authored_values.extend((boundaries.get("exterior"), boundaries.get("interior")))
    for authored in authored_values:
        if not isinstance(authored, dict) or not isinstance(authored.get("authority"), dict):
            raise ProtocolFailure(
                "rejected",
                "missing_authority",
                "A semantically used Recipe value is not authority-tagged.",
                "request-validation",
            )
        state = authored["authority"].get("state")
        if state == "conflicting":
            raise ProtocolFailure(
                "blocked",
                "conflicting_critical_input",
                authored["authority"].get("reason") or "Critical Recipe authorities conflict.",
                "request-validation",
            )
        if state == "missing":
            raise ProtocolFailure(
                "blocked",
                "missing_critical_input",
                authored["authority"].get("reason") or "A critical Recipe value is missing.",
                "request-validation",
            )
        if state not in (
            "ifc-derived",
            "user-confirmed",
            "validated-default",
            "preliminary-estimate",
        ):
            raise ProtocolFailure(
                "rejected",
                "invalid_authority",
                "A semantically used Recipe authority state is invalid.",
                "request-validation",
            )


def flux_metrics(refinement: dict) -> dict:
    recovered = refinement["fluxes_w_per_m"]["hdiv_recovered_outward"]
    reactions = refinement["fluxes_w_per_m"]["dirichlet_reaction"]
    hot = reactions["interior"]
    cold = -reactions["exterior"]
    through = max(abs(hot), abs(cold), 1e-12)
    return {
        "hot_in_w_per_m": hot,
        "cold_out_w_per_m": cold,
        "periodic_net_out_w_per_m": recovered["periodic-left"] + recovered["periodic-right"],
        "hot_cold_relative_imbalance": abs(hot - cold) / through,
        "periodic_relative_imbalance": abs(
            recovered["periodic-left"] + recovered["periodic-right"]
        )
        / through,
    }


def solve(request: dict) -> dict:
    primitive_registry = registry()
    if sha256(primitive_registry.manifest) != PINNED_BUNDLE["registryHash"]:
        raise ProtocolFailure(
            "rejected", "registry_hash_mismatch", "Resolved Primitive Registry hash is incompatible.", "bundle-resolution"
        )
    try:
        single = compile_recipe(request["recipe"], primitive_registry, repeats=1)
        double = compile_recipe(request["recipe"], primitive_registry, repeats=2)
    except CompileFailure as error:
        outcome = "blocked" if error.category in ("incomplete", "conflicting") else "rejected"
        raise ProtocolFailure(outcome, f"recipe_{error.category}", error.reason, "geometry-compilation") from error

    refinements = []
    previous_u = None
    try:
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
                None
                if previous_u is None
                else abs(refinement["u_value_w_m2k"] - previous_u) / abs(previous_u)
            )
            refinement["flux_diagnostics"] = flux_metrics(refinement)
            refinements.append(refinement)
            previous_u = refinement["u_value_w_m2k"]
        double_refinement = solve_refinement(
            double,
            MESH_SIZES_M[-1],
            BOUNDARY_CONDITIONS["exteriorTemperatureC"],
            BOUNDARY_CONDITIONS["interiorTemperatureC"],
        )
        double_refinement["flux_diagnostics"] = flux_metrics(double_refinement)
    except NumericalFailure as error:
        raise ProtocolFailure("rejected", "numerical_failure", str(error), "mesh-solve") from error

    final = refinements[-1]
    final_flux = final["flux_diagnostics"]
    repeat_difference = abs(final["u_value_w_m2k"] - double_refinement["u_value_w_m2k"]) / abs(
        final["u_value_w_m2k"]
    )
    audit = single.topology_audit
    gates = {
        "topology_audit": all(
            abs(audit[key]) <= 1e-11
            for key in ("gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2")
        )
        and audit["sliver_count"] == 0,
        "mesh_convergence": final["relative_change"] <= THRESHOLDS["mesh_relative_change"],
        "solver_residual": final["free_dof_solver_residual"] <= THRESHOLDS["solver_residual"],
        "hot_cold_balance": final_flux["hot_cold_relative_imbalance"]
        <= THRESHOLDS["hot_cold_balance"],
        "periodic_balance": final_flux["periodic_relative_imbalance"]
        <= THRESHOLDS["periodic_balance"],
        "repeat_cell_stability": repeat_difference <= THRESHOLDS["repeat_cell_stability"],
    }
    if not all(gates.values()):
        failed = sorted(name for name, passed in gates.items() if not passed)
        raise ProtocolFailure(
            "rejected",
            "numerical_evidence_gate_failed",
            f"Required numerical evidence gates failed: {failed}.",
            "evidence-validation",
        )

    canonical_geometry = single.canonical_json()
    numerical_proof = {
        "meshSizesM": list(MESH_SIZES_M),
        "thresholds": THRESHOLDS,
        "boundaryConditions": BOUNDARY_CONDITIONS,
        "refinements": refinements,
        "doubleCell": double_refinement,
        "oneTwoCellRelativeDifference": repeat_difference,
        "gates": gates,
    }
    runtime = verify_pinned_runtime()
    reproducibility_manifest = {
        "schemaVersion": "topology-reproducibility-manifest/v1",
        "request": {
            "requestId": request["requestId"],
            "recipeSha256": request["recipeHash"],
            "bundle": request["bundle"],
        },
        "module": {
            "id": PINNED_BUNDLE["moduleId"],
            "version": PINNED_BUNDLE["moduleVersion"],
        },
        "primitiveRegistry": primitive_registry.manifest,
        "primitiveRegistrySha256": sha256(primitive_registry.manifest),
        "packBundleSha256": PINNED_BUNDLE["packHash"],
        "runtimeIdentitySha256": PINNED_BUNDLE["runtimeHash"],
        "materialPackSha256": MATERIAL_PACK_SHA256,
        "validationPackSha256": VALIDATION_PACK_SHA256,
        "frozenConformanceSourceManifestSha256": SOURCE_MANIFEST_SHA256,
        "runtime": runtime,
        "sourceFiles": {
            "compiler.py": file_sha256(KERNEL_ROOT / "compiler.py"),
            "primitive_plugins.py": file_sha256(KERNEL_ROOT / "primitive_plugins.py"),
            "numerical_solver.py": file_sha256(KERNEL_ROOT / "numerical_solver.py"),
            "numerical_utils.py": file_sha256(KERNEL_ROOT / "numerical_utils.py"),
            "material-pack.json": file_sha256(MATERIAL_PACK_PATH),
            "requirements.lock.txt": file_sha256(REQUIREMENTS_PATH),
        },
    }
    return {
        "canonicalAnalysisGeometry": canonical_geometry,
        "topologyAudit": audit,
        "numericalProof": numerical_proof,
        "reproducibilityManifest": reproducibility_manifest,
        "reproducibilityManifestHash": sha256(reproducibility_manifest),
        "effectiveUValueWPerM2K": final["u_value_w_m2k"],
    }


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def publish_worker_artifacts(destination: Path, request: dict, solved: dict) -> list[dict]:
    values = {
        "canonical-analysis-geometry.json": solved["canonicalAnalysisGeometry"],
        "topology-audit.json": solved["topologyAudit"],
        "numerical-proof.json": solved["numericalProof"],
        "reproducibility-manifest.json": solved["reproducibilityManifest"],
        "primitive-registry-manifest.json": solved["reproducibilityManifest"]["primitiveRegistry"],
        "worker-request.json": request,
    }
    destination.mkdir(parents=True, exist_ok=True)
    for name, value in values.items():
        atomic_json(destination / name, value)
    return [
        {"name": name, "sha256": file_sha256(destination / name), "sizeBytes": (destination / name).stat().st_size}
        for name in sorted(values)
    ]


def response_identity(request: dict) -> dict:
    return {
        "requestId": request.get("requestId", "unknown"),
        "correlationId": request.get("correlationId", "unknown"),
        "idempotencyKey": request.get("idempotencyKey", "unknown"),
        "bundle": request.get("bundle", PINNED_BUNDLE),
    }


def main() -> int:
    request: dict = {}
    try:
        lines = [line for line in sys.stdin.read().splitlines() if line.strip()]
        if len(lines) != 1:
            raise ProtocolFailure(
                "rejected", "invalid_jsonl", "Worker requires exactly one JSONL request.", "request-validation"
            )
        parsed_request = json.loads(lines[0])
        request = parsed_request if isinstance(parsed_request, dict) else {}
        request = validate_request(request)
        verify_pinned_runtime()
        solved = solve(request)
        artifact_index = publish_worker_artifacts(Path(request["artifactDestination"]), request, solved)
        evidence = {key: value for key, value in solved.items() if key != "effectiveUValueWPerM2K"}
        evidence["artifactIndex"] = artifact_index
        response = {
            "schema": "topology-analysis.result.v1",
            **response_identity(request),
            "outcome": "preliminary-unsafe",
            "effectiveUValueWPerM2K": solved["effectiveUValueWPerM2K"],
            "evidence": evidence,
        }
        print(json.dumps(response, sort_keys=True, separators=(",", ":")), flush=True)
        return 0
    except ProtocolFailure as error:
        response = {
            "schema": "topology-analysis.error.v1",
            **response_identity(request),
            "outcome": error.outcome,
            "code": error.code,
            "message": error.message,
            "phase": error.phase,
            "retryable": False,
            "runtimeIdentity": PINNED_BUNDLE["runtimeHash"],
        }
        print(json.dumps(response, sort_keys=True, separators=(",", ":")), flush=True)
        return 2
    except Exception as error:
        response = {
            "schema": "topology-analysis.error.v1",
            **response_identity(request),
            "outcome": "failed",
            "code": "worker_internal_error",
            "message": str(error),
            "phase": "worker",
            "retryable": False,
            "runtimeIdentity": PINNED_BUNDLE["runtimeHash"],
        }
        print(json.dumps(response, sort_keys=True, separators=(",", ":")), flush=True)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
