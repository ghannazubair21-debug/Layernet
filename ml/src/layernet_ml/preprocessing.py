from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import pandas as pd


class TrainFittedPreprocessor(Protocol):
    """Learned transform contract; callers provide training rows separately."""

    def fit(self, features: pd.DataFrame, labels: pd.Series | None = None) -> Any: ...

    def transform(self, features: pd.DataFrame) -> Any: ...


@dataclass(frozen=True)
class PreprocessedPartitions:
    train: Any
    validation: Any
    test: Any


def fit_preprocessor_on_train(
    preprocessor: TrainFittedPreprocessor,
    train_features: pd.DataFrame,
    validation_features: pd.DataFrame,
    test_features: pd.DataFrame,
    train_labels: pd.Series | None = None,
) -> PreprocessedPartitions:
    """Fit learned preprocessing on train rows only, then transform each partition once."""
    expected_columns = tuple(train_features.columns)
    if not expected_columns:
        raise ValueError("Training features must have at least one column.")
    for name, frame in (("validation", validation_features), ("test", test_features)):
        if tuple(frame.columns) != expected_columns:
            raise ValueError(f"{name} feature columns must match training columns and order.")
    if train_labels is not None and len(train_labels) != len(train_features):
        raise ValueError("train_labels must have the same number of rows as train_features.")

    preprocessor.fit(train_features, train_labels)
    transformed = PreprocessedPartitions(
        train=preprocessor.transform(train_features),
        validation=preprocessor.transform(validation_features),
        test=preprocessor.transform(test_features),
    )
    matrices = (transformed.train, transformed.validation, transformed.test)
    expected_rows = (len(train_features), len(validation_features), len(test_features))
    expected_width: int | None = None
    for name, matrix, row_count in zip(("train", "validation", "test"), matrices, expected_rows, strict=True):
        shape = getattr(matrix, "shape", None)
        if shape is None or len(shape) != 2 or shape[0] != row_count:
            raise ValueError(f"Preprocessed {name} output must be a two-dimensional matrix with rows preserved.")
        if expected_width is None:
            expected_width = int(shape[1])
        elif shape[1] != expected_width:
            raise ValueError("Preprocessor output feature counts must match across all partitions.")
        if isinstance(matrix, pd.DataFrame) and name != "train":
            if tuple(matrix.columns) != tuple(transformed.train.columns):
                raise ValueError("Preprocessor output feature columns must match across all partitions.")
    return transformed
