from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.benchmark_replay import (
    MAX_CSV_BYTES,
    MAX_COLUMNS,
    MAX_ROWS,
    BenchmarkInputError,
    ModelAvailabilityError,
    load_benchmark_bundle,
    load_default_bundles,
    main,
    parse_benchmark_csv,
    run_benchmark,
    validate_benchmark_frame,
)
from layernet_ml.data import FEATURE_COLUMNS, FEATURE_SCHEMA_VERSION
from layernet_ml.pipeline import sha256_file

ML_ROOT = Path(__file__).parents[1]
REAL_ARTIFACTS = ML_ROOT / "artifacts"
REAL_ULB_CSV = ML_ROOT / "data" / "raw" / "creditcard.csv"


def make_frame(rows: int = 4, with_labels: bool = True) -> pd.DataFrame:
    data: dict[str, object] = {
        "Time": [float(i * 10) for i in range(rows)],
        "Amount": [100.0 + i for i in range(rows)],
    }
    for index in range(1, 29):
        data[f"V{index}"] = [0.01 * index] * rows
    if with_labels:
        data["Class"] = [i % 2 for i in range(rows)]
    return pd.DataFrame(data)


def make_stub_estimator() -> LogisticRegression:
    rng = np.random.default_rng(42)
    features = rng.normal(size=(40, len(FEATURE_COLUMNS)))
    labels = (features[:, 0] > 0).astype(np.int64)
    model = LogisticRegression(max_iter=500)
    model.fit(features, labels)
    return model


def write_stub_artifact(
    root: Path,
    directory: str,
    filename: str,
    family: str,
    *,
    threshold: float = 0.5,
    corrupt_hash: bool = False,
    wrong_schema: bool = False,
) -> Path:
    artifact = root / directory
    artifact.mkdir(parents=True, exist_ok=True)
    model = make_stub_estimator()
    model_path = artifact / filename
    joblib.dump(model, model_path)
    model_hash = sha256_file(model_path)
    manifest = {
        "model_family": family,
        "model_version": model_hash[:16],
        "model_sha256": "0" * 64 if corrupt_hash else model_hash,
        "feature_schema_version": "wrong-schema" if wrong_schema else FEATURE_SCHEMA_VERSION,
        "feature_columns": list(FEATURE_COLUMNS),
        "decision_threshold": threshold,
        "score_semantics": "Uncalibrated stub score for tests.",
        "test_metrics": {"average_precision": 0.5},
    }
    (artifact / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return artifact


def make_stub_bundles() -> dict[str, tuple[object, dict[str, object]]]:
    bundles = {}
    for family in ("xgboost", "random_forest"):
        model = make_stub_estimator()
        manifest = {
            "model_family": family,
            "model_version": f"stub-{family}",
            "decision_threshold": 0.5,
            "score_semantics": "Uncalibrated stub score for tests.",
            "test_metrics": {"average_precision": 0.5},
        }
        bundles[family] = (model, manifest)
    return bundles


class BenchmarkValidationTests(unittest.TestCase):
    def test_csv_byte_cap_is_rejected_before_pandas_parses(self) -> None:
        with patch("layernet_ml.benchmark_replay.pd.read_csv") as read_csv:
            with self.assertRaisesRegex(BenchmarkInputError, "byte upload limit"):
                parse_benchmark_csv("x" * (MAX_CSV_BYTES + 1))
            read_csv.assert_not_called()

    def test_csv_column_cap_is_rejected_before_pandas_parses_rows(self) -> None:
        oversized_header = ",".join(f"column_{index}" for index in range(MAX_COLUMNS + 1))
        with patch("layernet_ml.benchmark_replay.pd.read_csv") as read_csv:
            with self.assertRaisesRegex(BenchmarkInputError, str(MAX_COLUMNS)):
                parse_benchmark_csv(oversized_header + "\n")
            read_csv.assert_not_called()

    def test_duplicate_raw_headers_are_rejected_before_pandas_mangles_them(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        columns[-1] = "Amount"
        with patch("layernet_ml.benchmark_replay.pd.read_csv") as read_csv:
            with self.assertRaisesRegex(BenchmarkInputError, "duplicate column names"):
                parse_benchmark_csv(",".join(columns) + "\n")
            read_csv.assert_not_called()

    def test_csv_wide_data_record_is_rejected_before_pandas_parses(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        oversized_record = ",".join("0" for _ in range(MAX_COLUMNS + 1))
        text = ",".join(columns) + "\n" + oversized_record + "\n"
        with patch("layernet_ml.benchmark_replay.pd.read_csv") as read_csv:
            with self.assertRaisesRegex(BenchmarkInputError, "more than 64 columns"):
                parse_benchmark_csv(text)
            read_csv.assert_not_called()

    def test_quoted_commas_do_not_count_as_extra_csv_columns(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        values = ["0"] * len(columns)
        values[0] = '"' + ",".join("0" for _ in range(MAX_COLUMNS + 1)) + '"'

        parsed = parse_benchmark_csv(",".join(columns) + "\n" + ",".join(values))

        self.assertEqual(len(parsed.columns), len(columns))
        self.assertEqual(len(parsed), 1)

    def test_record_with_extra_field_is_rejected_instead_of_shifted(self) -> None:
        # pandas would otherwise use the first value as an implicit index and
        # silently shift every feature one column left.
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        values = [str(index + 1) for index in range(len(columns))]
        text = ",".join(columns) + "\n" + ",".join(values) + ",777\n"
        with patch("layernet_ml.benchmark_replay.pd.read_csv") as read_csv:
            with self.assertRaisesRegex(BenchmarkInputError, "record 2 has 31 fields; the header has 30"):
                parse_benchmark_csv(text)
            read_csv.assert_not_called()

    def test_record_with_missing_field_is_rejected(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        values = ["0"] * (len(columns) - 1)
        text = ",".join(columns) + "\n" + ",".join(values) + "\n"
        with self.assertRaisesRegex(BenchmarkInputError, "has 29 fields; the header has 30"):
            parse_benchmark_csv(text)

    def test_blank_lines_and_crlf_do_not_count_as_ragged_records(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        row = ",".join("0" for _ in columns)
        text = ",".join(columns) + "\r\n" + row + "\r\n\r\n" + row + "\n\n"

        parsed = parse_benchmark_csv(text)

        self.assertEqual(len(parsed), 2)
        self.assertEqual(list(parsed.columns), columns)

    def test_quoted_newline_does_not_end_a_record(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        values = ["0"] * len(columns)
        values[-1] = '"0\n"'
        text = ",".join(columns) + "\n" + ",".join(values) + "\n"

        parsed = parse_benchmark_csv(text)

        self.assertEqual(len(parsed), 1)

    def test_csv_row_cap_stops_parsing_at_one_row_over_limit(self) -> None:
        columns = ["Time", "Amount", *(f"V{index}" for index in range(1, 29))]
        row = ",".join("0" for _ in columns)
        text = ",".join(columns) + "\n" + (row + "\n") * (MAX_ROWS + 1)

        parsed = parse_benchmark_csv(text)

        self.assertEqual(len(parsed), MAX_ROWS + 1)
        with self.assertRaisesRegex(BenchmarkInputError, str(MAX_ROWS)):
            validate_benchmark_frame(parsed)

    def test_cli_rejects_oversized_input_before_loading_models(self) -> None:
        import contextlib

        oversized = ",".join(["Time", "Amount", *(f"V{i}" for i in range(1, 29))])
        oversized += "\n" + (",".join("0" for _ in range(30)) + "\n") * (MAX_ROWS + 1)
        stdout = io.StringIO()
        with patch("layernet_ml.benchmark_replay.load_default_bundles") as load_bundles:
            with contextlib.redirect_stdout(stdout):
                code = main([], input_text=oversized)
        self.assertEqual(code, 2)
        load_bundles.assert_not_called()

    def test_valid_frame_keeps_rows_and_order(self) -> None:
        frame = make_frame(rows=5)
        validated = validate_benchmark_frame(frame)
        self.assertEqual(len(validated), 5)
        self.assertEqual(validated["Time"].tolist(), frame["Time"].tolist())
        self.assertIn("Class", validated.columns)

    def test_missing_pca_columns_are_rejected(self) -> None:
        frame = make_frame().drop(columns=["V1", "V28"])
        with self.assertRaisesRegex(BenchmarkInputError, "V1, V28"):
            validate_benchmark_frame(frame)

    def test_missing_time_or_amount_is_rejected(self) -> None:
        for column in ("Time", "Amount"):
            with self.assertRaisesRegex(BenchmarkInputError, column):
                validate_benchmark_frame(make_frame().drop(columns=[column]))

    def test_non_numeric_values_are_rejected(self) -> None:
        frame = make_frame()
        frame["V3"] = frame["V3"].astype(object)
        frame.loc[0, "V3"] = "not-a-number"
        with self.assertRaisesRegex(BenchmarkInputError, "V3"):
            validate_benchmark_frame(frame)

    def test_negative_time_or_amount_is_rejected(self) -> None:
        frame = make_frame()
        frame.loc[0, "Time"] = -1.0
        with self.assertRaisesRegex(BenchmarkInputError, "Time"):
            validate_benchmark_frame(frame)
        frame = make_frame()
        frame.loc[0, "Amount"] = -5.0
        with self.assertRaisesRegex(BenchmarkInputError, "Amount"):
            validate_benchmark_frame(frame)

    def test_invalid_class_labels_are_rejected(self) -> None:
        frame = make_frame()
        frame.loc[0, "Class"] = 2
        with self.assertRaisesRegex(BenchmarkInputError, "Class"):
            validate_benchmark_frame(frame)

    def test_empty_frame_is_rejected(self) -> None:
        with self.assertRaisesRegex(BenchmarkInputError, "no data rows"):
            validate_benchmark_frame(make_frame(rows=0))

    def test_duplicate_columns_are_rejected(self) -> None:
        frame = make_frame()
        frame["Amount"] = frame["Amount"]
        duplicated = pd.concat([frame, frame["Amount"]], axis=1)
        with self.assertRaisesRegex(BenchmarkInputError, "duplicate column"):
            validate_benchmark_frame(duplicated)

    def test_row_cap_is_enforced(self) -> None:
        with self.assertRaisesRegex(BenchmarkInputError, str(MAX_ROWS)):
            validate_benchmark_frame(make_frame(rows=MAX_ROWS + 1))

    def test_column_cap_is_enforced(self) -> None:
        frame = make_frame()
        for index in range(MAX_COLUMNS):
            frame[f"extra_{index}"] = 0
        with self.assertRaisesRegex(BenchmarkInputError, str(MAX_COLUMNS)):
            validate_benchmark_frame(frame)

    def test_labels_are_optional(self) -> None:
        validated = validate_benchmark_frame(make_frame(with_labels=False))
        self.assertNotIn("Class", validated.columns)


class BenchmarkBundleLoadingTests(unittest.TestCase):
    def test_missing_directory_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ModelAvailabilityError):
                load_benchmark_bundle(Path(tmp) / "absent", "model.joblib", "xgboost")

    def test_hash_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            artifact = write_stub_artifact(
                Path(tmp), "xgboost-v1", "xgboost_model.joblib", "xgboost", corrupt_hash=True
            )
            with self.assertRaisesRegex(ModelAvailabilityError, "checksum"):
                load_benchmark_bundle(artifact, "xgboost_model.joblib", "xgboost")

    def test_wrong_schema_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            artifact = write_stub_artifact(
                Path(tmp), "xgboost-v1", "xgboost_model.joblib", "xgboost", wrong_schema=True
            )
            with self.assertRaisesRegex(ModelAvailabilityError, "feature schema"):
                load_benchmark_bundle(artifact, "xgboost_model.joblib", "xgboost")

    def test_wrong_family_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            artifact = write_stub_artifact(
                Path(tmp), "xgboost-v1", "xgboost_model.joblib", "random_forest"
            )
            with self.assertRaisesRegex(ModelAvailabilityError, "not a xgboost"):
                load_benchmark_bundle(artifact, "xgboost_model.joblib", "xgboost")

    def test_valid_stub_bundle_loads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            artifact = write_stub_artifact(
                Path(tmp), "xgboost-v1", "xgboost_model.joblib", "xgboost"
            )
            model, manifest = load_benchmark_bundle(artifact, "xgboost_model.joblib", "xgboost")
            self.assertTrue(hasattr(model, "predict_proba"))
            self.assertEqual(manifest["model_family"], "xgboost")


class BenchmarkOutputTests(unittest.TestCase):
    def test_output_contract_and_threshold_rule(self) -> None:
        frame = validate_benchmark_frame(make_frame(rows=6))
        result = run_benchmark(frame, make_stub_bundles())
        self.assertTrue(result["ok"])
        self.assertEqual(result["row_count"], 6)
        self.assertTrue(result["labels_present"])
        self.assertEqual(len(result["rows"]), 6)
        self.assertEqual(
            [model["family"] for model in result["models"]], ["xgboost", "random_forest"]
        )
        for row in result["rows"]:
            for family in ("xgboost", "random_forest"):
                score = row[family]["score"]
                self.assertTrue(0.0 <= score <= 1.0)
                self.assertEqual(row[family]["prediction"], int(score >= 0.5))
        comparison = result["comparison"]
        self.assertEqual(comparison["agreements"] <= 6, True)
        self.assertAlmostEqual(
            comparison["agreement_rate"], comparison["agreements"] / 6
        )
        self.assertIn("not live", result["note"])

    def test_metrics_on_uploaded_rows_with_both_classes(self) -> None:
        frame = validate_benchmark_frame(make_frame(rows=8))
        result = run_benchmark(frame, make_stub_bundles())
        metrics = result["uploaded_row_metrics"]
        self.assertIsNotNone(metrics)
        for family in ("xgboost", "random_forest"):
            entry = metrics[family]
            counts = (
                entry["true_positives"]
                + entry["true_negatives"]
                + entry["false_positives"]
                + entry["false_negatives"]
            )
            self.assertEqual(counts, 8)
            self.assertIn("average_precision", entry)
            self.assertIn("pr_auc", entry)
            self.assertIn("roc_auc", entry)
        self.assertIn("uploaded rows only", result["metrics_note"])

    def test_single_class_labels_skip_ranking_metrics(self) -> None:
        frame = make_frame(rows=4)
        frame["Class"] = 0
        result = run_benchmark(validate_benchmark_frame(frame), make_stub_bundles())
        self.assertIsNone(result["uploaded_row_metrics"])
        self.assertIn("single class", result["metrics_note"])

    def test_without_labels_metrics_are_unavailable(self) -> None:
        result = run_benchmark(
            validate_benchmark_frame(make_frame(with_labels=False)), make_stub_bundles()
        )
        self.assertFalse(result["labels_present"])
        self.assertIsNone(result["uploaded_row_metrics"])
        self.assertTrue(all(row["class"] is None for row in result["rows"]))

    def test_empty_bundle_set_is_rejected(self) -> None:
        with self.assertRaises(ModelAvailabilityError):
            run_benchmark(validate_benchmark_frame(make_frame()), {})


class BenchmarkCliTests(unittest.TestCase):
    def test_cli_success_with_stub_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_stub_artifact(root, "xgboost-v1", "xgboost_model.joblib", "xgboost")
            write_stub_artifact(
                root, "random-forest-v1", "random_forest_model.joblib", "random_forest"
            )
            csv_text = make_frame(rows=4).to_csv(index=False)
            import contextlib

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = main(["--artifacts-root", str(root)], input_text=csv_text)
            self.assertEqual(code, 0)
            payload = json.loads(stdout.getvalue())
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["row_count"], 4)

    def test_cli_reads_csv_from_bounded_binary_stdin(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_stub_artifact(root, "xgboost-v1", "xgboost_model.joblib", "xgboost")
            write_stub_artifact(
                root, "random-forest-v1", "random_forest_model.joblib", "random_forest"
            )
            csv_text = make_frame(rows=3).to_csv(index=False)
            fake_stdin = io.TextIOWrapper(io.BytesIO(csv_text.encode("utf-8")))
            import contextlib

            stdout = io.StringIO()
            with patch("layernet_ml.benchmark_replay.sys.stdin", fake_stdin):
                with contextlib.redirect_stdout(stdout):
                    code = main(["--artifacts-root", str(root)])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(stdout.getvalue())["row_count"], 3)

    def test_cli_input_error_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            import contextlib

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = main(["--artifacts-root", tmp], input_text="Time,Amount\n0,1\n")
            self.assertEqual(code, 2)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["error_kind"], "input")

    def test_cli_model_error_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            import contextlib

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = main(
                    ["--artifacts-root", tmp], input_text=make_frame().to_csv(index=False)
                )
            self.assertEqual(code, 3)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["error_kind"], "model")

    def test_cli_unreadable_csv_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            import contextlib

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = main(["--artifacts-root", tmp], input_text='"unterminated')
            self.assertEqual(code, 2)


@unittest.skipUnless(
    (REAL_ARTIFACTS / "xgboost-v1" / "manifest.json").is_file()
    and (REAL_ARTIFACTS / "random-forest-v1" / "manifest.json").is_file()
    and REAL_ULB_CSV.is_file(),
    "real ULB artifacts/data not available",
)
class RealArtifactReplayTests(unittest.TestCase):
    def test_real_artifacts_score_real_ulb_rows(self) -> None:
        frame = pd.read_csv(REAL_ULB_CSV, nrows=25)
        validated = validate_benchmark_frame(frame)
        bundles = load_default_bundles(REAL_ARTIFACTS)
        result = run_benchmark(validated, bundles)
        self.assertEqual(result["row_count"], 25)
        for row in result["rows"]:
            for family in ("xgboost", "random_forest"):
                score = row[family]["score"]
                self.assertTrue(np.isfinite(score))
                self.assertTrue(0.0 <= score <= 1.0)
        for model in result["models"]:
            self.assertEqual(len(model["model_version"]), 16)
            self.assertIsNotNone(model["recorded_test_metrics"])


if __name__ == "__main__":
    unittest.main()
