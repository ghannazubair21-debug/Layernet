from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.ieee_data import validate_ieee_cis


class IeeeCisIntakeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp_dir.name)
        self.transactions_path = self.directory / "train_transaction.csv"
        self.identity_path = self.directory / "train_identity.csv"
        self._write_fixture()

    def _write_fixture(self) -> None:
        transactions = pd.DataFrame(
            {
                "TransactionID": range(100, 115),
                "isFraud": [0, 1] * 7 + [0],
                "TransactionDT": [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12, 13, 14],
                "TransactionAmt": [float(index + 1) for index in range(15)],
                "card1": [1000] * 15,
            }
        )
        identity = pd.DataFrame(
            {
                "TransactionID": [100, 104, 109],
                "DeviceType": ["desktop", None, "mobile"],
                "DeviceInfo": ["browser-a", None, "browser-b"],
            }
        )
        transactions.to_csv(self.transactions_path, index=False)
        identity.to_csv(self.identity_path, index=False)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_reports_real_file_hashes_schema_coverage_and_ordered_split_ranges(self) -> None:
        report = validate_ieee_cis(self.transactions_path, self.identity_path)

        self.assertEqual(report["transaction_count"], 15)
        self.assertEqual(report["identity_join"]["transactions_with_identity_row"], 3)
        self.assertEqual(report["identity_join"]["transactions_without_identity_row"], 12)
        availability = report["feature_availability"]
        self.assertEqual(availability["groups"]["device_context"]["DeviceType"]["missing_transactions"], 13)
        self.assertTrue(availability["groups"]["card_attributes"]["card1"]["available_in_schema"])
        self.assertFalse(availability["groups"]["transaction_product_context"]["ProductCD"]["available_in_schema"])
        self.assertEqual(availability["groups"]["coded_address_attributes"]["addr1"]["missing_transactions"], 15)
        self.assertFalse(availability["groups"]["identity_auxiliary_fields"]["id_12"]["available_in_schema"])
        self.assertEqual(availability["transactions_with_card_and_device_fields"], 2)
        splits = report["chronological_splits"]
        self.assertEqual([split["name"] for split in splits], ["train", "validation", "test"])
        self.assertEqual(sum(split["rows"] for split in splits), 15)
        self.assertLess(splits[0]["time_end"], splits[1]["time_start"])
        self.assertLess(splits[1]["time_end"], splits[2]["time_start"])
        self.assertEqual(splits[0]["rows"], 10)
        self.assertEqual(sum(split["feature_availability"]["transactions_with_card_and_device_fields"] for split in splits), 2)
        self.assertEqual(len(report["files"]["transactions"]["sha256"]), 64)
        self.assertIn("no model or performance results", report["scope"])
        self.assertTrue(report["time_range"]["source_rows_chronological"])

    def test_sorts_shuffled_source_rows_before_chronological_split(self) -> None:
        transactions = pd.read_csv(self.transactions_path).sample(frac=1, random_state=1)
        transactions.to_csv(self.transactions_path, index=False)

        report = validate_ieee_cis(self.transactions_path, self.identity_path)

        self.assertFalse(report["time_range"]["source_rows_chronological"])
        splits = report["chronological_splits"]
        self.assertLess(splits[0]["time_end"], splits[1]["time_start"])
        self.assertLess(splits[1]["time_end"], splits[2]["time_start"])

    def test_rejects_duplicate_transaction_ids_and_unknown_identity_ids(self) -> None:
        transactions = pd.read_csv(self.transactions_path)
        transactions.loc[1, "TransactionID"] = 100
        transactions.to_csv(self.transactions_path, index=False)
        with self.assertRaisesRegex(ValueError, "duplicate TransactionID"):
            validate_ieee_cis(self.transactions_path, self.identity_path)

        self._write_fixture()
        identity = pd.read_csv(self.identity_path)
        identity.loc[0, "TransactionID"] = 999
        identity.to_csv(self.identity_path, index=False)
        with self.assertRaisesRegex(ValueError, "absent from transactions"):
            validate_ieee_cis(self.transactions_path, self.identity_path)

    def test_rejects_non_binary_labels_and_invalid_relative_time(self) -> None:
        transactions = pd.read_csv(self.transactions_path)
        transactions.loc[0, "isFraud"] = 2
        transactions.to_csv(self.transactions_path, index=False)
        with self.assertRaisesRegex(ValueError, "binary labels"):
            validate_ieee_cis(self.transactions_path, self.identity_path)

        self._write_fixture()
        transactions = pd.read_csv(self.transactions_path)
        transactions.loc[0, "TransactionDT"] = -1
        transactions.to_csv(self.transactions_path, index=False)
        with self.assertRaisesRegex(ValueError, "relative time"):
            validate_ieee_cis(self.transactions_path, self.identity_path)


if __name__ == "__main__":
    unittest.main()
