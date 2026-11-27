"""ULB benchmark replay: score genuine ULB-shaped CSV rows with saved artifacts.

This module is read-only with respect to research artifacts. It never trains,
never fabricates missing features, and never maps application transaction
fields onto V1-V28. Input rows must already carry the published ULB schema
(``Time``, ``Amount``, ``V1``-``V28``; ``Class`` is optional and used only for
evaluation on the uploaded rows).

CLI contract (CSV on stdin, one JSON document on stdout):
    python -m layernet_ml.benchmark_replay [--artifacts-root ml/artifacts]

When --artifacts-root is omitted, the artifact root resolves relative to this
package (ml/artifacts), so callers never need to embed artifact paths.

Exit codes: 0 success, 2 invalid input, 3 model availability failure,
4 unexpected internal error.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .contracts import PositiveClassProbabilityAdapter
from .data import (
    AMOUNT_COLUMN,
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    PCA_COLUMNS,
    TARGET_COLUMN,
    TIME_COLUMN,
    build_features,
)
from .evaluation import evaluate_scores
from .pipeline import sha256_file

BENCHMARK_SCHEMA_VERSION = "layernet-ulb-benchmark-replay.v1"
MAX_ROWS = 5_000
MAX_COLUMNS = 64
MAX_CSV_BYTES = 2_000_000
MAX_CSV_HEADER_BYTES = 16_384
REQUIRED_INPUT_COLUMNS = (TIME_COLUMN, AMOUNT_COLUMN, *PCA_COLUMNS)
BENCHMARK_NOTE = (
    "ULB benchmark replay on uploaded dataset rows. Scores are uncalibrated model outputs "
    "from models trained on the ULB/Worldline credit-card dataset; this is not live "
    "real-world transaction fraud prediction."
)

MODEL_FILES = {
    "xgboost": ("xgboost-v1", "xgboost_model.joblib"),
    "random_forest": ("random-forest-v1", "random_forest_model.joblib"),
}


class BenchmarkInputError(ValueError):
    """Uploaded CSV does not satisfy the genuine ULB input contract."""


class ModelAvailabilityError(RuntimeError):
    """A saved artifact is missing, unreadable, or fails its integrity checks."""


def _validate_csv_column_width(text: str, expected_fields: int | None = None) -> None:
    """Reject wide or ragged records before pandas can parse them.

    Wide records are rejected before pandas allocates a very large row. When
    ``expected_fields`` is given, every non-blank record must have exactly that
    many fields: pandas otherwise treats a row with one extra value as having an
    implicit index column and silently shifts every value one column left.
    """
    fields_in_record = 1
    record_has_content = False
    record_number = 0
    at_field_start = True
    in_quoted_field = False
    index = 0

    def finish_record() -> None:
        nonlocal record_number
        if not record_has_content:
            return  # blank line (or the second half of CRLF); pandas skips these
        record_number += 1
        if expected_fields is not None and fields_in_record != expected_fields:
            raise BenchmarkInputError(
                f"Uploaded CSV record {record_number} has {fields_in_record} fields; "
                f"the header has {expected_fields}."
            )

    while index < len(text):
        character = text[index]
        if in_quoted_field:
            if character == '"':
                if index + 1 < len(text) and text[index + 1] == '"':
                    index += 2
                    continue
                in_quoted_field = False
            index += 1
            continue

        if character in "\r\n":
            finish_record()
            fields_in_record = 1
            record_has_content = False
            at_field_start = True
            index += 1
            continue

        record_has_content = True
        if character == '"' and at_field_start:
            in_quoted_field = True
        elif character == ",":
            fields_in_record += 1
            if fields_in_record > MAX_COLUMNS:
                raise BenchmarkInputError(
                    f"Uploaded CSV contains a record with more than {MAX_COLUMNS} columns."
                )
            at_field_start = True
        else:
            at_field_start = False
        index += 1

    finish_record()


def parse_benchmark_csv(text: str) -> pd.DataFrame:
    """Apply byte, header-column, and row limits before expensive inference work."""
    try:
        encoded_size = len(text.encode("utf-8", errors="strict"))
    except UnicodeEncodeError as error:
        raise BenchmarkInputError("Uploaded CSV must contain valid UTF-8 text.") from error
    if encoded_size > MAX_CSV_BYTES:
        raise BenchmarkInputError(
            f"Uploaded CSV exceeds the {MAX_CSV_BYTES} byte upload limit."
        )

    header_line = text.partition("\n")[0].removesuffix("\r")
    if len(header_line.encode("utf-8")) > MAX_CSV_HEADER_BYTES:
        raise BenchmarkInputError(
            f"CSV header exceeds the {MAX_CSV_HEADER_BYTES} byte header limit."
        )
    try:
        header = next(csv.reader([header_line], strict=True))
    except (csv.Error, StopIteration) as error:
        raise BenchmarkInputError("Uploaded file has an invalid CSV header.") from error
    if len(set(header)) != len(header):
        raise BenchmarkInputError("Uploaded CSV contains duplicate column names.")
    if len(header) > MAX_COLUMNS:
        raise BenchmarkInputError(
            f"Uploaded CSV has more than {MAX_COLUMNS} columns; the benchmark replay limit is {MAX_COLUMNS} columns."
        )
    _validate_csv_column_width(text, expected_fields=len(header))

    try:
        # Read one row beyond the accepted maximum so validation can reject an
        # oversized upload without materializing the rest of its row set.
        return pd.read_csv(io.StringIO(text), nrows=MAX_ROWS + 1)
    except Exception as error:
        raise BenchmarkInputError(f"Uploaded file is not a readable CSV: {error}") from error


def validate_benchmark_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Validate uploaded rows without inventing, imputing, or reordering values."""
    if frame.empty:
        raise BenchmarkInputError("Uploaded CSV contains no data rows.")
    if len(frame.columns) > MAX_COLUMNS:
        raise BenchmarkInputError(
            f"Uploaded CSV has {len(frame.columns)} columns; the benchmark replay limit is {MAX_COLUMNS} columns."
        )
    if frame.columns.duplicated().any():
        raise BenchmarkInputError("Uploaded CSV contains duplicate column names.")
    missing = sorted(set(REQUIRED_INPUT_COLUMNS) - set(frame.columns))
    if missing:
        raise BenchmarkInputError(
            "Uploaded CSV is missing required ULB columns: " + ", ".join(missing)
        )
    if len(frame) > MAX_ROWS:
        raise BenchmarkInputError(
            f"Uploaded CSV has {len(frame)} rows; the benchmark replay limit is {MAX_ROWS} rows."
        )

    columns = list(REQUIRED_INPUT_COLUMNS)
    has_labels = TARGET_COLUMN in frame.columns
    if has_labels:
        columns.append(TARGET_COLUMN)
    selected = frame.loc[:, columns].copy()
    for column in columns:
        selected[column] = pd.to_numeric(selected[column], errors="coerce")
    if selected.isna().any().any():
        bad = sorted(selected.columns[selected.isna().any()].tolist())
        raise BenchmarkInputError(
            "Required columns contain missing or non-numeric values: " + ", ".join(bad)
        )
    if not np.isfinite(selected.to_numpy(dtype=np.float64)).all():
        raise BenchmarkInputError("Required columns contain non-finite values.")
    if (selected[TIME_COLUMN] < 0).any():
        raise BenchmarkInputError("Time must be non-negative elapsed seconds.")
    if (selected[AMOUNT_COLUMN] < 0).any():
        raise BenchmarkInputError("Amount must be non-negative.")
    if has_labels:
        labels = set(selected[TARGET_COLUMN].unique().tolist())
        if not labels.issubset({0, 1}):
            raise BenchmarkInputError("Class must contain only binary labels 0 and 1.")
        selected[TARGET_COLUMN] = selected[TARGET_COLUMN].astype(np.int64)
    return selected


def load_benchmark_bundle(
    artifact_directory: Path, model_filename: str, expected_family: str
) -> tuple[Any, dict[str, Any]]:
    """Load one saved artifact with the same integrity checks as training-time inference."""
    manifest_path = artifact_directory / "manifest.json"
    model_path = artifact_directory / model_filename
    try:
        if not manifest_path.is_file() or not model_path.is_file():
            raise ModelAvailabilityError(
                f"Expected manifest.json and {model_filename} in {artifact_directory}."
            )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ModelAvailabilityError(
            f"Cannot read artifact directory {artifact_directory}: {error}"
        ) from error
    if manifest.get("model_family") != expected_family:
        raise ModelAvailabilityError(
            f"Artifact in {artifact_directory} is not a {expected_family} model."
        )
    if (
        manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION
        or manifest.get("feature_columns") != list(FEATURE_COLUMNS)
    ):
        raise ModelAvailabilityError(
            f"Saved model feature schema in {artifact_directory} does not match the ULB inference contract."
        )
    if sha256_file(model_path) != manifest.get("model_sha256"):
        raise ModelAvailabilityError(
            f"Saved model checksum in {artifact_directory} does not match its manifest."
        )
    try:
        model = joblib.load(model_path)
    except Exception as error:
        raise ModelAvailabilityError(
            f"Failed to load model file {model_path}: {error}"
        ) from error
    return model, manifest


def load_default_bundles(artifacts_root: Path) -> dict[str, tuple[Any, dict[str, Any]]]:
    bundles: dict[str, tuple[Any, dict[str, Any]]] = {}
    for family, (directory_name, model_filename) in MODEL_FILES.items():
        bundles[family] = load_benchmark_bundle(
            artifacts_root / directory_name, model_filename, family
        )
    return bundles


def run_benchmark(
    frame: pd.DataFrame, bundles: dict[str, tuple[Any, dict[str, Any]]]
) -> dict[str, Any]:
    """Score validated rows with each saved model using the original feature builder."""
    if not bundles:
        raise ModelAvailabilityError("No model bundles were provided for benchmark replay.")
    features = build_features(frame)
    has_labels = TARGET_COLUMN in frame.columns

    model_summaries: list[dict[str, Any]] = []
    scores_by_family: dict[str, np.ndarray] = {}
    predictions_by_family: dict[str, np.ndarray] = {}
    for family, (model, manifest) in bundles.items():
        threshold = float(manifest["decision_threshold"])
        scores = PositiveClassProbabilityAdapter(model, family).score(features).values
        scores_by_family[family] = scores
        predictions_by_family[family] = (scores >= threshold).astype(np.int64)
        model_summaries.append(
            {
                "family": family,
                "model_version": str(manifest["model_version"]),
                "threshold": threshold,
                "score_meaning": str(manifest["score_semantics"]),
                "recorded_test_metrics": manifest.get("test_metrics"),
            }
        )

    rows: list[dict[str, Any]] = []
    for index in range(len(frame)):
        row: dict[str, Any] = {
            "row": index,
            "Time": float(frame[TIME_COLUMN].iloc[index]),
            "Amount": float(frame[AMOUNT_COLUMN].iloc[index]),
            "class": int(frame[TARGET_COLUMN].iloc[index]) if has_labels else None,
        }
        for family in bundles:
            row[family] = {
                "score": float(scores_by_family[family][index]),
                "prediction": int(predictions_by_family[family][index]),
            }
        rows.append(row)

    families = list(bundles)
    agreements = int(
        np.sum(
            np.all(
                np.stack([predictions_by_family[family] for family in families])
                == predictions_by_family[families[0]],
                axis=0,
            )
        )
    )
    comparison = {
        "agreements": agreements,
        "agreement_rate": agreements / len(frame),
        "positives": {
            family: int(predictions_by_family[family].sum()) for family in families
        },
        "mean_scores": {
            family: float(scores_by_family[family].mean()) for family in families
        },
    }

    uploaded_row_metrics: dict[str, Any] | None = None
    metrics_note: str
    if not has_labels:
        metrics_note = "No Class column was uploaded; evaluation metrics are unavailable."
    else:
        labels = frame[TARGET_COLUMN].to_numpy(dtype=np.int64)
        if set(labels.tolist()) != {0, 1}:
            metrics_note = (
                "Uploaded Class column contains a single class; ranking metrics require both classes."
            )
        else:
            uploaded_row_metrics = {
                family: evaluate_scores(
                    labels, scores_by_family[family], threshold=float(bundles[family][1]["decision_threshold"])
                )
                for family in families
            }
            metrics_note = (
                "Metrics computed on the uploaded rows only at each model's frozen manifest threshold; "
                "they are not the original held-out test results."
            )

    return {
        "ok": True,
        "benchmark": BENCHMARK_SCHEMA_VERSION,
        "note": BENCHMARK_NOTE,
        "row_count": len(frame),
        "labels_present": has_labels,
        "models": model_summaries,
        "rows": rows,
        "comparison": comparison,
        "uploaded_row_metrics": uploaded_row_metrics,
        "metrics_note": metrics_note,
    }


def main(argv: list[str] | None = None, input_text: str | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Replay ULB benchmark inference on genuine ULB-shaped CSV rows from stdin."
    )
    parser.add_argument(
        "--artifacts-root",
        type=Path,
        default=None,
        help="Directory containing xgboost-v1/ and random-forest-v1/ artifact folders. Defaults to ml/artifacts relative to this package.",
    )
    args = parser.parse_args(argv)
    if args.artifacts_root is None:
        args.artifacts_root = Path(__file__).resolve().parents[2] / "artifacts"

    try:
        if input_text is None:
            raw_input = sys.stdin.buffer.read(MAX_CSV_BYTES + 1)
            if len(raw_input) > MAX_CSV_BYTES:
                raise BenchmarkInputError(
                    f"Uploaded CSV exceeds the {MAX_CSV_BYTES} byte upload limit."
                )
            try:
                text = raw_input.decode("utf-8", errors="strict")
            except UnicodeDecodeError as error:
                raise BenchmarkInputError("Uploaded CSV must contain valid UTF-8 text.") from error
        else:
            text = input_text

        frame = parse_benchmark_csv(text)
        validated = validate_benchmark_frame(frame)
        bundles = load_default_bundles(args.artifacts_root)
        result = run_benchmark(validated, bundles)
    except BenchmarkInputError as error:
        print(json.dumps({"ok": False, "error_kind": "input", "error": str(error)}))
        return 2
    except ModelAvailabilityError as error:
        print(json.dumps({"ok": False, "error_kind": "model", "error": str(error)}))
        return 3
    except Exception as error:  # pragma: no cover - defensive envelope
        print(json.dumps({"ok": False, "error_kind": "internal", "error": str(error)}))
        return 4
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
