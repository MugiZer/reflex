import unittest
from pathlib import Path

from compiler import compile_recipe, load_recipe_fixture
from numerical_solver import solve_refinement
from primitive_plugins import create_standard_primitive_registry


ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / "recipe-contract"


class CanonicalNumericalSolverTests(unittest.TestCase):
    def test_timbers_canonical_regions_feed_ticket_01_solver_evidence(self):
        recipe = load_recipe_fixture(FIXTURES / "valid-timber-framing.json", FIXTURES)
        model = compile_recipe(recipe, create_standard_primitive_registry())
        result = solve_refinement(model, mesh_size_m=0.025)

        self.assertGreater(result["element_count"], 0)
        self.assertGreater(result["heat_flow_w_per_m"], 0)
        self.assertGreater(result["u_value_w_m2k"], 0)
        self.assertLess(result["free_dof_solver_residual"], 1e-8)
        hdiv = result["fluxes_w_per_m"]["hdiv_recovered_outward"]
        self.assertGreater(hdiv["exterior"], 0)
        self.assertLess(hdiv["interior"], 0)
        self.assertLess(
            abs(hdiv["periodic-left"] + hdiv["periodic-right"]),
            0.01 * result["heat_flow_w_per_m"],
        )


if __name__ == "__main__":
    unittest.main()
