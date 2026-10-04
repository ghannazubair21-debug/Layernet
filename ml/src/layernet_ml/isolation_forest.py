from __future__ import annotations

import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

from .contracts import ExperimentConfig, IsolationForestScoreAdapter, ModelFitData, RiskScorer
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
from .pipeline import DATASET_SOURCE, RANDOM_SEED, _require_both_labels, sha256_file

ISOLATION_FOREST_PARAMETERS: dict[str, Any] = {
    "n_estimators": 200,
    "max_samples": "auto",
    "contamination": "auto",
    "max_features": 1.0,
    "bootstrap": False,
    "n_jobs": 2,
    "random_state": RANDOM_SEED,
    "verbose": 0,
    "warm_start": False,
}
MODEL_NATIVE_THRESHOLD = 0.0


class IsolationForestTrainer:
    """Fit an unsupervised Isolation Forest using training features only."""

    model_family = "isolation_forest"

    def __init__(self) -> None:
        self.estimator: IsolationForest | None = None

    def fit(self, data: ModelFitData, config: ExperimentConfig) -> RiskScorer:
        if self.model_family not in config.model_families:
            raise ValueError("ExperimentConfig must include the isolation_forest model family.")
        if data.train_labels is not None or data.validation_labels is not None:
            raise ValueError("Isolation Forest is unsupervised and must not receive labels during fitting.")

        self.estimator = IsolationForest(**ISOLATION_FOREST_PARAMETERS)
        self.estimator.fit(data.train_features)
        return IsolationForestScoreAdapter(self.estimator)


def train_and_evaluate_isolation_forest(dataset_path: Path, artifact_directory: Path) -> dict[str, Any]:
    dataset_path = dataset_path.resolve()
    frame = pd.read_csv(dataset_path)
    data, data_summary = validate_dataset(frame)
    train, validation, test = chronological_split(data)
    _require_both_labels("validation", validation)

    x_train = build_features(train)
    x_validation = build_features(validation)
    config = ExperimentConfig(
        experiment_id="isolation-forest-baseline",
        model_families=("isolation_forest",),
        input_modality="tabular",
        dataset_schema_version=DATASET_SCHEMA_VERSION,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        random_seed=RANDOM_SEED,
        decision_threshold=MODEL_NATIVE_THRESHOLD,
    )
    trainer = IsolationForestTrainer()
    scorer = trainer.fit(
        ModelFitData(train_features=x_train, validation_features=x_validation),
        config,
    )
    validation_scores = scorer.score(x_validation)
    validation_metrics = evaluate_scores(
        validation[TARGET_COLUMN].astype("int64"),
        validation_scores,
        threshold=MODEL_NATIVE_THRESHOLD,
    )

    # Test features and labels enter the flow only after the train-only fit and
    # fixed estimator-native decision boundary have been established.
    _require_both_labels("test", test)
    x_test = build_features(test)
    test_scores = scorer.score(x_test)
    test_metrics = evaluate_scores(
        test[TARGET_COLUMN].astype("int64"),
        test_scores,
        threshold=MODEL_NATIVE_THRESHOLD,
    )
    if trainer.estimator is None:
        raise RuntimeError("Isolation Forest trainer did not retain its fitted estimator.")

    artifact_directory.mkdir(parents=True, exist_ok=True)
    model_path = artifact_directory / "isolation_forest_model.joblib"
    joblib.dump(trainer.estimator, model_path)
    model_hash = sha256_file(model_path)
    manifest = {
        "experiment": config.to_dict(),
        "model_family": "isolation_forest",
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
        "preprocessing": {
            "features": "existing fixed, label-free ULB feature builder",
            "learned_transform": None,
            "fit_partition": None,
            "model_fit_partition": "train",
        },
        "training": {
            "random_seed": RANDOM_SEED,
            "fit_uses_labels": False,
            "fit_partitions": ["train"],
            "fit_rows": len(train),
            "model_selection": "none; fixed unsupervised configuration",
            "threshold_policy": "fixed model-native decision boundary after score orientation; no label-based threshold selection",
            "model_parameters": ISOLATION_FOREST_PARAMETERS,
            "test_used_for_fit_or_selection": False,
        },
        "score_semantics": "Uncalibrated Isolation Forest anomaly ranking score (-decision_function); higher indicates greater anomaly, not a fraud probability.",
        "decision_threshold": MODEL_NATIVE_THRESHOLD,
        "score_calibrated": False,
        "probability_calibrated": False,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
    }
    (artifact_directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
