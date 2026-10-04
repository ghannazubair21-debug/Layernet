from __future__ import annotations

import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
import pandas as pd

from .contracts import IsolationForestScoreAdapter, PositiveClassProbabilityAdapter
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
from .evaluation import evaluate_scores
from .pipeline import DATASET_SOURCE, sha256_file
from .selector_artifacts import regenerate_validation_predictions

DEFAULT_DATASET_PATH = Path("ml/data/raw/creditcard.csv")
DEFAULT_ARTIFACT_DIRECTORY = Path("ml/artifacts/ensemble-v1")
SELECTOR_DIRECTORY = Path("ml/artifacts/ensemble-selectors-v1")
SPLIT_STRATEGY = "chronological contiguous 60/20/20 by elapsed Time; tied timestamps remain in one split"
WEIGHT_CANDIDATES: tuple[tuple[float, float, float], ...] = (
    (1 / 3, 1 / 3, 1 / 3),
    (0.50, 0.25, 0.25),
    (0.25, 0.50, 0.25),
    (0.25, 0.25, 0.50),
    (0.60, 0.20, 0.20),
    (0.20, 0.60, 0.20),
    (0.20, 0.20, 0.60),
)
BASELINES = {
    "xgboost": ("xgboost-v1", "xgboost_model.joblib"),
    "random_forest": ("random-forest-v1", "random_forest_model.joblib"),
    "isolation_forest": ("isolation-forest-v1", "isolation_forest_model.joblib"),
}


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}.")
    return value


def _partition(name: str, frame: pd.DataFrame, include_labels: bool = True) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "name": name,
        "rows": len(frame),
        "time_start": float(frame[TIME_COLUMN].iloc[0]),
        "time_end": float(frame[TIME_COLUMN].iloc[-1]),
    }
    if include_labels:
        metadata["fraud_count"] = int(frame[TARGET_COLUMN].sum())
    return metadata


def _assert_common_contract(
    dataset_hash: str,
    actual_partitions: tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame],
    artifact_root: Path,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    train, validation, test = actual_partitions
    manifests: dict[str, dict[str, Any]] = {}
    for family, (directory_name, model_filename) in BASELINES.items():
        directory = artifact_root / directory_name
        manifest_path = directory / "manifest.json"
        model_path = directory / model_filename
        if not manifest_path.is_file() or not model_path.is_file():
            raise FileNotFoundError(f"Missing accepted {family} artifacts in {directory}.")
        manifest = _load_json(manifest_path)
        if manifest.get("model_family") != family or sha256_file(model_path) != manifest.get("model_sha256"):
            raise ValueError(f"Accepted {family} model hash/family does not match its manifest.")
        dataset = manifest.get("dataset", {})
        if dataset.get("raw_csv_sha256") != dataset_hash:
            raise ValueError(f"Accepted {family} artifact uses a different dataset hash.")
        if dataset.get("schema_version") != DATASET_SCHEMA_VERSION:
            raise ValueError(f"Accepted {family} artifact uses a different dataset schema.")
        if manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION:
            raise ValueError(f"Accepted {family} artifact uses a different feature schema.")
        if manifest.get("feature_columns") != list(FEATURE_COLUMNS):
            raise ValueError(f"Accepted {family} artifact uses different feature columns.")
        if manifest.get("split_strategy") != SPLIT_STRATEGY:
            raise ValueError(f"Accepted {family} artifact uses a different split strategy.")
        splits = manifest.get("splits")
        if not isinstance(splits, list) or len(splits) != 3:
            raise ValueError(f"Accepted {family} artifact has incomplete split metadata.")
        expected = (
            _partition("train", train),
            _partition("validation", validation),
            _partition("test", test, include_labels=False),
        )
        for actual, recorded in zip(expected, splits, strict=True):
            for key, value in actual.items():
                if recorded.get(key) != value:
                    raise ValueError(f"Accepted {family} split metadata differs at {key} for {actual['name']}.")
        manifests[family] = manifest

    selector_dir = artifact_root / SELECTOR_DIRECTORY.name
    selector_manifest_path = selector_dir / "manifest.json"
    selector_manifest = _load_json(selector_manifest_path)
    if selector_manifest.get("experiment_id") != "ensemble-selectors-v1":
        raise ValueError("Unexpected selector artifact version.")
    selector_dataset = selector_manifest.get("dataset", {})
    if selector_dataset.get("raw_csv_sha256") != dataset_hash:
        raise ValueError("Selector artifacts use a different dataset hash.")
    if selector_dataset.get("schema_version") != DATASET_SCHEMA_VERSION:
        raise ValueError("Selector artifacts use a different dataset schema.")
    if selector_manifest.get("feature_schema_version") != FEATURE_SCHEMA_VERSION:
        raise ValueError("Selector artifacts use a different feature schema.")
    if selector_manifest.get("feature_columns") != list(FEATURE_COLUMNS):
        raise ValueError("Selector artifacts use different feature columns.")
    if selector_manifest.get("split_strategy") != SPLIT_STRATEGY:
        raise ValueError("Selector artifacts use a different split strategy.")
    expected_selector_partitions = [_partition("train", train), _partition("validation", validation)]
    if selector_manifest.get("partitions") != expected_selector_partitions:
        raise ValueError("Selector partition metadata differs from the current dataset split.")

    if manifests["isolation_forest"].get("training", {}).get("fit_partitions") != ["train"]:
        raise ValueError("Isolation Forest was not documented as fit on the training partition only.")
    if manifests["isolation_forest"].get("training", {}).get("fit_rows") != len(train):
        raise ValueError("Isolation Forest training row count does not match the training partition.")
    if manifests["isolation_forest"].get("training", {}).get("test_used_for_fit_or_selection") is not False:
        raise ValueError("Isolation Forest manifest does not exclude test use.")
    if manifests["isolation_forest"].get("score_calibrated") is not False:
        raise ValueError("Isolation Forest manifest does not document its score as uncalibrated.")

    selector_models = selector_manifest.get("models", {})
    for family in ("xgboost", "random_forest"):
        details = selector_models.get(family, {})
        if (
            details.get("fit_partitions") != ["train"]
            or details.get("fit_rows") != len(train)
            or details.get("fit_uses_validation") is not False
            or details.get("fit_uses_test") is not False
        ):
            raise ValueError(f"{family} selector is not documented as train-only.")
        selector_model_path = selector_dir / details.get("model_file", "")
        if not selector_model_path.is_file() or sha256_file(selector_model_path) != details.get("model_sha256"):
            raise ValueError(f"{family} selector model hash does not match its manifest.")
        baseline_reference = selector_manifest.get("baseline_artifacts", {}).get(family, {})
        if baseline_reference.get("model_sha256") != manifests[family].get("model_sha256"):
            raise ValueError(f"Selector manifest references a different accepted {family} baseline.")
    prediction_details = selector_manifest.get("validation_predictions", {})
    prediction_path = selector_dir / prediction_details.get("file", "")
    if (
        not prediction_path.is_file()
        or sha256_file(prediction_path) != prediction_details.get("sha256")
        or prediction_details.get("labels_included") is not False
        or prediction_details.get("rows") != len(validation)
    ):
        raise ValueError("Saved selector validation predictions do not match their manifest.")
    return manifests, selector_manifest


def _empirical_cdf(values: Sequence[float] | np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Map oriented scores to [0, 1] using a frozen empirical validation CDF."""
    scores = np.asarray(values, dtype=np.float64)
    reference = np.asarray(reference, dtype=np.float64)
    if scores.ndim != 1 or reference.ndim != 1 or reference.size == 0:
        raise ValueError("Scores and non-empty one-dimensional normalization references are required.")
    if not np.isfinite(scores).all() or not np.isfinite(reference).all():
        raise ValueError("Normalization scores must be finite.")
    if np.any(reference[1:] < reference[:-1]):
        raise ValueError("Normalization reference scores must be sorted ascending.")
    left = np.searchsorted(reference, scores, side="left")
    right = np.searchsorted(reference, scores, side="right")
    return ((left + right) / (2.0 * len(reference))).astype(np.float64)


def _select_f1_threshold(labels: Sequence[int], scores: np.ndarray) -> dict[str, float]:
    actual = np.asarray(labels, dtype=np.int64)
    values = np.asarray(scores, dtype=np.float64)
    if actual.ndim != 1 or values.ndim != 1 or len(actual) != len(values) or len(actual) == 0:
        raise ValueError("Threshold selection requires aligned, non-empty vectors.")
    if set(actual.tolist()) != {0, 1} or not np.isfinite(values).all():
        raise ValueError("Threshold selection requires finite scores and both binary classes.")

    order = np.argsort(-values, kind="mergesort")
    sorted_scores, sorted_labels = values[order], actual[order]
    total_positive = int(actual.sum())
    true_positive = false_positive = 0
    best = {"threshold": float(np.nextafter(sorted_scores[0], np.inf)), "f1": 0.0}
    index = 0
    while index < len(values):
        end = index + 1
        while end < len(values) and sorted_scores[end] == sorted_scores[index]:
            end += 1
        group_positive = int(sorted_labels[index:end].sum())
        true_positive += group_positive
        false_positive += end - index - group_positive
        false_negative = total_positive - true_positive
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / total_positive
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        threshold = float(sorted_scores[index])
        if f1 > best["f1"] or (f1 == best["f1"] and threshold > best["threshold"]):
            best = {"threshold": threshold, "f1": float(f1)}
        index = end
    return best


def _validation_selection(
    labels: Sequence[int],
    standardized_scores: dict[str, np.ndarray],
) -> tuple[dict[str, float], float, list[dict[str, Any]], dict[str, Any]]:
    actual = np.asarray(labels, dtype=np.int64)
    if set(actual.tolist()) != {0, 1}:
        raise ValueError("Validation selection requires both labels.")
    xgb = standardized_scores["xgboost"]
    rf = standardized_scores["random_forest"]
    isolation = standardized_scores["isolation_forest"]
    candidates: list[dict[str, Any]] = []
    chosen_index = 0
    for index, weights in enumerate(WEIGHT_CANDIDATES):
        combined = weights[0] * xgb + weights[1] * rf + weights[2] * isolation
        metrics = evaluate_scores(actual, combined, threshold=0.5)
        threshold = _select_f1_threshold(actual, combined)
        record = {
            "weights": {
                "xgboost": weights[0],
                "random_forest": weights[1],
                "isolation_forest": weights[2],
            },
            "validation_average_precision": float(metrics["average_precision"]),
            "validation_pr_auc": float(metrics["pr_auc"]),
            "validation_roc_auc": float(metrics["roc_auc"]),
            "validation_max_f1": threshold["f1"],
            "validation_threshold_at_max_f1": threshold["threshold"],
        }
        candidates.append(record)
        if record["validation_average_precision"] > candidates[chosen_index]["validation_average_precision"]:
            chosen_index = index

    selected_record = candidates[chosen_index]
    selected_weights = selected_record["weights"]
    selected_score = (
        selected_weights["xgboost"] * xgb
        + selected_weights["random_forest"] * rf
        + selected_weights["isolation_forest"] * isolation
    )
    threshold_selection = _select_f1_threshold(actual, selected_score)
    selected_metrics = evaluate_scores(actual, selected_score, threshold_selection["threshold"])
    return selected_weights, threshold_selection["threshold"], candidates, selected_metrics


def _score_validation_components(
    dataset_path: Path,
    artifact_root: Path,
    selector_manifest: dict[str, Any],
    validation: pd.DataFrame,
) -> dict[str, np.ndarray]:
    selector_dir = artifact_root / SELECTOR_DIRECTORY.name
    predictions = regenerate_validation_predictions(dataset_path, selector_dir)
    saved_path = selector_dir / selector_manifest["validation_predictions"]["file"]
    saved = pd.read_csv(saved_path)
    if list(predictions.columns) != list(saved.columns) or not np.array_equal(
        predictions["validation_position"].to_numpy(), saved["validation_position"].to_numpy()
    ):
        raise ValueError("Regenerated selector validation rows do not align with the saved prediction file.")
    for column in (TIME_COLUMN, "xgboost_score", "random_forest_score"):
        if not np.allclose(predictions[column], saved[column], rtol=0.0, atol=1e-14):
            raise ValueError(f"Regenerated selector predictions differ for {column}.")

    if_model_path = artifact_root / BASELINES["isolation_forest"][0] / BASELINES["isolation_forest"][1]
    isolation_model = joblib.load(if_model_path)
    isolation_scores = IsolationForestScoreAdapter(isolation_model).score(build_features(validation)).values
    return {
        # The hash-verified saved selector streams are the canonical validation
        # values; regenerated predictions above are a consistency check.
        "xgboost": saved["xgboost_score"].to_numpy(dtype=np.float64),
        "random_forest": saved["random_forest_score"].to_numpy(dtype=np.float64),
        "isolation_forest": isolation_scores,
    }


def _normalization_references(scores: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    return {family: np.sort(np.asarray(values, dtype=np.float64), kind="mergesort") for family, values in scores.items()}


def _standardize(scores: dict[str, np.ndarray], references: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    return {family: _empirical_cdf(scores[family], references[family]) for family in references}


def _score_final_test(
    artifact_root: Path,
    test: pd.DataFrame,
    references: dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    features = build_features(test)
    component_scores: dict[str, np.ndarray] = {}
    for family in ("xgboost", "random_forest", "isolation_forest"):
        directory_name, filename = BASELINES[family]
        model = joblib.load(artifact_root / directory_name / filename)
        if family == "isolation_forest":
            component_scores[family] = IsolationForestScoreAdapter(model).score(features).values
        else:
            component_scores[family] = PositiveClassProbabilityAdapter(model, family).score(features).values
    return component_scores


def _manifest_test_metrics(
    artifact_root: Path,
    test: pd.DataFrame,
    references: dict[str, np.ndarray],
    weights: dict[str, float],
    threshold: float,
) -> dict[str, Any]:
    component_scores = _score_final_test(artifact_root, test, references)
    standardized = _standardize(component_scores, references)
    ensemble_scores = sum(weights[family] * standardized[family] for family in weights)
    labels = test[TARGET_COLUMN].astype(np.int64)
    return evaluate_scores(labels, ensemble_scores, threshold)


def run_ensemble_experiment(
    dataset_path: Path = DEFAULT_DATASET_PATH,
    artifact_directory: Path = DEFAULT_ARTIFACT_DIRECTORY,
) -> dict[str, Any]:
    dataset_path = dataset_path.resolve()
    artifact_directory = artifact_directory.resolve()
    if artifact_directory.exists():
        raise FileExistsError(f"Refusing to overwrite ensemble artifacts: {artifact_directory}.")
    dataset_hash = sha256_file(dataset_path)
    frame, summary = validate_dataset(pd.read_csv(dataset_path))
    train, validation, test = chronological_split(frame)
    artifact_root = artifact_directory.parent
    baselines, selector_manifest = _assert_common_contract(dataset_hash, (train, validation, test), artifact_root)

    validation_scores = _score_validation_components(dataset_path, artifact_root, selector_manifest, validation)
    references = _normalization_references(validation_scores)
    standardized_validation = _standardize(validation_scores, references)
    weights, threshold, candidate_records, validation_metrics = _validation_selection(
        validation[TARGET_COLUMN].astype(np.int64), standardized_validation
    )
    # The validation-only selection is now frozen. No test labels were passed to selection.
    test_metrics = _manifest_test_metrics(artifact_root, test, references, weights, threshold)

    artifact_directory.mkdir(parents=True)
    normalization_path = artifact_directory / "normalization_reference_scores.npz"
    np.savez_compressed(normalization_path, **references)
    component_references: dict[str, Any] = {}
    for family, (directory_name, filename) in BASELINES.items():
        component_references[family] = {
            "artifact": f"../{directory_name}/{filename}",
            "model_sha256": baselines[family]["model_sha256"],
            "score_orientation": "higher = more suspicious/anomalous",
            "score_calibrated": False,
        }
    for family in ("xgboost", "random_forest"):
        details = selector_manifest["models"][family]
        component_references[family]["validation_selector_artifact"] = (
            f"../{SELECTOR_DIRECTORY.name}/{details['model_file']}"
        )
        component_references[family]["validation_selector_sha256"] = details["model_sha256"]
    component_references["isolation_forest"]["validation_selector_artifact"] = component_references[
        "isolation_forest"
    ]["artifact"]

    manifest = {
        "experiment_id": "ensemble-v1",
        "model_family": "weighted_score_ensemble",
        "dataset": {
            "name": baselines["xgboost"]["dataset"]["name"],
            "source": DATASET_SOURCE,
            "schema_version": DATASET_SCHEMA_VERSION,
            "raw_csv_sha256": dataset_hash,
            "rows_after_exact_deduplication": summary.row_count,
            "exact_duplicate_rows_removed": summary.duplicate_rows_removed,
        },
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_columns": list(FEATURE_COLUMNS),
        "target_column": TARGET_COLUMN,
        "excluded_columns": [TARGET_COLUMN, TIME_COLUMN],
        "split_strategy": SPLIT_STRATEGY,
        "splits": [
            _partition("train", train),
            _partition("validation", validation),
            _partition("test", test, include_labels=False),
        ],
        "component_artifacts": component_references,
        "score_orientation": "higher = more suspicious/anomalous",
        "score_calibrated": False,
        "normalization": {
            "method": "empirical validation-score CDF with midrank ties",
            "output_range": "[0, 1]; larger values indicate scores at or above more validation reference scores",
            "fit_partition": "validation scores only; no labels used to fit normalization references",
            "reference_artifact": normalization_path.name,
            "reference_sha256": sha256_file(normalization_path),
            "reference_rows": len(validation),
            "test_scores_above_or_below_reference": "clipped to 1 or 0 by empirical CDF search bounds",
        },
        "selection": {
            "partition": "validation",
            "labels_used": "validation labels only",
            "weight_candidates": candidate_records,
            "weight_selection_metric": "validation Average Precision",
            "weight_selection_tie_break": "first candidate in the recorded candidate order",
            "selected_weights": weights,
            "threshold_selection_metric": "validation F1",
            "threshold_tie_break": "highest threshold among equal-F1 candidates",
            "selected_threshold": threshold,
            "validation_metrics": validation_metrics,
            "frozen_before_test_evaluation": True,
            "test_used_for_selection": False,
        },
        "test_metrics": test_metrics,
        "ensemble_score_semantics": "Uncalibrated weighted combination of normalized model ranking scores; not a fraud probability.",
        "runtime": {
            "python": platform.python_version(),
            "packages": {
                package: importlib.metadata.version(package)
                for package in ("numpy", "pandas", "scikit-learn", "xgboost", "joblib")
            },
        },
    }
    (artifact_directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def verify_ensemble_artifacts(
    dataset_path: Path = DEFAULT_DATASET_PATH,
    artifact_directory: Path = DEFAULT_ARTIFACT_DIRECTORY,
) -> dict[str, Any]:
    """Recompute validation selection and final test metrics from saved artifacts."""
    dataset_path = dataset_path.resolve()
    artifact_directory = artifact_directory.resolve()
    manifest = _load_json(artifact_directory / "manifest.json")
    dataset_hash = sha256_file(dataset_path)
    if manifest.get("dataset", {}).get("raw_csv_sha256") != dataset_hash:
        raise ValueError("Ensemble manifest dataset hash does not match the dataset file.")
    frame, _ = validate_dataset(pd.read_csv(dataset_path))
    train, validation, test = chronological_split(frame)
    artifact_root = artifact_directory.parent
    baseline_manifests, selector_manifest = _assert_common_contract(dataset_hash, (train, validation, test), artifact_root)
    component_references = manifest.get("component_artifacts", {})
    for family, baseline in baseline_manifests.items():
        if component_references.get(family, {}).get("model_sha256") != baseline.get("model_sha256"):
            raise ValueError(f"Ensemble manifest references a different {family} model hash.")
    for family in ("xgboost", "random_forest"):
        if component_references.get(family, {}).get("validation_selector_sha256") != selector_manifest[
            "models"
        ][family].get("model_sha256"):
            raise ValueError(f"Ensemble manifest references a different {family} selector hash.")
    references_path = artifact_directory / manifest["normalization"]["reference_artifact"]
    if sha256_file(references_path) != manifest["normalization"]["reference_sha256"]:
        raise ValueError("Ensemble normalization-reference hash does not match the manifest.")
    with np.load(references_path, allow_pickle=False) as saved_references:
        references = {family: saved_references[family] for family in ("xgboost", "random_forest", "isolation_forest")}
    validation_scores = _score_validation_components(dataset_path, artifact_root, selector_manifest, validation)
    regenerated_references = _normalization_references(validation_scores)
    for family in references:
        if not np.allclose(references[family], regenerated_references[family], rtol=0.0, atol=1e-14):
            raise ValueError(f"Saved normalization reference differs for {family}.")
    validation_metrics = _validation_selection(
        validation[TARGET_COLUMN].astype(np.int64), _standardize(validation_scores, references)
    )
    weights, threshold = validation_metrics[0], validation_metrics[1]
    selection = manifest.get("selection", {})
    if weights != selection.get("selected_weights") or not np.isclose(
        threshold, float(selection.get("selected_threshold")), rtol=0.0, atol=1e-14
    ):
        raise ValueError("Recomputed validation selection differs from the saved ensemble configuration.")
    recorded_validation_metrics = selection.get("validation_metrics", {})
    if recorded_validation_metrics.keys() != validation_metrics[3].keys() or any(
        not np.isclose(
            float(recorded_validation_metrics[key]),
            float(value),
            rtol=0.0,
            atol=1e-12,
        )
        for key, value in validation_metrics[3].items()
    ):
        raise ValueError("Recomputed validation metrics differ from the ensemble manifest.")
    if selection.get("test_used_for_selection") is not False or selection.get("frozen_before_test_evaluation") is not True:
        raise ValueError("Manifest does not document a test-isolated selection protocol.")
    reproduced_test_metrics = _manifest_test_metrics(artifact_root, test, references, weights, threshold)
    recorded = manifest.get("test_metrics", {})
    if recorded.keys() != reproduced_test_metrics.keys() or any(
        not np.isclose(float(recorded[key]), float(value), rtol=0.0, atol=1e-12)
        for key, value in reproduced_test_metrics.items()
    ):
        raise ValueError("Recomputed final test metrics differ from the ensemble manifest.")
    return {
        "status": "verified",
        "dataset_sha256": dataset_hash,
        "component_model_hashes": {family: item["model_sha256"] for family, item in manifest["component_artifacts"].items()},
        "selector_hashes": {
            family: item["validation_selector_sha256"]
            for family, item in manifest["component_artifacts"].items()
            if "validation_selector_sha256" in item
        },
        "selected_weights": weights,
        "selected_threshold": threshold,
        "test_metrics": reproduced_test_metrics,
        "baseline_manifests_checked": list(baseline_manifests),
    }
