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

from .contracts import (
    ExperimentConfig,
    ModelFitData,
    PositiveClassProbabilityAdapter,
    RiskScorer,
)
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
from .pipeline import DATASET_SOURCE, DEFAULT_THRESHOLD, RANDOM_SEED, _require_both_labels, sha256_file

SELECTION_ESTIMATOR_COUNTS = (100, 200)
RANDOM_FOREST_PARAMETERS: dict[str, Any] = {
    "criterion": "gini",
    "max_depth": 12,
    "max_features": "sqrt",
    "min_samples_leaf": 2,
    "min_samples_split": 2,
    "bootstrap": True,
    "class_weight": "balanced_subsample",
    "n_jobs": 2,
    "random_state": RANDOM_SEED,
}


class RandomForestTrainer:
    """Select tree count on validation, without ever receiving the final test split."""

    model_family = "random_forest"

    def __init__(self) -> None:
        self.selected_estimators: int | None = None
        self.selection_records: list[dict[str, Any]] = []
        self.selected_validation_metrics: dict[str, float | int] | None = None
        self.selected_parameters: dict[str, Any] | None = None

    def fit(self, data: ModelFitData, config: ExperimentConfig) -> RiskScorer:
        if self.model_family not in config.model_families:
            raise ValueError("ExperimentConfig must include the random_forest model family.")
        if data.train_labels is None or data.validation_labels is None:
            raise ValueError("Random Forest selection requires train and validation labels.")
        if set(np.asarray(data.train_labels).tolist()) != {0, 1}:
            raise ValueError("Random Forest training partition must contain both classes.")
        if set(np.asarray(data.validation_labels).tolist()) != {0, 1}:
            raise ValueError("Random Forest validation partition must contain both classes.")

        best_model: RandomForestClassifier | None = None
        best_average_precision = -1.0
        for estimator_count in SELECTION_ESTIMATOR_COUNTS:
            parameters = {**RANDOM_FOREST_PARAMETERS, "n_estimators": estimator_count}
            candidate = RandomForestClassifier(**parameters)
            candidate.fit(data.train_features, data.train_labels)
            scorer = PositiveClassProbabilityAdapter(candidate, self.model_family)
            scores = scorer.score(data.validation_features)
            metrics = evaluate_scores(
                data.validation_labels,
                scores,
                threshold=config.decision_threshold if config.decision_threshold is not None else DEFAULT_THRESHOLD,
            )
            self.selection_records.append(
                {
                    "n_estimators": estimator_count,
                    "parameters": parameters,
                    "validation_metrics": metrics,
                }
            )
            average_precision = float(metrics["average_precision"])
            if average_precision > best_average_precision:
                best_model = candidate
                best_average_precision = average_precision
                self.selected_estimators = estimator_count
                self.selected_validation_metrics = metrics
                self.selected_parameters = parameters

        if best_model is None or self.selected_parameters is None or self.selected_validation_metrics is None:
            raise RuntimeError("Random Forest validation selection did not produce a fitted model.")
        return PositiveClassProbabilityAdapter(best_model, self.model_family)


def train_and_evaluate_random_forest(dataset_path: Path, artifact_directory: Path) -> dict[str, Any]:
    dataset_path = dataset_path.resolve()
    frame = pd.read_csv(dataset_path)
    data, data_summary = validate_dataset(frame)
    train, validation, test = chronological_split(data)
    for split_name, split in (("train", train), ("validation", validation), ("test", test)):
        _require_both_labels(split_name, split)

    x_train, y_train = build_features(train), train[TARGET_COLUMN].astype(np.int64)
    x_validation, y_validation = build_features(validation), validation[TARGET_COLUMN].astype(np.int64)
    x_test, y_test = build_features(test), test[TARGET_COLUMN].astype(np.int64)
    config = ExperimentConfig(
        experiment_id="B-random-forest",
        model_families=("random_forest",),
        input_modality="tabular",
        dataset_schema_version=DATASET_SCHEMA_VERSION,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        random_seed=RANDOM_SEED,
        decision_threshold=DEFAULT_THRESHOLD,
    )
    trainer = RandomForestTrainer()
    selector_scorer = trainer.fit(
        ModelFitData(
            train_features=x_train,
            train_labels=y_train,
            validation_features=x_validation,
            validation_labels=y_validation,
        ),
        config,
    )
    validation_metrics = evaluate_scores(
        y_validation,
        selector_scorer.score(x_validation),
        threshold=config.decision_threshold if config.decision_threshold is not None else DEFAULT_THRESHOLD,
    )
    selected_estimators = trainer.selected_estimators
    if validation_metrics is None or selected_estimators is None:
        raise RuntimeError("Random Forest trainer did not record validation selection.")
    # The selector has seen training data only. Refit the chosen configuration on
    # train + validation, then use test once for final evaluation.
    combined_train = pd.concat([train, validation], ignore_index=True)
    x_combined, y_combined = build_features(combined_train), combined_train[TARGET_COLUMN].astype(np.int64)
    final_parameters = {**RANDOM_FOREST_PARAMETERS, "n_estimators": selected_estimators}
    model = RandomForestClassifier(**final_parameters)
    model.fit(x_combined, y_combined)
    test_scorer = PositiveClassProbabilityAdapter(model, "random_forest")
    test_metrics = evaluate_scores(
        y_test,
        test_scorer.score(x_test),
        threshold=config.decision_threshold if config.decision_threshold is not None else DEFAULT_THRESHOLD,
    )

    artifact_directory.mkdir(parents=True, exist_ok=True)
    model_path = artifact_directory / "random_forest_model.joblib"
    joblib.dump(model, model_path)
    model_hash = sha256_file(model_path)
    manifest = {
        "experiment": config.to_dict(),
        "model_family": "random_forest",
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
        },
        "training": {
            "random_seed": RANDOM_SEED,
            "selection_metric": "validation average_precision",
            "selection_tie_break": "smallest n_estimators",
            "selection_candidates": trainer.selection_records,
            "selected_estimators": selected_estimators,
            "selection_fit_parameters": trainer.selected_parameters,
            "final_fit_parameters": final_parameters,
            "final_fit_rows": len(combined_train),
            "final_fit_partitions": ["train", "validation"],
        },
        "score_semantics": "Uncalibrated Random Forest positive-class score from predict_proba; not a calibrated fraud probability.",
        "decision_threshold": config.decision_threshold,
        "probability_calibrated": False,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
    }
    (artifact_directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
