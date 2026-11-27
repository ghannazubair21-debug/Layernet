# Preregistration — PaySim Temporal Transformer Seed Replication v1

**Experiment ID:** `paysim-transformer-seeds-v1`
**Frozen:** 2026-11-27, before any training or scoring for this experiment.
Configuration SHA-256 (exact file bytes): `14213e102a1506800461deaccd585898270838d73e7a7a24acbdf1d3ef4fabe4`
Configuration file: `ml/reports/paysim-transformer-seeds-config-v1.json`

## Question

The Phase 12 temporal Transformer was trained with a single seed (42). Its test Average Precision (0.1458) and PR-AUC (0.1476) have no seed-variability estimate. This experiment asks:

1. How much do the Transformer's validation and test metrics vary across seeds 42, 123 and 2026 with the unchanged Phase 12 configuration?
2. Per seed label, how does its test Average Precision compare with the Phase 16 history-enabled SGD arm on the same split?

It does **not** test generalisation beyond this synthetic PaySim split, sender personalisation, calibration, or real-bank performance.

## Fixed design

- Data: pinned PaySim v2 archive and Phase 10 sequence contract (hashes in the configuration). C-prefixed `nameDest` recipients; `step` as time; strictly earlier whole-step history (17-bucket cap); current transaction `isFraud` as target. Labels, balances, `isFlaggedFraud`, identifiers and same-step/future events are not inputs.
- Split: steps 1–281 train, 282–355 validation, 356–743 test (2,533,440 / 860,036 / 817,649 targets).
- Model: `PaySimTemporalTransformer` with `TRANSFORMER_CONFIG` exactly as used in Phase 12 (1 encoder layer, 32-wide, 2 heads, 64-wide FFN, dropout 0.1, AdamW lr 0.001, weight decay 1e-4, clip 1.0, batch 2,048, 2 epochs, 4 CPU threads, deterministic algorithms). No architecture or hyperparameter changes. No tuning.
- Seeds: 42, 123, 2026. A seed sets Python, NumPy and PyTorch RNGs and the per-epoch batch permutation (`seed + epoch`).
- Class weighting: `BCEWithLogitsLoss` with `pos_weight` = train negatives / train positives.

## Protocol

1. Verify archive, contract, configuration and this document's recorded configuration hash. Refuse to write into an existing output directory.
2. Train each seed on train targets only and save its artifact before any scoring.
3. Reload artifacts; score validation; select each seed's threshold by maximum validation F1 over `precision_recall_curve` thresholds (ties prefer higher precision, then higher threshold).
4. Write `selection-freeze.json` with artifact hashes and thresholds **before the test partition is opened**.
5. Score test once per seed with its frozen threshold (`score >= threshold`).
6. No retraining, threshold change or model selection after test is opened. Any interruption after that point is recorded as a deviation, not silently rerun.

## Reproduction check (seed 42)

Seed 42 matches the Phase 12 seed and configuration. Its validation metrics will be compared with the Phase 12 values recorded in `ml/reports/paysim-temporal-reproduction-v1.md` (threshold −0.35194271802902222; AP 0.0149986165289; PR-AUC 0.0149095095671; ROC-AUC 0.888624439385; TP/TN/FP/FN 427 / 845,771 / 13,495 / 343), absolute tolerance 1e-9 and exact counts. A mismatch is reported as a deviation; seed 42 is still analysed as a fresh seed.

## Analysis (fixed now)

- **Primary metric:** test Average Precision.
- **Primary comparison:** per-seed difference *Transformer − Phase 16 history-enabled SGD* (Phase 16 test AP: seed 42 0.0803969248906291, seed 123 0.04328401188044165, seed 2026 0.11418470889920856, from its frozen replay manifest). Report mean, sample SD and a descriptive two-sided 95% Student-t interval (df = 2). Pairing is by seed label only; the model families do not share initialisation or batch order.
- **Secondary:** Transformer mean and sample SD across seeds for AP, PR-AUC, ROC-AUC and thresholded precision/recall/F1 (validation and test); AP lift over split prevalence; per-seed confusion counts; training/scoring time; epoch losses.

## Interpretation rules (fixed now)

- An interval that includes zero does not establish a difference.
- Three seeds on one shared synthetic test split are not independent datasets; no statistical-significance claim.
- Validation and test PR-AUC/AP are not compared directly; prevalence differs (0.0895% vs 0.5198%).
- Scores are uncalibrated logits, not probabilities.
- Results apply only to this synthetic PaySim recipient-history setup.

## Outputs

- Artifacts: `ml/artifacts/paysim-transformer-seeds-v1/` (new; Git-ignored).
- Report: `ml/reports/paysim-transformer-seeds-v1.md` (new).
- No existing report, manifest, artifact or dataset is modified.
