from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml import paysim_temporal
from layernet_ml.paysim_data import PaySimCausalExample, PaySimHistoryEvent, PaySimHistoryStep
from layernet_ml.paysim_temporal import PaySimTemporalTransformer
from layernet_ml.paysim_transformer_seeds import (
    CONFIG_PATH,
    PREREG_PATH,
    check_reproduction,
    describe,
    paired_comparison,
    save_transformer,
    load_transformer,
    train_transformer_seed,
    verify_preregistration,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


class FakeReader:
    """Minimal stand-in for PaySimSequenceReader: a fixed list of train examples and the audit count."""

    def __init__(self, examples: list[PaySimCausalExample]) -> None:
        self._examples = examples
        self.audit = {"splits": [{"name": "train", "customer_recipient_targets": len(examples)}]}

    def iter_examples(self, splits=None):  # noqa: ANN001 - mirrors the reader signature
        yield from (example for example in self._examples if splits is None or example.split in splits)


def fake_examples(count: int = 300) -> list[PaySimCausalExample]:
    rng = np.random.default_rng(7)
    types = ("CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER")
    examples = []
    for index in range(count):
        history = tuple(
            PaySimHistoryStep(step_gap=int(gap), events=(PaySimHistoryEvent(types[int(rng.integers(5))], float(rng.uniform(1, 5000))),))
            for gap in sorted(rng.choice(np.arange(1, 40), size=int(rng.integers(0, 5)), replace=False), reverse=True)
        )
        examples.append(
            PaySimCausalExample(
                entity_id=f"C{index}",
                source_row_ordinal=index,
                target_step=50,
                target_type=types[int(rng.integers(5))],
                target_amount=float(rng.uniform(1, 9000)),
                target_label=int(index % 10 == 0),
                split="train",
                history=history,
            )
        )
    return examples


class TransformerSeedReplicationTests(unittest.TestCase):
    def test_seed_42_training_is_identical_to_the_phase12_training_loop(self) -> None:
        reader = FakeReader(fake_examples())
        original = paysim_temporal._train_transformer(reader, 270, 30)  # type: ignore[arg-type]
        replica, losses, _seconds = train_transformer_seed(reader, 270, 30, 42)  # type: ignore[arg-type]
        for key, value in original.state_dict().items():
            self.assertTrue(torch.equal(value, replica.state_dict()[key]), key)
        self.assertEqual(original._layernet_epoch_losses, losses)  # type: ignore[attr-defined]

    def test_different_seeds_give_different_models_and_the_same_seed_repeats(self) -> None:
        reader = FakeReader(fake_examples(120))
        first, _, _ = train_transformer_seed(reader, 108, 12, 123)  # type: ignore[arg-type]
        again, _, _ = train_transformer_seed(reader, 108, 12, 123)  # type: ignore[arg-type]
        other, _, _ = train_transformer_seed(reader, 108, 12, 2026)  # type: ignore[arg-type]
        weight = "output_head.weight"
        self.assertTrue(torch.equal(first.state_dict()[weight], again.state_dict()[weight]))
        self.assertFalse(torch.equal(first.state_dict()[weight], other.state_dict()[weight]))

    def test_saved_artifacts_are_hash_checked_on_reload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            torch.manual_seed(1)
            digest = save_transformer(path, PaySimTemporalTransformer(), 1, [0.5])
            self.assertIsInstance(load_transformer(path, digest), PaySimTemporalTransformer)
            with self.assertRaises(ValueError):
                load_transformer(path, "0" * 64)

    def test_preregistration_must_quote_the_exact_configuration_hash(self) -> None:
        config, config_hash, _ = verify_preregistration(REPO_ROOT / CONFIG_PATH, REPO_ROOT / PREREG_PATH)
        self.assertEqual(config["seeds"], [42, 123, 2026])
        self.assertEqual(len(config_hash), 64)
        with tempfile.TemporaryDirectory() as directory:
            config_copy = Path(directory) / "config.json"
            shutil.copyfile(REPO_ROOT / CONFIG_PATH, config_copy)
            config_copy.write_text(config_copy.read_text(encoding="utf-8") + " ", encoding="utf-8")
            with self.assertRaises(ValueError):
                verify_preregistration(config_copy, REPO_ROOT / PREREG_PATH)

    def test_reproduction_check_reports_matches_and_mismatches(self) -> None:
        expected = {"average_precision": 0.0149986165289, "true_positives": 427}
        good = check_reproduction({"average_precision": 0.014998616528907374, "true_positives": 427}, expected)
        bad = check_reproduction({"average_precision": 0.0151, "true_positives": 426}, expected)
        self.assertTrue(good["matches"])
        self.assertFalse(bad["matches"])
        self.assertFalse(bad["comparisons"]["true_positives"]["match"])

    def test_paired_comparison_reports_a_descriptive_interval_and_whether_it_includes_zero(self) -> None:
        result = paired_comparison({42: 0.15, 123: 0.10, 2026: 0.20}, {42: 0.08, 123: 0.04, 2026: 0.11})
        self.assertEqual(result["seeds"], [42, 123, 2026])
        np.testing.assert_allclose(result["values"], [0.07, 0.06, 0.09])
        self.assertAlmostEqual(result["mean"], 0.07333333333333333)
        low, high = result["descriptive_95_percent_student_t_interval"]
        self.assertLess(low, result["mean"])
        self.assertGreater(high, result["mean"])
        self.assertFalse(result["interval_includes_zero"])
        mixed = paired_comparison({1: 0.1, 2: 0.0}, {1: 0.0, 2: 0.1})
        self.assertTrue(mixed["interval_includes_zero"])
        with self.assertRaises(ValueError):
            paired_comparison({1: 0.1}, {2: 0.1})

    def test_describe_omits_spread_for_a_single_value(self) -> None:
        self.assertEqual(describe([0.5]), {"values": [0.5], "mean": 0.5})


if __name__ == "__main__":
    unittest.main()
