from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from layernet_ml.contracts import (
    ExperimentConfig,
    IsolationForestScoreAdapter,
    ModelFitData,
    ModelScores,
    PositiveClassProbabilityAdapter,
)
from layernet_ml.evaluation import evaluate_scores
from layernet_ml.preprocessing import fit_preprocessor_on_train


class _ProbabilityAdapterContractFixture:
    classes_ = np.array([1, 0])

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        return np.tile([0.8, 0.2], (len(features), 1))


class _AnomalyAdapterContractFixture:
    def decision_function(self, features: pd.DataFrame) -> np.ndarray:
        return np.array([0.4, -0.2])[: len(features)]


class _TrainMeanPreprocessorFixture:
    def __init__(self) -> None:
        self.fit_rows: int | None = None
        self.fit_label_sum: int | None = None
        self.mean: float | None = None

    def fit(self, features: pd.DataFrame, labels: pd.Series | None = None) -> None:
        self.fit_rows = len(features)
        self.fit_label_sum = int(labels.sum()) if labels is not None else None
        self.mean = float(features["value"].mean())

    def transform(self, features: pd.DataFrame) -> pd.DataFrame:
        return pd.DataFrame({"value_centered": features["value"] - self.mean}, index=features.index)


class ResearchContractTests(unittest.TestCase):
    def test_model_fit_contract_exposes_train_and_validation_but_no_test_partition(self) -> None:
        fit_data = ModelFitData(
            train_features=np.array([[1.0], [2.0]]),
            train_labels=np.array([0, 1]),
            validation_features=np.array([[3.0]]),
            validation_labels=np.array([1]),
        )

        self.assertEqual(len(fit_data.train_features), 2)
        self.assertEqual(len(fit_data.validation_features), 1)
        self.assertFalse(hasattr(fit_data, "test_features"))
        with self.assertRaisesRegex(ValueError, "aligned"):
            ModelFitData(
                train_features=np.array([[1.0], [2.0]]),
                train_labels=np.array([0]),
                validation_features=np.array([[3.0]]),
            )

    def test_experiment_config_records_model_combinations_without_dataset_assumptions(self) -> None:
        config = ExperimentConfig(
            experiment_id="B",
            model_families=("xgboost", "random_forest"),
            input_modality="tabular",
            dataset_schema_version="dataset.v1",
            feature_schema_version="features.v1",
            random_seed=17,
        )

        self.assertEqual(config.to_dict()["model_families"], ("xgboost", "random_forest"))
        self.assertEqual(config.to_dict()["random_seed"], 17)
        with self.assertRaisesRegex(ValueError, "duplicates"):
            ExperimentConfig(
                experiment_id="bad",
                model_families=("xgboost", "xgboost"),
                input_modality="tabular",
                dataset_schema_version="dataset.v1",
                feature_schema_version="features.v1",
                random_seed=17,
            )

    def test_config_accepts_each_planned_model_family_and_both_input_modalities(self) -> None:
        for family, modality in (
            ("xgboost", "tabular"),
            ("random_forest", "tabular"),
            ("isolation_forest", "tabular"),
            ("sequence_baseline", "sequence"),
            ("transformer", "tabular"),
            ("transformer", "sequence"),
        ):
            config = ExperimentConfig(
                experiment_id=f"check-{family}-{modality}",
                model_families=(family,),
                input_modality=modality,
                dataset_schema_version="dataset.v1",
                feature_schema_version="features.v1",
                random_seed=17,
            )
            self.assertEqual(config.model_families, (family,))

    def test_probability_adapter_uses_class_label_and_does_not_claim_calibration(self) -> None:
        scorer = PositiveClassProbabilityAdapter(_ProbabilityAdapterContractFixture(), "xgboost")
        output = scorer.score(pd.DataFrame({"feature": [1, 2]}))

        np.testing.assert_array_equal(output.values, [0.8, 0.8])
        self.assertFalse(output.calibrated_probability)
        self.assertIn("Uncalibrated", output.score_meaning)
        self.assertEqual(scorer.model_family, "xgboost")

    def test_isolation_forest_adapter_orients_larger_scores_as_more_anomalous(self) -> None:
        output = IsolationForestScoreAdapter(_AnomalyAdapterContractFixture()).score(
            pd.DataFrame({"feature": [1, 2]})
        )

        np.testing.assert_array_equal(output.values, [-0.4, 0.2])
        self.assertFalse(output.calibrated_probability)

    def test_train_fitted_preprocessing_never_fits_validation_or_test_rows(self) -> None:
        preprocessor = _TrainMeanPreprocessorFixture()
        transformed = fit_preprocessor_on_train(
            preprocessor,
            pd.DataFrame({"value": [1.0, 3.0]}),
            pd.DataFrame({"value": [100.0]}),
            pd.DataFrame({"value": [200.0]}),
            train_labels=pd.Series([0, 1]),
        )

        self.assertEqual(preprocessor.fit_rows, 2)
        self.assertEqual(preprocessor.fit_label_sum, 1)
        self.assertEqual(float(transformed.validation.iloc[0, 0]), 98.0)
        self.assertEqual(float(transformed.test.iloc[0, 0]), 198.0)

    def test_train_fitted_preprocessing_rejects_schema_mismatch(self) -> None:
        with self.assertRaisesRegex(ValueError, "match training columns"):
            fit_preprocessor_on_train(
                _TrainMeanPreprocessorFixture(),
                pd.DataFrame({"value": [1.0]}),
                pd.DataFrame({"other": [2.0]}),
                pd.DataFrame({"value": [3.0]}),
            )

    def test_evaluation_reports_ranking_threshold_and_complete_confusion_counts(self) -> None:
        result = evaluate_scores([0, 0, 1, 1], [0.1, 0.6, 0.7, 0.9], threshold=0.65)

        self.assertEqual(result["average_precision"], 1.0)
        self.assertEqual(result["pr_auc"], 1.0)
        self.assertEqual(result["roc_auc"], 1.0)
        self.assertEqual(result["precision_at_threshold"], 1.0)
        self.assertEqual(result["recall_at_threshold"], 1.0)
        self.assertEqual(result["true_positives"], 2)
        self.assertEqual(result["true_negatives"], 2)
        self.assertEqual(result["false_positives"], 0)
        self.assertEqual(result["false_negatives"], 0)

    def test_ranking_metrics_handle_tied_scores_as_threshold_groups(self) -> None:
        result = evaluate_scores([1, 0, 1, 0], [0.8, 0.8, 0.2, 0.2], threshold=0.5)

        self.assertEqual(result["average_precision"], 0.5)
        self.assertEqual(result["pr_auc"], 0.625)
        self.assertEqual(result["roc_auc"], 0.5)

    def test_evaluation_rejects_invalid_vectors_and_single_class_metrics(self) -> None:
        with self.assertRaisesRegex(ValueError, "equal length"):
            evaluate_scores([0, 1], [0.3], threshold=0.5)
        with self.assertRaisesRegex(ValueError, "Both classes"):
            evaluate_scores([0, 0], [0.2, 0.4], threshold=0.5)
        with self.assertRaisesRegex(ValueError, "finite"):
            ModelScores(np.array([0.2, np.nan]), "ranking score")


if __name__ == "__main__":
    unittest.main()
