from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.paysim_data import (
    PAYSIM_COLUMNS,
    PAYSIM_CSV_MEMBER,
    PAYSIM_MAX_SEQUENCE_LENGTH,
    _CausalSequenceBuilder,
    _iter_complete_step_frames,
    _iter_validated_archive_sequences,
    iter_causal_examples,
    load_paysim_sequence_contract,
    split_for_step,
    validate_paysim_archive,
)


def make_sequence_frame() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"step": 1, "type": "PAYMENT", "amount": 12.0, "nameDest": "C001", "isFraud": 0, "isFlaggedFraud": 0},
            {"step": 1, "type": "CASH_OUT", "amount": 8.0, "nameDest": "C001", "isFraud": 1, "isFlaggedFraud": 1},
            {"step": 1, "type": "PAYMENT", "amount": 50.0, "nameDest": "M001", "isFraud": 0, "isFlaggedFraud": 0},
            {"step": 2, "type": "TRANSFER", "amount": 7.0, "nameDest": "C001", "isFraud": 0, "isFlaggedFraud": 0},
            {"step": 2, "type": "DEBIT", "amount": 5.0, "nameDest": "C001", "isFraud": 0, "isFlaggedFraud": 0},
            {"step": 3, "type": "CASH_IN", "amount": 4.0, "nameDest": "C002", "isFraud": 0, "isFlaggedFraud": 0},
            {"step": 282, "type": "PAYMENT", "amount": 10.0, "nameDest": "C001", "isFraud": 1, "isFlaggedFraud": 0},
            {"step": 356, "type": "CASH_OUT", "amount": 9.0, "nameDest": "C001", "isFraud": 0, "isFlaggedFraud": 0},
        ]
    )


def make_archive_fixture(path: Path) -> str:
    rows: list[dict[str, object]] = []
    for step in range(1, 744):
        customer_rows: list[dict[str, object]] = []
        if step == 1:
            customer_rows = [
                {"type": "PAYMENT", "amount": 12.0, "nameDest": "C001", "isFraud": 0},
                {"type": "CASH_OUT", "amount": 8.0, "nameDest": "C001", "isFraud": 1},
            ]
        elif step == 2:
            customer_rows = [
                {"type": "TRANSFER", "amount": 7.0, "nameDest": "C001", "isFraud": 0},
                {"type": "DEBIT", "amount": 5.0, "nameDest": "C001", "isFraud": 0},
            ]
        elif step in (282, 356):
            customer_rows = [
                {"type": "PAYMENT", "amount": 10.0, "nameDest": "C001", "isFraud": int(step == 282)}
            ]
        if not customer_rows:
            customer_rows = [
                {
                    "type": "CASH_IN" if step == 4 else "PAYMENT",
                    "amount": float(step),
                    "nameDest": "M001",
                    "isFraud": 0,
                }
            ]
        for index, customer in enumerate(customer_rows):
            rows.append(
                {
                    "step": step,
                    "type": customer["type"],
                    "amount": customer["amount"],
                    "nameOrig": f"C{step:03d}{index:02d}",
                    "oldbalanceOrg": 100.0,
                    "newbalanceOrig": 90.0,
                    "nameDest": customer["nameDest"],
                    "oldbalanceDest": 50.0,
                    "newbalanceDest": 60.0,
                    "isFraud": customer["isFraud"],
                    "isFlaggedFraud": 0,
                }
            )
    frame = pd.DataFrame(rows, columns=PAYSIM_COLUMNS)
    csv_bytes = frame.to_csv(index=False).encode("utf-8")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(PAYSIM_CSV_MEMBER, csv_bytes)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PaySimCausalSequenceTests(unittest.TestCase):
    def test_phase10_contract_is_loaded_and_split_edges_are_exact(self) -> None:
        contract = load_paysim_sequence_contract()
        self.assertEqual(contract["sequence_contract"]["maximum_sequence_length"], PAYSIM_MAX_SEQUENCE_LENGTH)
        self.assertEqual(split_for_step(1), "train")
        self.assertEqual(split_for_step(281), "train")
        self.assertEqual(split_for_step(282), "validation")
        self.assertEqual(split_for_step(355), "validation")
        self.assertEqual(split_for_step(356), "test")
        self.assertEqual(split_for_step(743), "test")
        self.assertTrue(contract["sequence_contract"]["target_label"].startswith("isFraud"))

    def test_history_is_strictly_past_and_same_step_events_are_simultaneous(self) -> None:
        examples = list(iter_causal_examples(make_sequence_frame(), max_sequence_length=10))
        same_step_targets = [example for example in examples if example.entity_id == "C001" and example.target_step == 1]
        self.assertEqual(len(same_step_targets), 2)
        self.assertTrue(all(example.history == () for example in same_step_targets))

        step_two = [example for example in examples if example.entity_id == "C001" and example.target_step == 2]
        self.assertEqual(len(step_two), 2)
        for example in step_two:
            self.assertEqual(len(example.history), 1)
            self.assertEqual(example.history[0].step_gap, 1)
            self.assertEqual(len(example.history[0].events), 2)

        self.assertTrue(all(bucket.step_gap > 0 for example in examples for bucket in example.history))

    def test_history_inputs_exclude_labels_flags_balances_and_entity_identifiers(self) -> None:
        frame = make_sequence_frame()
        example = next(example for example in iter_causal_examples(frame, max_sequence_length=10) if example.entity_id == "C001" and example.target_step == 2)
        relabeled = frame.assign(isFraud=1 - frame["isFraud"])
        relabeled_example = next(
            example
            for example in iter_causal_examples(relabeled, max_sequence_length=10)
            if example.entity_id == "C001" and example.target_step == 2
        )
        self.assertEqual(example.entity_id, "C001")
        self.assertEqual(example.target_label, 0)
        self.assertNotEqual(example.target_label, relabeled_example.target_label)
        self.assertEqual(example.history, relabeled_example.history)
        history_event = example.history[0].events[0]
        self.assertEqual(set(history_event.__dataclass_fields__), {"transaction_type", "amount"})
        self.assertFalse(hasattr(history_event, "isFraud"))
        self.assertFalse(hasattr(history_event, "isFlaggedFraud"))
        self.assertFalse(hasattr(history_event, "nameDest"))
        self.assertFalse(hasattr(history_event, "oldbalanceOrg"))

    def test_only_customer_recipients_are_emitted_and_partition_history_is_causal(self) -> None:
        examples = list(iter_causal_examples(make_sequence_frame(), max_sequence_length=10))
        self.assertTrue(all(example.entity_id.startswith("C") for example in examples))
        self.assertFalse(any(example.entity_id == "M001" for example in examples))

        train_example = next(example for example in examples if example.entity_id == "C001" and example.target_step == 2)
        validation_example = next(
            example for example in examples if example.entity_id == "C001" and example.target_step == 282
        )
        test_example = next(example for example in examples if example.entity_id == "C001" and example.target_step == 356)
        self.assertEqual(train_example.split, "train")
        self.assertEqual(validation_example.split, "validation")
        self.assertEqual(test_example.split, "test")
        train_history_steps = [train_example.target_step - bucket.step_gap for bucket in train_example.history]
        validation_history_steps = [validation_example.target_step - bucket.step_gap for bucket in validation_example.history]
        test_history_steps = [test_example.target_step - bucket.step_gap for bucket in test_example.history]
        self.assertTrue(all(step < train_example.target_step for step in train_history_steps))
        self.assertTrue(all(step <= 281 for step in train_history_steps))
        self.assertEqual(validation_history_steps, [1, 2])
        self.assertEqual(test_history_steps, [1, 2, 282])
        for example in (train_example, validation_example, test_example):
            history_steps = [example.target_step - bucket.step_gap for bucket in example.history]
            self.assertTrue(all(step < example.target_step for step in history_steps))
        self.assertEqual([bucket.step_gap for bucket in validation_example.history], [281, 280])
        self.assertEqual([bucket.step_gap for bucket in test_example.history], [355, 354, 74])

    def test_order_truncation_and_reruns_are_deterministic(self) -> None:
        frame = make_sequence_frame()
        first = list(iter_causal_examples(frame, max_sequence_length=2))
        second = list(iter_causal_examples(frame, max_sequence_length=2))
        self.assertEqual(first, second)

        test_example = next(example for example in first if example.entity_id == "C001" and example.target_step == 356)
        self.assertEqual([bucket.step_gap for bucket in test_example.history], [354, 74])
        self.assertEqual(
            [event.transaction_type for event in test_example.history[-1].events],
            ["PAYMENT"],
        )

    def test_full_cap_retains_newest_whole_buckets_and_examples_remain_ragged(self) -> None:
        rows = [
            {"step": step, "type": "PAYMENT", "amount": float(step), "nameDest": "C001", "isFraud": 0}
            for step in range(1, 21)
        ]
        rows.append({"step": 3, "type": "TRANSFER", "amount": 3.5, "nameDest": "C001", "isFraud": 0})
        examples = list(iter_causal_examples(pd.DataFrame(rows), max_sequence_length=PAYSIM_MAX_SEQUENCE_LENGTH))
        self.assertTrue(all(len(example.history) <= PAYSIM_MAX_SEQUENCE_LENGTH for example in examples))
        first = next(example for example in examples if example.target_step == 1)
        second = next(example for example in examples if example.target_step == 2)
        last = next(example for example in examples if example.target_step == 20)
        self.assertEqual(first.history, ())
        self.assertEqual(len(second.history), 1)
        history_steps = [last.target_step - bucket.step_gap for bucket in last.history]
        self.assertEqual(history_steps, list(range(3, 20)))
        self.assertEqual(len(last.history[0].events), 2)

    def test_rejects_invalid_sequence_caps_and_non_customer_unknown_ids(self) -> None:
        with self.assertRaisesRegex(ValueError, "positive integer"):
            list(iter_causal_examples(make_sequence_frame(), max_sequence_length=0))
        invalid = make_sequence_frame()
        invalid.loc[0, "nameDest"] = "X001"
        with self.assertRaisesRegex(ValueError, "unrecognized"):
            list(iter_causal_examples(invalid, max_sequence_length=2))

    def test_archive_audit_handles_step_ties_across_chunks_and_reports_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim.zip"
            archive_hash = make_archive_fixture(archive_path)
            report = validate_paysim_archive(archive_path, expected_sha256=archive_hash, chunksize=1)

        self.assertEqual(report["schema"]["row_count"], 745)
        self.assertEqual(report["schema"]["step_min"], 1)
        self.assertEqual(report["schema"]["step_max"], 743)
        self.assertEqual(report["entity"]["customer_recipient_entities"], 1)
        self.assertEqual(report["entity"]["entities_with_multiple_distinct_steps"], 1)
        self.assertEqual(report["entity"]["customer_recipient_transaction_rows"], 6)
        self.assertEqual(report["entity"]["rows_with_at_least_one_strictly_earlier_entity_event"], 4)
        # Validation/test have longer histories, but the cap is selected from train-target histories only.
        self.assertEqual(report["sequence_contract"]["maximum_sequence_length"], 1)
        splits = report["splits"]
        self.assertEqual([part["name"] for part in splits], ["train", "validation", "test"])
        self.assertEqual([part["customer_recipient_targets"] for part in splits], [4, 1, 1])
        self.assertEqual([part["targets_with_prior_history"] for part in splits], [2, 1, 1])
        self.assertEqual([part["customer_recipient_fraud_targets"] for part in splits], [1, 1, 0])

    def test_chunked_sequence_loader_carries_entire_tied_steps(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim.zip"
            make_archive_fixture(archive_path)
            step_frames = list(_iter_complete_step_frames(archive_path, chunksize=1))
            builder = _CausalSequenceBuilder(max_sequence_length=PAYSIM_MAX_SEQUENCE_LENGTH)
            examples = [example for step_frame in step_frames for example in builder.add_step(step_frame)]

        self.assertEqual([int(frame["step"].iloc[0]) for frame in step_frames], list(range(1, 744)))
        first_step = step_frames[0]
        self.assertEqual(len(first_step), 2)
        customer_step_one = [example for example in examples if example.entity_id == "C001" and example.target_step == 1]
        self.assertEqual(len(customer_step_one), 2)
        self.assertTrue(all(example.history == () for example in customer_step_one))
        self.assertEqual(sum(example.entity_id.startswith("C") for example in examples), 6)

    def test_split_filtered_stream_keeps_context_but_emits_only_selected_targets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim.zip"
            make_archive_fixture(archive_path)
            validation = list(
                _iter_validated_archive_sequences(
                    archive_path,
                    PAYSIM_MAX_SEQUENCE_LENGTH,
                    chunksize=3,
                    target_splits=frozenset({"validation"}),
                )
            )
            test = list(
                _iter_validated_archive_sequences(
                    archive_path,
                    PAYSIM_MAX_SEQUENCE_LENGTH,
                    chunksize=3,
                    target_splits=frozenset({"test"}),
                )
            )
            train = list(
                _iter_validated_archive_sequences(
                    archive_path,
                    PAYSIM_MAX_SEQUENCE_LENGTH,
                    chunksize=3,
                    target_splits=frozenset({"train"}),
                )
            )

        self.assertEqual({example.split for example in validation}, {"validation"})
        self.assertEqual({example.split for example in test}, {"test"})
        self.assertTrue(all(example.split == "train" and example.target_step <= 281 for example in train))
        validation_example = validation[0]
        test_example = test[0]
        self.assertEqual(
            [validation_example.target_step - bucket.step_gap for bucket in validation_example.history],
            [1, 2],
        )
        self.assertEqual(
            [test_example.target_step - bucket.step_gap for bucket in test_example.history],
            [1, 2, 282],
        )

    def test_archive_audit_rejects_hash_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim.zip"
            archive_hash = make_archive_fixture(archive_path)
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                validate_paysim_archive(archive_path, expected_sha256="0" * 64)
            # ZIP payload is modified after recording its verified digest; a changed archive cannot pass the gate.
            archive_path.write_bytes(archive_path.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                validate_paysim_archive(archive_path, expected_sha256=archive_hash)

    def test_archive_audit_rejects_schema_mismatch_even_when_archive_hash_is_pinned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim-schema-mismatch.zip"
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(PAYSIM_CSV_MEMBER, "step,type,amount\n1,PAYMENT,2.0\n")
            archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "header differs"):
                validate_paysim_archive(archive_path, expected_sha256=archive_hash)

    def test_archive_audit_rejects_non_chronological_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "paysim-unsorted.zip"
            make_archive_fixture(archive_path)
            with zipfile.ZipFile(archive_path) as archive:
                frame = pd.read_csv(archive.open(PAYSIM_CSV_MEMBER))
            swapped = frame.iloc[[2, 0]].to_numpy(copy=True)
            frame.iloc[[0, 2]] = swapped
            csv_bytes = frame.to_csv(index=False).encode("utf-8")
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(PAYSIM_CSV_MEMBER, csv_bytes)
            archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "not chronological"):
                validate_paysim_archive(archive_path, expected_sha256=archive_hash, chunksize=1000)


if __name__ == "__main__":
    unittest.main()
