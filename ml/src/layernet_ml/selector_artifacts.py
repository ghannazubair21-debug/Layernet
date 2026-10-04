from __future__ import annotations

import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier

from .contracts import PositiveClassProbabilityAdapter
from .data import (
    DATASET_SCHEMA_VERSION,
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    TARGET_COLUMN,
    TIME_COLUMN,
    build_features,
    chronological_split,
    validate_dataset,
)
from .pipeline import DATASET_SOURCE, sha256_file

DEFAULT_DATASET_PATH = Path("ml/data/raw/creditcard.csv")
DEFAULT_ARTIFACT_DIRECTORY = Path("ml/artifacts/ensemble-selectors-v1")
SPLIT_STRATEGY = "chronological contiguous 60/20/20 by elapsed Time; tied timestamps remain in one split"
BASELINE_FILES = {
    "xgboost": ("xgboost-v1", "xgboost_model.joblib"),
    "random_forest": ("random-forest-v1", "random_forest_model.joblib"),
    "isolation_forest": ("isolation-forest-v1", "isolation_forest_model.joblib"),
}


def build_xgboost_selector_parameters(selection_parameters: dict[str, Any]) -> dict[str, Any]:
    """Reuse the recorded XGBoost search configuration without validation early stopping."""
    parameters = dict(selection_parameters)
    parameters.pop("early_stopping_rounds", None)
    if "n_estimators" not in parameters or "random_state" not in parameters:
        raise ValueError("Recorded XGBoost selection parameters are incomplete.")
    return parameters


def build_random_forest_selector_parameters(selection_candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Use the smallest already-declared RF candidate without validation-based selection."""
    candidates = [
        candidate["parameters"]
        for candidate in selection_candidates
        if isinstance(candidate.get("parameters"), dict) and "n_estimators" in candidate["parameters"]
    ]
    if not candidates:
        raise ValueError("Recorded Random Forest selection candidates are missing parameters.")
    return dict(min(candidates, key=lambda parameters: int(parameters["n_estimators"])))


def _partition_metadata(name: str, frame: pd.DataFrame) -> dict[str, int | float | str]:
    return {
        "name": name,
        "rows": len(frame),
        "fraud_count": int(frame[TARGET_COLUMN].sum()),
        "time_start": float(frame[TIME_COLUMN].iloc[0]),
        "time_end": float(frame[TIME_COLUMN].iloc[-1]),
    }


def _load_baseline_manifests(artifact_root: Path, dataset_hash: str) -> dict[str, dict[str, Any]]:
    manifests: dict[str, dict[str, Any]] = {}
    reference_split_metadata: list[dict[str, Any]] | None = None
    for model_family, (directory_name, model_filename) in BASELINE_FILES.items():
        artifact_directory = artifact_root / directory_name
        manifest_path = artifact_directory / "manifest.json"
        model_path = artifact_directory / model_filename
        if not manifest_path.is_file() or not model_path.is_file():
            raise FileNotFoundError(f"Missing accepted {model_family} baseline artifacts in {artifact_directory}.")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("model_family") != model_family:
            raise ValueError(f"Unexpected model family in {manifest_path}.")
        if sha256_file(model_path) != manifest.get("model_sha256"):
            raise ValueError(f"Model artifact hash does not match {manifest_path}.")
        if manifest.get("dataset", {}).get("raw_csv_sha256") != dataset_hash:
            raise ValueError(f"Dataset hash differs in {manifest_path}.")
        if manifest.get("dataset", {}).get("schema_version") != DATASET_SCHEMA_VERSION:
            raise ValueError(f"Dataset schema differs in {manifest_path}.")
        if manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION:
            raise ValueError(f"Feature schema differs in {manifest_path}.")
        if manifest.get("feature_columns") != list(FEATURE_COLUMNS):
            raise ValueError(f"Feature columns differ in {manifest_path}.")
        if manifest.get("split_strategy") != SPLIT_STRATEGY:
            raise ValueError(f"Split strategy differs in {manifest_path}.")
        split_metadata = manifest.get("splits")
        if not isinstance(split_metadata, list) or len(split_metadata) != 3:
            raise ValueError(f"Split metadata is incomplete in {manifest_path}.")
        if reference_split_metadata is None:
            reference_split_metadata = split_metadata
        elif split_metadata != reference_split_metadata:
            raise ValueError("Accepted baseline artifacts do not share identical split metadata.")
        manifests[model_family] = manifest
    return manifests


def _validate_saved_selectors(artifact_directory: Path, manifest: dict[str, Any]) -> tuple[Any, Any]:
    models = manifest["models"]
    loaded: dict[str, Any] = {}
    for model_family, filename in (
        ("xgboost", "xgboost_selector.joblib"),
        ("random_forest", "random_forest_selector.joblib"),
    ):
        model_path = artifact_directory / filename
        if sha256_file(model_path) != models[model_family]["model_sha256"]:
            raise ValueError(f"Selector model checksum does not match the manifest: {filename}.")
        loaded[model_family] = joblib.load(model_path)
    return loaded["xgboost"], loaded["random_forest"]


def regenerate_validation_predictions(dataset_path: Path, artifact_directory: Path) -> pd.DataFrame:
    """Regenerate oriented validation scores using only the saved train-only selectors."""
    manifest_path = artifact_directory / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing selector manifest: {manifest_path}.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    dataset_path = dataset_path.resolve()
    if sha256_file(dataset_path) != manifest["dataset"]["raw_csv_sha256"]:
        raise ValueError("Dataset checksum does not match the selector manifest.")
    if manifest.get("dataset", {}).get("schema_version") != DATASET_SCHEMA_VERSION:
        raise ValueError("Dataset schema does not match the selector manifest.")
    if manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION:
        raise ValueError("Feature schema does not match the selector manifest.")
    if manifest.get("feature_columns") != list(FEATURE_COLUMNS):
        raise ValueError("Feature columns do not match the selector manifest.")
    xgb_model, rf_model = _validate_saved_selectors(artifact_directory, manifest)

    frame, _ = validate_dataset(pd.read_csv(dataset_path))
    train, validation, _test = chronological_split(frame)
    actual_partitions = [
        _partition_metadata("train", train),
        _partition_metadata("validation", validation),
    ]
    if actual_partitions != manifest["partitions"]:
        raise ValueError("Dataset partitions do not match the selector manifest.")
    validation_features = build_features(validation)
    xgb_scores = PositiveClassProbabilityAdapter(xgb_model, "xgboost").score(validation_features)
    rf_scores = PositiveClassProbabilityAdapter(rf_model, "random_forest").score(validation_features)
    return pd.DataFrame(
        {
            "validation_position": np.arange(len(validation), dtype=np.int64),
            TIME_COLUMN: validation[TIME_COLUMN].to_numpy(dtype=np.float64),
            "xgboost_score": xgb_scores.values,
            "random_forest_score": rf_scores.values,
        }
    )


def train_selector_artifacts(
    dataset_path: Path = DEFAULT_DATASET_PATH,
    artifact_directory: Path = DEFAULT_ARTIFACT_DIRECTORY,
) -> dict[str, Any]:
    dataset_path = dataset_path.resolve()
    artifact_directory = artifact_directory.resolve()
    if artifact_directory.exists():
        raise FileExistsError(f"Refusing to overwrite existing selector artifacts: {artifact_directory}.")

    dataset_hash = sha256_file(dataset_path)
    artifact_root = artifact_directory.parent
    baselines = _load_baseline_manifests(artifact_root, dataset_hash)
    xgb_baseline = baselines["xgboost"]
    rf_baseline = baselines["random_forest"]

    frame, data_summary = validate_dataset(pd.read_csv(dataset_path))
    train, validation, _test = chronological_split(frame)
    partitions = [
        _partition_metadata("train", train),
        _partition_metadata("validation", validation),
    ]
    for model_family, baseline in baselines.items():
        expected_partitions = baseline["splits"][:2]
        if expected_partitions != partitions:
            raise ValueError(f"{model_family} baseline partitions do not match the local dataset.")

    x_train = build_features(train)
    y_train = train[TARGET_COLUMN].astype(np.int64)
    x_validation = build_features(validation)

    xgb_parameters = build_xgboost_selector_parameters(
        xgb_baseline["training"]["selection_fit_parameters"]
    )
    xgb_model = XGBClassifier(**xgb_parameters)
    # No validation eval_set or test partition is passed to fit.
    xgb_model.fit(x_train, y_train, verbose=False)

    rf_parameters = build_random_forest_selector_parameters(
        rf_baseline["training"]["selection_candidates"]
    )
    rf_model = RandomForestClassifier(**rf_parameters)
    # The fixed smallest previously declared candidate avoids reusing the
    # validation-selected 200-tree configuration for selector fitting.
    rf_model.fit(x_train, y_train)

    xgb_validation_scores = PositiveClassProbabilityAdapter(xgb_model, "xgboost").score(x_validation)
    rf_validation_scores = PositiveClassProbabilityAdapter(rf_model, "random_forest").score(x_validation)
    predictions = pd.DataFrame(
        {
            "validation_position": np.arange(len(validation), dtype=np.int64),
            TIME_COLUMN: validation[TIME_COLUMN].to_numpy(dtype=np.float64),
            "xgboost_score": xgb_validation_scores.values,
            "random_forest_score": rf_validation_scores.values,
        }
    )

    artifact_directory.mkdir(parents=True)
    xgb_model_path = artifact_directory / "xgboost_selector.joblib"
    rf_model_path = artifact_directory / "random_forest_selector.joblib"
    joblib.dump(xgb_model, xgb_model_path)
    joblib.dump(rf_model, rf_model_path)
    predictions_path = artifact_directory / "validation_predictions.csv"
    predictions.to_csv(predictions_path, index=False, float_format="%.17g")

    manifest: dict[str, Any] = {
        "experiment_id": "ensemble-selectors-v1",
        "purpose": "Train-only supervised selectors for out-of-sample validation score generation; not baseline replacements.",
        "dataset": {
            "name": "ULB / Worldline credit card fraud detection",
            "source": DATASET_SOURCE,
            "schema_version": DATASET_SCHEMA_VERSION,
            "raw_csv_sha256": dataset_hash,
            "rows_after_exact_deduplication": data_summary.row_count,
            "exact_duplicate_rows_removed": data_summary.duplicate_rows_removed,
        },
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_columns": list(FEATURE_COLUMNS),
        "target_column": TARGET_COLUMN,
        "excluded_columns": [TARGET_COLUMN, TIME_COLUMN],
        "split_strategy": SPLIT_STRATEGY,
        "partitions": partitions,
        "preprocessing": {
            "features": "existing fixed, label-free ULB feature builder",
            "learned_transform": None,
            "fit_partition": None,
        },
        "models": {
            "xgboost": {
                "model_family": "xgboost",
                "model_file": xgb_model_path.name,
                "model_sha256": sha256_file(xgb_model_path),
                "model_parameters": xgb_parameters,
                "fit_parameters": {"verbose": False},
                "fit_partitions": ["train"],
                "fit_rows": len(train),
                "fit_uses_validation": False,
                "fit_uses_test": False,
                "score_orientation": "higher = more suspicious; uncalibrated class-1 score",
            },
            "random_forest": {
                "model_family": "random_forest",
                "model_file": rf_model_path.name,
                "model_sha256": sha256_file(rf_model_path),
                "model_parameters": rf_parameters,
                "fit_partitions": ["train"],
                "fit_rows": len(train),
                "fit_uses_validation": False,
                "fit_uses_test": False,
                "score_orientation": "higher = more suspicious; uncalibrated class-1 score",
            },
        },
        "validation_predictions": {
            "file": predictions_path.name,
            "sha256": sha256_file(predictions_path),
            "rows": len(predictions),
            "columns": list(predictions.columns),
            "labels_included": False,
        },
        "baseline_artifacts": {
            model_family: {
                "directory": directory_name,
                "model_file": model_filename,
                "model_sha256": baselines[model_family]["model_sha256"],
            }
            for model_family, (directory_name, model_filename) in BASELINE_FILES.items()
        },
        "runtime": {
            "python": platform.python_version(),
            "packages": {
                package: importlib.metadata.version(package)
                for package in ("numpy", "pandas", "scikit-learn", "xgboost", "joblib")
            },
        },
        "test_partition_used": False,
    }
    manifest_path = artifact_directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    regenerated = regenerate_validation_predictions(dataset_path, artifact_directory)
    saved = pd.read_csv(predictions_path)
    if not np.array_equal(regenerated["validation_position"].to_numpy(), saved["validation_position"].to_numpy()):
        raise RuntimeError("Regenerated validation row positions differ from the saved prediction artifact.")
    for column in (TIME_COLUMN, "xgboost_score", "random_forest_score"):
        if not np.allclose(regenerated[column].to_numpy(), saved[column].to_numpy(), rtol=0.0, atol=1e-15):
            raise RuntimeError(f"Regenerated selector predictions do not match saved column {column}.")
    return manifest
