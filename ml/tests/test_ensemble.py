from __future__ import annotations

import unittest

import numpy as np

from layernet_ml.ensemble import (
    WEIGHT_CANDIDATES,
    _empirical_cdf,
    _select_f1_threshold,
    _validation_selection,
)


class EnsembleSelectionTests(unittest.TestCase):
    def test_empirical_cdf_is_monotonic_and_handles_ties_and_bounds(self) -> None:
        reference = np.asarray([1.0, 2.0, 2.0, 4.0])
        actual = _empirical_cdf(np.asarray([0.0, 1.0, 2.0, 3.0, 4.0, 5.0]), reference)
        np.testing.assert_allclose(actual, [0.0, 0.125, 0.5, 0.75, 0.875, 1.0])
        self.assertTrue(np.all(actual[1:] >= actual[:-1]))

    def test_threshold_selection_maximizes_f1_and_breaks_ties_conservatively(self) -> None:
        result = _select_f1_threshold([1, 0, 0, 1], np.asarray([0.9, 0.8, 0.7, 0.1]))
        self.assertEqual(result["threshold"], 0.9)
        self.assertEqual(result["f1"], 2 / 3)

    def test_validation_selection_uses_small_fixed_candidate_list(self) -> None:
        labels = np.asarray([0, 0, 1, 1, 0, 1])
        scores = {
            "xgboost": np.asarray([0.1, 0.2, 0.8, 0.9, 0.3, 0.7]),
            "random_forest": np.asarray([0.2, 0.3, 0.7, 0.8, 0.1, 0.9]),
            "isolation_forest": np.asarray([0.7, 0.6, 0.8, 0.9, 0.5, 0.6]),
        }
        weights, threshold, candidates, metrics = _validation_selection(labels, scores)
        self.assertIn(tuple(weights[key] for key in ("xgboost", "random_forest", "isolation_forest")), WEIGHT_CANDIDATES)
        self.assertEqual(len(candidates), len(WEIGHT_CANDIDATES))
        self.assertTrue(0.0 <= threshold <= 1.0)
        self.assertEqual(metrics["threshold"], threshold)
        self.assertTrue(all(sum(candidate["weights"].values()) == 1.0 for candidate in candidates))


if __name__ == "__main__":
    unittest.main()
