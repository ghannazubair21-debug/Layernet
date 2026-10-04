from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd

from .contracts import ModelScores


def _average_precision(labels: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(-scores, kind="mergesort")
    sorted_labels = labels[order]
    sorted_scores = scores[order]
    positives = int(labels.sum())
    true_positives = 0
    false_positives = 0
    total = 0.0
    index = 0
    while index < len(sorted_labels):
        end = index + 1
        while end < len(sorted_labels) and sorted_scores[end] == sorted_scores[index]:
            end += 1
        group_labels = sorted_labels[index:end]
        group_positives = int(group_labels.sum())
        true_positives += group_positives
        false_positives += len(group_labels) - group_positives
        if group_positives:
            total += (group_positives / positives) * (true_positives / (true_positives + false_positives))
        index = end
    return float(total)


def _precision_recall_auc(labels: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(-scores, kind="mergesort")
    sorted_labels = labels[order]
    sorted_scores = scores[order]
    positives = int(labels.sum())
    true_positives = 0
    false_positives = 0
    previous_recall = 0.0
    previous_precision = 1.0
    area = 0.0
    index = 0
    while index < len(sorted_labels):
        end = index + 1
        while end < len(sorted_labels) and sorted_scores[end] == sorted_scores[index]:
            end += 1
        group = sorted_labels[index:end]
        group_positives = int(group.sum())
        true_positives += group_positives
        false_positives += len(group) - group_positives
        recall = true_positives / positives
        precision = true_positives / (true_positives + false_positives)
        area += (recall - previous_recall) * (precision + previous_precision) / 2.0
        previous_recall = recall
        previous_precision = precision
        index = end
    return float(area)


def _roc_auc(labels: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(scores, kind="mergesort")
    sorted_scores = scores[order]
    sorted_labels = labels[order]
    positive_rank_sum = 0.0
    index = 0
    while index < len(sorted_scores):
        end = index + 1
        while end < len(sorted_scores) and sorted_scores[end] == sorted_scores[index]:
            end += 1
        average_rank = ((index + 1) + end) / 2.0  # one-based ranks, inclusive group end
        positive_rank_sum += average_rank * int(sorted_labels[index:end].sum())
        index = end
    positives = int(labels.sum())
    negatives = len(labels) - positives
    return float((positive_rank_sum - positives * (positives + 1) / 2) / (positives * negatives))


def evaluate_scores(
    labels: Sequence[int] | pd.Series | np.ndarray,
    scores: ModelScores | Sequence[float] | np.ndarray,
    threshold: float,
) -> dict[str, float | int]:
    """Evaluate binary risk rankings at a declared threshold; does not fit or calibrate."""
    actual = np.asarray(labels, dtype=np.float64)
    raw_scores = scores.values if isinstance(scores, ModelScores) else np.asarray(scores, dtype=np.float64)
    if actual.ndim != 1 or raw_scores.ndim != 1 or actual.size != raw_scores.size or actual.size == 0:
        raise ValueError("Labels and scores must be non-empty one-dimensional arrays of equal length.")
    if not np.isfinite(actual).all() or not np.isin(actual, (0, 1)).all():
        raise ValueError("Labels must contain only finite binary values 0 and 1.")
    if set(actual.tolist()) != {0.0, 1.0}:
        raise ValueError("Both classes must be present to calculate the requested ranking metrics.")
    if not np.isfinite(raw_scores).all():
        raise ValueError("Scores must contain only finite values.")
    if not np.isfinite(threshold):
        raise ValueError("threshold must be finite.")

    actual = actual.astype(np.int64)
    predicted = (raw_scores >= threshold).astype(np.int64)
    true_positives = int(np.sum((actual == 1) & (predicted == 1)))
    false_positives = int(np.sum((actual == 0) & (predicted == 1)))
    false_negatives = int(np.sum((actual == 1) & (predicted == 0)))
    true_negatives = int(np.sum((actual == 0) & (predicted == 0)))
    precision = true_positives / (true_positives + false_positives) if true_positives + false_positives else 0.0
    recall = true_positives / (true_positives + false_negatives) if true_positives + false_negatives else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "pr_auc": _precision_recall_auc(actual, raw_scores),
        "average_precision": _average_precision(actual, raw_scores),
        "roc_auc": _roc_auc(actual, raw_scores),
        "precision_at_threshold": float(precision),
        "recall_at_threshold": float(recall),
        "f1_at_threshold": float(f1),
        "threshold": float(threshold),
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "true_negatives": true_negatives,
    }
