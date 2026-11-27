# PaySim History Ablation — Preregistration v1

**Status:** Frozen before Phase 16 training and test evaluation  
**Date:** 2026-10-25  
**Experiment:** `paysim-history-ablation-v1`

## Frozen configuration and provenance

- Configuration: `ml/reports/paysim-history-ablation-config-v1.json`
- Configuration SHA-256 (exact file bytes): `01837321e01d853c5b6a58a43f02755f09e674e6b2b453072ad1cc642e3d4704`
- Preregistration SHA-256: recorded in the experiment manifest after this report is finalized.
- Dataset: `ml/data/paysim/paysim-author-release-v2.zip`, SHA-256 `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d`.
- Sequence contract: `ml/reports/paysim-sequence-contract-v1.json`, SHA-256 `acfd3223b58ee1b58b7c6a522e82dcd8b38e1d0e811c385d5ca60def0834ace7`.
- Repository snapshot at preregistration: branch `main`, commit `efc584e061231d583f1aeb97fef42e5154d9e4e2`; the working tree already contained unrelated Phase 13–15 changes. Relevant source files and their actual hashes will be recorded in the run manifest.

The preregistration and JSON configuration are frozen inputs. They must not be edited after training starts. The run must refuse to overwrite an existing artifact directory or any accepted Phase 10–15 artifact.

## Hypothesis and outcomes

**Hypothesis:** Under the fixed PaySim chronological split and matched linear-model training procedure, adding strictly earlier recipient-history tokens improves test Average Precision relative to current-transaction-only input.

**Primary outcome:** Average Precision on the common test target rows. The paired difference is `history-enabled minus current-only` for each seed.

**Secondary outcomes:** evaluator `pr_auc`, ROC-AUC, precision, recall, F1, TP, TN, FP, FN, and frozen threshold. PR-AUC and Average Precision are separate metrics and will be named separately.

No result will be described as a probability or as real-world performance. Scores are uncalibrated SGD decision margins; higher means more suspicious.

## Controlled arms

| Arm | Model input |
|---|---|
| A — current only | Final current-target token: transaction-type channels and amount channel. |
| B — current plus history | The exact same final current-target token plus the accepted representation of up to 17 strictly earlier whole-step history buckets. |

Both arms use `sklearn.linear_model.SGDClassifier` with `loss=log_loss`, `penalty=l2`, `alpha=0.0001`, `learning_rate=optimal`, `average=True`, one epoch, `partial_fit`, batch size 4,096, and the same seed-controlled deterministic within-batch ordering. Their class weights, target rows, optimizer procedure, threshold rule, evaluator, and test rows are matched. Input width necessarily differs (7 versus 126 features) because the treatment is whether the 17 history tokens are available. No Transformer or other model family is included in this controlled ablation.

Positive-class weight is computed only from the training target counts: 2,530,247 negatives / 3,193 positives = 792.4356404635139. No early stopping, hyperparameter search, or model selection is planned.

## Dataset, causal rules, and split

- Entity: C-prefixed `nameDest` recipient; this is not sender-personalized modeling.
- Time: hourly `step`; target: current transaction `isFraud`.
- History rule: `history_step < target_step`; same-step and future events are excluded.
- Train: steps 1–281; validation: 282–355; test: 356–743.
- Recipient targets: train 2,533,440; validation 860,036; test 817,649.
- Training targets may use only earlier training steps. Validation and test may use causally earlier history under the accepted contract.
- The label-blind preflight and the existing Phase 10/11 data contract are used. Labels are separate from encoded inputs; test labels are used only after all six models and validation thresholds are saved and frozen.
- Exclusions remain unchanged: target/historical labels, `isFlaggedFraud`, balances, entity identifiers as features, same-step events, and future events.

## Training seeds and deterministic settings

Three seeds are fixed before execution: **42, 123, 2026**. Each seed trains both arms with the same seed and same batch order. The existing deterministic source order, 50,000-row CSV chunks, 4,096-example training batches, fixed transforms, SGD `random_state`, and validation/test batch size 8,192 are recorded for reproducibility. A seed is not chosen or omitted based on its test performance.

Training budget is one complete pass over 2,533,440 train recipient targets per arm and seed. There is no test-based early stopping or test-driven configuration change. If compute fails partway through, completed work will be reported as **PARTIAL** and will not be represented as a completed three-seed experiment.

## Threshold selection and evaluation order

For each seed and arm independently, select the threshold on validation labels only by maximizing F1 over `precision_recall_curve` thresholds. Ties prefer higher precision and then the higher threshold. Freeze the threshold and record its selection provenance. Positive prediction rule: `score >= threshold`.

Execution order is fixed:

1. Train both arms for all three seeds.
2. Generate validation scores and select/freeze each threshold; save and hash each model.
3. Verify the six models, validation thresholds, source hashes, and manifest inputs.
4. Only after all validation decisions are frozen, stream the test targets once and score all six saved models.
5. Attach evaluation-only labels after score generation, write row-keyed prediction exports, then compute metrics and paired differences.

No new test metrics may be inspected to change the model, features, seeds, thresholds, or training decisions.

## Statistical uncertainty

The unit of analysis is the paired seed-level metric difference, not transaction rows and not independent datasets. For the primary Average Precision difference, report all three paired deltas, their mean, sample standard deviation, and a two-sided 95% Student-t interval for the mean with 2 degrees of freedom. Report the same descriptive summaries for secondary scalar metrics where meaningful. Do not make a statistical-significance claim. The interval describes seed variability conditional on the one fixed test split; three seeds do not capture dataset, temporal-window, or domain uncertainty.

## Compute and storage assessment

Measured at preregistration: 12 logical CPUs, 7.4 GiB physical memory, approximately 1.0 GiB available memory, and 33.3 GiB free disk. The 186,385,561-byte compressed PaySim archive and the Phase 10 contract hashes were verified. Training and inference are streaming; the full CSV or expanded sequences will not be copied. The workload estimate in the frozen JSON config is approximately 39.5 million source-row visits, 15,200,640 paired training target exposures, 5,160,216 validation scores, and 4,905,894 test scores. Wall time is unknown because prior experiment manifests do not record runtime. Three compressed row-keyed prediction files are estimated at 0.1–0.3 GiB total; this is an estimate, not a measured size. Available disk is sufficient; low available RAM is a monitored risk.

## Failure and exclusion rules

Stop the affected run on a dataset/contract hash or split mismatch, causal or feature-exclusion violation, label leakage, invalid/non-finite score, incorrect threshold decision, artifact overwrite, or compute/storage failure. Do not change the research question or the accepted sequence contract to make a run pass. Report incomplete seeds, failures, warnings, and deviations explicitly. Do not call a partial run a complete experiment.

## Scope and limitations

This experiment concerns synthetic PaySim C-recipient histories only. It does not test sender-personalized behavior, real banking behavior, device/location/channel signals, calibration, or generalization beyond this fixed chronological split. Reusing the same test rows across three seeds makes seed-level differences paired but does not create three independent test datasets.
