# LayerNet Phase 16 — PaySim History Ablation v1

**Status: PARTIAL — all three paired seeds and the complete held-out evaluation finished; an aborted partial test-scoring attempt caused a deviation from the preregistered single-stream execution.**

## Preregistration and provenance

- Frozen preregistration SHA-256: `55efb7c60464a33bb2c8b86cc86fb351c6ed14411be60bcec5514da30f5cfc89`.
- Frozen configuration SHA-256: `01837321e01d853c5b6a58a43f02755f09e674e6b2b453072ad1cc642e3d4704`.
- PaySim archive SHA-256: `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d`.
- Sequence contract SHA-256: `acfd3223b58ee1b58b7c6a522e82dcd8b38e1d0e811c385d5ca60def0834ace7`.
- Source commit: `efc584e061231d583f1aeb97fef42e5154d9e4e2`, branch `main`. The repository already had unrelated uncommitted Phase 13–15 changes. The manifests preserve the full working-tree status and hashes of the relevant training and replay source files.
- Training runner SHA-256 at fit time: `2448887a3fd241c473987aec02fecd05a65080b6795627fe1a644a8cf2e0b593`.
- Replay runner SHA-256: `fd361796f0cefab3f3300684ad59c05c59b3a035523fc8898201caef6d40c80c`.

## Design

The comparison uses C-prefixed `nameDest` recipient histories, `step` as time, and current-transaction `isFraud` as the target. Training, validation, and test steps are 1–281, 282–355, and 356–743. The test set contains 817,649 targets. Historical events have strictly smaller `step` values than the target; same-step events are excluded.

Both arms use `SGDClassifier` with logistic loss, L2 penalty (`alpha=0.0001`), optimal learning rate, averaged weights, one pass, batch size 4,096, and paired deterministic batch order. Arm A receives the current transaction token. Arm B receives that same token plus up to 17 strictly earlier recipient-history step buckets. Training-only positive class weight is `792.4356404635139` (2,530,247 negatives / 3,193 positives). The fixed seeds are 42, 123, and 2026. The only intended treatment difference is access to those prior-history tokens.

Each 7-value historical bucket contains five `log1p` transaction-type counts, mean `log1p(amount) / 20`, and `step_gap / 743`; the current token contains the current transaction-type channel and `log1p(amount) / 20`. The history arm uses the accepted left-padded 18×7 representation flattened for the linear classifier (126 input values). No other feature was introduced.

Each arm and seed selected its threshold on validation labels by maximizing validation F1 over `precision_recall_curve` thresholds, with ties favoring higher precision and then a higher threshold. Test decisions use the frozen inclusive rule `score >= threshold`. Scores are uncalibrated decision margins, not probabilities. Labels, entity IDs, `isFlaggedFraud`, balances, and future or same-step events are excluded from model inputs.

## Held-out test results

Confusion counts are ordered TP / TN / FP / FN. Average Precision and PR-AUC are reported separately.

| Seed | Arm | Average Precision | PR-AUC | ROC-AUC | Precision | Recall | F1 | Threshold | TP / TN / FP / FN |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 42 | Current only | 0.038607759286747458 | 0.033573001984945054 | 0.83557163964751258 | 0.027524004012611063 | 0.72305882352941175 | 0.053029387910058852 | 5.8692464828491211 | 3,073 / 704,824 / 108,575 / 1,177 |
| 42 | Current + history | 0.080396924890629107 | 0.079607329247719891 | 0.86737272779013097 | 0.13344096197739799 | 0.56399999999999995 | 0.2158195651195246 | 11.335100173950195 | 2,397 / 797,833 / 15,566 / 1,853 |
| 123 | Current only | 0.016327821474199054 | 0.016269879265201216 | 0.70935158253495878 | 0.039407207814078811 | 0.027529411764705882 | 0.032414461836819501 | 9.6810932159423828 | 117 / 810,547 / 2,852 / 4,133 |
| 123 | Current + history | 0.043284011880441647 | 0.043122163115023177 | 0.86151401884163215 | 0.086678459654374748 | 0.4496470588235294 | 0.14533977259763473 | 13.530475616455078 | 1,911 / 793,263 / 20,136 / 2,339 |
| 2026 | Current only | 0.038607739472730045 | 0.033573001605396516 | 0.83557163906896714 | 0.027524004012611063 | 0.72305882352941175 | 0.053029387910058852 | 5.5263042449951172 | 3,073 / 704,824 / 108,575 / 1,177 |
| 2026 | Current + history | 0.11418470889920856 | 0.11054168709683214 | 0.86885059101665107 | 0.15183980613481282 | 0.56023529411764705 | 0.23892428879634739 | 11.768938064575195 | 2,381 / 800,099 / 13,300 / 1,869 |

### Paired differences: history minus current only

| Metric | Seed 42 | Seed 123 | Seed 2026 | Mean | Sample SD | Descriptive 95% Student-t interval, df=2 |
|---|---:|---:|---:|---:|---:|---|
| Average Precision | 0.04178916560388165 | 0.02695619040624259 | 0.07557696942647851 | 0.04810744181220092 | 0.02491857738349269 | [-0.01379373598930214, 0.1100086196137040] |
| PR-AUC | 0.04603432726277484 | 0.02685228384982196 | 0.07696868549143562 | 0.04995176553467747 | 0.02528681811411847 | [-0.01286417295277557, 0.1127677040221305] |
| ROC-AUC | 0.03180108814261839 | 0.1521624363066734 | 0.03327895194768393 | 0.07241415879899189 | 0.06906798711731950 | [-0.09916023267382747, 0.2439885502718113] |
| Precision | 0.1059169579647869 | 0.04727125184029594 | 0.1243158021222018 | 0.09250133730909486 | 0.04023617576532779 | [-0.007450864286170603, 0.1924535389043603] |
| Recall | -0.1590588235294118 | 0.4221176470588235 | -0.1628235294117647 | 0.03341176470588234 | 0.3366344315194586 | [-0.8028345217052387, 0.8696580511170034] |
| F1 | 0.1627901772094658 | 0.1129253107608152 | 0.1858949008862885 | 0.1538701296188565 | 0.03729364165020552 | [0.06122758798707816, 0.2465126712506349] |

Threshold and confusion-count differences use the same paired order (history minus current only). The counts partition the same 817,649 targets for each seed.

| Metric | Seed 42 | Seed 123 | Seed 2026 | Mean | Sample SD |
|---|---:|---:|---:|---:|---:|
| Threshold | 5.4658536911010742 | 3.8493824005126953 | 6.2426338195800781 | 5.1859566370646162 | 1.2209299158267548 |
| TP | -676 | 1,794 | -692 | 142 | 1,430.6963339576992 |
| TN | 93,009 | -17,284 | 95,275 | 57,000 | 64,341.807411666639 |
| FP | -93,009 | 17,284 | -95,275 | -57,000 | 64,341.807411666639 |
| FN | 676 | -1,794 | 692 | -142 | 1,430.6963339576992 |

All three seeds had a positive Average Precision difference for the history arm. The mean paired difference was `+0.04810744`, with sample SD `0.02491858`. The preregistered 95% interval includes zero; these three seeds on one shared test split do not establish statistical significance or dataset-level uncertainty.

Thresholded error trade-offs varied by seed. History reduced false positives by 93,009 and increased false negatives by 676 for seed 42; it increased false positives by 17,284 and reduced false negatives by 1,794 for seed 123; it reduced false positives by 95,275 and increased false negatives by 692 for seed 2026. Precision increased in each pair, while recall decreased for seeds 42 and 2026 and increased for seed 123.

## Runtime and reproducibility

Runtime environment: Python 3.12.14, NumPy 2.5.3, pandas 3.0.6, scikit-learn 1.9.1, joblib 1.6.0, and SciPy 1.18.1.

| Seed | Paired training time (s) | Validation scoring time (s) | Peak process working set after fit |
|---:|---:|---:|---:|
| 42 | 611.447816 | 267.285854 | 369,086,464 bytes |
| 123 | 612.587384 | 278.298972 | 423,931,904 bytes |
| 2026 | 581.087038 | 241.026058 | 423,931,904 bytes |

The successful test replay took 512.808189 seconds. No training warnings were recorded. Per-batch training-loss history was not retained by `SGDClassifier.partial_fit`; no post-hoc loss was added because its definition was not preregistered. That reporting gap is one reason this phase remains PARTIAL.

The trained models, validation records, and selection freeze are in `ml/artifacts/paysim-history-ablation-v1/`. The row-keyed exports and replay report are in `ml/artifacts/paysim-history-ablation-v1-test-replay-v1/`. Each export contains 817,649 rows and uses a SHA-256 key derived from the archive hash, CSV member, and original zero-based data-row ordinal. A separate read-back audit confirmed 817,649 unique keys per export, finite scores, frozen-threshold decisions, and exact confusion counts; all scalar metrics reproduced from the saved exports within `1e-10`. Export files total 163,302,543 bytes. Raw dataset and generated artifacts remain Git-ignored.

## Deviations, interpretation, and limits

The first fit attempt completed its paired training pass but stopped because the Windows process-memory sampler used incorrect `ctypes` handle signatures. The sampler was fixed and directly validated; the failed attempt is preserved separately. In the successful training attempt, all six models and validation thresholds were frozen before test scoring. A partial test-scoring attempt then stopped on an invalid assumption that deterministic target emission must be globally ordered by source-row ordinal. No aggregate metrics or prediction files resulted from that attempt and no test-driven selection or configuration change occurred. After correcting the assertion and adding a replay-only path around the saved models, test inference was completed without retraining or threshold reselection. The aborted test-stream attempt is recorded in the replay manifest and prevents a PASS under the preregistered single-stream procedure.

The observed results support a positive history signal for Average Precision on this synthetic PaySim split under this matched SGD setup. They do not establish sender-personalized behavior, real-world bank performance, device/location/channel intelligence, calibrated probabilities, statistical significance, or generalization beyond this fixed test period. The three repeated seeds share the same dataset and test rows and are not independent datasets.
