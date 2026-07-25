"""Netgen/NGSolve adapter for canonical analysis geometry.

The finite-element and flux diagnostics are the Ticket 01 implementation. This
adapter replaces its family-specific geometry construction with canonical
material regions.
"""
from __future__ import annotations

import os
import json
import sys
from pathlib import Path

from shapely import orient_polygons
from shapely.geometry import Point

from compiler import CanonicalAnalysisGeometry


ROOT = Path(__file__).resolve().parent
from numerical_utils import free_dof_residual, hdiv_fluxes, reaction_flux, skeleton_flux


BOUNDARIES = ("exterior", "interior", "periodic-left", "periodic-right")
MATERIAL_PACK_PATH = ROOT / "material-pack.json"
MATERIAL_PACK = json.loads(MATERIAL_PACK_PATH.read_text(encoding="utf-8"))
CONDUCTIVITY_W_MK = {
    material_id: definition["conductivity"]
    for material_id, definition in MATERIAL_PACK["materials"].items()
}


class NumericalFailure(RuntimeError):
    pass


def _configure_windows_dlls() -> None:
    if os.name != "nt":
        return
    site_packages = next(Path(path) for path in sys.path if path.endswith("site-packages"))
    virtual_environment = site_packages.parent.parent
    os.add_dll_directory(str(site_packages / "netgen"))
    os.add_dll_directory(str(virtual_environment / "Library" / "bin"))


def _polygon_components(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    raise NumericalFailure(f"Unsupported canonical region geometry: {geometry.geom_type}.")


def _segment_key(start: tuple[float, float], end: tuple[float, float]):
    rounded_start = tuple(round(value, 12) for value in start)
    rounded_end = tuple(round(value, 12) for value in end)
    return tuple(sorted((rounded_start, rounded_end)))


def _canonical_segments(model: CanonicalAnalysisGeometry):
    segments = {}
    for domain, region in enumerate(model.material_regions, start=1):
        geometry = orient_polygons(region.polygon, exterior_cw=False)
        for polygon in _polygon_components(geometry):
            rings = [polygon.exterior, *polygon.interiors]
            for ring in rings:
                coordinates = list(ring.coords)
                for start, end in zip(coordinates, coordinates[1:]):
                    key = _segment_key(start, end)
                    segments.setdefault(key, set()).add(domain)
    return segments


def _domain_at(model: CanonicalAnalysisGeometry, point: Point) -> int:
    for domain, region in enumerate(model.material_regions, start=1):
        if region.polygon.contains(point):
            return domain
    return 0


def _segment_domains(model: CanonicalAnalysisGeometry, start, end, candidate_domains):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = (dx * dx + dy * dy) ** 0.5
    if length == 0:
        raise NumericalFailure("Canonical geometry contains a zero-length edge.")
    offset = min(1e-7, length * 1e-4)
    midpoint = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
    normal = (-dy / length * offset, dx / length * offset)
    left = _domain_at(model, Point(midpoint[0] + normal[0], midpoint[1] + normal[1]))
    right = _domain_at(model, Point(midpoint[0] - normal[0], midpoint[1] - normal[1]))
    if left == right:
        # Very short edges can defeat a normal probe. The oriented candidate
        # domains still prove that this is a real partition edge.
        domains = sorted(candidate_domains)
        if len(domains) == 2:
            left, right = domains
        elif len(domains) == 1:
            left, right = domains[0], 0
    if left == right or (left == 0 and right == 0):
        raise NumericalFailure(f"Could not assign material domains around edge {start} -> {end}.")
    return left, right


def _boundary_name(model: CanonicalAnalysisGeometry, start, end) -> str | None:
    tolerance = 1e-10
    width = model.cell.bounds[2]
    depth = model.cell.bounds[3]
    if abs(start[1]) < tolerance and abs(end[1]) < tolerance:
        return "exterior"
    if abs(start[1] - depth) < tolerance and abs(end[1] - depth) < tolerance:
        return "interior"
    if abs(start[0]) < tolerance and abs(end[0]) < tolerance:
        return "periodic-left"
    if abs(start[0] - width) < tolerance and abs(end[0] - width) < tolerance:
        return "periodic-right"
    return None


def build_mesh(model: CanonicalAnalysisGeometry, mesh_size_m: float):
    _configure_windows_dlls()
    from netgen.geom2d import SplineGeometry
    from ngsolve import Mesh

    geometry = SplineGeometry()
    point_ids = {}

    def point_id(point):
        if point not in point_ids:
            point_ids[point] = geometry.AppendPoint(*point)
        return point_ids[point]

    raw_segments = _canonical_segments(model)
    records = []
    for (start, end), candidates in raw_segments.items():
        left, right = _segment_domains(model, start, end, candidates)
        records.append((start, end, left, right, _boundary_name(model, start, end)))

    left_copies = {}
    for boundary in ("periodic-left", None, "exterior", "interior", "periodic-right"):
        selected = sorted(
            (record for record in records if record[4] == boundary),
            key=lambda record: (record[0], record[1]),
        )
        for start, end, left, right, boundary_name in selected:
            append_arguments = {
                "leftdomain": left,
                "rightdomain": right,
                "maxh": mesh_size_m,
            }
            if boundary_name:
                append_arguments["bc"] = boundary_name
            if boundary_name == "periodic-left":
                if start[1] > end[1]:
                    start, end, left, right = end, start, right, left
                    append_arguments["leftdomain"] = left
                    append_arguments["rightdomain"] = right
                edge = geometry.Append(["line", point_id(start), point_id(end)], **append_arguments)
                left_copies[(round(start[1], 12), round(end[1], 12))] = edge
                continue
            if boundary_name == "periodic-right":
                if start[1] > end[1]:
                    start, end, left, right = end, start, right, left
                    append_arguments["leftdomain"] = left
                    append_arguments["rightdomain"] = right
                copy_edge = left_copies.get((round(start[1], 12), round(end[1], 12)))
                if copy_edge is None:
                    raise NumericalFailure("Periodic right edge has no matching left edge.")
                append_arguments["copy"] = copy_edge
            geometry.Append(["line", point_id(start), point_id(end)], **append_arguments)

    for domain, region in enumerate(model.material_regions, start=1):
        geometry.SetMaterial(domain, region.material_id)
    try:
        return Mesh(geometry.GenerateMesh(maxh=mesh_size_m))
    except Exception as error:
        raise NumericalFailure(f"Netgen rejected canonical geometry: {error}") from error


def solve_refinement(
    model: CanonicalAnalysisGeometry,
    mesh_size_m: float,
    exterior_temperature_c: float = 0.0,
    interior_temperature_c: float = 20.0,
):
    _configure_windows_dlls()
    from ngsolve import (
        BND,
        BilinearForm,
        GridFunction,
        H1,
        Integrate,
        LinearForm,
        Periodic,
        SymbolicBFI,
        TaskManager,
        grad,
    )

    unsupported_contacts = sorted(
        {interface.contact for interface in model.interfaces if interface.contact != "perfect-contact"}
    )
    if unsupported_contacts:
        raise NumericalFailure(f"Unsupported contact models: {unsupported_contacts}.")
    mesh = build_mesh(model, mesh_size_m)
    missing_materials = {
        region.material_id
        for region in model.material_regions
        if region.material_id not in CONDUCTIVITY_W_MK
    }
    if missing_materials:
        raise NumericalFailure(f"No conductivity for materials: {sorted(missing_materials)}.")
    conductivity = mesh.MaterialCF(CONDUCTIVITY_W_MK)
    finite_elements = Periodic(H1(mesh, order=1, dirichlet="exterior|interior"))
    trial, test = finite_elements.TnT()
    matrix = BilinearForm(finite_elements, symmetric=True)
    matrix += SymbolicBFI(conductivity * grad(trial) * grad(test))
    right_hand_side = LinearForm(finite_elements)
    temperature = GridFunction(finite_elements)
    temperature.Set(
        mesh.BoundaryCF(
            {"exterior": exterior_temperature_c, "interior": interior_temperature_c},
            default=0,
        ),
        BND,
    )
    with TaskManager():
        matrix.Assemble()
        right_hand_side.Assemble()
        temperature.vec.data += matrix.mat.Inverse(finite_elements.FreeDofs()) * (
            right_hand_side.vec - matrix.mat * temperature.vec
        )

    raw_fluxes = {
        name: skeleton_flux(mesh, temperature, conductivity, name) for name in BOUNDARIES
    }
    reaction_fluxes = {
        name: reaction_flux(
            finite_elements, matrix.mat, right_hand_side.vec, temperature, mesh, name
        )
        for name in ("exterior", "interior")
    }
    recovered_fluxes = hdiv_fluxes(mesh, temperature, conductivity, BOUNDARIES)
    temperature_difference = interior_temperature_c - exterior_temperature_c
    energy_heat_flow = float(
        Integrate(conductivity * grad(temperature) * grad(temperature), mesh)
        / temperature_difference
    )
    hdiv_face_mean_heat_flow = (
        recovered_fluxes["exterior"] - recovered_fluxes["interior"]
    ) / 2
    # The Ticket 01 H(div) field is an interpolated diagnostic, not an
    # equilibrated reconstruction. Thin, high-conductivity regions expose that
    # distinction. Energy and Dirichlet reactions are conservative and agree
    # to solver precision, so the generic result contract uses energy for U.
    heat_flow = energy_heat_flow
    projected_width = model.periodicity_m * model.repeats
    return {
        "mesh_size_m": mesh_size_m,
        "element_count": mesh.ne,
        "heat_flow_w_per_m": heat_flow,
        "heat_flow_basis": "volume-energy-with-dirichlet-reaction-check",
        "hdiv_face_mean_heat_flow_w_per_m": hdiv_face_mean_heat_flow,
        "u_value_w_m2k": heat_flow / (projected_width * temperature_difference),
        "free_dof_solver_residual": free_dof_residual(
            matrix.mat, temperature.vec, right_hand_side.vec, finite_elements.FreeDofs()
        ),
        "fluxes_w_per_m": {
            "h1_skeleton_outward": raw_fluxes,
            "dirichlet_reaction": reaction_fluxes,
            "hdiv_recovered_outward": recovered_fluxes,
            "volume_energy_heat_flow": energy_heat_flow,
        },
        "flux_balance_w_per_m": {
            "hot_in": -recovered_fluxes["interior"],
            "cold_out": recovered_fluxes["exterior"],
            "periodic_net_out": recovered_fluxes["periodic-left"]
            + recovered_fluxes["periodic-right"],
            "hot_cold_imbalance": -recovered_fluxes["interior"]
            - recovered_fluxes["exterior"],
            "energy_minus_face_mean": energy_heat_flow - hdiv_face_mean_heat_flow,
        },
        "region_areas_m2": {
            region.material_id: region.polygon.area for region in model.material_regions
        },
    }
