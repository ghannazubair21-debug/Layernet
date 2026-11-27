# LayerNet Research Findings — Evidence Through Phase 14

**Evidence cutoff:** 2026-10-25. **Scope:** Consolidation of the existing ULB benchmark and PaySim temporal experiments. No model was trained and no new experiment was run for this report.

## Evidence standard and scope

Machine-readable experiment manifests are the primary record for configurations, splits, thresholds, and metrics. Sequence and replay reports corroborate the temporal data construction and replay checks. Source code is used to clarify metric definitions and input construction. Statements below distinguish those recorded facts from interpretation.

The five separate project-planning documents are outside this research roadmap and were not used as evidence. ULB and PaySim are separate experiments on different datasets, tasks, feature schemas, and split designs; their scores must not be combined into one leaderboard.

## Metric conventions

The shared evaluator in `ml/src/layernet_ml/evaluation.py` reports three distinct ranking metrics: `pr_auc` is trapezoidal area under the precision-recall curve; `average_precision` is the evaluator's grouped, stepwise precision-recall summary; and `roc_auc` is ROC area. These fields are not interchangeable. Precision, recall, F1, and confusion counts use the recorded threshold and the decision rule `score >= threshold`.

The ULB supervised and Isolation Forest scores, the PaySim decision margins/logits, and the ULB weighted ensemble are recorded as **uncalibrated scores**, not calibrated fraud probabilities. The ULB ensemble's normalized weighted score is also not a probability.

## Track A — ULB / Worldline tabular benchmark

### Data and evaluation design

The original source is described in `DATASET_STRATEGY.md` as 284,807 transactions with 492 fraud labels. The benchmark manifests record the modeling population **after exact duplicate removal**: 283,726 rows, 1,081 duplicates removed, and 473 fraud rows. The local CSV hash was checked against the manifests and matched.

The manifests define a chronological contiguous 60/20/20 split by elapsed `Time`, with tied timestamps kept together:

| Split | Rows | Fraud labels | Elapsed-time range |
|---|---:|---:|---:|
| Train | 170,235 | 342 | 0–120,392 |
| Validation | 56,745 | 57 | 120,393–145,233 |
| Test | 56,746 | 74 | 145,234–172,792 |

Inputs are fixed, label-free features: `log1p(Amount)`, cyclic elapsed-time features, and `V1`–`V28`; `Class` and absolute `Time` are excluded. This release has no persistent account/customer identifier, so it supports a conventional tabular benchmark and chronological evaluation, not personalized histories. The anonymized PCA features also do not provide human-readable transaction evidence.

XGBoost selected its tree count with validation early stopping, then fit the final model on train plus validation. Random Forest selected between its recorded 100- and 200-tree candidates by validation Average Precision, then fit on train plus validation. Isolation Forest used its fixed configuration and fit on train only; its oriented native threshold was 0. The ensemble used train-only selector models for out-of-sample validation scores, a validation-score empirical CDF for normalization, validation Average Precision for weight selection, and validation F1 for threshold selection. Test labels were reserved for reported final measurements according to the manifests.

### Recorded metrics

All values below are transcribed from the corresponding manifest. `P`, `R`, and `F1` are thresholded metrics. Confusion counts are shown as `TP / TN / FP / FN`.

| Model | Split | PR-AUC | Average Precision | ROC-AUC | P | R | F1 | Threshold | TP / TN / FP / FN |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| XGBoost | Validation | 0.7571991638263738 | 0.7581774497393768 | 0.9761755326787191 | 0.24083769633507854 | 0.8070175438596491 | 0.3709677419354839 | 0.5 | 46 / 56543 / 145 / 11 |
| XGBoost | Test | 0.7722870806297158 | 0.7725965689814533 | 0.9802946209196209 | 0.3391812865497076 | 0.7837837837837838 | 0.47346938775510206 | 0.5 | 58 / 56559 / 113 / 16 |
| Random Forest | Validation | 0.7636480132423442 | 0.7642272280586584 | 0.9477735316982833 | 0.9523809523809523 | 0.7017543859649122 | 0.8080808080808081 | 0.5 | 40 / 56686 / 2 / 17 |
| Random Forest | Test | 0.8070187152386684 | 0.8072680865582504 | 0.9779061732186732 | 0.9814814814814815 | 0.7162162162162162 | 0.8281250000000001 | 0.5 | 53 / 56671 / 1 / 21 |
| Isolation Forest | Validation | 0.01934079245060698 | 0.020011271036813248 | 0.9359869473288075 | 0.01752289924332935 | 0.7719298245614035 | 0.03426791277258567 | 0.0 | 44 / 54221 / 2467 / 13 |
| Isolation Forest | Test | 0.03479275685126939 | 0.03573313815796601 | 0.9431369893326415 | 0.026899480887210947 | 0.7702702702702703 | 0.05198358413132695 | 0.0 | 57 / 54610 / 2062 / 17 |
| Weighted ensemble | Validation | 0.633596620050499 | 0.6352092000203203 | 0.9611554906883353 | 0.6724137931034483 | 0.6842105263157895 | 0.6782608695652174 | 0.9941616001409815 | 39 / 56669 / 19 / 18 |
| Weighted ensemble | Test | 0.6087938217094901 | 0.6109966561114698 | 0.9794835287362461 | 0.6231884057971014 | 0.581081081081081 | 0.6013986013986014 | 0.9941616001409815 | 43 / 56646 / 26 / 31 |

The ensemble manifest records selected weights of XGBoost 0.2, Random Forest 0.6, and Isolation Forest 0.2. Each component score was normalized by its empirical validation-score CDF (midrank ties); the ensemble threshold was selected on validation F1. On this held-out split the Random Forest manifest has higher Average Precision than the other listed ULB experiments, while the thresholded trade-offs differ across models. This is a descriptive reading of one split, not a universal ranking or a claim of generalization. The test partition contains 74 fraud cases, so operating metrics reflect a small positive-class count.

## Track B — PaySim synthetic recipient-history temporal experiment

### Data and sequence design

The locally available author-attributed Version 2 archive at `ml/data/paysim/paysim-author-release-v2.zip` has SHA-256 `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d`; the hash was recomputed and matched. The contract records 6,362,620 source rows, 8,213 `isFraud=1` labels, hourly steps 1–743, and customer-recipient targets for `nameDest` values beginning with `C`.

| Split | Whole-step range | Source rows | Recipient targets | Fraud targets | Non-fraud targets | Targets with history |
|---|---|---:|---:|---:|---:|---:|
| Train | 1–281 | 3,820,599 | 2,533,440 | 3,193 | 2,530,247 | 2,146,962 |
| Validation | 282–355 | 1,293,285 | 860,036 | 770 | 859,266 | 741,405 |
| Test | 356–743 | 1,248,736 | 817,649 | 4,250 | 813,399 | 703,260 |

The target is the current recipient transaction's `isFraud`. A target's history includes only transactions for the same C-prefixed `nameDest` at strictly smaller `step`; all transactions tied at a step are simultaneous. Validation and test can use causally earlier history from previous partitions, while training targets see only earlier train steps. The history cap is 17 distinct prior step buckets, selected as the nearest-rank 95th percentile of the training-target history-length distribution. Truncation keeps the newest whole buckets.

The model input has seven channels: five `log1p` transaction-type counts, mean `log1p(amount)` divided by 20, and step-gap divided by 743. The current target token contains the current type and amount. The sequence contract and temporal manifest exclude labels, `isFlaggedFraud`, all balance columns, source entity IDs as predictive features, same-step events, and future events. There are no device, geographic-location, or channel signals in this experiment. The entity is a recipient identity, not a sender/customer-personalization claim.

### Models and threshold protocol

The current-only control is an SGD logistic classifier using only the current transaction token. The temporal linear baseline is an SGD logistic classifier using the flattened 17 prior buckets plus the current token. The Transformer is a single-layer PyTorch TransformerEncoder with 32-wide input projection, two attention heads, 64-wide feed-forward layer, dropout 0.1, learned positions, and current-token pooling. It was trained on CPU for two recorded epochs with AdamW, learning rate 0.001, batch size 2,048, and seed 42. Each model uses a training-label-derived class weight; input transforms are fixed and deterministic, with no learned preprocessing.

Each model's threshold was selected independently using validation F1 over the recorded precision-recall-curve thresholds; ties prefer higher precision and then a higher threshold. The frozen thresholds are listed below and were reused for test evaluation. Scores are uncalibrated decision margins/logits, not probabilities.

### Recorded metrics and replay

Values below are transcribed from `ml/artifacts/paysim-temporal-v1/manifest.json`. The Phase 13B replay report records stored/replayed values and reports a match at absolute and relative tolerance 1e-10, with exact confusion counts. The Phase 14 export manifest records the same test metrics and thresholds; its values were compared with the temporal manifest, with numeric differences within 1e-10 and exact confusion-count matches.

| Model | Split | PR-AUC | Average Precision | ROC-AUC | P | R | F1 | Threshold | TP / TN / FP / FN |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Current-only control | Validation | 0.0030924693505261797 | 0.003108148421206422 | 0.8247039907905693 | 0.004896723646723646 | 0.7142857142857143 | 0.009726766292333539 | 5.869246482849121 | 550 / 747496 / 111770 / 220 |
| Current-only control | Test | 0.033573001984945054 | 0.03860775928674746 | 0.8355716396475126 | 0.027524004012611063 | 0.7230588235294118 | 0.05302938791005885 | 5.869246482849121 | 3073 / 704824 / 108575 / 1177 |
| Temporal linear baseline | Validation | 0.012034713038733961 | 0.012090657288248017 | 0.8608728641276769 | 0.024902005994927368 | 0.561038961038961 | 0.04768738271332376 | 11.335100173950195 | 432 / 842350 / 16916 / 338 |
| Temporal linear baseline | Test | 0.07960732924771989 | 0.0803969248906291 | 0.867372727790131 | 0.133440961977398 | 0.564 | 0.2158195651195246 | 11.335100173950195 | 2397 / 797833 / 15566 / 1853 |
| Temporal Transformer | Validation | 0.014909509567101272 | 0.014998616528907374 | 0.8886244393848558 | 0.03067088062060049 | 0.5545454545454546 | 0.058126871766947995 | -0.3519427180290222 | 427 / 845771 / 13495 / 343 |
| Temporal Transformer | Test | 0.14759999719607347 | 0.14578967124048028 | 0.8940755646801805 | 0.16123778501628663 | 0.5590588235294117 | 0.25028968713789107 | -0.3519427180290222 | 2376 / 801039 / 12360 / 1874 |

The Transformer has higher test PR-AUC, Average Precision, and ROC-AUC than the temporal linear baseline in this recorded split. At their respective validation-selected thresholds, the Transformer has lower recall and fewer false positives than the temporal linear baseline. This pattern is consistent with useful signal in the accepted temporal representation under this synthetic setup, but does not isolate the causal contribution of history from model/representation differences and does not establish performance outside this experiment.

The Phase 13B replay report records 860,036 validation targets and 817,649 test targets, no training or test-based selection during replay, and exact confusion-count agreement. Phase 14 regenerated row-keyed test predictions for all 817,649 targets. The key is derived from the archive hash, CSV member, and zero-based source data-row ordinal. The exported predictions are regenerated outputs, not original predictions retained during training. The compressed CSV hash and all three saved model hashes were checked against their manifests during this consolidation.

## Supported findings, unresolved questions, and limits

### Supported by the current evidence

1. The ULB pipeline produces four recorded tabular benchmark results on the same chronological held-out test partition, with score, threshold, and confusion-count details in the four manifests.
2. The accepted PaySim sequence contract and loader construct recipient-side histories from strictly earlier hourly steps and exclude target/future labels and unsupported fields.
3. On one fixed PaySim synthetic test split, the Transformer records higher ranking metrics than the temporal linear baseline and current-only control; its operating-point metrics show a different precision/recall trade-off.
4. Phase 13B replay and Phase 14 regenerated row-keyed export reproduce the recorded PaySim aggregate metrics within the documented tolerance; Phase 14 adds row-level auditability for regenerated predictions.

### Unresolved questions and research gaps

- Whether the PaySim temporal pattern repeats across random seeds, time windows, or a separate permitted dataset.
- How much of the PaySim difference is due specifically to history, versus current-transaction signals, representation, and model capacity; a controlled history ablation is needed.
- Whether thresholds and scores remain useful under other class prevalences or operational cost assumptions. Scores are not calibrated probabilities.
- Whether results generalize to genuine account/customer histories. PaySim is synthetic; the experiment uses recipient IDs and contains no device, location, or channel variables.
- No confidence intervals, repeated-seed uncertainty estimates, external validation, or documented calibration study are present in the inspected experiment evidence.
- Phase 14 fingerprints the source files used for export, but the Phase 12 training manifest does not provide a complete immutable source snapshot for the original training execution. Replayed artifact inference is verifiable; original training-code provenance is less complete.
- The reports record test replay/export after the original experiment. These are verification replays with frozen models and thresholds, not new model selection; retain that distinction when describing the test-set protocol.

## Thesis-writing guidance

Write the ULB and PaySim tracks as separate studies. State each dataset, split, target, feature scope, threshold rule, metric definition, and limitation next to the result. Use the recorded terms **PR-AUC**, **Average Precision**, and **ROC-AUC** distinctly. Describe PaySim as a synthetic C-prefixed recipient-history experiment and describe the Transformer comparison as an observation on its single held-out chronological split.

Do not claim that the results prove real-world, Pakistani banking, sender-personalized, device/location/channel-aware, or production fraud detection. Do not say the LayerNet application currently serves the trained models, that scores are calibrated probabilities, that temporal history alone caused an improvement, or that one model is universally best. The evidence does not yet establish explanation quality, investigator outcomes, or generalization across institutions and populations.

## Evidence paths

The path-by-path inventory and its verification status are in `ml/reports/research-evidence-inventory-v1.md`. Primary result records are the ULB manifests in `ml/artifacts/{xgboost-v1,random-forest-v1,isolation-forest-v1,ensemble-v1}/manifest.json` and the PaySim manifest at `ml/artifacts/paysim-temporal-v1/manifest.json`.
