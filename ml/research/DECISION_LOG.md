# Research Decision Log

Methodological decisions that shape results. Append-only; a reversed decision gets a new entry that references the old one. Product/architecture decisions live in `docs/architecture/DATA_CONTRACT_v1.md` §7 and `docs/ml/MODEL_SERVING_CONTRACT_v1.md` §8.

| ID | Date | Decision | Rationale | Source | Decided by |
|---|---|---|---|---|---|
| RD-01 | before 2026-10-25 (R) | Primary metric is Average Precision; PR-AUC and ROC-AUC secondary | Extreme class imbalance; ROC-AUC flatters weak rankers | `research-findings-v1.md` (metric conventions) | NOT RECORDED |
| RD-02 | before 2026-10-25 (R) | Chronological splits only (ULB by `Time` 60/20/20 with ties grouped; PaySim whole steps 1–281 / 282–355 / 356–743) | Prevent temporal leakage | ULB manifests; sequence contract | NOT RECORDED |
| RD-03 | before 2026-10-25 (R) | Thresholds chosen by validation F1 (ties: higher precision, then higher threshold), frozen before test | No test-set tuning | `paysim_temporal.choose_validation_f1_threshold` | NOT RECORDED |
| RD-04 | before 2026-10-25 (R) | PaySim entity = C-prefixed `nameDest` recipient; history = strictly earlier whole steps, max 17 buckets; inputs exclude labels, balances, `isFlaggedFraud`, identifiers | `nameOrig` history too sparse; leakage control | `DATASET_STRATEGY.md`, sequence contract | NOT RECORDED |
| RD-05 | before 2026-10-25 (R) | Never merge datasets into one table or headline score | Different domains, label processes and synthetic/real status | `DATASET_STRATEGY.md` | NOT RECORDED |
| RD-06 | 2026-10-25 | Phase 16 keeps PARTIAL status after the aborted test stream; results come from a replay without retraining | Preserve the preregistered standard | Phase 16 report | NOT RECORDED |
| RD-07 | 2026-11-27 | Seed replication reuses the unchanged Phase 12 Transformer configuration; Phase 16 history-enabled SGD (already run for the same seeds) is the comparator; no new SGD runs | Isolate seed variability; avoid new tuning | `paysim-transformer-seeds-prereg-v1.md` | Owner approved P2-1 |
| RD-08 | 2026-11-27 | Report AP lift over split prevalence alongside AP | Test prevalence is 5.8× validation; raw AP rises with prevalence | `docs/ml/P2_ML_INTEGRATION_PLAN_v1.md` §3 | Project lead |
| RD-09 | 2026-11-27 | No research model is integrated into `/analysis`; app fields are not mapped onto ULB/PaySim inputs | Data contracts not satisfiable; mapped scores would have no validated meaning | `docs/ml/P2_ML_INTEGRATION_PLAN_v1.md` §4 | Project lead |
| RD-10 | 2026-11-28 | Research records are stored byte-exact in Git (`ml/reports/** -text`) | Pinned SHA-256 must match on every platform | `.gitattributes`, D-006 | Project lead |
| RD-11 | 2026-11-28 | Do not install a Parquet engine into `ml/.venv` just to inspect CreditTransAct | Keep the recorded research environment unchanged; dataset is not qualified anyway | `DATASET_REGISTER.md` | Project lead |
