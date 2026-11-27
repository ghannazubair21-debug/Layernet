# P2 — ML and Transformer Integration: Inventory and Plan v1

**Prepared:** 2026-11-27. **Scope:** Handover Phase 5 (P2 ML/Transformer), step 5.1 inventory, plus the plan that follows from it.
No model was trained, no artifact, dataset, manifest or research report was modified, and no package was installed for this document.

## 1. What exists (verified this session)

| Item | Status | How verified |
|---|---|---|
| ULB XGBoost, Random Forest, Isolation Forest, ensemble artifacts (`ml/artifacts/{xgboost,random-forest,isolation-forest,ensemble,ensemble-selectors}-v1`) | Present and readable | Directory listing; manifests present |
| ULB XGBoost + Random Forest served by `/benchmark` | Working | Real 20-row replay earlier in this session; 100% agreement on 5 fraud rows |
| Phase 12 PaySim models (`ml/artifacts/paysim-temporal-v1`: current-only SGD, temporal SGD, Transformer) | **Present but unreadable** | `ls` and `icacls` both return *Access is denied*. Sibling folders grant full control to the user and also carry a `CodexSandboxUsers` ACE, so this folder was most likely created with a restrictive ACL inside the Codex sandbox |
| Phase 16 history ablation (`paysim-history-ablation-v1*`) | Present and readable; status **PARTIAL** preserved | Report and manifests read |
| Phase 17 | **BLOCKED** preserved | No qualified dataset (handover §7.5) |
| Datasets: ULB CSV, PaySim v2 archive, CreditTransAct parquet | Present | Directory listing (hashes not recomputed in this pass) |
| ML environment `ml/.venv` | Python 3.12.14, torch 2.6.0+cpu, scikit-learn 1.9.1, xgboost 3.4.1, numpy 2.5.3, pandas 3.0.6 | Imported |
| ML tests | **96 passed** | `PYTHONPATH="ml/src;ml/tests" ml/.venv/Scripts/python.exe -m unittest discover -s ml/tests` from repo root |

**Environment risk:** the venv's base interpreter resolves to `C:\Users\ghann\.cache\codex-runtimes\...`, a tool runtime cache rather than a standalone Python install. If that cache is cleared, `ml/.venv` (and `/benchmark`) stops working. No lockfile pins the full dependency set (`requirements*.txt` are short).

**Test-command note:** the suite must be run from the repository root (one test resolves `ml/reports/...` relative to the working directory). Running from `ml/` gives one `FileNotFoundError`, not a real failure.

## 2. The Transformer that exists

From `ml/src/layernet_ml/paysim_temporal.py` and `ml/reports/research-findings-v1.md`:

- **Purpose / target:** current PaySim transaction `isFraud` for C-prefixed `nameDest` **recipients** (not sender/customer personalization).
- **Input:** 18 tokens × 7 channels — up to 17 strictly-earlier recipient step buckets (left-padded, masked) plus the current-target token. Channels: five `log1p` PaySim type counts, mean `log1p(amount)/20`, `step_gap/743`. No labels, balances, `isFlaggedFraud`, identifiers, same-step or future events.
- **Architecture:** 32-wide input projection, learned position embedding, 1 `TransformerEncoderLayer` (2 heads, 64-wide FFN, dropout 0.1), current-token pooling, linear 32→1 logit. **9,409 parameters** (counted from the class this session).
- **Training:** `BCEWithLogitsLoss` with train-only positive-class weight, AdamW lr 0.001, batch 2,048, 2 epochs, CPU, **single seed (42)**.
- **Artifact format:** `temporal_transformer.pt` (PyTorch state), threshold selected on validation F1.

It is genuinely a (small) Transformer encoder trained on a causal sequence representation.

## 3. The PR-AUC 0.1476 figure

`0.1476` is the Phase 12 Transformer's **test** PR-AUC (`0.14759999719607347`), recorded in the Phase 12 manifest and reproduced within 1e-10 by the Phase 13B replay report. Context that must accompany it:

| Split | Fraud prevalence | Current-only AP (lift) | Temporal SGD AP (lift) | Transformer AP (lift) |
|---|---:|---:|---:|---:|
| Validation | 0.0895% (770 / 860,036) | 0.0031 (3.5×) | 0.0121 (13.5×) | 0.0150 (16.8×) |
| Test | 0.5198% (4,250 / 817,649) | 0.0386 (7.4×) | 0.0804 (15.5×) | 0.1458 (28.0×) |

*Lift = Average Precision ÷ split prevalence (the AP of a random ranking). Computed this session from the recorded metrics and counts.*

- Test prevalence is **5.8× validation prevalence**, so most of the validation→test rise in PR-AUC/AP is prevalence, not model improvement. PR-AUC values from different splits must not be compared directly.
- Relative to prevalence, the Transformer ranks best on both splits in this run, but it is **one seed on one synthetic split**. There is no seed variability estimate for the Transformer (Phase 16's three seeds were SGD models only).
- It is not evidence of real-bank performance and it is not integrated into the product.
- This could not be re-verified against the artifact file this session because `paysim-temporal-v1` is unreadable (blocker B1).

## 4. Why no model can be integrated into `/analysis` today

Handover §5.7 requires the model's data contract to be satisfiable before integration. It is not, for any existing model:

| Model | Needs | The app captures | Verdict |
|---|---|---|---|
| ULB XGBoost / RF / IF / ensemble | `V1`–`V28` PCA components (from undisclosed original features), elapsed `Time`, `Amount` | amount, currency, type (Purchase/Transfer/…), location, channel, timestamp, optional accountId/device | **Not satisfiable.** The PCA inputs cannot be derived from analyst-entered fields. |
| PaySim temporal Transformer / SGD | PaySim transaction types (CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER), PaySim amount scale, **recipient** history by hourly step | Different type vocabulary, real currencies, optional **sender** `accountId`, no recipient identity, no persistent history store (persistence is deferred) | **Not satisfiable.** Feeding app records would be out-of-distribution and the scores meaningless. |

Mapping app fields onto these inputs (e.g. treating "Transfer" as PaySim `TRANSFER`, or PKR amounts as PaySim units) would produce numbers that look like model output but have no validated meaning. That would violate "Do not claim a model is integrated" and the scoring-integrity rules, so it will not be done.

`/benchmark` remains the honest surface for the ULB models: it scores genuine ULB-shaped rows.

## 5. Plan

### Can proceed now (no new data needed)

| # | Work | Output | Needs approval? |
|---|---|---|---|
| P2-1 | **Transformer seed replication.** Preregister, then train the existing Phase 12 Transformer configuration with seeds 42, 123, 2026 on the same PaySim split, plus the matched temporal-SGD and current-only arms already covered by Phase 16 seeds. Thresholds on validation only; test scored once after freeze. | New run dir `ml/artifacts/paysim-transformer-seeds-v1/`, new report `ml/reports/paysim-transformer-seeds-v1.md`, preregistration `ml/reports/paysim-transformer-seeds-prereg-v1.md`. Nothing existing is overwritten. (Transformer arm only; the SGD arms for the same seeds already exist from Phase 16 and are used as the comparator.) | **Yes** — model training, CPU time (est. tens of minutes to a few hours; measured during the run). |
| P2-2 | **Prevalence-aware reporting.** Add lift-over-prevalence and per-split prevalence to new reports (as in §3) so cross-split numbers are not misread. | Included in P2-1 report; this document already records the Phase 12 values. | No |
| P2-3 | **Model inference contract for the product** (design only): versioned model + preprocessing ids, input validation, rules-vs-ML separation, fallback on failure, shadow-mode recording, and what product data must be captured for a temporal model (persistent entity id, history store). | `docs/ml/MODEL_SERVING_CONTRACT_v1.md` | No (design doc; no integration) |
| P2-4 | **Environment pinning.** Record the exact installed package set (`pip freeze` → new file) and document the Codex-runtime base-interpreter dependency. No reinstall. | `ml/requirements-lock-observed.txt` | No |

### Blocked — needs the user

| # | Blocker | What is needed |
|---|---|---|
| B1 | `ml/artifacts/paysim-temporal-v1` is unreadable (Access denied, including to `icacls`). Phase 12 hashes cannot be re-verified and P2-1 cannot reuse its manifest for comparison. | The owner restores read access, e.g. in an elevated PowerShell: `takeown /f "<repo>\ml\artifacts\paysim-temporal-v1" /r /d y` then `icacls "<repo>\ml\artifacts\paysim-temporal-v1" /grant "%USERNAME%:(OI)(CI)R" /t`. Claude will not change ACLs itself (security setting). |
| B2 | No qualified dataset for a product-relevant model (real timestamps, persistent account identity, labels, unexposed chronological holdout, documented permission). | A dataset decision. IEEE-CIS has card/device context and a validator already exists (`validate-ieee-cis`), but requires accepting the Kaggle competition terms for the intended use. |
| B3 | Product integration of any temporal model needs persistent per-entity history. | Persistence (deferred by instruction). |

### Explicitly not planned

- No mapping of app transactions onto ULB/PaySim features.
- No change to Phase 16 (PARTIAL) or Phase 17 (BLOCKED) status or findings.
- No merging of PaySim synthetic results with real-world claims.

## 6. Recommended next step

Run **P2-1** (Transformer seed replication) after approval, ideally after **B1** is cleared so the original Phase 12 artifact can be hash-checked first. P2-3 and P2-4 can proceed in parallel without approval.
