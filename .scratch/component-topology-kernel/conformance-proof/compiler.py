"""Generic recipe-to-canonical-analysis-geometry compiler."""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path

from shapely import set_precision
from shapely.affinity import translate
from shapely.geometry import MultiPolygon, Polygon, box, mapping
from shapely.ops import unary_union

from primitive_plugins import PrimitivePluginFailure, PrimitiveRegistry


GEOMETRY_GRID_M = 1e-9
AREA_TOLERANCE_M2 = 1e-11
SLIVER_AREA_M2 = 1e-10


class CompileFailure(Exception):
    def __init__(self, category: str, reason: str):
        self.category = category
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True)
class MaterialRegion:
    region_id: str
    material_id: str
    polygon: Polygon | MultiPolygon

    def canonical_json(self) -> dict:
        return {
            "regionId": self.region_id,
            "materialId": self.material_id,
            "geometry": mapping(self.polygon),
        }


@dataclass(frozen=True)
class MaterialInterface:
    region_a: str
    region_b: str
    length_m: float
    contact: str


@dataclass(frozen=True)
class CanonicalAnalysisGeometry:
    cell: Polygon
    periodicity_m: float
    repeats: int
    material_regions: tuple[MaterialRegion, ...]
    interfaces: tuple[MaterialInterface, ...]
    topology_audit: dict
    primitive_manifest: dict
    boundary_profiles: dict[str, str]

    def canonical_json(self) -> dict:
        return {
            "schemaVersion": "canonical-analysis-geometry/v1",
            "coordinateSystem": {
                "x": "periodic-left-to-right-m",
                "y": "exterior-to-interior-depth-m",
            },
            "cell": mapping(self.cell),
            "periodicityM": self.periodicity_m,
            "repeats": self.repeats,
            "materialRegions": [region.canonical_json() for region in self.material_regions],
            "interfaces": [interface.__dict__ for interface in self.interfaces],
            "topologyAudit": self.topology_audit,
            "primitiveManifest": self.primitive_manifest,
            "boundaryProfiles": self.boundary_profiles,
        }


def _set_path(value: dict, path: str, replacement: object) -> None:
    parts = path.split(".")
    current = value
    for part in parts[:-1]:
        if "[" in part:
            key, index = part[:-1].split("[")
            current = current[key][int(index)]
        else:
            current = current[part]
    leaf = parts[-1]
    if "[" in leaf:
        key, index = leaf[:-1].split("[")
        current[key][int(index)] = replacement
    else:
        current[leaf] = replacement


def load_recipe_fixture(path: Path, fixture_directory: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    recipe = raw.get("recipe", raw)
    if "fixtureBase" not in recipe:
        return copy.deepcopy(recipe)
    base_raw = json.loads((fixture_directory / recipe["fixtureBase"]).read_text(encoding="utf-8"))
    resolved = copy.deepcopy(base_raw.get("recipe", base_raw))
    for patch_path, replacement in recipe.get("patch", {}).items():
        _set_path(resolved, patch_path, replacement)
    return resolved


def _periodic_placement(local_polygon, through_origin: float, phase: float, pitch: float, repeats: int, cell):
    placed = translate(local_polygon, xoff=phase, yoff=through_origin)
    fragments = [
        translate(placed, xoff=index * pitch).intersection(cell)
        for index in range(-2, repeats + 2)
    ]
    polygonal_fragments = [
        fragment for fragment in fragments if not fragment.is_empty and fragment.area > AREA_TOLERANCE_M2
    ]
    return set_precision(unary_union(polygonal_fragments), GEOMETRY_GRID_M)


def _periodic_contact_placement(local_boundary, through_origin, phase, pitch, repeats, cell):
    placed = translate(local_boundary, xoff=phase, yoff=through_origin)
    fragments = [
        translate(placed, xoff=index * pitch).intersection(cell)
        for index in range(-2, repeats + 2)
    ]
    lines = [fragment for fragment in fragments if not fragment.is_empty and fragment.length > GEOMETRY_GRID_M]
    return set_precision(unary_union(lines), GEOMETRY_GRID_M)


def _explode(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    return []


def _choose_periodic_origin(compiled_rows: list[tuple], pitch: float) -> float:
    """Choose a deterministic cell cut without changing relative row phase."""
    best_shift = 0.0
    best_margin = float("-inf")
    for candidate_index in range(720):
        shift = candidate_index * pitch / 720
        margin = pitch
        for _, _, phase, local, _ in compiled_rows:
            minimum_x, maximum_x = local.polygon.bounds[0], local.polygon.bounds[2]
            width = maximum_x - minimum_x
            start = (minimum_x + phase + shift) % pitch
            row_margin = min(start, pitch - (start + width)) if start + width <= pitch else -width
            margin = min(margin, row_margin)
        if margin > best_margin + GEOMETRY_GRID_M:
            best_margin = margin
            best_shift = shift
    if best_margin <= GEOMETRY_GRID_M:
        raise CompileFailure(
            "unsupported", "No periodic cell cut avoids intersecting a member placement."
        )
    return best_shift


def compile_recipe(recipe: dict, registry: PrimitiveRegistry, repeats: int = 1) -> CanonicalAnalysisGeometry:
    if recipe.get("schemaVersion") != "1.0.0-draft":
        raise CompileFailure("unsupported", "Recipe schema version is not supported.")
    module = recipe.get("topologyModule", {})
    if (
        module.get("id") != "repeating-parallel-profile-wall-2d"
        or module.get("version") != "1.0.0-draft"
    ):
        raise CompileFailure("unsupported", "The requested topology module is not registered.")
    if recipe.get("cavities") or recipe.get("thermalBreaks"):
        raise CompileFailure(
            "unsupported", "Cavity and thermal-break composition needs a validated interaction fixture."
        )
    boundaries = recipe.get("boundaries", {})
    if boundaries.get("left") != "periodic" or boundaries.get("right") != "periodic":
        raise CompileFailure("unsupported", "This module requires a matched periodic boundary pair.")
    if not boundaries.get("exterior", {}).get("value") or not boundaries.get("interior", {}).get("value"):
        raise CompileFailure("incomplete", "Exterior and interior boundary profiles are required.")
    pitch = recipe.get("periodicity", {}).get("value")
    if not isinstance(pitch, (int, float)) or pitch <= 0 or repeats not in (1, 2):
        raise CompileFailure("invalid", "Positive periodicity and one or two repeats are required.")
    layers = recipe.get("layers", [])
    layer_depths = [layer.get("thickness", {}).get("value") for layer in layers]
    if not layers or any(not isinstance(depth, (int, float)) or depth <= 0 for depth in layer_depths):
        raise CompileFailure("incomplete", "Every host layer needs a positive thickness.")
    host_depth = sum(layer_depths)
    cell = box(0, 0, pitch * repeats, host_depth)
    rows = recipe.get("rows", [])
    if not 1 <= len(rows) <= 2:
        raise CompileFailure("unsupported", "The module supports one or two parallel rows.")

    compiled_rows = []
    for row in rows:
        member = row.get("member", {})
        if member.get("orientation") not in (None, "parallel-to-section"):
            raise CompileFailure(
                "unsupported",
                "Crossed framing is not representable by a continuous parallel-member 2-D representative cell.",
            )
        if member.get("placementMode", "continuous-parallel") != "continuous-parallel":
            raise CompileFailure("unsupported", "Discrete point placements require a 3-D topology module.")
        primitive = member.get("primitive", {})
        origin = row.get("originY", {}).get("value")
        phase = row.get("offsetX", {}).get("value")
        if origin is None or phase is None:
            raise CompileFailure("incomplete", "Every row needs through-host origin and periodic phase.")
        try:
            local = registry.compile(
                primitive.get("kind"), primitive.get("version"), primitive.get("parameters", {})
            )
        except PrimitivePluginFailure as error:
            raise CompileFailure(error.category, error.reason) from error
        unwrapped = translate(local.polygon, xoff=phase, yoff=origin)
        if unwrapped.bounds[1] < -GEOMETRY_GRID_M or unwrapped.bounds[3] > host_depth + GEOMETRY_GRID_M:
            raise CompileFailure("invalid", "Primitive geometry extends outside the host depth.")
        compiled_rows.append((row, origin, phase, local, member["material"]["value"]))

    cell_phase_shift = _choose_periodic_origin(compiled_rows, pitch)
    placed_members = []
    for row, origin, phase, local, material_id in compiled_rows:
        placed = _periodic_placement(
            local.polygon, origin, phase + cell_phase_shift, pitch, repeats, cell
        )
        if placed.is_empty or not placed.is_valid:
            raise CompileFailure("invalid", "Primitive placement produced invalid periodic geometry.")
        placed_contact = _periodic_contact_placement(
            local.contact_boundary,
            origin,
            phase + cell_phase_shift,
            pitch,
            repeats,
            cell,
        )
        if placed_contact.is_empty:
            raise CompileFailure("invalid", "Primitive contact boundary was lost during placement.")
        placed_members.append(
            (row["id"], material_id, placed, placed_contact, local.contact_mode)
        )

    member_overlap = 0.0
    for index, (_, _, left, _, _) in enumerate(placed_members):
        for _, _, right, _, _ in placed_members[index + 1 :]:
            member_overlap += left.intersection(right).area
    if member_overlap > AREA_TOLERANCE_M2:
        raise CompileFailure("invalid", f"Member placements overlap by {member_overlap:.12g} m2.")

    member_union = unary_union([geometry for _, _, geometry, _, _ in placed_members])
    material_geometries: dict[str, list] = {}
    cursor = 0.0
    for layer, thickness in zip(layers, layer_depths):
        slab = box(0, cursor, pitch * repeats, cursor + thickness)
        host_region = set_precision(slab.difference(member_union), GEOMETRY_GRID_M)
        material_geometries.setdefault(layer["material"]["value"], []).append(host_region)
        cursor += thickness
    for _, material_id, geometry, _, _ in placed_members:
        material_geometries.setdefault(material_id, []).append(geometry)

    regions = []
    for ordinal, material_id in enumerate(sorted(material_geometries), start=1):
        geometry = set_precision(unary_union(material_geometries[material_id]), GEOMETRY_GRID_M)
        regions.append(MaterialRegion(f"region-{ordinal}", material_id, geometry))

    region_union = unary_union([region.polygon for region in regions])
    gap_area = cell.difference(region_union).area
    overlap_area = member_overlap
    area_sum = sum(region.polygon.area for region in regions)
    area_residual = cell.area - area_sum
    slivers = [
        {"regionId": region.region_id, "areaM2": polygon.area}
        for region in regions
        for polygon in _explode(region.polygon)
        if polygon.area < SLIVER_AREA_M2
    ]
    if gap_area > AREA_TOLERANCE_M2 or abs(area_residual) > AREA_TOLERANCE_M2:
        raise CompileFailure("invalid", "Material regions do not conserve the periodic cell.")
    if slivers:
        raise CompileFailure("invalid", "Material-region slivers fall below the topology tolerance.")

    interfaces = []
    for index, left in enumerate(regions):
        for right in regions[index + 1 :]:
            length = left.polygon.boundary.intersection(right.polygon.boundary).length
            if length > GEOMETRY_GRID_M:
                shared_boundary = left.polygon.boundary.intersection(right.polygon.boundary)
                declared_modes = {
                    contact_mode
                    for _, _, _, contact_boundary, contact_mode in placed_members
                    if contact_boundary.intersection(shared_boundary).length > GEOMETRY_GRID_M
                }
                if len(declared_modes) > 1:
                    raise CompileFailure("conflicting", "Primitive contact declarations conflict.")
                contact = next(iter(declared_modes), "perfect-contact")
                interfaces.append(MaterialInterface(left.region_id, right.region_id, length, contact))

    audit = {
        "cell_area_m2": cell.area,
        "material_area_m2": area_sum,
        "area_residual_m2": area_residual,
        "gap_area_m2": gap_area,
        "overlap_area_m2": overlap_area,
        "sliver_count": len(slivers),
        "region_count": len(regions),
        "interface_count": len(interfaces),
        "periodic_pair_count": 1,
        "out_of_host_area_m2": 0.0,
        "cell_phase_shift_m": cell_phase_shift,
        "declared_contact_length_m": sum(
            contact_boundary.length for _, _, _, contact_boundary, _ in placed_members
        ),
    }
    return CanonicalAnalysisGeometry(
        cell=cell,
        periodicity_m=pitch,
        repeats=repeats,
        material_regions=tuple(regions),
        interfaces=tuple(interfaces),
        topology_audit=audit,
        primitive_manifest=registry.manifest,
        boundary_profiles={
            "exterior": boundaries["exterior"]["value"],
            "interior": boundaries["interior"]["value"],
            "left": boundaries["left"],
            "right": boundaries["right"],
        },
    )
