from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal, Protocol

import numpy as np

ModelFamily = Literal["xgboost", "random_forest", "isolation_forest", "sequence_baseline", "transformer"]
InputModality = Literal["tabular", "sequence"]
SUPPORTED_MODEL_FAMILIES: tuple[str, ...] = (
    "xgboost",
    "random_forest",
    "isolation_forest",
    "sequence_baseline",
    "transformer",
)


@dataclass(frozen=True)
class ExperimentConfig:
    """Explicit, dataset-scoped definition of a planned model comparison."""

    experiment_id: str
    model_families: tuple[ModelFamily, ...]
    input_modality: InputModality
    dataset_schema_version: str
    feature_schema_version: str
    random_seed: int
    decision_threshold: float | None = None

    def __post_init__(self) -> None:
        if not self.experiment_id.strip():
            raise ValueError("experiment_id must not be empty.")
        if not self.model_families:
            raise ValueError("At least one model family must be specified.")
        if len(set(self.model_families)) != len(self.model_families):
            raise ValueError("model_families must not contain duplicates.")
        unknown = sorted(set(self.model_families) - set(SUPPORTED_MODEL_FAMILIES))
        if unknown:
            raise ValueError(f"Unsupported model families: {', '.join(unknown)}")
        if self.input_modality not in ("tabular", "sequence"):
            raise ValueError("input_modality must be 'tabular' or 'sequence'.")
        if not self.dataset_schema_version.strip() or not self.feature_schema_version.strip():
            raise ValueError("Dataset and feature schema versions are required.")
        if isinstance(self.random_seed, bool) or not isinstance(self.random_seed, int) or self.random_seed < 0:
            raise ValueError("random_seed must be a non-negative integer.")
        if self.decision_threshold is not None and not np.isfinite(self.decision_threshold):
            raise ValueError("decision_threshold must be finite.")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ModelScores:
    """Continuous scores with an explicit direction and calibration statement."""

    values: np.ndarray
    score_meaning: str
    calibrated_probability: bool = False

    def __post_init__(self) -> None:
        values = np.asarray(self.values, dtype=np.float64)
        if values.ndim != 1:
            raise ValueError("Model scores must be a one-dimensional array.")
        if not np.isfinite(values).all():
            raise ValueError("Model scores must be finite.")
        if not self.score_meaning.strip():
            raise ValueError("score_meaning must describe the returned score.")
        object.__setattr__(self, "values", values)


class RiskScorer(Protocol):
    """Adapter contract: higher scores always indicate greater suspicion."""

    @property
    def model_family(self) -> str: ...

    def score(self, features: Any) -> ModelScores: ...


@dataclass(frozen=True)
class ModelFitData:
    """Training and model-selection partitions; the final test set is deliberately absent."""

    train_features: Any
    validation_features: Any
    train_labels: Any | None = None
    validation_labels: Any | None = None

    def __post_init__(self) -> None:
        _validate_fit_partition("train", self.train_features, self.train_labels)
        _validate_fit_partition("validation", self.validation_features, self.validation_labels)


def _validate_fit_partition(name: str, features: Any, labels: Any | None) -> None:
    feature_rows = len(features)
    if feature_rows == 0:
        raise ValueError(f"{name} partition must not be empty.")
    if labels is None:
        return
    label_values = np.asarray(labels)
    if label_values.ndim != 1 or len(label_values) != feature_rows:
        raise ValueError(f"{name} labels must be one-dimensional and aligned with feature rows.")
    if not np.isfinite(label_values.astype(np.float64)).all() or not np.isin(label_values, (0, 1)).all():
        raise ValueError(f"{name} labels must contain only finite binary values 0 and 1.")


class ModelTrainer(Protocol):
    """Fit one configured model component using train/validation data only."""

    @property
    def model_family(self) -> str: ...

    def fit(self, data: ModelFitData, config: ExperimentConfig) -> RiskScorer: ...


@dataclass(frozen=True)
class ModelFitData:
    """Training and model-selection partitions; the final test set is deliberately absent."""

    train_features: Any
    validation_features: Any
    train_labels: Any | None = None
    validation_labels: Any | None = None

    def __post_init__(self) -> None:
        _validate_fit_partition("train", self.train_features, self.train_labels)
        _validate_fit_partition("validation", self.validation_features, self.validation_labels)


def _validate_fit_partition(name: str, features: Any, labels: Any | None) -> None:
    feature_rows = len(features)
    if feature_rows == 0:
        raise ValueError(f"{name} partition must not be empty.")
    if labels is None:
        return
    label_values = np.asarray(labels)
    if label_values.ndim != 1 or len(label_values) != feature_rows:
        raise ValueError(f"{name} labels must be one-dimensional and aligned with feature rows.")
    if not np.isfinite(label_values.astype(np.float64)).all() or not np.isin(label_values, (0, 1)).all():
        raise ValueError(f"{name} labels must contain only finite binary values 0 and 1.")


class ModelTrainer(Protocol):
    """Fit one configured model component using train/validation data only."""

    @property
    def model_family(self) -> str: ...

    def fit(self, data: ModelFitData, config: ExperimentConfig) -> RiskScorer: ...


class PositiveClassProbabilityAdapter:
    """Adapt a fitted binary estimator without claiming its output is calibrated."""

    def __init__(self, estimator: Any, model_family: str = "probability_estimator"):
        self._estimator = estimator
        self.model_family = model_family

    def score(self, features: Any) -> ModelScores:
        predict_proba = getattr(self._estimator, "predict_proba", None)
        classes = np.asarray(getattr(self._estimator, "classes_", []))
        if not callable(predict_proba) or classes.ndim != 1:
            raise TypeError("Estimator must be fitted and expose predict_proba plus classes_.")
        positive_indices = np.flatnonzero(classes == 1)
        if len(classes) != 2 or positive_indices.size != 1:
            raise ValueError("Estimator classes_ must contain binary labels 0 and 1.")
        probabilities = np.asarray(predict_proba(features), dtype=np.float64)
        if probabilities.shape != (len(features), 2):
            raise ValueError("predict_proba must return one score per row for both binary classes.")
        if not np.isfinite(probabilities).all() or (probabilities < 0).any() or (probabilities > 1).any():
            raise ValueError("predict_proba must return finite values between 0 and 1.")
        if not np.allclose(probabilities.sum(axis=1), 1.0, atol=1e-6):
            raise ValueError("Binary predict_proba rows must sum to 1.")
        return ModelScores(
            values=probabilities[:, int(positive_indices[0])],
            score_meaning="Uncalibrated positive-class model score; higher indicates greater suspicion.",
            calibrated_probability=False,
        )


class IsolationForestScoreAdapter:
    """Orient Isolation Forest decision scores so higher means more anomalous."""

    model_family = "isolation_forest"

    def __init__(self, estimator: Any):
        self._estimator = estimator

    def score(self, features: Any) -> ModelScores:
        decision_function = getattr(self._estimator, "decision_function", None)
        if not callable(decision_function):
            raise TypeError("Estimator must expose decision_function.")
        normality = np.asarray(decision_function(features), dtype=np.float64)
        if normality.shape != (len(features),):
            raise ValueError("decision_function must return one score per row.")
        return ModelScores(
            values=-normality,
            score_meaning="Isolation Forest anomaly ranking score; higher indicates greater anomaly.",
            calibrated_probability=False,
        )
