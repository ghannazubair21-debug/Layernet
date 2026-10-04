from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.selector_artifacts import (
    build_random_forest_selector_parameters,
    build_xgboost_selector_parameters,
)


class SelectorConfigurationTests(unittest.TestCase):
    def test_xgboost_selector_removes_validation_early_stopping(self) -> None:
        parameters = build_xgboost_selector_parameters(
            {
                "n_estimators": 500,
                "early_stopping_rounds": 30,
                "random_state": 42,
                "scale_pos_weight": 10.0,
            }
        )

        self.assertEqual(parameters["n_estimators"], 500)
        self.assertEqual(parameters["scale_pos_weight"], 10.0)
        self.assertNotIn("early_stopping_rounds", parameters)

    def test_random_forest_selector_uses_smallest_declared_candidate(self) -> None:
        parameters = build_random_forest_selector_parameters(
            [
                {"n_estimators": 200, "parameters": {"n_estimators": 200, "random_state": 42}},
                {"n_estimators": 100, "parameters": {"n_estimators": 100, "random_state": 42}},
            ]
        )

        self.assertEqual(parameters, {"n_estimators": 100, "random_state": 42})

    def test_random_forest_selector_rejects_missing_configuration(self) -> None:
        with self.assertRaisesRegex(ValueError, "candidates are missing"):
            build_random_forest_selector_parameters([])


if __name__ == "__main__":
    unittest.main()
