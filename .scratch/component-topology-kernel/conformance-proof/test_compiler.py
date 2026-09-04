import json
import unittest
from pathlib import Path

from shapely.geometry import MultiPolygon, box

from compiler import CompileFailure, compile_recipe, load_recipe_fixture
from primitive_plugins import (
    PrimitiveGeometry,
    PrimitivePlugin,
    compile_rectangle,
    create_standard_primitive_registry,
)


ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / "recipe-contract"


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


class RecipeCompilerConformanceTests(unittest.TestCase):
    def setUp(self):
        self.registry = create_standard_primitive_registry()

    def compile_fixture(self, name: str, repeats: int = 1):
        recipe = load_recipe_fixture(FIXTURES / name, FIXTURES)
        return compile_recipe(recipe, self.registry, repeats=repeats)

    def test_all_representative_recipes_compile_to_conserved_material_regions(self):
        for name in (
            "valid-timber-framing.json",
            "valid-single-c-row.json",
            "valid-aligned-c-rows.json",
            "valid-staggered-c-rows.json",
            "valid-z-profile-regression.json",
        ):
            with self.subTest(name=name):
                model = self.compile_fixture(name)
                self.assertAlmostEqual(model.topology_audit["gap_area_m2"], 0.0, places=12)
                self.assertAlmostEqual(model.topology_audit["overlap_area_m2"], 0.0, places=12)
                self.assertAlmostEqual(model.topology_audit["area_residual_m2"], 0.0, places=12)
                self.assertGreaterEqual(len(model.material_regions), 2)
                self.assertGreater(len(model.interfaces), 0)

    def test_expanded_cell_is_exactly_two_periods_of_the_same_model(self):
        single = self.compile_fixture("valid-staggered-c-rows.json", repeats=1)
        double = self.compile_fixture("valid-staggered-c-rows.json", repeats=2)
        self.assertAlmostEqual(double.cell.area, 2 * single.cell.area, places=12)
        self.assertAlmostEqual(
            sum(region.polygon.area for region in double.material_regions),
            2 * sum(region.polygon.area for region in single.material_regions),
            places=12,
        )

    def test_unsupported_recipes_fail_with_fixture_diagnostic_category(self):
        for name in (
            "invalid-crossed-framing.json",
            "invalid-missing-critical-input.json",
            "invalid-unknown-primitive.json",
            "invalid-point-fixing.json",
            "invalid-out-of-host.json",
        ):
            fixture_path = (
                ROOT / "fixtures" / name
                if name in {"invalid-point-fixing.json", "invalid-out-of-host.json"}
                else FIXTURES / name
            )
            raw = json.loads(fixture_path.read_text(encoding="utf-8"))
            with self.subTest(name=name), self.assertRaises(CompileFailure) as raised:
                recipe = load_recipe_fixture(fixture_path, FIXTURES)
                compile_recipe(recipe, self.registry)
            self.assertEqual(raised.exception.category, raw["expect"]["category"])
            self.assertEqual(raised.exception.reason, raw["expect"]["reason"])

    def test_disconnected_member_is_rejected_by_registry_output_contract(self):
        fixture_path = ROOT / "fixtures" / "invalid-disconnected-member.json"
        recipe = load_recipe_fixture(fixture_path, FIXTURES)
        plugin = PrimitivePlugin(
            "fixture.disconnected",
            "1.0.0",
            ("width", "depth"),
            {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
            compile_disconnected_fixture,
        )
        registry = self.registry.registered_with(plugin, "disconnected-rejection-fixture/v1")
        with self.assertRaises(CompileFailure) as raised:
            compile_recipe(recipe, registry)
        self.assertEqual(raised.exception.category, "invalid")
        self.assertEqual(
            raised.exception.reason,
            json.loads(fixture_path.read_text(encoding="utf-8"))["expect"]["reason"],
        )

    def test_new_registered_primitive_compiles_without_shared_compiler_change(self):
        recipe = load_recipe_fixture(FIXTURES / "valid-timber-framing.json", FIXTURES)
        recipe["rows"][0]["member"]["primitive"]["kind"] = "vendor.block"
        plugin = PrimitivePlugin(
            "vendor.block",
            "1.0.0",
            ("width", "depth"),
            {"dimension": "2d-cross-section", "supportsPeriodicTranslation": True},
            compile_rectangle,
        )
        registry = self.registry.registered_with(plugin, "test-extension/v1")
        model = compile_recipe(recipe, registry)
        self.assertAlmostEqual(model.topology_audit["gap_area_m2"], 0.0, places=12)

    def test_unknown_primitive_parameter_and_recipe_version_reject(self):
        recipe = load_recipe_fixture(FIXTURES / "valid-single-c-row.json", FIXTURES)
        recipe["rows"][0]["member"]["primitive"]["parameters"]["familyHint"] = 1
        with self.assertRaises(CompileFailure) as unknown:
            compile_recipe(recipe, self.registry)
        self.assertEqual(unknown.exception.category, "unsupported")
        recipe = load_recipe_fixture(FIXTURES / "valid-single-c-row.json", FIXTURES)
        recipe["schemaVersion"] = "2.0.0"
        with self.assertRaises(CompileFailure) as version:
            compile_recipe(recipe, self.registry)
        self.assertEqual(version.exception.category, "unsupported")

    def test_incompatible_primitive_capability_rejects(self):
        recipe = load_recipe_fixture(FIXTURES / "valid-timber-framing.json", FIXTURES)
        recipe["rows"][0]["member"]["primitive"]["kind"] = "vendor.nonperiodic"
        plugin = PrimitivePlugin(
            "vendor.nonperiodic",
            "1.0.0",
            ("width", "depth"),
            {"dimension": "2d-cross-section", "supportsPeriodicTranslation": False},
            compile_rectangle,
        )
        registry = self.registry.registered_with(plugin, "test-incompatible/v1")
        with self.assertRaises(CompileFailure) as raised:
            compile_recipe(recipe, registry)
        self.assertEqual(raised.exception.category, "unsupported")

    def test_primitive_output_uses_periodic_x_and_depth_y(self):
        geometry = self.registry.compile(
            "standard.c",
            "1.0.0",
            {"depth": 0.15, "flangeWidth": 0.05, "gauge": 0.0015, "lipWidth": 0.012},
        )
        minimum_x, minimum_y, maximum_x, maximum_y = geometry.polygon.bounds
        self.assertAlmostEqual(maximum_x - minimum_x, 0.05, places=12)
        self.assertAlmostEqual(maximum_y - minimum_y, 0.15, places=12)


if __name__ == "__main__":
    unittest.main()
