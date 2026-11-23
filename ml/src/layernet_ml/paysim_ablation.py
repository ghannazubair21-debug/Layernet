"""Preregistered, paired PaySim current-only versus history-enabled ablation."""

from __future__ import annotations

import argparse
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
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import scipy.stats

from .evaluation import evaluate_scores
from .paysim_data import (
    PAYSIM_ARCHIVE_SHA256,
    PAYSIM_CSV_MEMBER,
    PaySimSequenceReader,
    open_paysim_label_blind_sequence_reader,
)
from .paysim_prediction_export import make_source_row_key
from .paysim_temporal import (
    MODEL_INPUT_WIDTH,
    SEQUENCE_TOKEN_COUNT,
    _batch_iterator,
    choose_validation_f1_threshold,
    encode_sequence_batch,
    make_sgd_classifier,
)

EXPERIMENT_ID = "paysim-history-ablation-v1"
EXPECTED_MODEL_NAMES = ("current_only", "history_enabled")
CONTINUOUS_METRICS = (
    "average_precision",
    "pr_auc",
    "roc_auc",
    "precision_at_threshold",
    "recall_at_threshold",
    "f1_at_threshold",
)
ALL_METRICS = CONTINUOUS_METRICS + (
    "threshold",
    "true_positives",
    "true_negatives",
    "false_positives",
    "false_negatives",
)
EXPORT_FIELDS = (
    "row_key",
    "source_archive_sha256",
    "source_csv_member",
    "source_data_row_ordinal",
    "target_split",
    "target_step",
    "ground_truth_label_evaluation_only",
    "seed",
    "current_only_score",
    "current_only_threshold",
    "current_only_prediction",
    "history_enabled_score",
    "history_enabled_threshold",
    "history_enabled_prediction",
)
SOURCE_FILES = (
    "ml/pyproject.toml",
    "ml/requirements-temporal.txt",
    "ml/src/layernet_ml/contracts.py",
    "ml/src/layernet_ml/evaluation.py",
    "ml/src/layernet_ml/paysim_ablation.py",
    "ml/src/layernet_ml/paysim_data.py",
    "ml/src/layernet_ml/paysim_prediction_export.py",
    "ml/src/layernet_ml/paysim_temporal.py",
    "ml/reports/paysim-sequence-contract-v1.json",
    "ml/reports/paysim-history-ablation-config-v1.json",
    "ml/reports/paysim-history-ablation-prereg-v1.md",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_arm_features(tokens: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return matched current-only and current-plus-history matrices from shared tokens."""
    values = np.asarray(tokens, dtype=np.float32)
    if values.ndim != 3 or tuple(values.shape[1:]) != (SEQUENCE_TOKEN_COUNT, MODEL_INPUT_WIDTH):
        raise ValueError("Encoded PaySim tokens must have shape (batch, 18, 7).")
    return values[:, -1, :], values.reshape(len(values), -1)


def apply_frozen_threshold(scores: np.ndarray, threshold: float) -> np.ndarray:
    """Apply the preregistered inclusive score threshold without reading labels."""
    values = np.asarray(scores, dtype=np.float64)
    if values.ndim != 1 or not np.isfinite(values).all() or not math.isfinite(float(threshold)):
        raise ValueError("Scores and frozen threshold must be finite one-dimensional values.")
    return (values >= float(threshold)).astype(np.int8)


def summarize_paired_differences(
    metrics_by_seed: dict[int, dict[str, dict[str, float | int]]],
) -> dict[str, Any]:
    """Summarize history-minus-control differences across paired seeds."""
    seeds = sorted(metrics_by_seed)
    if len(seeds) < 2:
        raise ValueError("At least two paired seeds are required for a sample standard deviation.")
    result: dict[str, Any] = {"unit_of_analysis": "paired seed-level differences", "seeds": seeds, "metrics": {}}
    for metric in ALL_METRICS:
        differences = [
            float(metrics_by_seed[seed]["history_enabled"][metric])
            - float(metrics_by_seed[seed]["current_only"][metric])
            for seed in seeds
        ]
        mean = float(np.mean(differences))
        sample_sd = float(np.std(differences, ddof=1))
        entry: dict[str, Any] = {
            "paired_differences": differences,
            "mean": mean,
            "sample_standard_deviation": sample_sd,
        }
        if metric in CONTINUOUS_METRICS:
            critical = float(scipy.stats.t.ppf(0.975, df=len(seeds) - 1))
            half_width = critical * sample_sd / math.sqrt(len(seeds))
            entry["two_sided_95_percent_student_t_interval"] = [mean - half_width, mean + half_width]
        result["metrics"][metric] = entry
    result["primary_metric"] = "average_precision"
    result["interval_interpretation"] = (
        "descriptive seed variability conditional on one fixed test split; no significance claim"
    )
    return result


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")


def _write_json(path: Path, value: Any) -> None:
    path.write_bytes(_json_bytes(value))


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}.")
    return value


def _git_text(*args: str) -> str:
    result = subprocess.run(["git", *args], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def _git_status_for(path: str) -> str:
    result = subprocess.run(
        ["git", "status", "--short", "--", path], check=True, capture_output=True, text=True
    )
    return result.stdout.strip() or "clean"


def _source_provenance() -> dict[str, Any]:
    return {
        "git_commit": _git_text("rev-parse", "HEAD"),
        "working_tree_status": _git_text("status", "--short", "--untracked-files=all"),
        "source_files": {
            name: {"sha256": sha256_file(Path(name)), "git_status": _git_status_for(name)}
            for name in SOURCE_FILES
        },
    }


def _windows_memory_bytes() -> dict[str, int] | None:
    """Read current and peak process working set on Windows without an extra dependency."""
    if os.name != "nt":
        return None
    import ctypes
    from ctypes import wintypes

    counters_type = type(
        "PROCESS_MEMORY_COUNTERS",
        (ctypes.Structure,),
        {
            "_fields_": [
                ("cb", ctypes.c_ulong),
                ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]
        },
    )
    counters = counters_type()
    counters.cb = ctypes.sizeof(counters_type)
    get_current_process = ctypes.windll.kernel32.GetCurrentProcess
    get_current_process.restype = wintypes.HANDLE
    get_memory_info = ctypes.windll.psapi.GetProcessMemoryInfo
    get_memory_info.argtypes = (
        wintypes.HANDLE,
        ctypes.POINTER(counters_type),
        wintypes.DWORD,
    )
    get_memory_info.restype = wintypes.BOOL
    try:
        process = get_current_process()
        ok = get_memory_info(process, ctypes.byref(counters), counters.cb)
    except OSError:
        return None
    if not ok:
        return None
    return {
        "working_set_bytes": int(counters.WorkingSetSize),
        "peak_working_set_bytes": int(counters.PeakWorkingSetSize),
    }


def _runtime_metadata() -> dict[str, Any]:
    packages = ("numpy", "pandas", "scikit-learn", "joblib", "scipy")
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "packages": {package: importlib.metadata.version(package) for package in packages},
    }


def _verify_preregistration(config_path: Path, prereg_path: Path) -> tuple[dict[str, Any], str, str]:
    config = _read_json(config_path)
    config_hash = sha256_file(config_path)
    prereg_hash = sha256_file(prereg_path)
    expected_config_hash = f"Configuration SHA-256 (exact file bytes): `{config_hash}`"
    if expected_config_hash not in prereg_path.read_text(encoding="utf-8"):
        raise ValueError("Preregistration does not record the current frozen configuration hash.")
    if config.get("experiment_id") != EXPERIMENT_ID:
        raise ValueError("Configuration experiment ID does not match this runner.")
    return config, config_hash, prereg_hash


def _verify_dataset_config(config: dict[str, Any], archive_path: Path, contract_path: Path) -> None:
    dataset = config["dataset"]
    if sha256_file(archive_path) != dataset["archive_sha256"] or dataset["archive_sha256"] != PAYSIM_ARCHIVE_SHA256:
        raise ValueError("PaySim archive hash differs from the preregistered pinned release.")
    if sha256_file(contract_path) != dataset["sequence_contract_sha256"]:
        raise ValueError("Sequence contract hash differs from the preregistered contract.")
    if dataset["csv_member"] != PAYSIM_CSV_MEMBER:
        raise ValueError("CSV member differs from the preregistered PaySim source.")


def _validate_audit(reader: PaySimSequenceReader, config: dict[str, Any]) -> None:
    audit = reader.audit
    expected_rows = int(config["dataset"]["source_rows"])
    if int(audit["schema"]["row_count"]) != expected_rows:
        raise ValueError("Label-blind archive preflight row count differs from the preregistration.")
    if audit["schema"].get("label_columns_parsed") is not False:
        raise ValueError("PaySim preflight must not parse aggregate fraud-label columns.")
    expected = config["split"]["recipient_targets"]
    for split in audit["splits"]:
        name = split["name"]
        if int(split["customer_recipient_targets"]) != int(expected[name]):
            raise ValueError(f"{name} recipient-target count differs from the preregistration.")


def _train_pair(
    reader: PaySimSequenceReader,
    *,
    seed: int,
    negative: int,
    positive: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    weight = negative / positive
    models = {
        "current_only": make_sgd_classifier(weight, seed=seed),
        "history_enabled": make_sgd_classifier(weight, seed=seed),
    }
    classes = np.asarray([0, 1], dtype=np.int64)
    rows_seen = 0
    positives_seen = 0
    train_start = time.perf_counter()
    captured_warnings: list[str] = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        for tokens, _masks, labels in _batch_iterator(
            reader, "train", 4096, shuffle_seed=seed
        ):
            current, history = make_arm_features(tokens)
            first_batch = rows_seen == 0
            models["current_only"].partial_fit(current, labels, classes=classes if first_batch else None)
            models["history_enabled"].partial_fit(history, labels, classes=classes if first_batch else None)
            rows_seen += int(labels.size)
            positives_seen += int(labels.sum())
        captured_warnings = [f"{item.category.__name__}: {item.message}" for item in caught]
    duration_seconds = time.perf_counter() - train_start
    if rows_seen != int(reader.audit["splits"][0]["customer_recipient_targets"]):
        raise ValueError(f"Train iterator yielded {rows_seen} targets; expected the Phase 10 train count.")
    if positives_seen != positive or rows_seen - positives_seen != negative:
        raise ValueError("Streamed train-label counts differ from the preregistered train-only class counts.")
    details = {
        "duration_seconds": duration_seconds,
        "train_targets_seen_per_arm": rows_seen,
        "positive_train_targets_seen": positives_seen,
        "negative_train_targets_seen": rows_seen - positives_seen,
        "positive_class_weight": weight,
        "warnings": captured_warnings,
        "process_memory_after_fit": _windows_memory_bytes(),
    }
    return models, details


def _score_split(
    reader: PaySimSequenceReader,
    split: str,
    models: dict[int, dict[str, Any]],
    *,
    batch_size: int,
    expected_count: int,
    retain_metadata: bool,
) -> tuple[np.ndarray, dict[int, dict[str, np.ndarray]], dict[str, np.ndarray]]:
    labels_out: list[np.ndarray] = []
    score_parts: dict[int, dict[str, list[np.ndarray]]] = {
        seed: {name: [] for name in EXPECTED_MODEL_NAMES} for seed in models
    }
    metadata_parts: dict[str, list[np.ndarray]] = {"ordinals": [], "steps": []}
    iterator = reader.iter_examples({split})
    batch: list[Any] = []

    def score_batch(examples: list[Any]) -> None:
        if any(item.split != split for item in examples):
            raise ValueError(f"Filtered {split} stream emitted a target from another partition.")
        tokens, _masks, labels = encode_sequence_batch(examples)
        current, history = make_arm_features(tokens)
        labels_out.append(labels)
        for seed, pair in models.items():
            current_scores = np.asarray(pair["current_only"].decision_function(current), dtype=np.float64)
            history_scores = np.asarray(pair["history_enabled"].decision_function(history), dtype=np.float64)
            score_parts[seed]["current_only"].append(current_scores)
            score_parts[seed]["history_enabled"].append(history_scores)
        if retain_metadata:
            ordinals = np.asarray([int(item.source_row_ordinal) for item in examples], dtype=np.int64)
            steps = np.asarray([int(item.target_step) for item in examples], dtype=np.int16)
            metadata_parts["ordinals"].append(ordinals)
            metadata_parts["steps"].append(steps)

    for example in iterator:
        batch.append(example)
        if len(batch) == batch_size:
            score_batch(batch)
            batch.clear()
    if batch:
        score_batch(batch)

    labels = np.concatenate(labels_out).astype(np.int8, copy=False)
    if len(labels) != expected_count:
        raise ValueError(f"{split} stream yielded {len(labels)} labels; expected {expected_count}.")
    scores = {
        seed: {name: np.concatenate(parts) for name, parts in by_model.items()}
        for seed, by_model in score_parts.items()
    }
    for seed_scores in scores.values():
        for name, values in seed_scores.items():
            if len(values) != expected_count or not np.isfinite(values).all():
                raise ValueError(f"{split} {name} scores are missing, non-finite, or misaligned.")
    metadata = {
        name: np.concatenate(parts) if parts else np.empty(0, dtype=np.int64)
        for name, parts in metadata_parts.items()
    }
    return labels, scores, metadata


def _write_prediction_csv(
    path: Path,
    *,
    seed: int,
    labels: np.ndarray,
    scores: dict[str, np.ndarray],
    thresholds: dict[str, float],
    ordinals: np.ndarray,
    steps: np.ndarray,
    config: dict[str, Any],
    check_unique_keys: bool,
) -> dict[str, Any]:
    predictions = {name: apply_frozen_threshold(scores[name], thresholds[name]) for name in EXPECTED_MODEL_NAMES}
    seen_keys: set[str] | None = set() if check_unique_keys else None
    row_count = 0
    with path.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="") as text:
                writer = csv.DictWriter(text, fieldnames=EXPORT_FIELDS, lineterminator="\n")
                writer.writeheader()
                for index, ordinal_value in enumerate(ordinals):
                    ordinal = int(ordinal_value)
                    row_key = make_source_row_key(
                        config["dataset"]["archive_sha256"], config["dataset"]["csv_member"], ordinal
                    )
                    if seen_keys is not None:
                        if row_key in seen_keys:
                            raise ValueError(f"Duplicate source row key generated for ordinal {ordinal}.")
                        seen_keys.add(row_key)
                    writer.writerow(
                        {
                            "row_key": row_key,
                            "source_archive_sha256": config["dataset"]["archive_sha256"],
                            "source_csv_member": config["dataset"]["csv_member"],
                            "source_data_row_ordinal": ordinal,
                            "target_split": "test",
                            "target_step": int(steps[index]),
                            "ground_truth_label_evaluation_only": int(labels[index]),
                            "seed": seed,
                            "current_only_score": format(float(scores["current_only"][index]), ".17g"),
                            "current_only_threshold": format(float(thresholds["current_only"]), ".17g"),
                            "current_only_prediction": int(predictions["current_only"][index]),
                            "history_enabled_score": format(float(scores["history_enabled"][index]), ".17g"),
                            "history_enabled_threshold": format(float(thresholds["history_enabled"]), ".17g"),
                            "history_enabled_prediction": int(predictions["history_enabled"][index]),
                        }
                    )
                    row_count += 1
    if seen_keys is not None and len(seen_keys) != row_count:
        raise ValueError("Row-key uniqueness check failed.")
    return {
        "path": str(path.name),
        "format": "gzip-compressed CSV with deterministic mtime=0",
        "sha256": sha256_file(path),
        "row_count": row_count,
        "unique_row_keys_checked": seen_keys is not None,
        "columns": list(EXPORT_FIELDS),
        "ground_truth_used_for_scoring_or_thresholding": False,
    }


def _verify_prediction_csv(
    path: Path,
    *,
    expected_seed: int,
    expected_labels: np.ndarray,
    expected_scores: dict[str, np.ndarray],
    thresholds: dict[str, float],
    expected_ordinals: np.ndarray,
    expected_steps: np.ndarray,
    config: dict[str, Any],
) -> dict[str, dict[str, float | int]]:
    labels: list[int] = []
    scores: dict[str, list[float]] = {name: [] for name in EXPECTED_MODEL_NAMES}
    expected_predictions = {
        name: apply_frozen_threshold(expected_scores[name], thresholds[name])
        for name in EXPECTED_MODEL_NAMES
    }
    seen: set[str] = set()
    with gzip.open(path, mode="rt", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if tuple(reader.fieldnames or ()) != EXPORT_FIELDS:
            raise ValueError("Prediction export columns differ from the declared schema.")
        for index, row in enumerate(reader):
            if index >= len(expected_labels):
                raise ValueError("Prediction export has more rows than the test target set.")
            ordinal = int(row["source_data_row_ordinal"])
            step = int(row["target_step"])
            label = int(row["ground_truth_label_evaluation_only"])
            if (
                row["target_split"] != "test"
                or int(row["seed"]) != expected_seed
                or ordinal != int(expected_ordinals[index])
                or step != int(expected_steps[index])
                or label != int(expected_labels[index])
                or row["source_archive_sha256"] != config["dataset"]["archive_sha256"]
                or row["source_csv_member"] != config["dataset"]["csv_member"]
            ):
                raise ValueError("Prediction export row identity, split, or evaluation label changed.")
            row_key = make_source_row_key(
                config["dataset"]["archive_sha256"], config["dataset"]["csv_member"], ordinal
            )
            if row["row_key"] != row_key or row_key in seen:
                raise ValueError("Prediction export row key is invalid or duplicated.")
            seen.add(row_key)
            labels.append(label)
            for name in EXPECTED_MODEL_NAMES:
                score = float(row[f"{name}_score"])
                threshold = float(row[f"{name}_threshold"])
                prediction = int(row[f"{name}_prediction"])
                if (
                    not math.isfinite(score)
                    or threshold != float(thresholds[name])
                    or score != float(expected_scores[name][index])
                    or prediction != int(expected_predictions[name][index])
                ):
                    raise ValueError("Export score or decision does not reproduce the frozen inference result.")
                scores[name].append(score)
        if len(labels) != len(expected_labels) or len(seen) != len(expected_labels):
            raise ValueError("Prediction export row count or key uniqueness differs from the test targets.")

    labels_array = np.asarray(labels, dtype=np.int8)
    reproduced: dict[str, dict[str, float | int]] = {}
    for name in EXPECTED_MODEL_NAMES:
        score_array = np.asarray(scores[name], dtype=np.float64)
        reproduced[name] = evaluate_scores(labels_array, score_array, thresholds[name])
    return reproduced


def _compare_metrics(
    left: dict[str, float | int], right: dict[str, float | int], *, atol: float = 1e-10, rtol: float = 1e-10
) -> bool:
    for key in ALL_METRICS:
        if key in ("true_positives", "true_negatives", "false_positives", "false_negatives"):
            if int(left[key]) != int(right[key]):
                return False
        elif not np.isclose(float(left[key]), float(right[key]), atol=atol, rtol=rtol):
            return False
    return True


def _write_results_report(output: Path, manifest: dict[str, Any]) -> None:
    lines = [
        "# PaySim History Ablation — Results",
        "",
        f"**Status:** {manifest['status']}  ",
        f"**Primary metric:** {manifest['analysis']['primary_metric']}  ",
        "**Scope:** synthetic PaySim C-prefixed `nameDest` recipient histories; fixed chronological test split only.",
        "",
        "The frozen preregistration and configuration hashes are recorded in the adjacent experiment manifest. Scores are uncalibrated decision margins, not probabilities.",
        "",
        "## Per-seed test metrics",
        "",
        "| Seed | Arm | Average Precision | PR-AUC | ROC-AUC | Precision | Recall | F1 | Threshold | TP / TN / FP / FN | Runtime (s) |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---:|",
    ]
    for seed in manifest["seeds"]:
        for arm in EXPECTED_MODEL_NAMES:
            run = manifest["runs"][str(seed)][arm]
            metrics = run["test_metrics"]
            confusion = " / ".join(
                str(metrics[key])
                for key in ("true_positives", "true_negatives", "false_positives", "false_negatives")
            )
            lines.append(
                f"| {seed} | {arm} | {metrics['average_precision']:.17g} | {metrics['pr_auc']:.17g} | "
                f"{metrics['roc_auc']:.17g} | {metrics['precision_at_threshold']:.17g} | "
                f"{metrics['recall_at_threshold']:.17g} | {metrics['f1_at_threshold']:.17g} | "
                f"{metrics['threshold']:.17g} | {confusion} | {run['training']['duration_seconds']:.6f} |"
            )
    lines.extend(
        [
            "",
            "## Paired history-minus-current-only differences",
            "",
            f"Unit: {manifest['analysis']['uncertainty']['unit_of_analysis']}. The 95% t intervals are descriptive across three seeds on one fixed test split; they are not significance tests.",
            "",
            "| Metric | Per-seed differences | Mean | Sample SD | Two-sided 95% t interval |",
            "|---|---|---:|---:|---|",
        ]
    )
    for metric, summary in manifest["analysis"]["uncertainty"]["metrics"].items():
        deltas = ", ".join(f"{float(value):.17g}" for value in summary["paired_differences"])
        interval = summary.get("two_sided_95_percent_student_t_interval")
        interval_text = "—" if interval is None else f"[{interval[0]:.17g}, {interval[1]:.17g}]"
        lines.append(
            f"| {metric} | {deltas} | {summary['mean']:.17g} | "
            f"{summary['sample_standard_deviation']:.17g} | {interval_text} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation boundaries",
            "",
            "The primary conclusion is determined only by the preregistered Average Precision differences. False-positive/false-negative trade-offs are described from the paired confusion counts at validation-selected thresholds. The experiment does not support sender-personalized, device/location/channel, real-world banking, or cross-dataset claims.",
            "",
            "The row-level predictions are regenerated from the saved per-seed models and frozen thresholds. Labels are included only in evaluation-only columns after score generation; these are not original training-time predictions.",
            "",
        ]
    )
    output.write_text("\n".join(lines), encoding="utf-8")


def run_history_ablation(
    *,
    archive_path: Path,
    contract_path: Path,
    config_path: Path,
    prereg_path: Path,
    artifact_directory: Path,
) -> dict[str, Any]:
    """Train all preregistered pairs, freeze validation thresholds, then evaluate test once."""
    archive_path = archive_path.resolve()
    contract_path = contract_path.resolve()
    config_path = config_path.resolve()
    prereg_path = prereg_path.resolve()
    artifact_directory = artifact_directory.resolve()
    if artifact_directory.exists():
        raise FileExistsError(f"Refusing to overwrite an existing Phase 16 artifact directory: {artifact_directory}")
    config, config_hash, prereg_hash = _verify_preregistration(config_path, prereg_path)
    _verify_dataset_config(config, archive_path, contract_path)
    seeds = [int(seed) for seed in config["seeds"]]
    if len(seeds) != 3 or len(set(seeds)) != len(seeds):
        raise ValueError("This preregistration requires exactly three distinct fixed seeds.")

    reader = open_paysim_label_blind_sequence_reader(
        archive_path,
        contract_path,
        chunksize=int(config["streaming"]["csv_chunksize_rows"]),
    )
    _validate_audit(reader, config)
    artifact_directory.mkdir(parents=True, exist_ok=False)
    for seed in seeds:
        (artifact_directory / f"seed-{seed}").mkdir()
    split_targets = config["split"]["recipient_targets"]
    class_weight_data = config["model"]["class_weight"]
    negative = int(class_weight_data["train_negative_targets"])
    positive = int(class_weight_data["train_positive_targets"])
    expected_weight = negative / positive
    if not np.isclose(expected_weight, float(class_weight_data["positive_class_weight"]), atol=1e-12, rtol=1e-12):
        raise ValueError("Preregistered training-only class weight does not match its training class counts.")

    manifest: dict[str, Any] = {
        "experiment_id": EXPERIMENT_ID,
        "schema_version": "layernet-paysim-history-ablation-manifest.v1",
        "status": "training",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "preregistration": {
            "path": str(prereg_path),
            "sha256": prereg_hash,
            "configuration_path": str(config_path),
            "configuration_sha256": config_hash,
        },
        "dataset": {
            **config["dataset"],
            "actual_archive_sha256": sha256_file(archive_path),
            "actual_contract_sha256": sha256_file(contract_path),
        },
        "split": config["split"],
        "experimental_design": config["arms"],
        "training_configuration": config["model"],
        "threshold_selection_rule": config["threshold_selection"],
        "seeds": seeds,
        "runs": {str(seed): {name: {"status": "pending"} for name in EXPECTED_MODEL_NAMES} for seed in seeds},
        "test_evaluation": {"status": "not_started", "started_after_all_validation_thresholds_frozen": False},
        "runtime": _runtime_metadata(),
        "source_provenance": _source_provenance(),
        "outputs": {},
    }
    _write_json(artifact_directory / "manifest.json", manifest)

    selection_freeze: dict[str, Any] = {
        "experiment_id": EXPERIMENT_ID,
        "preregistration_sha256": prereg_hash,
        "configuration_sha256": config_hash,
        "seeds": seeds,
        "runs": {},
        "test_evaluation_started": False,
    }
    trained_models: dict[int, dict[str, Any]] = {}

    for seed in seeds:
        seed_directory = artifact_directory / f"seed-{seed}"
        start = time.perf_counter()
        pair, training = _train_pair(reader, seed=seed, negative=negative, positive=positive)
        training["duration_seconds"] = time.perf_counter() - start
        trained_models[seed] = {}
        for arm in EXPECTED_MODEL_NAMES:
            model_path = seed_directory / f"{arm}.joblib"
            joblib.dump(pair[arm], model_path, compress=3)
            model_hash = sha256_file(model_path)
            loaded = joblib.load(model_path)
            if not hasattr(loaded, "decision_function"):
                raise ValueError(f"Saved {arm} model for seed {seed} cannot produce decision scores.")
            trained_models[seed][arm] = loaded

        validation_started = time.perf_counter()
        validation_labels, validation_scores, _ = _score_split(
            reader,
            "validation",
            {seed: trained_models[seed]},
            batch_size=int(config["streaming"]["test_batch_size"]),
            expected_count=int(split_targets["validation"]),
            retain_metadata=False,
        )
        validation_duration = time.perf_counter() - validation_started
        if int(validation_labels.sum()) <= 0 or int(validation_labels.sum()) >= len(validation_labels):
            raise ValueError("Validation targets must contain both classes before threshold selection.")

        run_records: dict[str, Any] = {}
        for arm in EXPECTED_MODEL_NAMES:
            threshold, selection = choose_validation_f1_threshold(validation_labels, validation_scores[seed][arm])
            validation_metrics = evaluate_scores(validation_labels, validation_scores[seed][arm], threshold)
            model_path = seed_directory / f"{arm}.joblib"
            run_records[arm] = {
                "status": "validation_frozen",
                "model": {
                    "path": str(model_path.relative_to(artifact_directory)),
                    "sha256": sha256_file(model_path),
                    "family": "sklearn.linear_model.SGDClassifier",
                    "fit_partition": "train",
                    "fit_targets": training["train_targets_seen_per_arm"],
                    "input_definition": config["arms"]["A_current_only"]["input"]
                    if arm == "current_only"
                    else config["arms"]["B_current_plus_history"]["input"],
                },
                "training": training,
                "validation": {
                    "threshold": threshold,
                    "selection": selection,
                    "metrics": validation_metrics,
                    "score_orientation": "higher = more suspicious; uncalibrated decision margin",
                    "scoring_duration_seconds": validation_duration,
                },
            }
            selection_freeze["runs"].setdefault(str(seed), {})[arm] = {
                "model_sha256": run_records[arm]["model"]["sha256"],
                "threshold": threshold,
                "selection": selection,
            }
        manifest["runs"][str(seed)] = run_records
        _write_json(seed_directory / "validation.json", {"seed": seed, "runs": run_records})
        _write_json(artifact_directory / "manifest.json", manifest)

    selection_freeze_path = artifact_directory / "selection-freeze.json"
    _write_json(selection_freeze_path, selection_freeze)
    selection_freeze_hash = sha256_file(selection_freeze_path)
    manifest["selection_freeze"] = {
        "path": selection_freeze_path.name,
        "sha256": selection_freeze_hash,
        "frozen_before_test_scoring": True,
        "all_seeds_and_arms_complete": True,
    }
    manifest["status"] = "validation_frozen"
    manifest["test_evaluation"] = {
        "status": "not_started",
        "started_after_all_validation_thresholds_frozen": True,
        "selection_freeze_sha256": selection_freeze_hash,
    }
    _write_json(artifact_directory / "manifest.json", manifest)

    # Reload only the six saved artifacts and verify their recorded hashes before test access.
    frozen_models: dict[int, dict[str, Any]] = {}
    thresholds: dict[int, dict[str, float]] = {}
    for seed in seeds:
        frozen_models[seed] = {}
        thresholds[seed] = {}
        for arm in EXPECTED_MODEL_NAMES:
            record = manifest["runs"][str(seed)][arm]
            model_path = artifact_directory / record["model"]["path"]
            if sha256_file(model_path) != record["model"]["sha256"]:
                raise ValueError(f"Saved {arm} model hash changed before test scoring for seed {seed}.")
            frozen_models[seed][arm] = joblib.load(model_path)
            thresholds[seed][arm] = float(record["validation"]["threshold"])

    manifest["test_evaluation"] = {
        "status": "running",
        "started_after_all_validation_thresholds_frozen": True,
        "selection_freeze_sha256": selection_freeze_hash,
        "test_stream_open_count": 1,
    }
    manifest["status"] = "test_evaluation"
    _write_json(artifact_directory / "manifest.json", manifest)

    test_labels, test_scores, metadata = _score_split(
        reader,
        "test",
        frozen_models,
        batch_size=int(config["streaming"]["test_batch_size"]),
        expected_count=int(split_targets["test"]),
        retain_metadata=True,
    )
    ordinals = metadata["ordinals"]
    steps = metadata["steps"]
    if len(ordinals) != int(split_targets["test"]) or len(steps) != len(ordinals):
        raise ValueError("Test row identity metadata differs from the preregistered target count.")
    if not np.all((steps >= 356) & (steps <= 743)):
        raise ValueError("Test target steps fall outside the preregistered test partition.")
    metrics_by_seed: dict[int, dict[str, dict[str, float | int]]] = {}
    export_results: dict[str, Any] = {}
    first_seed_keys_checked = False
    for seed in seeds:
        test_metrics = {
            arm: evaluate_scores(test_labels, test_scores[seed][arm], thresholds[seed][arm])
            for arm in EXPECTED_MODEL_NAMES
        }
        metrics_by_seed[seed] = test_metrics
        prediction_path = artifact_directory / f"test-predictions-seed-{seed}.csv.gz"
        export_info = _write_prediction_csv(
            prediction_path,
            seed=seed,
            labels=test_labels,
            scores=test_scores[seed],
            thresholds=thresholds[seed],
            ordinals=ordinals,
            steps=steps,
            config=config,
            check_unique_keys=not first_seed_keys_checked,
        )
        first_seed_keys_checked = True
        replay_metrics = _verify_prediction_csv(
            prediction_path,
            expected_seed=seed,
            expected_labels=test_labels,
            expected_scores=test_scores[seed],
            thresholds=thresholds[seed],
            expected_ordinals=ordinals,
            expected_steps=steps,
            config=config,
        )
        if any(not _compare_metrics(test_metrics[arm], replay_metrics[arm]) for arm in EXPECTED_MODEL_NAMES):
            raise ValueError(f"Metrics do not reproduce from the saved prediction export for seed {seed}.")
        export_results[str(seed)] = {**export_info, "metrics_reproduced_from_export": True}
        for arm in EXPECTED_MODEL_NAMES:
            manifest["runs"][str(seed)][arm]["test_metrics"] = test_metrics[arm]
            manifest["runs"][str(seed)][arm]["test_status"] = "evaluated_from_frozen_model_and_threshold"
        _write_json(artifact_directory / "manifest.json", manifest)

    paired = summarize_paired_differences(metrics_by_seed)
    ap_differences = paired["metrics"]["average_precision"]["paired_differences"]
    all_positive = all(float(delta) > 0 for delta in ap_differences)
    all_negative = all(float(delta) < 0 for delta in ap_differences)
    manifest["analysis"] = {
        "primary_metric": config["outcomes"]["primary_metric"],
        "history_minus_current_only": paired,
        "direction_consistent_for_primary_metric": all_positive or all_negative,
        "primary_metric_direction": "positive_in_all_seeds" if all_positive else "negative_in_all_seeds" if all_negative else "mixed_or_zero",
        "uncertainty": {
            "unit_of_analysis": config["uncertainty"]["unit_of_analysis"],
            "method": config["uncertainty"]["interval"],
            "limitations": config["uncertainty"]["interpretation"],
            "metrics": paired["metrics"],
        },
    }
    manifest["outputs"] = export_results
    manifest["test_evaluation"] = {
        "status": "complete",
        "started_after_all_validation_thresholds_frozen": True,
        "selection_freeze_sha256": selection_freeze_hash,
        "test_stream_open_count": 1,
        "target_count": len(test_labels),
        "all_scores_finite": True,
        "all_threshold_rules_verified": True,
        "labels_used_only_after_score_generation": True,
    }
    manifest["status"] = "complete"
    manifest["completed_utc"] = datetime.now(timezone.utc).isoformat()
    manifest["source_provenance_after_run"] = _source_provenance()
    _write_json(artifact_directory / "manifest.json", manifest)
    _write_results_report(artifact_directory / "results.md", manifest)
    return manifest


def replay_frozen_test_only(
    *,
    archive_path: Path,
    contract_path: Path,
    config_path: Path,
    prereg_path: Path,
    frozen_artifact_directory: Path,
    artifact_directory: Path,
) -> dict[str, Any]:
    """Replay test inference from already-frozen Phase 16 models without training or reselection."""
    archive_path = archive_path.resolve()
    contract_path = contract_path.resolve()
    config_path = config_path.resolve()
    prereg_path = prereg_path.resolve()
    frozen_artifact_directory = frozen_artifact_directory.resolve()
    artifact_directory = artifact_directory.resolve()
    if artifact_directory.exists():
        raise FileExistsError(f"Refusing to overwrite an existing replay artifact directory: {artifact_directory}")

    config, config_hash, prereg_hash = _verify_preregistration(config_path, prereg_path)
    _verify_dataset_config(config, archive_path, contract_path)
    source_manifest_path = frozen_artifact_directory / "manifest.json"
    source_manifest = _read_json(source_manifest_path)
    source_manifest_hash = sha256_file(source_manifest_path)
    expected_failure = "Test source row ordinals are not strictly increasing."
    if (
        source_manifest.get("experiment_id") != EXPERIMENT_ID
        or source_manifest.get("status") != "partial"
        or source_manifest.get("failure", {}).get("message") != expected_failure
        or source_manifest.get("test_evaluation", {}).get("status") != "running"
    ):
        raise ValueError("Frozen source manifest is not the known interrupted post-selection test attempt.")
    if (
        source_manifest.get("preregistration", {}).get("configuration_sha256") != config_hash
        or source_manifest.get("preregistration", {}).get("sha256") != prereg_hash
        or source_manifest.get("dataset", {}).get("actual_archive_sha256") != config["dataset"]["archive_sha256"]
        or source_manifest.get("dataset", {}).get("actual_contract_sha256") != config["dataset"]["sequence_contract_sha256"]
        or source_manifest.get("training_configuration") != config["model"]
    ):
        raise ValueError("Frozen source manifest does not match the preregistered inputs.")
    if source_manifest.get("outputs"):
        raise ValueError("Interrupted source attempt unexpectedly contains prediction outputs.")

    freeze_record = source_manifest.get("selection_freeze", {})
    freeze_path = frozen_artifact_directory / str(freeze_record.get("path", ""))
    if not freeze_path.is_file() or sha256_file(freeze_path) != freeze_record.get("sha256"):
        raise ValueError("Frozen validation selection artifact is missing or its hash differs from the manifest.")
    freeze_bytes = freeze_path.read_bytes()
    selection_freeze = _read_json(freeze_path)
    if (
        selection_freeze.get("test_evaluation_started") is not False
        or selection_freeze.get("preregistration_sha256") != prereg_hash
        or selection_freeze.get("configuration_sha256") != config_hash
    ):
        raise ValueError("Selection-freeze artifact does not establish validation-only selection provenance.")

    recorded_sources = source_manifest.get("source_provenance", {}).get("source_files", {})
    unchanged_sources = (
        "ml/src/layernet_ml/contracts.py",
        "ml/src/layernet_ml/evaluation.py",
        "ml/src/layernet_ml/paysim_data.py",
        "ml/src/layernet_ml/paysim_prediction_export.py",
        "ml/src/layernet_ml/paysim_temporal.py",
        "ml/reports/paysim-sequence-contract-v1.json",
        "ml/reports/paysim-history-ablation-config-v1.json",
        "ml/reports/paysim-history-ablation-prereg-v1.md",
    )
    for source_name in unchanged_sources:
        recorded = recorded_sources.get(source_name, {}).get("sha256")
        if recorded is None or sha256_file(Path(source_name)) != recorded:
            raise ValueError(f"A training/inference dependency changed after validation freeze: {source_name}")

    seeds = [int(seed) for seed in config["seeds"]]
    frozen_models: dict[int, dict[str, Any]] = {}
    thresholds: dict[int, dict[str, float]] = {}
    runs: dict[str, dict[str, Any]] = {}
    for seed in seeds:
        seed_key = str(seed)
        frozen_models[seed] = {}
        thresholds[seed] = {}
        runs[seed_key] = {}
        freeze_runs = selection_freeze.get("runs", {}).get(seed_key, {})
        for arm in EXPECTED_MODEL_NAMES:
            run_record = json.loads(json.dumps(source_manifest["runs"][seed_key][arm]))
            model_record = run_record["model"]
            validation_record = run_record["validation"]
            frozen_record = freeze_runs.get(arm, {})
            model_path = (frozen_artifact_directory / model_record["path"]).resolve()
            if not model_path.is_relative_to(frozen_artifact_directory):
                raise ValueError("Frozen model reference escapes the selected experiment artifact directory.")
            if (
                run_record.get("status") != "validation_frozen"
                or model_record.get("fit_partition") != "train"
                or validation_record.get("selection", {}).get("source_split") != "validation"
                or frozen_record.get("model_sha256") != model_record.get("sha256")
                or float(frozen_record.get("threshold")) != float(validation_record.get("threshold"))
                or frozen_record.get("selection") != validation_record.get("selection")
                or sha256_file(model_path) != model_record.get("sha256")
            ):
                raise ValueError(f"Seed {seed} {arm} model or validation threshold is not frozen consistently.")
            model = joblib.load(model_path)
            if not hasattr(model, "decision_function"):
                raise ValueError(f"Saved seed {seed} {arm} model cannot produce inference scores.")
            frozen_models[seed][arm] = model
            thresholds[seed][arm] = float(validation_record["threshold"])
            run_record["replay_model_reference"] = {
                "artifact_directory": str(frozen_artifact_directory),
                "path": model_record["path"],
                "sha256": model_record["sha256"],
            }
            runs[seed_key][arm] = run_record

    reader = open_paysim_label_blind_sequence_reader(
        archive_path,
        contract_path,
        chunksize=int(config["streaming"]["csv_chunksize_rows"]),
    )
    _validate_audit(reader, config)

    artifact_directory.mkdir(parents=True, exist_ok=False)
    (artifact_directory / "selection-freeze.json").write_bytes(freeze_bytes)
    replay_manifest: dict[str, Any] = {
        "experiment_id": EXPERIMENT_ID,
        "schema_version": "layernet-paysim-history-ablation-replay-manifest.v1",
        "status": "test_replay",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "replay_only": True,
        "preregistration": source_manifest["preregistration"],
        "dataset": source_manifest["dataset"],
        "split": config["split"],
        "experimental_design": config["arms"],
        "training_configuration": config["model"],
        "threshold_selection_rule": config["threshold_selection"],
        "seeds": seeds,
        "runs": runs,
        "runtime": _runtime_metadata(),
        "training_source": {
            "artifact_directory": str(frozen_artifact_directory),
            "manifest_path": str(source_manifest_path),
            "manifest_sha256": source_manifest_hash,
            "manifest_status": source_manifest["status"],
            "selection_freeze_sha256": freeze_record["sha256"],
            "source_manifest_failure": source_manifest["failure"],
        },
        "source_provenance_at_replay": _source_provenance(),
        "replay_code_correction": {
            "changed_source_file": "ml/src/layernet_ml/paysim_ablation.py",
            "training_time_sha256": recorded_sources["ml/src/layernet_ml/paysim_ablation.py"]["sha256"],
            "replay_time_sha256": sha256_file(Path("ml/src/layernet_ml/paysim_ablation.py")),
            "change": "Removed the invalid global source-row-ordinal monotonicity assertion. The sequence reader emits deterministic step/entity order, which need not be globally ordered by original CSV ordinal. Rows are kept in emitted order and keyed by their original source ordinal; model inputs and scores are not reordered.",
            "training_and_feature_dependencies_unchanged": list(unchanged_sources),
        },
        "deviation": {
            "status": "partial prior test-scoring attempt aborted before metrics or prediction files were produced",
            "failure": source_manifest["failure"],
            "selection_or_configuration_effect": "none; all six validation thresholds were frozen before the attempt and remain unchanged",
            "successful_full_test_replay_count": 1,
        },
        "test_evaluation": {
            "status": "running",
            "thresholds_frozen_before_this_replay": True,
            "selection_freeze_sha256": freeze_record["sha256"],
            "aborted_prior_partial_scoring_attempts": 1,
            "test_metrics_or_exports_from_prior_attempt": False,
        },
        "outputs": {},
    }
    _write_json(artifact_directory / "manifest.json", replay_manifest)

    test_started = time.perf_counter()
    test_labels, test_scores, metadata = _score_split(
        reader,
        "test",
        frozen_models,
        batch_size=int(config["streaming"]["test_batch_size"]),
        expected_count=int(config["split"]["recipient_targets"]["test"]),
        retain_metadata=True,
    )
    ordinals = metadata["ordinals"]
    steps = metadata["steps"]
    if len(ordinals) != int(config["split"]["recipient_targets"]["test"]) or len(steps) != len(ordinals):
        raise ValueError("Replayed test target identity metadata has the wrong row count.")

    metrics_by_seed: dict[int, dict[str, dict[str, float | int]]] = {}
    output_records: dict[str, Any] = {}
    first_keys_checked = False
    for seed in seeds:
        metrics = {
            arm: evaluate_scores(test_labels, test_scores[seed][arm], thresholds[seed][arm])
            for arm in EXPECTED_MODEL_NAMES
        }
        metrics_by_seed[seed] = metrics
        prediction_path = artifact_directory / f"test-predictions-seed-{seed}.csv.gz"
        export_record = _write_prediction_csv(
            prediction_path,
            seed=seed,
            labels=test_labels,
            scores=test_scores[seed],
            thresholds=thresholds[seed],
            ordinals=ordinals,
            steps=steps,
            config=config,
            check_unique_keys=not first_keys_checked,
        )
        first_keys_checked = True
        reproduced = _verify_prediction_csv(
            prediction_path,
            expected_seed=seed,
            expected_labels=test_labels,
            expected_scores=test_scores[seed],
            thresholds=thresholds[seed],
            expected_ordinals=ordinals,
            expected_steps=steps,
            config=config,
        )
        if any(not _compare_metrics(metrics[arm], reproduced[arm]) for arm in EXPECTED_MODEL_NAMES):
            raise ValueError(f"Seed {seed} metrics do not reproduce from its saved row-level export.")
        output_records[str(seed)] = {
            **export_record,
            "metrics_reproduced_from_export": True,
        }
        for arm in EXPECTED_MODEL_NAMES:
            runs[str(seed)][arm]["test_metrics"] = metrics[arm]
            runs[str(seed)][arm]["test_status"] = "evaluated_from_frozen_model_and_validation_threshold"
        replay_manifest["outputs"] = output_records
        _write_json(artifact_directory / "manifest.json", replay_manifest)

    uncertainty = summarize_paired_differences(metrics_by_seed)
    deltas = uncertainty["metrics"]["average_precision"]["paired_differences"]
    replay_manifest["analysis"] = {
        "primary_metric": config["outcomes"]["primary_metric"],
        "history_minus_current_only": uncertainty,
        "direction_consistent_for_primary_metric": all(float(value) > 0 for value in deltas)
        or all(float(value) < 0 for value in deltas),
        "primary_metric_direction": "positive_in_all_seeds"
        if all(float(value) > 0 for value in deltas)
        else "negative_in_all_seeds"
        if all(float(value) < 0 for value in deltas)
        else "mixed_or_zero",
        "uncertainty": {
            "unit_of_analysis": config["uncertainty"]["unit_of_analysis"],
            "method": config["uncertainty"]["interval"],
            "limitations": config["uncertainty"]["interpretation"],
            "metrics": uncertainty["metrics"],
        },
    }
    replay_manifest["test_evaluation"] = {
        **replay_manifest["test_evaluation"],
        "status": "complete",
        "successful_test_stream_open_count": 1,
        "target_count": len(test_labels),
        "all_scores_finite": True,
        "all_threshold_rules_verified": True,
        "labels_used_only_after_score_generation": True,
        "duration_seconds": time.perf_counter() - test_started,
        "process_memory_after_evaluation": _windows_memory_bytes(),
    }
    replay_manifest["status"] = "partial"
    replay_manifest["completed_utc"] = datetime.now(timezone.utc).isoformat()
    replay_manifest["partial_status_reason"] = (
        "A prior test-scoring attempt read a partial batch after all thresholds were frozen, then aborted on an invalid row-order assertion. "
        "No test metrics or prediction artifacts were produced by that attempt; this replay produced and verified the complete test results."
    )
    replay_manifest["source_provenance_after_replay"] = _source_provenance()
    _write_json(artifact_directory / "manifest.json", replay_manifest)
    _write_results_report(artifact_directory / "results.md", replay_manifest)
    (artifact_directory / "thesis-notes.md").write_text(
        "\n".join(
            [
                "# PaySim History Ablation — Thesis Notes",
                "",
                "## Supported by this experiment",
                "",
                f"- Under the preregistered current-only versus current-plus-recipient-history comparison, the measured test Average Precision paired differences were {', '.join(format(float(value), '.17g') for value in deltas)} for seeds {', '.join(str(seed) for seed in seeds)}.",
                "- Results apply to this synthetic PaySim release, its fixed chronological split, C-prefixed `nameDest` recipient histories, and the recorded SGD training configuration.",
                "- Precision/recall trade-offs are described only by the exported frozen-threshold predictions and confusion counts.",
                "",
                "## Not established",
                "",
                "- Sender-personalized customer behavior, real-bank behavior, device/location/channel signals, or generalization outside this PaySim split.",
                "- Statistical significance or independent-dataset uncertainty; the three seeds share one fixed test partition.",
                "- Probability calibration; model outputs are uncalibrated decision margins.",
                "",
                "## Execution deviation",
                "",
                "A prior test-scoring attempt was aborted after a source-row ordering assertion failed. All thresholds were already frozen, no aggregate test metrics or prediction files were created by that attempt, and no selection or configuration changed. The successful row-keyed replay is recorded in the adjacent manifest; Phase status remains PARTIAL because of this deviation from the preregistered single-stream execution.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return replay_manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the preregistered PaySim history ablation.")
    parser.add_argument("--archive", type=Path, default=Path("ml/data/paysim/paysim-author-release-v2.zip"))
    parser.add_argument("--contract", type=Path, default=Path("ml/reports/paysim-sequence-contract-v1.json"))
    parser.add_argument("--config", type=Path, default=Path("ml/reports/paysim-history-ablation-config-v1.json"))
    parser.add_argument("--prereg", type=Path, default=Path("ml/reports/paysim-history-ablation-prereg-v1.md"))
    parser.add_argument(
        "--replay-from",
        type=Path,
        help="Replay test inference from a saved all-seed validation freeze without retraining.",
    )
    parser.add_argument("--artifacts", type=Path, default=None)
    args = parser.parse_args(argv)
    artifact_path = args.artifacts or (
        Path("ml/artifacts/paysim-history-ablation-v1-test-replay-v1")
        if args.replay_from is not None
        else Path("ml/artifacts/paysim-history-ablation-v1")
    )
    try:
        if args.replay_from is not None:
            manifest = replay_frozen_test_only(
                archive_path=args.archive,
                contract_path=args.contract,
                config_path=args.config,
                prereg_path=args.prereg,
                frozen_artifact_directory=args.replay_from,
                artifact_directory=artifact_path,
            )
        else:
            manifest = run_history_ablation(
                archive_path=args.archive,
                contract_path=args.contract,
                config_path=args.config,
                prereg_path=args.prereg,
                artifact_directory=artifact_path,
            )
    except Exception as error:
        artifact_directory = artifact_path.resolve()
        if artifact_directory.is_dir():
            manifest_path = artifact_directory / "manifest.json"
            if manifest_path.is_file():
                try:
                    incomplete = _read_json(manifest_path)
                    incomplete["status"] = "partial"
                    incomplete["failure"] = {
                        "type": type(error).__name__,
                        "message": str(error),
                        "observed_utc": datetime.now(timezone.utc).isoformat(),
                    }
                    _write_json(manifest_path, incomplete)
                except Exception:
                    pass
        parser.exit(2, f"Phase 16 run stopped: {type(error).__name__}: {error}\n")
    print(json.dumps(manifest, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
