"""Primitive plugins own local cross-section geometry and nothing else."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import inspect
from typing import Callable

from shapely.affinity import affine_transform
from shapely.geometry import Polygon, box
from shapely.ops import unary_union


class PrimitivePluginFailure(ValueError):
    def __init__(self, category: str, reason: str):
        self.category = category
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True)
class PrimitiveGeometry:
    polygon: Polygon
    contact_boundary: object
    contact_mode: str


@dataclass(frozen=True)
class PrimitivePlugin:
    kind: str
    version: str
    parameter_names: tuple[str, ...]
    capabilities: dict[str, object]
    compile_local_geometry: Callable[[dict], PrimitiveGeometry]


class PrimitiveRegistry:
    def __init__(self, snapshot_id: str, plugins: tuple[PrimitivePlugin, ...]):
        self.snapshot_id = snapshot_id
        self._plugins = {(plugin.kind, plugin.version): plugin for plugin in plugins}

    def compile(self, kind: str, version: str, parameters: dict) -> PrimitiveGeometry:
        plugin = self._plugins.get((kind, version))
        if plugin is None:
            raise PrimitivePluginFailure(
                "unsupported", f"{kind} is absent from the pinned registry snapshot."
            )
        supplied = set(parameters)
        expected = set(plugin.parameter_names)
        unknown = sorted(supplied - expected)
        if unknown:
            raise PrimitivePluginFailure(
                "unsupported", f"Primitive '{kind}' has unknown parameters: {unknown}."
            )
        required_capabilities = {
            "dimension": "2d-cross-section",
            "supportsPeriodicTranslation": True,
        }
        incompatible = {
            name: {"required": required, "declared": plugin.capabilities.get(name)}
            for name, required in required_capabilities.items()
            if plugin.capabilities.get(name) != required
        }
        if incompatible:
            raise PrimitivePluginFailure(
                "unsupported", f"Primitive '{kind}' has incompatible capabilities: {incompatible}."
            )
        geometry = plugin.compile_local_geometry(parameters)
        if (
            geometry.polygon.is_empty
            or not geometry.polygon.is_valid
            or geometry.polygon.geom_type != "Polygon"
        ):
            raise PrimitivePluginFailure("invalid", f"Primitive '{kind}' emitted invalid local geometry.")
        if geometry.contact_mode != "perfect-contact":
            raise PrimitivePluginFailure(
                "unsupported", f"Primitive '{kind}' declares unsupported contact mode."
            )
        return geometry

    @property
    def manifest(self) -> dict:
        registrations = []
        for key in sorted(self._plugins):
            plugin = self._plugins[key]
            implementation = inspect.getsource(plugin.compile_local_geometry).encode("utf-8")
            registrations.append(
                {
                    "kind": plugin.kind,
                    "version": plugin.version,
                    "parameterNames": list(plugin.parameter_names),
                    "capabilities": plugin.capabilities,
                    "implementationSha256": hashlib.sha256(implementation).hexdigest(),
                }
            )
        return {"registrySnapshot": self.snapshot_id, "registrations": registrations}

    def registered_with(self, plugin: PrimitivePlugin, snapshot_id: str) -> "PrimitiveRegistry":
        return PrimitiveRegistry(snapshot_id, (*self._plugins.values(), plugin))


def _positive(parameters: dict, *names: str) -> tuple[float, ...]:
    values = tuple(parameters.get(name) for name in names)
    if any(not isinstance(value, (int, float)) or value <= 0 for value in values):
        missing = [name for name, value in zip(names, values) if value is None]
        category = "incomplete" if missing else "invalid"
        reason = (
            "Member depth is missing and cannot be compiled."
            if missing == ["depth"]
            else f"Positive parameters required: {', '.join(names)}."
        )
        raise PrimitivePluginFailure(category, reason)
    return values


def _geometry(polygon) -> PrimitiveGeometry:
    merged = unary_union(polygon)
    if merged.geom_type != "Polygon":
        raise PrimitivePluginFailure("invalid", "Primitive pieces must form one connected polygon.")
    # Helpers use (depth, transverse-width) for readable profile formulas; the
    # published local contract is (periodic-x, exterior-to-interior-y).
    merged = affine_transform(merged, (0, 1, 1, 0, 0, 0))
    return PrimitiveGeometry(
        polygon=merged, contact_boundary=merged.boundary, contact_mode="perfect-contact"
    )


def compile_rectangle(parameters: dict) -> PrimitiveGeometry:
    width, depth = _positive(parameters, "width", "depth")
    return _geometry(box(0, -width / 2, depth, width / 2))


def compile_c_section(parameters: dict) -> PrimitiveGeometry:
    depth, flange, gauge, lip = _positive(
        parameters, "depth", "flangeWidth", "gauge", "lipWidth"
    )
    if depth <= 2 * gauge or flange <= gauge or lip + 2 * gauge >= depth:
        raise PrimitivePluginFailure("invalid", "C-section dimensions cannot form a valid thin section.")
    pieces = (
        box(0, 0, depth, gauge),
        box(0, 0, gauge, flange),
        box(depth - gauge, 0, depth, flange),
        box(gauge, flange - gauge, gauge + lip, flange),
        box(depth - gauge - lip, flange - gauge, depth - gauge, flange),
    )
    return _geometry(pieces)


def compile_z_section(parameters: dict) -> PrimitiveGeometry:
    depth, flange, gauge, lip = _positive(
        parameters, "depth", "flangeWidth", "gauge", "lipWidth"
    )
    if depth <= 2 * gauge or flange <= gauge or lip + 2 * gauge >= depth:
        raise PrimitivePluginFailure("invalid", "Z-section dimensions cannot form a valid thin section.")
    pieces = (
        box(0, -gauge / 2, depth, gauge / 2),
        box(0, -flange, gauge, gauge / 2),
        box(depth - gauge, -gauge / 2, depth, flange),
        box(gauge, -flange, gauge + lip, -flange + gauge),
        box(depth - gauge - lip, flange - gauge, depth - gauge, flange),
    )
    return _geometry(pieces)


def compile_hat_section(parameters: dict) -> PrimitiveGeometry:
    depth, top, base, gauge = _positive(
        parameters, "depth", "topFlangeWidth", "baseFlangeWidth", "gauge"
    )
    if depth <= gauge or min(top, base) <= 2 * gauge:
        raise PrimitivePluginFailure("invalid", "Hat-section dimensions cannot form a valid thin section.")
    half_top, half_base = top / 2, base / 2
    pieces = (
        box(0, -half_top, gauge, half_top),
        box(0, -half_top, depth, -half_top + gauge),
        box(0, half_top - gauge, depth, half_top),
        box(depth - gauge, -half_base, depth, half_base),
    )
    return _geometry(pieces)


def create_standard_primitive_registry() -> PrimitiveRegistry:
    return PrimitiveRegistry(
        "standard-primitives-1.0.0-draft",
        (
            PrimitivePlugin(
                "standard.rectangle",
                "1.0.0",
                ("width", "depth"),
                {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
                compile_rectangle,
            ),
            PrimitivePlugin(
                "standard.c",
                "1.0.0",
                ("depth", "flangeWidth", "gauge", "lipWidth"),
                {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
                compile_c_section,
            ),
            PrimitivePlugin(
                "standard.z",
                "1.0.0",
                ("depth", "flangeWidth", "gauge", "lipWidth"),
                {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
                compile_z_section,
            ),
            PrimitivePlugin(
                "standard.hat",
                "1.0.0",
                ("depth", "topFlangeWidth", "baseFlangeWidth", "gauge"),
                {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
                compile_hat_section,
            ),
        )
    )
