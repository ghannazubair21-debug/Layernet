from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd

TARGET_COLUMN = "Class"
TIME_COLUMN = "Time"
AMOUNT_COLUMN = "Amount"
PCA_COLUMNS = tuple(f"V{i}" for i in range(1, 29))
REQUIRED_COLUMNS = (TIME_COLUMN, *PCA_COLUMNS, AMOUNT_COLUMN, TARGET_COLUMN)
FEATURE_SCHEMA_VERSION = "layernet-ulb-creditcard.v1"
DATASET_SCHEMA_VERSION = "ulb-creditcard.csv.v1"
FEATURE_COLUMNS = (
    "amount_log1p",
    "elapsed_day_sin",
    "elapsed_day_cos",
    *PCA_COLUMNS,
)


@dataclass(frozen=True)
class DatasetSummary:
    row_count: int
    duplicate_rows_removed: int
    fraud_count: int
    legitimate_count: int
    time_start: float
    time_end: float
    ignored_columns: tuple[str, ...]


def validate_dataset(frame: pd.DataFrame) -> tuple[pd.DataFrame, DatasetSummary]:
    """Validate ULB-style credit-card CSV data and remove exact duplicate rows before splitting."""
    if frame.empty:
        raise ValueError("Dataset is empty.")
    if frame.columns.duplicated().any():
        raise ValueError("Dataset contains duplicate column names.")

    missing = sorted(set(REQUIRED_COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing)}")

    selected = frame.loc[:, REQUIRED_COLUMNS].copy()
    for column in REQUIRED_COLUMNS:
        selected[column] = pd.to_numeric(selected[column], errors="coerce")

    if selected.isna().any().any():
        bad = sorted(selected.columns[selected.isna().any()].tolist())
        raise ValueError(f"Required columns contain missing or non-numeric values: {', '.join(bad)}")
    if not np.isfinite(selected.to_numpy(dtype=np.float64)).all():
        raise ValueError("Required columns contain non-finite values.")
    if (selected[TIME_COLUMN] < 0).any():
        raise ValueError("Time must be non-negative elapsed seconds.")
    if (selected[AMOUNT_COLUMN] < 0).any():
        raise ValueError("Amount must be non-negative.")

    labels = set(selected[TARGET_COLUMN].unique().tolist())
    if not labels.issubset({0, 1}) or labels != {0, 1}:
        raise ValueError("Class must contain both binary labels 0 and 1 for supervised training.")

    before = len(selected)
    selected = selected.drop_duplicates(keep="first")
    removed = before - len(selected)
    selected = selected.sort_values(TIME_COLUMN, kind="mergesort").reset_index(drop=True)

    summary = DatasetSummary(
        row_count=len(selected),
        duplicate_rows_removed=removed,
        fraud_count=int(selected[TARGET_COLUMN].sum()),
        legitimate_count=int((selected[TARGET_COLUMN] == 0).sum()),
        time_start=float(selected[TIME_COLUMN].iloc[0]),
        time_end=float(selected[TIME_COLUMN].iloc[-1]),
        ignored_columns=tuple(column for column in frame.columns if column not in REQUIRED_COLUMNS),
    )
    return selected, summary


def chronological_split(
    frame: pd.DataFrame,
    train_fraction: float = 0.6,
    validation_fraction: float = 0.2,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split ordered transactions into contiguous time blocks without separating tied timestamps."""
    if not 0 < train_fraction < 1 or not 0 < validation_fraction < 1:
        raise ValueError("Split fractions must be between 0 and 1.")
    if train_fraction + validation_fraction >= 1:
        raise ValueError("Train and validation fractions must leave rows for test.")
    if len(frame) < 3 or TIME_COLUMN not in frame:
        raise ValueError("At least three time-ordered rows are required for a split.")

    ordered = frame.sort_values(TIME_COLUMN, kind="mergesort").reset_index(drop=True)
    times = ordered[TIME_COLUMN].to_numpy()

    def safe_boundary(target: int) -> int:
        boundary = max(1, min(target, len(ordered) - 1))
        while boundary < len(ordered) and times[boundary] == times[boundary - 1]:
            boundary += 1
        return boundary

    train_end = safe_boundary(int(len(ordered) * train_fraction))
    validation_end = safe_boundary(int(len(ordered) * (train_fraction + validation_fraction)))
    if train_end >= validation_end or validation_end >= len(ordered):
        raise ValueError("Timestamp groups are too large to create non-empty chronological splits.")

    return (
        ordered.iloc[:train_end].copy(),
        ordered.iloc[train_end:validation_end].copy(),
        ordered.iloc[validation_end:].copy(),
    )


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Create the stable, label-free feature matrix used by training and inference."""
    missing = sorted(set((TIME_COLUMN, AMOUNT_COLUMN, *PCA_COLUMNS)) - set(frame.columns))
    if missing:
        raise ValueError(f"Cannot engineer features; missing columns: {', '.join(missing)}")

    time = pd.to_numeric(frame[TIME_COLUMN], errors="coerce").to_numpy(dtype=np.float64)
    amount = pd.to_numeric(frame[AMOUNT_COLUMN], errors="coerce").to_numpy(dtype=np.float64)
    components = frame.loc[:, PCA_COLUMNS].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(time).all() or not np.isfinite(amount).all() or not np.isfinite(components.to_numpy(dtype=np.float64)).all():
        raise ValueError("Feature inputs must be finite numeric values.")
    if (time < 0).any() or (amount < 0).any():
        raise ValueError("Time and Amount must be non-negative.")

    phase = np.mod(time, 86_400.0) / 86_400.0 * (2 * np.pi)
    features = pd.DataFrame(
        {
            "amount_log1p": np.log1p(amount),
            "elapsed_day_sin": np.sin(phase),
            "elapsed_day_cos": np.cos(phase),
        },
        index=frame.index,
    )
    for column in PCA_COLUMNS:
        features[column] = components[column].to_numpy(dtype=np.float64)
    return features.loc[:, FEATURE_COLUMNS]


def split_summary(splits: Sequence[pd.DataFrame]) -> list[dict[str, object]]:
    names = ("train", "validation", "test")
    result = []
    for name, frame in zip(names, splits, strict=True):
        result.append(
            {
                "name": name,
                "rows": len(frame),
                "fraud_count": int(frame[TARGET_COLUMN].sum()),
                "time_start": float(frame[TIME_COLUMN].iloc[0]),
                "time_end": float(frame[TIME_COLUMN].iloc[-1]),
            }
        )
    return result
