from __future__ import annotations

import sys
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.paysim_data import PaySimCausalExample
from layernet_ml.paysim_temporal import MODEL_KEYS, encode_sequence_batch
from layernet_ml.paysim_prediction_export import (
    _encode_prediction_batch,
    build_prediction_records,
    make_source_row_key,
)


def example(*, target_label: int = 1, target_step: int = 356) -> PaySimCausalExample:
    return PaySimCausalExample(
        entity_id="C-recipient-test",
        source_row_ordinal=100,
        target_step=target_step,
        target_type="TRANSFER",
        target_amount=100.0,
        target_label=target_label,
        split="test",
        history=(),
    )


class PaySimPredictionExportTests(unittest.TestCase):
    archive_sha256 = "a" * 64
    csv_member = "PS_20174392719_1491204439457_log.csv"

    def test_row_key_is_deterministic_and_unique_by_source_row(self) -> None:
        first = make_source_row_key(self.archive_sha256, self.csv_member, 42)
        repeated = make_source_row_key(self.archive_sha256, self.csv_member, 42)
        different_row = make_source_row_key(self.archive_sha256, self.csv_member, 43)
        different_archive = make_source_row_key("b" * 64, self.csv_member, 42)

        self.assertEqual(first, repeated)
        self.assertEqual(len({first, different_row, different_archive}), 3)

    def test_batch_preserves_source_row_and_step_metadata_without_changing_inputs(self) -> None:
        first = replace(example(target_step=356), source_row_ordinal=101, split="test")
        second = replace(example(target_step=357), source_row_ordinal=202, split="test")
        tokens, masks, ordinals, steps, splits = _encode_prediction_batch([first, second])
        expected_tokens, expected_masks, _labels = encode_sequence_batch([first, second])

        np.testing.assert_array_equal(tokens, expected_tokens)
        np.testing.assert_array_equal(masks, expected_masks)
        np.testing.assert_array_equal(ordinals, [101, 202])
        np.testing.assert_array_equal(steps, [356, 357])
        self.assertEqual(splits, ("test", "test"))

    def test_records_apply_frozen_thresholds_before_adding_evaluation_labels(self) -> None:
        examples = [
            replace(example(target_step=356, target_label=1), source_row_ordinal=900, split="test"),
            replace(example(target_step=357, target_label=0), source_row_ordinal=901, split="test"),
        ]
        thresholds = {name: 0.5 for name in MODEL_KEYS}
        scores = {
            "current_only_control": np.asarray([0.5, 0.49]),
            "temporal_baseline": np.asarray([0.6, 0.4]),
            "temporal_transformer": np.asarray([0.3, 0.7]),
        }

        records = build_prediction_records(
            examples,
            scores,
            thresholds,
            archive_sha256=self.archive_sha256,
            csv_member=self.csv_member,
        )

        self.assertEqual(len(records), 2)
        self.assertEqual([record["source_data_row_ordinal"] for record in records], [900, 901])
        self.assertEqual([record["ground_truth_label_evaluation_only"] for record in records], [1, 0])
        self.assertEqual(records[0]["current_only_control_prediction"], 1)
        self.assertEqual(records[1]["current_only_control_prediction"], 0)
        self.assertEqual(records[0]["temporal_baseline_prediction"], 1)
        self.assertEqual(records[1]["temporal_transformer_prediction"], 1)
        self.assertTrue(all(record["target_split"] == "test" for record in records))

    def test_records_reject_non_test_rows_and_non_finite_scores(self) -> None:
        thresholds = {name: 0.5 for name in MODEL_KEYS}
        finite_scores = {name: np.asarray([0.7]) for name in MODEL_KEYS}
        train_example = replace(example(target_step=280), source_row_ordinal=10, split="train")
        with self.assertRaisesRegex(ValueError, "test targets only"):
            build_prediction_records(
                [train_example],
                finite_scores,
                thresholds,
                archive_sha256=self.archive_sha256,
                csv_member=self.csv_member,
            )

        test_example = replace(example(target_step=356), source_row_ordinal=11, split="test")
        invalid_scores = dict(finite_scores)
        invalid_scores["temporal_transformer"] = np.asarray([np.nan])
        with self.assertRaisesRegex(ValueError, "finite and aligned"):
            build_prediction_records(
                [test_example],
                invalid_scores,
                thresholds,
                archive_sha256=self.archive_sha256,
                csv_member=self.csv_member,
            )


if __name__ == "__main__":
    unittest.main()
