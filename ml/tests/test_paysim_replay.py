from __future__ import annotations

import csv
import hashlib
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.paysim_data import (
    PAYSIM_COLUMNS,
    PAYSIM_CSV_MEMBER,
    PAYSIM_TYPES,
    PaySimSequenceReader,
    validate_paysim_archive,
)


def _write_archive(path: Path, rows: list[dict[str, object]]) -> str:
    text = io.StringIO(newline="")
    writer = csv.DictWriter(text, fieldnames=PAYSIM_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(PAYSIM_CSV_MEMBER, text.getvalue())
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _row(step: int, *, fraud: str = "0") -> dict[str, object]:
    return {
        "step": step,
        "type": PAYSIM_TYPES[(step - 1) % len(PAYSIM_TYPES)],
        "amount": float(step),
        "nameOrig": "C-origin",
        "oldbalanceOrg": 0.0,
        "newbalanceOrig": 0.0,
        "nameDest": "C-recipient",
        "oldbalanceDest": 0.0,
        "newbalanceDest": 0.0,
        "isFraud": fraud,
        "isFlaggedFraud": "not-parsed",
    }


class PaySimReplaySafetyTests(unittest.TestCase):
    def test_label_blind_preflight_does_not_parse_fraud_or_rule_flag_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim-label-blind.zip"
            rows = [_row(step, fraud="not-parsed") for step in range(1, 744)]
            archive_hash = _write_archive(archive_path, rows)

            audit = validate_paysim_archive(
                archive_path,
                expected_sha256=archive_hash,
                chunksize=113,
                label_blind=True,
            )

            self.assertEqual(audit["schema"]["label_columns_parsed"], False)
            self.assertEqual(audit["schema"]["row_count"], 743)
            self.assertNotIn("fraud_label_count", audit["schema"])
            self.assertNotIn("fraud_labels", audit["splits"][0])
            with self.assertRaisesRegex(ValueError, "not-parsed"):
                validate_paysim_archive(
                    archive_path,
                    expected_sha256=archive_hash,
                    chunksize=113,
                )

    def test_validation_stream_stops_at_exact_split_row_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim-validation-boundary.zip"
            rows = [
                _row(1),
                _row(282, fraud="1"),
                _row(355),
                _row(356, fraud="future-test-label-must-not-be-read"),
            ]
            archive_hash = _write_archive(archive_path, rows)
            reader = PaySimSequenceReader(
                archive_path,
                {"sequence_contract": {"maximum_sequence_length": 17}},
                {
                    "source": {"archive_sha256": archive_hash},
                    "splits": [
                        {"name": "train", "rows": 1},
                        {"name": "validation", "rows": 2},
                        {"name": "test", "rows": 1},
                    ],
                },
                chunksize=2,
            )

            examples = list(reader.iter_examples({"validation"}))

            self.assertEqual([example.target_step for example in examples], [282, 355])
            self.assertEqual([example.target_label for example in examples], [1, 0])


if __name__ == "__main__":
    unittest.main()
