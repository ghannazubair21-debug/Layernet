# LayerNet Thesis-Writing Notes — Evidence Through Phase 14

Use these notes with `ml/reports/research-findings-v1.md` and `ml/reports/research-evidence-inventory-v1.md`. They are evidence-bound phrasing guidance, not new results.

## Claims supported by current evidence

- **ULB benchmark:** “On the recorded chronological ULB held-out test split, the XGBoost, Random Forest, Isolation Forest, and validation-selected weighted ensemble produced the metrics reported in their manifests.” Cite the four manifests under `ml/artifacts/`. State that the modeling CSV contained 283,726 rows after exact duplicate removal and 473 fraud labels.
- **PaySim data construction:** “The experiment modeled fraud labels for transactions received by C-prefixed `nameDest` entities, using transactions at strictly earlier hourly steps as history.” Cite `ml/reports/paysim-sequence-contract-v1.json` and `ml/reports/paysim-sequence-materialization-v1.json`.
- **PaySim result:** “On the single recorded synthetic PaySim chronological test split, the one-layer Transformer had higher PR-AUC, Average Precision, and ROC-AUC than the recorded temporal linear baseline.” Cite `ml/artifacts/paysim-temporal-v1/manifest.json`; give the exact metrics and thresholded trade-off from that file.
- **Reproduction/auditability:** “A later replay reproduced recorded aggregate metrics within the report's `1e-10` absolute and relative tolerance and exact confusion counts. A subsequent Phase 14 process regenerated row-keyed predictions for 817,649 test targets.” Cite the Phase 13B and Phase 14 reports/manifests. Explicitly say the regenerated rows were not original predictions retained during training.

## Required qualifications

- ULB and PaySim are separate datasets and experimental tracks; do not pool, rank, or compare their numerical scores directly.
- Interpret PaySim only as a synthetic mobile-money, C-recipient-history study. `nameDest` does not establish sender-personalized behavior, and the data contain no demonstrated device, geographic-location, or channel signals used by this experiment.
- Describe all listed scores as uncalibrated. The saved thresholds are decision cutoffs, not calibrated fraud probabilities.
- State that PaySim has a whole-step chronological split (train 1–281, validation 282–355, test 356–743) and that histories use only strictly smaller steps.
- Name PR-AUC, Average Precision, and ROC-AUC separately. `ml/src/layernet_ml/evaluation.py` implements PR-AUC and Average Precision as distinct quantities.
- Explain that thresholded precision/recall/F1 depend on the validation-selected threshold. On the ULB test partition there are 74 fraud targets; PaySim test has 4,250 fraud targets among 817,649 recipient targets.

## Claims not supported

Do not state that the current evidence proves:

- universal superiority of the Transformer or any other model;
- that sequence history alone caused the observed PaySim difference;
- fraud-detection performance on real customers, real banks, or Pakistani banking transactions;
- sender-personalized, device-aware, location-aware, or channel-aware detection;
- calibrated probabilities, production readiness, or application-side inference integration;
- improved investigator decisions, evidence-grounded explanation quality, or operational impact;
- generalization across institutions, populations, time periods, or fraud types.

## Unresolved research questions

1. Does the temporal result persist across multiple seeds and additional chronological windows?
2. What is the isolated contribution of history when current inputs, split, training budget, and model capacity are controlled in a history-ablation study?
3. Do rankings and decision thresholds transfer to a second permitted dataset with persistent identities and genuine timestamps?
4. How stable are the operating points under prevalence changes, calibration, and explicitly stated false-positive/false-negative costs?
5. Can the original training execution be tied to a complete immutable source snapshot? Current evidence pins artifact hashes and later replay/export provenance, but the original training manifest does not contain a full source tree fingerprint.

## Recommended next step

Before making a causal claim about temporal history, define and run one pre-registered PaySim ablation with the same split, labels, model family, training budget, and threshold rule, changing only whether prior-history tokens are available; record code/data hashes and uncertainty across fixed seeds. This recommendation does not authorize starting that experiment in this documentation phase.
