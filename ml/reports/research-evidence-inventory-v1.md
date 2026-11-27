# LayerNet Research Evidence Inventory — Through Phase 14

**Prepared:** 2026-10-25. **Purpose:** Index of repository evidence used by `ml/reports/research-findings-v1.md`. Presence of a file is not treated as proof by itself; the entries below identify what was inspected and what each artifact can support.

## Repository snapshot

At the start of this consolidation, the repository was on `main` at `efc584e061231d583f1aeb97fef42e5154d9e4e2`. The working tree already had modifications to `DATASET_STRATEGY.md`, `ml/src/layernet_ml/cli.py`, `ml/src/layernet_ml/paysim_data.py`, `ml/src/layernet_ml/paysim_temporal.py`, and `ml/tests/test_paysim_temporal.py`. It also had untracked project-planning documents and Phase 13B/14 implementation/report files. Those pre-existing changes were not edited by this documentation task. The separate five planning documents were not used as research evidence.

## Evidence inventory

| Evidence path | Experiment / scope | Verified claims used | Status and limitations |
|---|---|---|---|
| `DATASET_STRATEGY.md` | Dataset decisions and limitations | ULB is a tabular benchmark without persistent entity identity; PaySim is limited to synthetic C-recipient histories; IEEE-CIS/FCA APP/Handbook statuses are documented separately | Inspected as the current strategy record. Candidate dataset claims are not evidence that those datasets were used in an experiment. |
| `ml/artifacts/xgboost-v1/manifest.json` | ULB XGBoost | Dataset/schema and hash; post-dedup counts; split; fit configuration; validation/test metrics and threshold | Primary result record. Its model file hash was recomputed and matched. |
| `ml/artifacts/random-forest-v1/manifest.json` | ULB Random Forest | Validation candidate selection; final train+validation fit; validation/test metrics and threshold | Primary result record. Its model file hash was recomputed and matched. |
| `ml/artifacts/isolation-forest-v1/manifest.json` | ULB Isolation Forest | Train-only unsupervised fit; fixed model-native threshold; oriented anomaly score; validation/test metrics | Primary result record. Its model file hash was recomputed and matched. |
| `ml/artifacts/ensemble-selectors-v1/manifest.json` | ULB selector models | XGBoost/RF selectors fit on train only; validation score file excludes labels; test unused | The two selector model hashes recorded in the manifest were recomputed and matched. Selector files are not replacements for accepted final-fit baselines. |
| `ml/artifacts/ensemble-v1/manifest.json` | ULB weighted ensemble | Validation-only normalization/selection; weights; frozen threshold; test metrics; component references | Primary result record. Component model hashes and normalization-reference hash were recomputed and matched. The ensemble score is uncalibrated. |
| `ml/reports/paysim-sequence-contract-v1.json` | Phase 10 PaySim schema and causal contract | Source/schema counts; recipient definition; whole-step splits; strict earlier-step history; feature exclusions and 17-bucket rule | Contract report; no performance claims. Source archive SHA-256 was recomputed and matched. |
| `ml/reports/paysim-sequence-materialization-v1.json` | Phase 11 loader/materialization | Per-split target/history counts; deterministic ragged representation; streaming materialization without copied raw CSV | Validation report, not a model result. |
| `ml/artifacts/paysim-temporal-v1/manifest.json` | Phase 12 PaySim models | Three model configurations, validation-selected thresholds, splits, leakage controls, runtime, validation/test metrics, model hashes | Primary experiment record. All three model artifact hashes were recomputed and matched. It does not retain original row-level prediction arrays or a complete immutable source snapshot for the original training run. |
| `ml/reports/paysim-temporal-reproduction-v1.md` | Phase 13B replay | Stored-versus-replayed validation and test metrics; thresholds; numeric tolerance; counts; replay procedure and recorded test status | Report records successful replay with `1e-10` absolute/relative tolerances and exact count matching. It is a report of a replay, not the original training log. |
| `ml/reports/paysim-temporal-prediction-export-v1.md` | Phase 14 row-level export | 817,649 regenerated test records; key definition; model thresholds; test metrics; limitations | Human-readable report. It explicitly distinguishes regenerated predictions from original retained predictions. |
| `ml/artifacts/paysim-temporal-v1/test-predictions-v1.manifest.json` | Phase 14 export provenance | Export schema/columns, dataset/contract/model hashes, thresholds, row count, row-key rule, score/label separation, validation flags, metric comparison | Machine-readable export record. Export gzip hash was recomputed and matched. The manifest reports unique keys and all test targets; this consolidation did not re-stream every row. |
| `ml/src/layernet_ml/evaluation.py` | Shared metric implementation | `pr_auc`, Average Precision, ROC-AUC, threshold `score >= threshold`, confusion counts | Source inspection confirms PR-AUC and Average Precision are separately implemented. |
| `ml/src/layernet_ml/paysim_data.py`, `ml/src/layernet_ml/paysim_temporal.py` | PaySim sequence/input and model implementation | Causal sequence loader and model construction paths | Inspected together with the contract, manifest, and README. Current source files are locally modified; the Phase 14 export manifest fingerprints the files used by export, but does not substitute for an immutable Phase 12 source archive. |
| `ml/tests/test_paysim_data.py`, `ml/tests/test_paysim_temporal.py`, `ml/tests/test_paysim_replay.py`, `ml/tests/test_paysim_prediction_export.py`, `ml/tests/test_research_contracts.py` | Sequence, training-contract, replay, and export behavior | Test coverage locations for causal history, feature exclusions, thresholding, and row identity | Test source was inspected. The Phase 13B report records 2 focused replay tests and 47 ML tests passed. No standalone Phase 14 test log was found, and tests were not rerun here. |
| `ml/README.md` | Documented setup, pipeline, metrics, sequence and experiment procedure | ULB/PaySim feature and split methodology; threshold selection; replay/export command descriptions | Documentation supports interpretation of implementation, but manifest and source remain the primary experiment evidence. |

### Dataset and split index

- `ml/artifacts/xgboost-v1/manifest.json`, `ml/artifacts/random-forest-v1/manifest.json`, `ml/artifacts/isolation-forest-v1/manifest.json`, and `ml/artifacts/ensemble-v1/manifest.json`: the same ULB chronological 60/20/20 split by elapsed `Time`; train 170,235 rows, validation 56,745, test 56,746, with tied timestamps grouped.
- `ml/artifacts/ensemble-selectors-v1/manifest.json`: ULB train-only fits on 170,235 rows; out-of-sample validation scores for 56,745 rows; final test unused.
- `ml/reports/paysim-sequence-contract-v1.json`, `ml/reports/paysim-sequence-materialization-v1.json`, `ml/artifacts/paysim-temporal-v1/manifest.json`, and the Phase 13B/14 PaySim records: PaySim customer-recipient targets on whole steps 1–281 train, 282–355 validation, and 356–743 test. Recipient target counts are 2,533,440 / 860,036 / 817,649, respectively.
- `ml/src/layernet_ml/evaluation.py` and `ml/README.md`: shared definitions and documented procedures; these are not dataset-specific split results.

## Integrity checks performed for this consolidation

- Recomputed SHA-256 values matched the recorded values for the local ULB CSV and PaySim archive.
- Recomputed SHA-256 values matched the ULB XGBoost, Random Forest, and Isolation Forest models; the two train-only selector models; the ensemble normalization reference; the three PaySim temporal models; and the Phase 14 compressed prediction export.
- Confirmed every ULB validation/test confusion matrix sums to its manifest split row count (56,745 validation; 56,746 test). The ULB test positive count is 74 for each manifest.
- Compared the Phase 14 export manifest's PaySim test metrics with the temporal experiment manifest: all recorded ranking/threshold metrics were within `1e-10`; all confusion counts matched exactly. Each test confusion matrix sums to 817,649 targets.
- The Phase 13B report records 860,036 validation targets and 817,649 test targets, thresholds selected on validation only, and no test-based selection. Phase 14 records a 817,649-row regenerated export and flags that labels were not used for score generation or thresholding.
- No model was trained and no dataset, saved model, threshold, manifest, or planning document was changed. This phase added only the three Phase 15 research documents.

## Evidence not present or not fully pinned

- No separate Phase 12 training console log or immutable training-source snapshot was found in the inspected report/artifact set. The manifest captures training parameters and artifact hashes; the later Phase 14 export manifest fingerprints code used for export, not necessarily every byte of code used in the original training process.
- Test source exists, and Phase 13B's report records prior test outcomes, but this inventory does not claim tests were run again during Phase 15 or infer a Phase 14 test count.
- The original Phase 12 per-row predictions were not saved. The Phase 14 CSV is a deterministic, row-keyed reconstruction from saved models and frozen thresholds, not original prediction output.
- The repository contains no IEEE-CIS, FCA APP, or Fraud Detection Handbook model-result artifacts in the inspected report/artifact list. Dataset strategy status is not experiment evidence.

## Primary result records

- ULB: `ml/artifacts/xgboost-v1/manifest.json`, `ml/artifacts/random-forest-v1/manifest.json`, `ml/artifacts/isolation-forest-v1/manifest.json`, `ml/artifacts/ensemble-v1/manifest.json`.
- PaySim: `ml/artifacts/paysim-temporal-v1/manifest.json`, corroborated by `ml/reports/paysim-temporal-reproduction-v1.md` and `ml/artifacts/paysim-temporal-v1/test-predictions-v1.manifest.json`.
- Data construction: `ml/reports/paysim-sequence-contract-v1.json` and `ml/reports/paysim-sequence-materialization-v1.json`.
