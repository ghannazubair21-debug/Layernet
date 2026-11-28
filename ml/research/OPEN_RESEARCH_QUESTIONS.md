# Open Research Questions

Questions raised by the evidence, not answered by it. Each states what would answer it. Nothing here is a finding.

| # | Question | Raised by | What would answer it | Needs |
|---|---|---|---|---|
| Q1 | Is the Transformer better than the history-enabled SGD model on PaySim? | EXP-PS-TSEEDS-v1 (interval includes zero) | More comparator seeds (the SGD arm's AP spans 0.043–0.114 while the Transformer's SD is 0.00005), preregistered before running | CPU time only |
| Q2 | Why do Phase 16 current-only seeds 42 and 2026 produce identical test metrics (AP 0.038608, ROC-AUC 0.835572)? | EXP-PS-ABL-v1-REPLAY | Compare the two saved `current_only.joblib` models' coefficients and the seed's effect on the SGD fitting path. Diagnostic only; no re-scoring of test | Read access to existing artifacts (available) |
| Q3 | Why do all three Transformer seeds flag the identical set of 2,376 test frauds? | EXP-PS-TSEEDS-v1 §3 | Inspect the feature tokens of flagged vs missed frauds (e.g. whether flagged frauds share an empty-history pattern) | Diagnostic analysis on saved scores |
| Q4 | How uncertain are the single-run ULB results (74 test positives)? | EXP-ULB-* | Stratified bootstrap of test AP from saved predictions/models (no retraining) | Re-scoring ULB test with saved models |
| Q5 | Does the PaySim temporal signal hold on a non-synthetic dataset with real entity history? | All PaySim claims are synthetic | A qualified dataset (blocker B2) and a new preregistered experiment | Owner dataset decision |
| Q6 | Are the models' scores calibratable to usable probabilities, and at what alert volume? | Product integration (`MODEL_SERVING_CONTRACT_v1.md`) | Calibration on validation (Platt/isotonic), reported on test with reliability curves | A product-relevant dataset first |
| Q7 | What does the PaySim Transformer attend to? | Interpretability for the paper | Attention/ablation analysis by history position | Saved models (available) |
