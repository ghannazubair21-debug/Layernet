# Metrics and Evaluation Conventions

Applies to every LayerNet experiment. Implementation: `ml/src/layernet_ml/evaluation.py` (custom NumPy, no sklearn dependency for the reported values). Independently cross-checked against scikit-learn on 2026-11-28 for EXP-PS-TSEEDS-v1: agreement ≤ 1e-12 for every metric.

## Ranking metrics

| Metric | Definition in `evaluation.py` | Notes |
|---|---|---|
| Average Precision (AP) — **primary** | Sort by score descending, group tied scores; sum over groups of (positives in group / all positives) × precision after the group | Equals sklearn `average_precision_score`. Random-ranking expectation = prevalence. |
| PR-AUC | Trapezoidal area under the precision–recall curve, tied scores grouped, starting from (recall 0, precision 1) | Differs from AP; both are reported, never used interchangeably. Equals sklearn `auc(recall, precision)` on `precision_recall_curve`. |
| ROC-AUC | Mann–Whitney statistic with mid-ranks for ties | Insensitive to prevalence; reported as secondary only, because it looks high even for weak rankers on imbalanced data (e.g. EXP-ULB-IF-v1: ROC-AUC 0.943 with AP 0.036). |
| AP lift | AP ÷ split prevalence | Makes AP comparable in scale to "random = 1×"; still not comparable across splits with different prevalence. |

## Threshold metrics

- Thresholds are selected **on validation only**, by maximum F1 over `precision_recall_curve` thresholds; ties prefer higher precision, then higher threshold (`choose_validation_f1_threshold`).
- The rule is inclusive: flagged ⇔ `score >= threshold`.
- Thresholds are written to a freeze file **before** the test partition is opened; test is scored once.
- Reported at the frozen threshold: precision, recall, F1, and confusion counts TP / TN / FP / FN.

## Uncertainty and comparisons

- Across seeds: mean, sample SD (ddof = 1), and a **descriptive** two-sided 95% Student-t interval with df = n − 1.
- Paired comparisons are by seed label; the pairing does not remove shared noise when model families differ in initialisation and batch order.
- **An interval that includes zero does not establish a difference.** Three seeds on one shared split are not independent datasets: no p-values or significance claims.
- Single-run results (ULB) have no uncertainty estimate; they are reported as observed values only.

## Scope rules

- Scores are uncalibrated (logits or model-native decision scores). They are never described as probabilities.
- Validation and test AP/PR-AUC are never compared directly when prevalence differs (PaySim: 0.0895% vs 0.5198%).
- Synthetic (PaySim) and real anonymised (ULB) results are reported in separate tables and never combined.
- Test data is never used for tuning, model selection, threshold selection or early stopping.
