from __future__ import annotations

import csv
import gzip
import hashlib
import importlib.metadata
import io
import json
import math
import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import joblib
import numpy as np
import torch

from .evaluation import evaluate_scores
from .paysim_data import (
    PAYSIM_ARCHIVE_SHA256,
    PAYSIM_CSV_MEMBER,
    SPLIT_BOUNDARIES,
    PaySimCausalExample,
    PaySimSequenceReader,
    open_paysim_label_blind_sequence_reader,
)
from .paysim_temporal import (
    MODEL_KEYS,
    REPLAY_FLOAT_ATOL,
    REPLAY_FLOAT_RTOL,
    TEMPORAL_ARTIFACT_DIRECTORY,
    TEMPORAL_FEATURE_SCHEMA_VERSION,
    _load_transformer,
    encode_sequence_example,
    verify_temporal_artifact_manifest,
)

PREDICTION_EXPORT_SCHEMA_VERSION = "layernet-paysim-row-predictions.v1"
DEFAULT_PREDICTION_PATH = TEMPORAL_ARTIFACT_DIRECTORY / "test-predictions-v1.csv.gz"
DEFAULT_PREDICTION_MANIFEST_PATH = TEMPORAL_ARTIFACT_DIRECTORY / "test-predictions-v1.manifest.json"
DEFAULT_PREDICTION_REPORT_PATH = Path("ml/reports/paysim-temporal-prediction-export-v1.md")
EXPECTED_TEST_TARGETS = 817_649

PREDICTION_COLUMNS = (
    "row_key",
    "source_archive_sha256",
    "source_csv_member",
    "source_data_row_ordinal",
    "target_split",
    "target_step",
    "ground_truth_label_evaluation_only",
    "current_only_control_score",
    "current_only_control_threshold",
    "current_only_control_prediction",
    "temporal_baseline_score",
    "temporal_baseline_threshold",
    "temporal_baseline_prediction",
    "temporal_transformer_score",
    "temporal_transformer_threshold",
    "temporal_transformer_prediction",
)

SOURCE_FILES = (
    "ml/src/layernet_ml/cli.py",
    "ml/src/layernet_ml/paysim_data.py",
    "ml/src/layernet_ml/paysim_temporal.py",
    "ml/src/layernet_ml/paysim_prediction_export.py",
    "ml/src/layernet_ml/evaluation.py",
    "ml/src/layernet_ml/contracts.py",
    "ml/pyproject.toml",
    "ml/requirements-temporal.txt",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_source_row_key(archive_sha256: str, csv_member: str, row_ordinal: int) -> str:
    """Hash the verified dataset identity and zero-based source data-row ordinal."""
    if len(archive_sha256) != 64 or any(character not in "0123456789abcdef" for character in archive_sha256.lower()):
        raise ValueError("archive_sha256 must be a hexadecimal SHA-256 digest.")
    if not csv_member or "\0" in csv_member:
        raise ValueError("csv_member must be a non-empty archive member name.")
    if isinstance(row_ordinal, bool) or not isinstance(row_ordinal, int) or row_ordinal < 0:
        raise ValueError("row_ordinal must be a non-negative zero-based data-row ordinal.")
    identity = f"{archive_sha256.lower()}\0{csv_member}\0{row_ordinal}".encode("utf-8")
    return hashlib.sha256(identity).hexdigest()


def _encode_prediction_batch(
    examples: Sequence[PaySimCausalExample],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, tuple[str, ...]]:
    """Encode only model inputs and carry identity/split metadata beside the tensors."""
    if not examples:
        raise ValueError("Cannot encode an empty prediction batch.")
    encoded = [encode_sequence_example(example) for example in examples]
    tokens = np.stack([item[0] for item in encoded]).astype(np.float32, copy=False)
    masks = np.stack([item[1] for item in encoded]).astype(np.bool_, copy=False)
    row_ordinals = np.asarray([example.source_row_ordinal for example in examples], dtype=np.int64)
    target_steps = np.asarray([example.target_step for example in examples], dtype=np.int16)
    splits = tuple(example.split for example in examples)
    if (row_ordinals < 0).any():
        raise ValueError("Prediction batch contains an invalid source row ordinal.")
    return tokens, masks, row_ordinals, target_steps, splits


def build_prediction_records(
    examples: Sequence[PaySimCausalExample],
    scores: Mapping[str, Sequence[float] | np.ndarray],
    thresholds: Mapping[str, float],
    *,
    archive_sha256: str,
    csv_member: str,
) -> list[dict[str, str | int | float]]:
    """Apply frozen score thresholds before reading labels into evaluation-only records."""
    if set(scores) != set(MODEL_KEYS) or set(thresholds) != set(MODEL_KEYS):
        raise ValueError("Scores and frozen thresholds must cover exactly the three temporal models.")
    score_arrays = {name: np.asarray(scores[name], dtype=np.float64) for name in MODEL_KEYS}
    for name, values in score_arrays.items():
        if values.ndim != 1 or len(values) != len(examples) or not np.isfinite(values).all():
            raise ValueError(f"Scores for {name} must be finite and aligned to the example batch.")
        if not math.isfinite(float(thresholds[name])):
            raise ValueError(f"Frozen threshold for {name} must be finite.")

    # Prediction decisions depend only on scores and manifest thresholds.
    predicted = {
        name: (score_arrays[name] >= float(thresholds[name])).astype(np.int8)
        for name in MODEL_KEYS
    }
    records: list[dict[str, str | int | float]] = []
    for index, example in enumerate(examples):
        if example.split != "test" or not SPLIT_BOUNDARIES["test"][0] <= example.target_step <= SPLIT_BOUNDARIES["test"][1]:
            raise ValueError("Prediction export accepts test targets only.")
        if example.target_label not in (0, 1):
            raise ValueError("Evaluation-only target labels must be binary.")
        record: dict[str, str | int | float] = {
            "row_key": make_source_row_key(archive_sha256, csv_member, example.source_row_ordinal),
            "source_archive_sha256": archive_sha256,
            "source_csv_member": csv_member,
            "source_data_row_ordinal": example.source_row_ordinal,
            "target_split": example.split,
            "target_step": example.target_step,
            "ground_truth_label_evaluation_only": example.target_label,
        }
        for name in MODEL_KEYS:
            record[f"{name}_score"] = float(score_arrays[name][index])
            record[f"{name}_threshold"] = float(thresholds[name])
            record[f"{name}_prediction"] = int(predicted[name][index])
        records.append(record)
    return records


def _source_code_state(repo_root: Path) -> dict[str, Any]:
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, check=True, capture_output=True, text=True
    ).stdout.strip()
    status = subprocess.run(
        ["git", "status", "--short", "--branch"], cwd=repo_root, check=True, capture_output=True, text=True
    ).stdout.strip()
    files: dict[str, dict[str, str]] = {}
    for relative in SOURCE_FILES:
        path = repo_root / relative
        if not path.is_file():
            raise FileNotFoundError(f"Required provenance source file is missing: {relative}")
        file_status = subprocess.run(
            ["git", "status", "--short", "--", relative],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        files[relative] = {"sha256": sha256_file(path), "git_status": file_status or "clean"}
    return {"git_commit": commit, "working_tree_status": status, "files": files}


def _runtime_provenance() -> dict[str, Any]:
    packages: dict[str, str] = {}
    for package in ("numpy", "pandas", "scikit-learn", "joblib", "torch"):
        packages[package] = importlib.metadata.version(package)
    return {"python": sys.version.split()[0], "platform": platform.platform(), "packages": packages}


def _load_models(artifact_directory: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    models: dict[str, Any] = {
        "current_only_control": joblib.load(
            artifact_directory / manifest["models"]["current_only_control"]["artifact"]
        ),
        "temporal_baseline": joblib.load(
            artifact_directory / manifest["models"]["temporal_baseline"]["artifact"]
        ),
    }
    transformer, _ = _load_transformer(
        artifact_directory / manifest["models"]["temporal_transformer"]["artifact"]
    )
    models["temporal_transformer"] = transformer
    return models


def _score_features(
    tokens: np.ndarray,
    masks: np.ndarray,
    models: Mapping[str, Any],
) -> dict[str, np.ndarray]:
    """Score feature tensors without accepting or reading target labels."""
    models["temporal_transformer"].eval()
    with torch.no_grad():
        values = tokens.reshape(len(tokens), -1)
        scores = {
            "current_only_control": np.asarray(
                models["current_only_control"].decision_function(tokens[:, -1, :]), dtype=np.float64
            ),
            "temporal_baseline": np.asarray(models["temporal_baseline"].decision_function(values), dtype=np.float64),
            "temporal_transformer": np.asarray(
                models["temporal_transformer"](torch.from_numpy(tokens), torch.from_numpy(masks)).cpu().numpy(),
                dtype=np.float64,
            ),
        }
    if any(values.ndim != 1 or len(values) != len(tokens) or not np.isfinite(values).all() for values in scores.values()):
        raise ValueError("A saved model produced invalid or misaligned scores.")
    return scores


def _iter_scored_test_batches(
    reader: PaySimSequenceReader,
    models: Mapping[str, Any],
    *,
    batch_size: int = 8192,
) -> Iterable[tuple[list[PaySimCausalExample], dict[str, np.ndarray]]]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive.")
    examples: list[PaySimCausalExample] = []
    for example in reader.iter_examples({"test"}):
        examples.append(example)
        if len(examples) < batch_size:
            continue
        tokens, masks, _row_ordinals, _target_steps, _splits = _encode_prediction_batch(examples)
        scores = _score_features(tokens, masks, models)
        yield examples, scores
        examples = []
    if examples:
        tokens, masks, _row_ordinals, _target_steps, _splits = _encode_prediction_batch(examples)
        scores = _score_features(tokens, masks, models)
        yield examples, scores


def _csv_text_writer(binary_file: Any) -> tuple[gzip.GzipFile, io.TextIOWrapper, csv.DictWriter]:
    compressed = gzip.GzipFile(filename="", mode="wb", fileobj=binary_file, mtime=0)
    text = io.TextIOWrapper(compressed, encoding="utf-8", newline="")
    writer = csv.DictWriter(text, fieldnames=PREDICTION_COLUMNS, lineterminator="\n", extrasaction="raise")
    return compressed, text, writer


def _validate_prediction_file(
    path: Path,
    *,
    archive_sha256: str,
    csv_member: str,
    source_row_count: int,
    expected_count: int,
    thresholds: Mapping[str, float],
) -> tuple[dict[str, dict[str, float | int]], dict[str, int]]:
    labels = np.empty(expected_count, dtype=np.int8)
    scores = {name: np.empty(expected_count, dtype=np.float64) for name in MODEL_KEYS}
    seen_rows = np.zeros(source_row_count, dtype=np.bool_)
    prediction_counts = {name: 0 for name in MODEL_KEYS}
    with gzip.open(path, mode="rt", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if tuple(reader.fieldnames or ()) != PREDICTION_COLUMNS:
            raise ValueError("Prediction export columns do not match the declared export schema.")
        count = 0
        for record in reader:
            if count >= expected_count:
                raise ValueError("Prediction export contains more rows than the expected test target count.")
            ordinal = int(record["source_data_row_ordinal"])
            if ordinal < 0 or ordinal >= source_row_count or seen_rows[ordinal]:
                raise ValueError("Prediction export contains an invalid or duplicate source row ordinal.")
            seen_rows[ordinal] = True
            if record["source_archive_sha256"] != archive_sha256 or record["source_csv_member"] != csv_member:
                raise ValueError("Prediction export source identity differs from the verified source archive.")
            if record["row_key"] != make_source_row_key(archive_sha256, csv_member, ordinal):
                raise ValueError("Prediction export row key does not match its source identity fields.")
            if record["target_split"] != "test":
                raise ValueError("Prediction export contains a non-test target.")
            step = int(record["target_step"])
            if not SPLIT_BOUNDARIES["test"][0] <= step <= SPLIT_BOUNDARIES["test"][1]:
                raise ValueError("Prediction export target step falls outside the test split boundaries.")
            label = int(record["ground_truth_label_evaluation_only"])
            if label not in (0, 1):
                raise ValueError("Prediction export contains a non-binary evaluation-only label.")
            labels[count] = label
            for name in MODEL_KEYS:
                score = float(record[f"{name}_score"])
                threshold = float(record[f"{name}_threshold"])
                prediction = int(record[f"{name}_prediction"])
                expected_threshold = float(thresholds[name])
                if not math.isfinite(score) or threshold != expected_threshold:
                    raise ValueError(f"Prediction export has an invalid score or changed threshold for {name}.")
                if prediction not in (0, 1) or prediction != int(score >= expected_threshold):
                    raise ValueError(f"Prediction export decision does not follow the frozen threshold for {name}.")
                scores[name][count] = score
                prediction_counts[name] += prediction
            count += 1
    if count != expected_count:
        raise ValueError(f"Prediction export contains {count} rows; expected {expected_count}.")
    if int(seen_rows.sum()) != expected_count:
        raise ValueError("Prediction export row-key uniqueness validation failed.")
    metrics = {
        name: evaluate_scores(labels, scores[name], float(thresholds[name]))
        for name in MODEL_KEYS
    }
    return metrics, prediction_counts


def _render_export_report(manifest: Mapping[str, Any]) -> str:
    provenance = manifest["provenance"]
    dataset = manifest["dataset"]
    artifact = manifest["prediction_artifact"]
    results = manifest["results"]
    lines = [
        "# PaySim Temporal Row-Level Prediction Export",
        "",
        f"**Result:** {manifest['result']}",
        "",
        "## Export",
        "",
        f"- File: `{artifact['path']}` (SHA-256 `{artifact['sha256']}`)",
        f"- Rows: `{artifact['row_count']}`; schema: `{artifact['schema_version']}`",
        f"- Source archive: `{dataset['archive_sha256']}`; CSV member: `{dataset['csv_member']}`",
        f"- Contract SHA-256: `{dataset['contract_sha256']}`",
        f"- Temporal manifest SHA-256: `{dataset['temporal_manifest_sha256']}`",
        "- Source row ordinal is zero-based over CSV data records (header excluded); row key hashes archive SHA-256, member name, and ordinal.",
        "- Ground-truth labels are evaluation-only fields; scoring and thresholding use model scores and frozen manifest thresholds.",
        "",
        "## Source-code provenance",
        "",
        f"- Git commit: `{provenance['git_commit']}`",
        "- Relevant source files are fingerprinted in the adjacent JSON export manifest; dirty/clean status is recorded per file.",
        f"- Runtime: Python `{provenance['runtime']['python']}` on `{provenance['runtime']['platform']}`.",
        "",
        "## Reproduced test metrics",
        "",
        "| Model | Threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 | TP | TN | FP | FN | Match |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for name in MODEL_KEYS:
        metrics = results["metrics"][name]
        lines.append(
            f"| {name} | {metrics['threshold']:.17g} | {metrics['pr_auc']:.12g} | "
            f"{metrics['average_precision']:.12g} | {metrics['roc_auc']:.12g} | "
            f"{metrics['precision_at_threshold']:.12g} | {metrics['recall_at_threshold']:.12g} | "
            f"{metrics['f1_at_threshold']:.12g} | {metrics['true_positives']} | "
            f"{metrics['true_negatives']} | {metrics['false_positives']} | {metrics['false_negatives']} | "
            f"{results['matches_recorded_manifest'][name]} |"
        )
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "These are regenerated row-keyed predictions from the saved models and pinned source, not retained original predictions. PaySim is synthetic and the scope remains C-prefixed recipient histories; this does not establish sender-personalized or real-world banking performance.",
            "",
        ]
    )
    return "\n".join(lines)


def _write_json_temp(directory: Path, payload: Mapping[str, Any], prefix: str) -> Path:
    descriptor, name = tempfile.mkstemp(prefix=prefix, suffix=".tmp", dir=directory)
    path = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            json.dump(payload, output, indent=2, sort_keys=True, allow_nan=False)
            output.write("\n")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return path


def export_paysim_temporal_predictions(
    archive_path: Path,
    artifact_directory: Path,
    contract_path: Path,
    output_path: Path,
    manifest_path: Path,
    report_path: Path,
    *,
    batch_size: int = 8192,
) -> dict[str, Any]:
    """Export keyed test predictions by replaying saved models; never trains or tunes thresholds."""
    archive_path = archive_path.resolve()
    artifact_directory = artifact_directory.resolve()
    contract_path = contract_path.resolve()
    output_path = output_path.resolve()
    manifest_path = manifest_path.resolve()
    report_path = report_path.resolve()
    repo_root = Path(__file__).resolve().parents[3]
    for destination in (output_path, manifest_path, report_path):
        if destination.exists():
            raise FileExistsError(f"Refusing to overwrite existing export artifact: {destination}")

    code_before = _source_code_state(repo_root)
    model_manifest_path = artifact_directory / "manifest.json"
    original_manifest_hash = sha256_file(model_manifest_path)
    manifest = verify_temporal_artifact_manifest(artifact_directory)
    source_hash = sha256_file(archive_path)
    contract_hash = sha256_file(contract_path)
    if source_hash != PAYSIM_ARCHIVE_SHA256 or source_hash != manifest["dataset"]["archive_sha256"]:
        raise ValueError("PaySim archive hash differs from the pinned experiment and model manifest.")
    if manifest["split_boundaries"] != {
        name: {"step_start": values[0], "step_end": values[1]} for name, values in SPLIT_BOUNDARIES.items()
    }:
        raise ValueError("Temporal manifest split boundaries differ from the accepted sequence contract.")
    expected_count = next(int(part["recipient_targets"]) for part in manifest["splits"] if part["name"] == "test")
    if expected_count != EXPECTED_TEST_TARGETS:
        raise ValueError(f"Temporal manifest test target count differs from {EXPECTED_TEST_TARGETS}.")

    reader = open_paysim_label_blind_sequence_reader(archive_path, contract_path)
    source_row_count = int(reader.audit["schema"]["row_count"])
    model_hashes = {
        name: manifest["models"][name]["artifact_sha256"]
        for name in MODEL_KEYS
    }
    thresholds = {name: float(manifest["models"][name]["threshold"]) for name in MODEL_KEYS}
    for name in MODEL_KEYS:
        if manifest["models"][name]["threshold_selection"]["source_split"] != "validation":
            raise ValueError(f"Frozen threshold for {name} is not documented as validation-selected.")
    models = _load_models(artifact_directory, manifest)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temp_output: Path | None = None
    temp_manifest: Path | None = None
    temp_report: Path | None = None
    published: list[Path] = []
    try:
        descriptor, temp_name = tempfile.mkstemp(prefix=".paysim-test-predictions-", suffix=".tmp", dir=output_path.parent)
        temp_output = Path(temp_name)
        records_written = 0
        with os.fdopen(descriptor, "wb") as binary_output:
            compressed, text, writer = _csv_text_writer(binary_output)
            try:
                writer.writeheader()
                for examples, scores in _iter_scored_test_batches(reader, models, batch_size=batch_size):
                    records = build_prediction_records(
                        examples,
                        scores,
                        thresholds,
                        archive_sha256=source_hash,
                        csv_member=PAYSIM_CSV_MEMBER,
                    )
                    for record in records:
                        writer.writerow(record)
                    records_written += len(records)
            finally:
                text.flush()
                text.detach()
                compressed.close()
        if records_written != expected_count:
            raise ValueError(f"Prediction stream emitted {records_written} rows; expected {expected_count}.")

        reproduced_metrics, prediction_counts = _validate_prediction_file(
            temp_output,
            archive_sha256=source_hash,
            csv_member=PAYSIM_CSV_MEMBER,
            source_row_count=source_row_count,
            expected_count=expected_count,
            thresholds=thresholds,
        )
        metric_matches: dict[str, bool] = {}
        for name in MODEL_KEYS:
            stored = manifest["models"][name]["test_metrics"]
            actual = reproduced_metrics[name]
            metric_matches[name] = all(
                (int(stored[key]) == int(actual[key]))
                if key in {"true_positives", "true_negatives", "false_positives", "false_negatives"}
                else bool(np.isclose(float(stored[key]), float(actual[key]), atol=REPLAY_FLOAT_ATOL, rtol=REPLAY_FLOAT_RTOL))
                for key in actual
            )
        if not all(metric_matches.values()):
            raise ValueError("Exported prediction metrics do not reproduce the saved test metrics.")

        code_after = _source_code_state(repo_root)
        if code_before["git_commit"] != code_after["git_commit"] or code_before["files"] != code_after["files"]:
            raise RuntimeError("Relevant source code changed during prediction export; provenance cannot be trusted.")
        if sha256_file(archive_path) != source_hash or sha256_file(contract_path) != contract_hash:
            raise RuntimeError("Dataset archive or sequence contract changed during prediction export.")
        if sha256_file(model_manifest_path) != original_manifest_hash:
            raise RuntimeError("Accepted temporal manifest changed during prediction export.")
        for name in MODEL_KEYS:
            model_path = artifact_directory / manifest["models"][name]["artifact"]
            if sha256_file(model_path) != model_hashes[name]:
                raise RuntimeError(f"Accepted temporal model changed during prediction export: {name}.")

        export_manifest: dict[str, Any] = {
            "result": "PASS",
            "export_schema_version": PREDICTION_EXPORT_SCHEMA_VERSION,
            "dataset": {
                "archive_sha256": source_hash,
                "csv_member": PAYSIM_CSV_MEMBER,
                "source_data_row_count": source_row_count,
                "contract_path": str(contract_path.relative_to(repo_root)),
                "contract_sha256": contract_hash,
                "temporal_manifest_path": str(model_manifest_path.relative_to(repo_root)),
                "temporal_manifest_sha256": original_manifest_hash,
                "dataset_schema_version": manifest["dataset"]["dataset_schema_version"],
                "sequence_contract_version": manifest["sequence_contract_version"],
                "feature_schema_version": TEMPORAL_FEATURE_SCHEMA_VERSION,
            },
            "split": {
                "name": "test",
                "step_start": SPLIT_BOUNDARIES["test"][0],
                "step_end": SPLIT_BOUNDARIES["test"][1],
                "whole_step_chronological": True,
                "target_count": records_written,
                "history_rule": "only same-entity events with strictly smaller step; same-step/future events excluded",
            },
            "row_identity": {
                "native_transaction_id": None,
                "source_data_row_ordinal_base": 0,
                "ordinal_definition": "zero-based data-record ordinal in the pinned CSV member; header excluded; all source rows count toward the ordinal",
                "row_key": "SHA-256 of UTF-8 archive_sha256 + NUL + csv_member + NUL + decimal row ordinal",
                "model_feature": False,
            },
            "models": {
                name: {
                    "artifact": manifest["models"][name]["artifact"],
                    "sha256": model_hashes[name],
                    "threshold": thresholds[name],
                    "threshold_source_split": "validation",
                    "decision_rule": "positive iff score >= frozen threshold",
                    "score_is_calibrated_probability": False,
                }
                for name in MODEL_KEYS
            },
            "prediction_artifact": {
                "path": str(output_path.relative_to(repo_root)),
                "format": "CSV compressed with gzip; deterministic mtime=0",
                "schema_version": PREDICTION_EXPORT_SCHEMA_VERSION,
                "sha256": sha256_file(temp_output),
                "row_count": records_written,
                "columns": list(PREDICTION_COLUMNS),
                "ground_truth_column": "ground_truth_label_evaluation_only",
                "ground_truth_used_for_scoring_or_thresholding": False,
            },
            "results": {
                "numeric_tolerance": {"absolute": REPLAY_FLOAT_ATOL, "relative": REPLAY_FLOAT_RTOL},
                "confusion_counts_exact": True,
                "metrics": reproduced_metrics,
                "prediction_positive_counts": prediction_counts,
                "matches_recorded_manifest": metric_matches,
            },
            "validation": {
                "rows_match_expected_test_count": records_written == EXPECTED_TEST_TARGETS,
                "source_row_keys_unique": True,
                "all_targets_in_test_split": True,
                "all_scores_finite": True,
                "all_predictions_follow_frozen_thresholds": True,
                "no_training_or_threshold_selection": True,
                "model_inputs_reused_existing_encoder": True,
                "model_score_function_reused_existing_inference_logic": True,
            },
            "provenance": {
                "git_commit": code_before["git_commit"],
                "working_tree_status_before_export": code_before["working_tree_status"],
                "source_code_files": code_before["files"],
                "runtime": _runtime_provenance(),
                "command": subprocess.list2cmdline([sys.executable, "-m", "layernet_ml.cli", *sys.argv[1:]]),
            },
            "interpretation": {
                "predictions_are_regenerated_not_original_retained_predictions": True,
                "scope": "synthetic PaySim C-prefixed nameDest recipient-history test split only",
            },
        }
        report_text = _render_export_report(export_manifest)
        temp_manifest = _write_json_temp(manifest_path.parent, export_manifest, ".paysim-prediction-manifest-")
        descriptor, temp_report_name = tempfile.mkstemp(
            prefix=".paysim-prediction-report-", suffix=".tmp", dir=report_path.parent
        )
        temp_report = Path(temp_report_name)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(report_text)

        for destination in (output_path, manifest_path, report_path):
            if destination.exists():
                raise FileExistsError(f"Refusing to overwrite existing export artifact: {destination}")
        os.replace(temp_output, output_path)
        published.append(output_path)
        os.replace(temp_manifest, manifest_path)
        published.append(manifest_path)
        os.replace(temp_report, report_path)
        published.append(report_path)
        return export_manifest
    except Exception:
        for path in (temp_output, temp_manifest, temp_report):
            if path is not None:
                path.unlink(missing_ok=True)
        for path in published:
            path.unlink(missing_ok=True)
        raise
