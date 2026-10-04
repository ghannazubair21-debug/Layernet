from __future__ import annotations

import hashlib
import inspect
import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.contracts import ExperimentConfig
from layernet_ml.evaluation import evaluate_scores
from layernet_ml.paysim_data import (
    PAYSIM_ARCHIVE_SHA256,
    PAYSIM_DATASET_SCHEMA_VERSION,
    PAYSIM_SEQUENCE_SCHEMA_VERSION,
    PAYSIM_TYPES,
    SPLIT_BOUNDARIES,
    PaySimCausalExample,
    PaySimHistoryEvent,
    PaySimHistoryStep,
)
from layernet_ml.paysim_temporal import (
    HISTORY_BUCKET_FEATURES,
    MODEL_INPUT_WIDTH,
    SEQUENCE_TOKEN_COUNT,
    TEMPORAL_FEATURE_SCHEMA_VERSION,
    TEMPORAL_RANDOM_SEED,
    TRANSFORMER_CONFIG,
    PaySimTemporalTransformer,
    choose_validation_f1_threshold,
    encode_sequence_batch,
    encode_sequence_example,
    verify_temporal_artifact_manifest,
)


def example(*, target_label: int = 1, target_step: int = 282) -> PaySimCausalExample:
    return PaySimCausalExample(
        entity_id="C-recipient-001",
        target_step=target_step,
        target_type="TRANSFER",
        target_amount=100.0,
        target_label=target_label,
        split="validation" if target_step == 282 else "train",
        history=(
            PaySimHistoryStep(
                step_gap=3,
                events=(
                    PaySimHistoryEvent("CASH_OUT", 5.0),
                    PaySimHistoryEvent("PAYMENT", 9.0),
                ),
            ),
        ),
    )


class PaySimTemporalExperimentTests(unittest.TestCase):
    def test_fixed_input_shape_and_allowed_features_keep_target_separate(self) -> None:
        target = example(target_label=1)
        tokens, padding = encode_sequence_example(target)
        relabeled_tokens, _ = encode_sequence_example(replace(target, target_label=0))

        self.assertEqual(tokens.shape, (18, 7))
        self.assertEqual(padding.shape, (18,))
        self.assertEqual(MODEL_INPUT_WIDTH, 7)
        self.assertEqual(SEQUENCE_TOKEN_COUNT, 18)
        self.assertNotIn("isFraud", HISTORY_BUCKET_FEATURES)
        self.assertNotIn("isFlaggedFraud", HISTORY_BUCKET_FEATURES)
        self.assertNotIn("nameDest", HISTORY_BUCKET_FEATURES)
        np.testing.assert_array_equal(tokens, relabeled_tokens)
        np.testing.assert_array_equal(padding[:16], np.ones(16, dtype=np.bool_))
        self.assertFalse(padding[16:].any())
        self.assertAlmostEqual(float(tokens[16, 1]), np.log1p(1.0))
        self.assertAlmostEqual(float(tokens[16, 3]), np.log1p(1.0))
        self.assertAlmostEqual(float(tokens[16, -1]), 3 / 743)
        self.assertAlmostEqual(float(tokens[17, 4]), np.log1p(1.0))

    def test_empty_history_is_deterministically_left_padded_and_current_token_unmasked(self) -> None:
        empty = replace(example(), history=())
        first_tokens, first_mask = encode_sequence_example(empty)
        second_tokens, second_mask = encode_sequence_example(empty)

        np.testing.assert_array_equal(first_tokens, second_tokens)
        np.testing.assert_array_equal(first_mask, second_mask)
        self.assertTrue(first_mask[:-1].all())
        self.assertFalse(first_mask[-1])
        self.assertFalse(first_tokens[:-1].any())

    def test_batch_targets_are_separate_and_model_output_shape_is_binary_logit(self) -> None:
        batch = [example(target_label=0), example(target_label=1)]
        tokens, masks, labels = encode_sequence_batch(batch)
        model = PaySimTemporalTransformer().eval()
        with torch.no_grad():
            scores = model(torch.from_numpy(tokens), torch.from_numpy(masks))

        self.assertEqual(tokens.shape, (2, 18, 7))
        self.assertEqual(masks.shape, (2, 18))
        np.testing.assert_array_equal(labels, [0, 1])
        self.assertEqual(tuple(scores.shape), (2,))

    def test_transformer_configuration_and_experiment_contract_are_explicit(self) -> None:
        first = json.dumps(TRANSFORMER_CONFIG, sort_keys=True)
        second = json.dumps(dict(TRANSFORMER_CONFIG), sort_keys=True)
        self.assertEqual(first, second)
        self.assertEqual(TEMPORAL_RANDOM_SEED, 42)
        self.assertEqual(TRANSFORMER_CONFIG["layers"], 1)
        self.assertEqual(TRANSFORMER_CONFIG["attention_heads"], 2)
        config = ExperimentConfig(
            experiment_id="test-paysim-sequence",
            model_families=("sequence_baseline", "transformer"),
            input_modality="sequence",
            dataset_schema_version=PAYSIM_DATASET_SCHEMA_VERSION,
            feature_schema_version=TEMPORAL_FEATURE_SCHEMA_VERSION,
            random_seed=TEMPORAL_RANDOM_SEED,
        )
        self.assertEqual(config.input_modality, "sequence")

    def test_causal_gaps_and_split_boundaries_are_checked_before_model_encoding(self) -> None:
        encoded, _ = encode_sequence_example(example(target_step=282))
        self.assertAlmostEqual(float(encoded[16, -1]), 3 / 743)
        self.assertEqual(SPLIT_BOUNDARIES, {"train": (1, 281), "validation": (282, 355), "test": (356, 743)})
        invalid = replace(
            example(),
            history=(PaySimHistoryStep(step_gap=0, events=(PaySimHistoryEvent("PAYMENT", 1.0),)),),
        )
        with self.assertRaisesRegex(ValueError, "strictly earlier"):
            encode_sequence_example(invalid)

    def test_threshold_selector_accepts_validation_vectors_only_and_uses_f1_rule(self) -> None:
        selector_parameters = tuple(inspect.signature(choose_validation_f1_threshold).parameters)
        self.assertEqual(selector_parameters, ("labels", "scores"))
        threshold, selection = choose_validation_f1_threshold(
            np.asarray([0, 0, 1, 1]), np.asarray([0.1, 0.4, 0.35, 0.8])
        )
        self.assertAlmostEqual(threshold, 0.35)
        self.assertEqual(selection["source_split"], "validation")
        self.assertEqual(selection["metric"], "F1")
        self.assertIn("ties prefer higher precision", selection["procedure"])

    def test_artifact_manifest_hashes_and_threshold_records_are_consistent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_records: dict[str, dict[str, object]] = {}
            for index, name in enumerate(("current_only_control", "temporal_baseline", "temporal_transformer")):
                artifact_name = f"{name}.model"
                artifact = root / artifact_name
                artifact.write_bytes(f"fixture-model-{index}".encode())
                threshold = 0.25 + index / 10
                fixture_metrics = evaluate_scores([0, 1], [0.1, 0.9], threshold)
                model_records[name] = {
                    "artifact": artifact_name,
                    "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                    "threshold": threshold,
                    "threshold_selection": {"source_split": "validation", "selected_threshold": threshold},
                    "validation_metrics": fixture_metrics,
                    "test_metrics": fixture_metrics,
                }
            manifest = {
                "dataset": {"archive_sha256": PAYSIM_ARCHIVE_SHA256},
                "sequence_contract_version": PAYSIM_SEQUENCE_SCHEMA_VERSION,
                "feature_schema_version": TEMPORAL_FEATURE_SCHEMA_VERSION,
                "split_boundaries": {
                    name: {"step_start": bounds[0], "step_end": bounds[1]}
                    for name, bounds in SPLIT_BOUNDARIES.items()
                },
                "models": model_records,
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            verified = verify_temporal_artifact_manifest(root)
            self.assertEqual(set(verified["models"]), set(model_records))
            (root / "temporal_baseline.model").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "hash is missing or inconsistent"):
                verify_temporal_artifact_manifest(root)


if __name__ == "__main__":
    unittest.main()
