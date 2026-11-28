# Claims–Evidence Matrix

Every statement LayerNet might make in a paper, thesis or product page is listed with its evidence. **Status:** `SUPPORTED` (evidence verified and the claim stays within it) · `PARTIALLY SUPPORTED` (evidence exists but with a stated gap) · `UNSUPPORTED` (evidence contradicts it or does not establish it) · `NOT VERIFIED` (evidence exists but could not be checked now).

Wording rule: a claim may be used only in the exact scope written here. Last reviewed 2026-11-28 against `evidence-snapshot-2026-11-28.json` (repository `8acd7da`).

## Research claims

| # | Claim (exact scope) | Evidence (experiment → record) | Statistical evidence | Limitations | Status |
|---|---|---|---|---|---|
| C1 | On the ULB two-day anonymised card dataset with a chronological split, supervised XGBoost and Random Forest rank fraud far above the base rate (test AP 0.7726 and 0.8073 vs prevalence ≈0.13% of test). | EXP-ULB-XGB-v1, EXP-ULB-RF-v1 → manifests (model hashes verified 2026-11-28) | Single run each; no interval | 74 test positives; PCA features; two days; no entity identity | SUPPORTED |
| C2 | Random Forest outperforms XGBoost on ULB. | EXP-ULB-RF-v1 vs EXP-ULB-XGB-v1 | None (single runs, 74 positives) | Difference of 0.035 AP could arise from a handful of cases | **UNSUPPORTED** as a general claim; may be reported only as an observed single-run ordering |
| C3 | Unsupervised Isolation Forest is a weak ranker on ULB (test AP 0.0357, ROC-AUC 0.943). | EXP-ULB-IF-v1 | Single run | Fixed model-native threshold; no tuning | SUPPORTED (as observed) |
| C4 | The validation-selected weighted ensemble did not improve on its best component (test AP 0.6110 < 0.8073). | EXP-ULB-ENS-v1 | Single run | Weights selected on validation only | SUPPORTED (as observed) |
| C5 | On synthetic PaySim C-recipient data, adding causal recipient history to an SGD model raised test AP in all three seeds (+0.042, +0.027, +0.076). | EXP-PS-ABL-v1-REPLAY | Mean +0.048, 95% t-interval [−0.014, +0.110] (df = 2) | Interval includes zero; one shared synthetic split; Phase 16 PARTIAL (D-002) | PARTIALLY SUPPORTED: direction consistent, difference **not established** |
| C6 | The temporal Transformer's PaySim results are stable across seeds (test AP 0.145838 ± 0.000049 SD, ROC-AUC 0.894688 ± 0.000682). | EXP-PS-TSEEDS-v1 (independently recomputed from raw scores, 66 checks) | Sample SD over 3 seeds | Seeds vary initialisation and batch order only; one split | SUPPORTED |
| C7 | The Phase 12 Transformer result reproduces: seed 42 retrained from scratch matches Phase 12 validation metrics exactly and test PR-AUC to ~3e-16. | EXP-PS-TSEEDS-v1 reproduction check; EXP-PS-REPLAY-v1 | Exact match (tolerance 1e-9, counts exact) | Phase 12 artifacts currently unreadable (D-007) | SUPPORTED (reproduction); Phase 12 artifact hashes NOT VERIFIED now |
| C8 | The Transformer outperforms the history-enabled SGD model on PaySim. | EXP-PS-TSEEDS-v1 primary analysis | Mean +0.0666 AP, 95% t-interval [−0.0216, +0.1547] | Interval includes zero; comparator varies widely by seed; pairing by seed label only | **UNSUPPORTED** (not established). May say: "higher in all three seeds; difference not established" |
| C9 | The Transformer ranks PaySim C-recipient fraud at ~28× the prevalence baseline on test (~16.8× on validation). | EXP-PS-TSEEDS-v1 lift values | Per-seed; SD negligible | Synthetic data; lift not comparable across splits | SUPPORTED (synthetic scope) |
| C10 | Results on PaySim indicate real-world banking performance. | — | — | PaySim is synthetic mobile-money simulation | **UNSUPPORTED** — must never be claimed |
| C11 | Models learn sender-level / customer-personalised behaviour. | — | — | PaySim `nameOrig` history too sparse; ULB has no identity | **UNSUPPORTED** |
| C12 | Transformer scores are calibrated fraud probabilities. | — | — | Uncalibrated logits; no calibration study | **UNSUPPORTED** |

## Product claims

| # | Claim | Evidence | Status |
|---|---|---|---|
| P1 | The live LayerNet analysis score is produced by a rules baseline (`LayerNet rules baseline v1.1`), not a trained model. | `lib/fraudAnalysis.ts`; no model adapter in `app/` or `lib/` | SUPPORTED |
| P2 | A trained Transformer (or any trained model) is integrated into transaction analysis. | — | **UNSUPPORTED** (not integrated; data contract not satisfiable, `docs/ml/P2_ML_INTEGRATION_PLAN_v1.md` §4) |
| P3 | `/benchmark` scores genuine ULB-shaped rows with the saved XGBoost and Random Forest models. | `app/api/benchmark/route.ts`, `ml/` replay CLI; real replay earlier in this project | SUPPORTED (local only; blocked in production by the request guard) |
| P4 | Transaction history is persisted in a database. | — | **UNSUPPORTED** (browser localStorage only) |

## Paper-readiness blockers (claims side)

1. Phase 12 artifact access (D-007) — needed to re-verify C7's artifact hashes.
2. No result on a non-synthetic dataset with entity identity — every temporal claim is synthetic-only.
3. All model comparisons rest on 3 seeds on one split (C5, C8): more seeds of the **comparator** and/or additional splits are needed before any difference claim.
4. ULB single-run results have no uncertainty estimate (C1–C4): a bootstrap over the test set would quantify it without retraining.
