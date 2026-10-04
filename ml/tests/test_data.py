from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.data import FEATURE_COLUMNS, TARGET_COLUMN, build_features, chronological_split, validate_dataset


def make_test_frame() -> pd.DataFrame:
    # Structural unit-test fixture only; it is never used to fit a model or report metrics.
    rows = []
    for index, elapsed in enumerate([0, 1, 2, 3, 4, 5, 5, 6, 7, 8]):
        row = {"Time": elapsed, "Amount": float(index + 1), "Class": index % 2}
        row.update({f"V{column}": float(index - column) for column in range(1, 29)})
        rows.append(row)
    return pd.DataFrame(rows)


class DatasetPreparationTests(unittest.TestCase):
    def test_validation_selects_expected_schema_sorts_and_reports_duplicates(self) -> None:
        frame = make_test_frame()
        frame = pd.concat([frame.iloc[[0]], frame], ignore_index=True)
        frame["TX_FRAUD_SCENARIO"] = 123

        cleaned, summary = validate_dataset(frame)

        self.assertEqual(summary.row_count, 10)
        self.assertEqual(summary.duplicate_rows_removed, 1)
        self.assertEqual(summary.ignored_columns, ("TX_FRAUD_SCENARIO",))
        self.assertTrue(cleaned["Time"].is_monotonic_increasing)
        self.assertNotIn("TX_FRAUD_SCENARIO", cleaned.columns)

    def test_validation_rejects_missing_fields_invalid_labels_and_non_finite_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing required columns"):
            validate_dataset(make_test_frame().drop(columns=["V28"]))

        invalid_label = make_test_frame()
        invalid_label.loc[0, "Class"] = 2
        with self.assertRaisesRegex(ValueError, "binary labels"):
            validate_dataset(invalid_label)

        non_finite = make_test_frame()
        non_finite.loc[0, "Amount"] = float("inf")
        with self.assertRaisesRegex(ValueError, "non-finite"):
            validate_dataset(non_finite)

    def test_time_split_is_contiguous_and_keeps_equal_timestamps_together(self) -> None:
        frame = make_test_frame()
        train, validation, test = chronological_split(frame)

        self.assertTrue(train["Time"].max() < validation["Time"].min())
        self.assertTrue(validation["Time"].max() < test["Time"].min())
        self.assertEqual(len(train) + len(validation) + len(test), len(frame))
        self.assertEqual(int((train["Time"] == 5).sum()), 2)

    def test_feature_schema_excludes_target_and_absolute_time(self) -> None:
        frame = make_test_frame()
        features = build_features(frame)
        altered_labels = frame.assign(Class=1 - frame["Class"])
        altered_features = build_features(altered_labels)

        self.assertEqual(tuple(features.columns), FEATURE_COLUMNS)
        self.assertNotIn(TARGET_COLUMN, features.columns)
        self.assertNotIn("Time", features.columns)
        pd.testing.assert_frame_equal(features, altered_features)

    def test_inference_features_reject_missing_or_invalid_raw_inputs(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing columns"):
            build_features(pd.DataFrame([{"Time": 1, "Amount": 4}]))

        invalid = make_test_frame()
        invalid.loc[0, "V1"] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite numeric"):
            build_features(invalid)


if __name__ == "__main__":
    unittest.main()
