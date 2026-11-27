# PaySim Temporal Transformer Seed Replication v1 — Results

**Experiment ID:** `paysim-transformer-seeds-v1`
**Status: COMPLETE — protocol followed, one recorded provenance deviation (§6). Primary comparison: difference NOT established (interval includes zero).**
**Run:** 2026-11-27 18:47:53 → 20:38:12 UTC, CPU only. **Report written:** 2026-11-28.

Preregistration: `ml/reports/paysim-transformer-seeds-prereg-v1.md` (SHA-256 `67bbced0df8f9b2255fb73b75057cdd7e9a1b5d1c095fbd23d08d69e98cb876e`), configuration `ml/reports/paysim-transformer-seeds-config-v1.json` (SHA-256 `14213e102a1506800461deaccd585898270838d73e7a7a24acbdf1d3ef4fabe4`).
Run outputs: `ml/artifacts/paysim-transformer-seeds-v1/` (Git-ignored). No existing report, manifest, artifact or dataset was modified.

All results below are on **one fixed synthetic PaySim split** (C-prefixed recipients, steps 356–743 test). They are not evidence of real-bank performance. Scores are uncalibrated logits.

## 1. Answers to the preregistered questions

1. **Seed variability of the Phase 12 Transformer is very small.** Across seeds 42, 123 and 2026, test Average Precision is 0.145838 ± 0.000049 (mean ± sample SD) and test ROC-AUC 0.894688 ± 0.000682. The single-seed Phase 12 figures (test AP 0.1458, PR-AUC 0.1476) are representative of this configuration on this split, not a lucky seed.
2. **Transformer vs Phase 16 history-enabled SGD (primary, test AP):** the Transformer's AP is higher for every seed label (+0.0654, +0.1026, +0.0317). Mean difference **+0.0665**, sample SD 0.0355, descriptive 95% Student-t interval (df = 2) **[−0.0216, +0.1547]**. **The interval includes zero, so under the preregistered rule a difference is not established.** The width comes almost entirely from the SGD comparator's seed variability (its test AP ranges 0.0433–0.1142); the Transformer's own spread is ~0.0001.

No statistical-significance claim is made: three seeds on one shared test split are not independent datasets.

## 2. Seed-42 reproduction check — PASS

Seed 42 reproduces the Phase 12 validation result exactly (preregistered tolerance: absolute 1e-9, counts exact).

| Metric | Phase 12 (recorded) | This run, seed 42 | Match |
|---|---:|---:|:-:|
| Threshold | −0.3519427180290222 | −0.3519427180290222 | ✓ |
| Average Precision | 0.0149986165289 | 0.014998616528907374 | ✓ |
| PR-AUC | 0.0149095095671 | 0.014909509567101272 | ✓ |
| ROC-AUC | 0.888624439385 | 0.8886244393848558 | ✓ |
| TP / TN / FP / FN | 427 / 845,771 / 13,495 / 343 | 427 / 845,771 / 13,495 / 343 | ✓ |

Seed-42 test PR-AUC is 0.14759999719607317 against the Phase 12 recorded 0.14759999719607347 (difference ≈ 3e-16, floating-point summation order). This indirectly corroborates the Phase 12 result, whose own artifact directory is still unreadable on this machine (blocker B1).

## 3. Transformer results by seed

Thresholds were selected on validation F1 only and frozen before the test partition was opened.

**Validation** (860,036 targets, 770 fraud, prevalence 0.0895%)

| Seed | Threshold | AP | PR-AUC | ROC-AUC | Precision | Recall | F1 | TP / FP / FN / TN |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 42 | −0.35194 | 0.014999 | 0.014910 | 0.888624 | 0.0307 | 0.5545 | 0.0581 | 427 / 13,495 / 343 / 845,771 |
| 123 | −0.48286 | 0.015021 | 0.014931 | 0.888549 | 0.0308 | 0.5545 | 0.0584 | 427 / 13,420 / 343 / 845,846 |
| 2026 | −0.40022 | 0.015023 | 0.014934 | 0.887841 | 0.0309 | 0.5545 | 0.0585 | 427 / 13,399 / 343 / 845,867 |

**Test** (817,649 targets, 4,250 fraud, prevalence 0.5198%)

| Seed | AP | PR-AUC | ROC-AUC | Precision | Recall | F1 | TP / FP / FN / TN |
|---|---:|---:|---:|---:|---:|---:|---|
| 42 | 0.145790 | 0.147600 | 0.894076 | 0.1612 | 0.5591 | 0.2503 | 2,376 / 12,360 / 1,874 / 801,039 |
| 123 | 0.145887 | 0.147698 | 0.895424 | 0.1614 | 0.5591 | 0.2505 | 2,376 / 12,345 / 1,874 / 801,054 |
| 2026 | 0.145838 | 0.147649 | 0.894564 | 0.1615 | 0.5591 | 0.2506 | 2,376 / 12,334 / 1,874 / 801,065 |

**Across seeds** (mean, sample SD, descriptive 95% t-interval df = 2)

| Metric | Validation | Test |
|---|---|---|
| AP | 0.015014 ± 0.000014 [0.014981, 0.015048] | 0.145838 ± 0.000049 [0.145717, 0.145959] |
| PR-AUC | 0.014925 ± 0.000013 [0.014892, 0.014958] | 0.147649 ± 0.000049 [0.147527, 0.147771] |
| ROC-AUC | 0.888338 ± 0.000432 [0.887264, 0.889412] | 0.894688 ± 0.000682 [0.892992, 0.896383] |
| Precision @ frozen threshold | 0.030797 ± 0.000112 | 0.161388 ± 0.000143 |
| Recall @ frozen threshold | 0.554545 ± 0 | 0.559059 ± 0 |
| F1 @ frozen threshold | 0.058354 ± 0.000201 | 0.250470 ± 0.000172 |

**AP lift over split prevalence** (AP ÷ prevalence; a random ranking scores 1×): validation 16.75× / 16.78× / 16.78×, test 28.05× / 28.07× / 28.06× (seeds 42 / 123 / 2026). Validation and test values are not compared directly because prevalence differs 5.8×.

**Observation (not preregistered, descriptive only):** all three seeds flag the *identical* set of 2,376 test frauds (and 427 validation frauds), so recall is exactly equal across seeds. This is not score degeneracy — each seed produces ~670–690k distinct test scores — but the seeds rank targets very similarly (rank correlation between seeds 42 and 123: 0.966), and each seed's F1-optimal threshold falls in the same gap of the fraud-score distribution. Seeds differ only in how many non-fraud targets they flag (12,334–12,360 on test).

## 4. Primary comparison detail

| Seed | Transformer test AP | Phase 16 history-enabled SGD test AP | Difference |
|---|---:|---:|---:|
| 42 | 0.145790 | 0.080397 | +0.065393 |
| 123 | 0.145887 | 0.043284 | +0.102603 |
| 2026 | 0.145838 | 0.114185 | +0.031653 |
| **Mean** | | | **+0.066550** (SD 0.035489) |
| **Descriptive 95% t-interval (df = 2)** | | | **[−0.021610, +0.154709]** — includes zero |

Caveats specific to this comparison:

- Pairing is by seed label only. The two model families share neither initialisation nor batch order, so the "pairing" does not remove any shared noise; it is a preregistered convention.
- The comparator comes from Phase 16, whose status remains **PARTIAL** (an aborted test-scoring attempt deviated from its preregistered single-stream procedure; see `ml/reports/paysim-history-ablation-v1*.md`). Its test metrics themselves are complete and were read, hash-checked, from `ml/artifacts/paysim-history-ablation-v1-test-replay-v1/manifest.json` (SHA-256 `c05d9589…46bbe5`, as preregistered).
- Consistent direction across 3/3 seeds and a mean difference of +0.067 AP are suggestive, but with df = 2 and a highly variable comparator, this experiment cannot establish the difference. More comparator seeds (not more Transformer seeds) would be the informative next measurement.

## 5. Training and runtime

| Seed | Epoch weighted loss (1, 2) | Epoch seconds (1, 2) | Artifact SHA-256 |
|---|---|---|---|
| 42 | 1.115452, 0.992464 | 955, 1,088 | `6c4bbc909887b65223c8067ae09fbb14fa8c50da4e66ae8b8f06d032967afbae` |
| 123 | 1.110453, 0.995699 | 1,075, 995 | `18d6e61eb751e0325bb401c1d086f5380cf2ac6e6ba729b6e4dbeab9ede76875` |
| 2026 | 1.114561, 0.986033 | 873, 889 | `1b775a4195306af5bda7ac673e4b8cdc15d6556d6bca4b2bf9e3dfbbb7bb96bf` |

Train targets 2,533,440 (3,193 fraud); positive-class weight 792.4356 (train only). Scoring all three seeds in one pass: validation 280 s, test 279 s. Python 3.12.14, torch 2.6.0+cpu, numpy 2.5.3, scikit-learn 1.9.1, scipy 1.18.1, 4 CPU threads, deterministic algorithms.

Other output hashes: `selection-freeze.json` `76ece4dec6c7f5b818a2b76fa603cbc7a1c688861b55d01110e31cc1a8853def`, `test-scores.npz` `34713cb28b8d16e3ee58aca0c1c2f989faa4163cae04dc6cc8a62c90243f4c91`, `test-labels.npz` `648c0fb09d5b3bf0b706e182efbb7baf8130d4374a2e816470869c6af11d44dd`.

## 6. Protocol compliance and deviations

Recorded event order (UTC, from the run manifest): preregistration verified 18:47:54 → dataset verified 18:49:29 → seed 42 trained 19:23:52 → seed 123 trained 19:58:42 → seed 2026 trained 20:28:04 → **thresholds frozen 20:33:09.556 → test opened 20:33:09.562** → completed 20:38:12. No retraining, threshold change, model selection or rerun occurred after the test partition was opened.

**Deviation D1 (provenance, no effect on results).** The run was launched from commit `fc0a68d` while the runner (`paysim_transformer_seeds.py`), its tests, the configuration and the preregistration were present in the working tree but **not yet committed**. They were committed as `bc93ea1` at 19:00:12 UTC, during seed-42 training and before any scoring. The SHA-256 of every source file and of the configuration and preregistration recorded at run start equals the bytes stored in `bc93ea1` and the current files, so the code and the frozen design that produced these results are exactly identified. The preregistration hash was recorded by the run 1 h 45 min before the test partition was opened.

## 7. Independent verification

A separate script (not using `layernet_ml.evaluation`) re-derived the results from the raw outputs with scikit-learn and SciPy directly and checked: manifest status and event order; freeze-before-test timestamps; configuration, preregistration, comparator and source-file hashes; artifact hashes on disk = training record = freeze record; split counts; test AP, PR-AUC, ROC-AUC, precision, recall, F1 and confusion counts for each seed recomputed from `test-scores.npz` / `test-labels.npz` at the frozen thresholds (agreement ≤ 1e-12); the seed-42 reproduction verdict; and the primary mean, SD and interval. **66 checks passed.** The only check that did not pass is deviation D1 (working tree not clean at launch). Validation metrics were not independently re-derived because validation scores were not saved by design; they are corroborated by the exact seed-42 reproduction.

## 8. What this does and does not support

Supported (this synthetic split only):
- The Phase 12 Transformer result is stable across seeds (test AP SD ≈ 0.00005) and reproducible bit-for-bit for seed 42.
- The Transformer ranks C-recipient fraud at ~28× the prevalence baseline on test with very low seed sensitivity.

Not supported:
- That the Transformer is better than the history-enabled SGD model: the preregistered interval includes zero.
- Any real-world, real-bank, sender-level or calibrated-probability claim.
- Integration into `/analysis`: the data contract is still not satisfiable by app records (`docs/ml/P2_ML_INTEGRATION_PLAN_v1.md` §4).
