# Paper Outline (working; not a draft)

Section-by-section plan with the evidence each section needs. **No conclusions are written until the claims they rest on are `SUPPORTED` in `CLAIMS_EVIDENCE_MATRIX.md`.** Existing thesis guidance: `ml/reports/thesis-writing-notes-v1.md`; reference register: `report/REPORT_REFERENCE_REGISTER.md` (references must be verified there before citation — none are added here).

| # | Section | Content plan | Evidence available | Gap / blocker |
|---|---|---|---|---|
| 1 | Problem and motivation | Fraud detection under extreme imbalance; value of entity history | Dataset facts (`DATASET_REGISTER.md`) | Verified references needed |
| 2 | Related work | Tabular fraud benchmarks; sequence/Transformer fraud models; PaySim usage | — | Literature review not done; every citation must be verified (DOI, venue, year) |
| 3 | Research gap | Leakage-safe causal history evaluation with seed variability reported | Protocol records (prereg, freeze files) | Must be supported by the literature review |
| 4 | Research questions | RQ1: does causal recipient history help? RQ2: does a Transformer beat a flattened-history linear model? RQ3: how stable are results across seeds? | EXP-PS-ABL-v1, EXP-PS-TSEEDS-v1 | RQ1/RQ2 currently inconclusive (C5, C8) |
| 5 | Data and preprocessing | ULB (chronological, de-duplicated); PaySim C-recipient causal sequences | Contract + materialization reports; dataset hashes | Licence statements must be final |
| 6 | Models | ULB: XGB/RF/IF/ensemble. PaySim: current-only SGD, history SGD, 1-layer Transformer (9,409 params) | Manifests, source code | Phase 12 manifest unreadable (D-007) |
| 7 | Experimental setup | Splits, validation-only thresholds, freeze-before-test, seeds, environment lock | `METRICS_AND_EVALUATION.md`, `REPRODUCIBILITY_GUIDE.md` | Hardware details not recorded for past runs |
| 8 | Baselines and comparisons | Current-only control; history SGD; Transformer | Registry tables | More comparator seeds needed (Q1) |
| 9 | Results and statistics | AP, lift, per-seed values, descriptive t-intervals | C1, C3, C4, C6, C7, C9 supported | C2, C5, C8 not established |
| 10 | Ablations | History on/off (Phase 16) | EXP-PS-ABL-v1 (PARTIAL) | PARTIAL status must be disclosed |
| 11 | Threats to validity | Synthetic data; one split; 3 seeds; 74 ULB test positives; uncalibrated scores; Phase 16 deviation; Phase 12 provenance gaps | `DEVIATION_LOG.md` | — |
| 12 | Limitations | No real entity-history dataset; no calibration; no product integration | Claims C10–C12, P2 | — |
| 13 | Reproducibility statement | Code commits, environment lock, dataset hashes, preregistrations, evidence snapshots | `ml/research/` | Phase 12 artifact access |
| 14 | Ethics and licensing | PaySim CC BY-SA 4.0 attribution/ShareAlike; ULB Kaggle terms; no personal data | `DATASET_REGISTER.md` | ULB licence statement unresolved upstream |

**Current readiness:** the evidence supports a *methods-and-reproducibility* paper about leakage-safe evaluation on synthetic data with honest negative/inconclusive comparisons. It does **not** yet support a claim that a Transformer outperforms simpler models, or any real-world performance claim.
