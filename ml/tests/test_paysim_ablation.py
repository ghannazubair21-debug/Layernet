from __future__ import annotations

import csv
import gzip
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.paysim_ablation import (
    _windows_memory_bytes,
    _score_split,
    _verify_prediction_csv,
    _write_prediction_csv,
    apply_frozen_threshold,
    make_arm_features,
    summarize_paired_differences,
)
from layernet_ml.paysim_data import (
    PAYSIM_ARCHIVE_SHA256,
    PAYSIM_CSV_MEMBER,
    PaySimCausalExample,
    PaySimHistoryEvent,
    PaySimHistoryStep,
)
from layernet_ml.paysim_temporal import encode_sequence_batch, make_sgd_classifier


def example(
    *, label: int, history: tuple[PaySimHistoryStep, ...], source_row_ordinal: int = 25
) -> PaySimCausalExample:
    return PaySimCausalExample(
        entity_id="C-test-recipient",
        source_row_ordinal=source_row_ordinal,
        target_step=356,
        target_type="TRANSFER",
        target_amount=120.0,
        target_label=label,
        split="test",
        history=history,
    )


class PaySimHistoryAblationTests(unittest.TestCase):
    def test_paired_arms_share_current_features_and_only_history_arm_sees_history(self) -> None:
        no_history = example(label=0, history=())
        with_history = example(
            label=1,
            history=(
                PaySimHistoryStep(
                    step_gap=4,
                    events=(PaySimHistoryEvent("CASH_OUT", 50.0),),
                ),
            ),
        )
        tokens, _masks, _labels = encode_sequence_batch([no_history, with_history])
        current, history = make_arm_features(tokens)

        np.testing.assert_array_equal(current[0], current[1])
        self.assertEqual(current.shape, (2, 7))
        self.assertEqual(history.shape, (2, 18 * 7))
        self.assertFalse(np.array_equal(history[0], history[1]))

    def test_target_label_changes_do_not_change_either_arm_input(self) -> None:
        item = example(label=0, history=())
        relabeled = example(label=1, history=())
        first, _mask_a, _labels_a = encode_sequence_batch([item])
        second, _mask_b, _labels_b = encode_sequence_batch([relabeled])
        current_a, history_a = make_arm_features(first)
        current_b, history_b = make_arm_features(second)
        np.testing.assert_array_equal(current_a, current_b)
        np.testing.assert_array_equal(history_a, history_b)

    def test_both_arms_use_same_sgd_model_parameters_and_seed(self) -> None:
        first = make_sgd_classifier(792.4356404635139, seed=123)
        second = make_sgd_classifier(792.4356404635139, seed=123)
        self.assertEqual(first.get_params(deep=False), second.get_params(deep=False))
        self.assertEqual(first.random_state, 123)
        self.assertEqual(second.random_state, 123)

    def test_frozen_threshold_is_inclusive_and_rejects_invalid_scores(self) -> None:
        predictions = apply_frozen_threshold(np.asarray([0.49, 0.5, 0.51]), 0.5)
        np.testing.assert_array_equal(predictions, np.asarray([0, 1, 1], dtype=np.int8))
        with self.assertRaisesRegex(ValueError, "finite"):
            apply_frozen_threshold(np.asarray([0.1, np.nan]), 0.5)

    def test_paired_uncertainty_uses_seed_level_differences(self) -> None:
        base = {
            "average_precision": 0.1,
            "pr_auc": 0.09,
            "roc_auc": 0.8,
            "precision_at_threshold": 0.2,
            "recall_at_threshold": 0.3,
            "f1_at_threshold": 0.24,
            "threshold": 0.5,
            "true_positives": 3,
            "true_negatives": 70,
            "false_positives": 8,
            "false_negatives": 7,
        }
        history = {**base, "average_precision": 0.2, "true_positives": 4}
        result = summarize_paired_differences(
            {
                42: {"current_only": base, "history_enabled": history},
                123: {"current_only": base, "history_enabled": history},
                2026: {"current_only": base, "history_enabled": history},
            }
        )
        self.assertEqual(result["unit_of_analysis"], "paired seed-level differences")
        self.assertEqual(result["metrics"]["average_precision"]["paired_differences"], [0.1, 0.1, 0.1])
        self.assertAlmostEqual(result["metrics"]["average_precision"]["sample_standard_deviation"], 0.0, places=15)
        self.assertEqual(len(result["metrics"]["average_precision"]["two_sided_95_percent_student_t_interval"]), 2)

    @unittest.skipUnless(sys.platform == "win32", "Windows process-memory API is platform-specific")
    def test_windows_memory_sampler_returns_process_counters(self) -> None:
        memory = _windows_memory_bytes()
        self.assertIsNotNone(memory)
        self.assertGreater(memory["working_set_bytes"], 0)
        self.assertGreaterEqual(memory["peak_working_set_bytes"], memory["working_set_bytes"])

    def test_scoring_and_export_preserve_deterministic_non_monotonic_source_ordinals(self) -> None:
        class Reader:
            def iter_examples(self, _splits):
                return iter(
                    [
                        example(label=0, history=(), source_row_ordinal=29),
                        example(label=1, history=(), source_row_ordinal=12),
                    ]
                )

        class ScoreModel:
            def decision_function(self, features):
                return np.asarray(features[:, 0], dtype=np.float64)

        models = {42: {"current_only": ScoreModel(), "history_enabled": ScoreModel()}}
        labels, scores, metadata = _score_split(
            Reader(),
            "test",
            models,
            batch_size=2,
            expected_count=2,
            retain_metadata=True,
        )
        np.testing.assert_array_equal(metadata["ordinals"], np.asarray([29, 12]))

        thresholds = {"current_only": -1.0, "history_enabled": -1.0}
        config = {"dataset": {"archive_sha256": PAYSIM_ARCHIVE_SHA256, "csv_member": PAYSIM_CSV_MEMBER}}
        with tempfile.TemporaryDirectory() as directory:
            export_path = Path(directory) / "test-predictions.csv.gz"
            _write_prediction_csv(
                export_path,
                seed=42,
                labels=labels,
                scores=scores[42],
                thresholds=thresholds,
                ordinals=metadata["ordinals"],
                steps=metadata["steps"],
                config=config,
                check_unique_keys=True,
            )
            with gzip.open(export_path, "rt", encoding="utf-8", newline="") as source:
                exported_rows = list(csv.DictReader(source))
            self.assertEqual([int(row["source_data_row_ordinal"]) for row in exported_rows], [29, 12])
            self.assertEqual(len({row["row_key"] for row in exported_rows}), 2)
            _verify_prediction_csv(
                export_path,
                expected_seed=42,
                expected_labels=labels,
                expected_scores=scores[42],
                thresholds=thresholds,
                expected_ordinals=metadata["ordinals"],
                expected_steps=metadata["steps"],
                config=config,
            )


if __name__ == "__main__":
    unittest.main()
