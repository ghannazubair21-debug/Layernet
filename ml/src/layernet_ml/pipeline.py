from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .contracts import ExperimentConfig, PositiveClassProbabilityAdapter
from .data import (
    DATASET_SCHEMA_VERSION,
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    TARGET_COLUMN,
    build_features,
    chronological_split,
    split_summary,
    validate_dataset,
)
from .evaluation import evaluate_scores

DATASET_SOURCE = "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
DEFAULT_THRESHOLD = 0.5
RANDOM_SEED = 42


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_both_labels(name: str, frame: pd.DataFrame) -> None:
    if set(frame[TARGET_COLUMN].unique().tolist()) != {0, 1}:
        raise ValueError(f"The chronological {name} split must contain both classes to evaluate fraud metrics.")


def train_and_evaluate(dataset_path: Path, artifact_directory: Path) -> dict[str, Any]:
    try:
        from xgboost import XGBClassifier
    except ImportError as error:
        raise RuntimeError("XGBoost is not installed. Install ml/requirements.txt before training.") from error

    dataset_path = dataset_path.resolve()
    frame = pd.read_csv(dataset_path)
    data, data_summary = validate_dataset(frame)
    train, validation, test = chronological_split(data)
    for split_name, split in (("train", train), ("validation", validation), ("test", test)):
        _require_both_labels(split_name, split)

    x_train, y_train = build_features(train), train[TARGET_COLUMN].astype(np.int64)
    x_validation, y_validation = build_features(validation), validation[TARGET_COLUMN].astype(np.int64)
    x_test, y_test = build_features(test), test[TARGET_COLUMN].astype(np.int64)
    scale_pos_weight = float((y_train == 0).sum() / (y_train == 1).sum())

    selection_parameters = {
        "objective": "binary:logistic",
        "eval_metric": "aucpr",
        "n_estimators": 500,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "reg_lambda": 1.0,
        "scale_pos_weight": scale_pos_weight,
        "tree_method": "hist",
        "n_jobs": 2,
        "random_state": RANDOM_SEED,
        "early_stopping_rounds": 30,
    }
    selector = XGBClassifier(**selection_parameters)
    selector.fit(x_train, y_train, eval_set=[(x_validation, y_validation)], verbose=False)
    validation_scores = PositiveClassProbabilityAdapter(selector, "xgboost").score(x_validation)
    validation_metrics = evaluate_scores(y_validation, validation_scores, threshold=DEFAULT_THRESHOLD)

    selected_estimators = int(selector.best_iteration) + 1
    combined_train = pd.concat([train, validation], ignore_index=True)
    x_combined, y_combined = build_features(combined_train), combined_train[TARGET_COLUMN].astype(np.int64)
    final_weight = float((y_combined == 0).sum() / (y_combined == 1).sum())
    final_parameters = {
        **selection_parameters,
        "n_estimators": selected_estimators,
        "scale_pos_weight": final_weight,
    }
    final_parameters.pop("early_stopping_rounds")
    model = XGBClassifier(**final_parameters)
    model.fit(x_combined, y_combined, verbose=False)
    test_scores = PositiveClassProbabilityAdapter(model, "xgboost").score(x_test)
    test_metrics = evaluate_scores(y_test, test_scores, threshold=DEFAULT_THRESHOLD)

    artifact_directory.mkdir(parents=True, exist_ok=True)
    model_path = artifact_directory / "xgboost_model.joblib"
    joblib.dump(model, model_path)
    model_hash = sha256_file(model_path)
    experiment = ExperimentConfig(
        experiment_id="A",
        model_families=("xgboost",),
        input_modality="tabular",
        dataset_schema_version=DATASET_SCHEMA_VERSION,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        random_seed=RANDOM_SEED,
        decision_threshold=DEFAULT_THRESHOLD,
    )
    manifest = {
        "experiment": experiment.to_dict(),
        "model_family": "xgboost",
        "model_version": model_hash[:16],
        "model_sha256": model_hash,
        "environment": {
            "python": platform.python_version(),
            "packages": {
                package: importlib.metadata.version(package)
                for package in ("numpy", "pandas", "scikit-learn", "xgboost", "joblib")
            },
        },
        "dataset": {
            "name": "ULB / Worldline credit card fraud detection",
            "source": DATASET_SOURCE,
            "schema_version": DATASET_SCHEMA_VERSION,
            "raw_csv_sha256": sha256_file(dataset_path),
            "rows_after_exact_deduplication": data_summary.row_count,
            "exact_duplicate_rows_removed": data_summary.duplicate_rows_removed,
            "fraud_count": data_summary.fraud_count,
            "legitimate_count": data_summary.legitimate_count,
        },
        "target_column": TARGET_COLUMN,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_columns": list(FEATURE_COLUMNS),
        "excluded_columns": [TARGET_COLUMN, "Time"],
        "split_strategy": "chronological contiguous 60/20/20 by elapsed Time; tied timestamps remain in one split",
        "splits": split_summary((train, validation, test)),
        "training": {
            "random_seed": RANDOM_SEED,
            "early_stopping_rounds": 30,
            "selected_estimators": selected_estimators,
            "scale_pos_weight_from_training_partition": scale_pos_weight,
            "scale_pos_weight_for_final_fit": final_weight,
            "final_fit_rows": len(combined_train),
            "selection_fit_parameters": selection_parameters,
            "final_fit_parameters": final_parameters,
        },
        "score_semantics": "Uncalibrated XGBoost ranking score from predict_proba; not a calibrated fraud probability.",
        "decision_threshold": DEFAULT_THRESHOLD,
        "probability_calibrated": False,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
    }
    (artifact_directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def load_model_bundle(artifact_directory: Path) -> tuple[Any, dict[str, Any]]:
    manifest_path = artifact_directory / "manifest.json"
    model_path = artifact_directory / "xgboost_model.joblib"
    if not manifest_path.is_file() or not model_path.is_file():
        raise FileNotFoundError("Expected manifest.json and xgboost_model.joblib in the artifact directory.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION or manifest.get("feature_columns") != list(FEATURE_COLUMNS):
        raise ValueError("Saved model feature schema does not match this inference adapter.")
    if sha256_file(model_path) != manifest.get("model_sha256"):
        raise ValueError("Saved model checksum does not match its manifest.")
    return joblib.load(model_path), manifest


def score_transaction(transaction: dict[str, float], artifact_directory: Path) -> dict[str, str | float]:
    """Score one dataset-shaped record; the Phase 1 UI record is intentionally not mapped to V1–V28."""
    model, manifest = load_model_bundle(artifact_directory)
    features = build_features(pd.DataFrame([transaction]))
    score = float(PositiveClassProbabilityAdapter(model, "xgboost").score(features).values[0])
    return {
        "model_family": str(manifest["model_family"]),
        "model_version": str(manifest["model_version"]),
        "score": score,
        "score_meaning": str(manifest["score_semantics"]),
    }
