# Model Serving Contract v1 (P2-3)

**Status:** DESIGN ONLY. No model is integrated, no inference endpoint exists, and nothing in the running app changes.
**Date:** 2026-11-28. **Builds on:** `docs/architecture/DATA_CONTRACT_v1.md` (`RiskAssessment` in `lib/domain/contracts.ts`) and `docs/ml/P2_ML_INTEGRATION_PLAN_v1.md`.

This document fixes the conditions a trained model must meet before it may score a product transaction, and how it is introduced. Its purpose is to prevent the failure mode P2 identified: a model receiving inputs it was never trained on and producing numbers that look like predictions but mean nothing.

## 1. Principles

1. **The rules baseline stays the primary decision** until a model is promoted by the owner under §6.
2. **No score without a satisfied contract.** If any required input is missing, out of vocabulary, or out of the trained range, the model does not score. It is never imputed, mapped or guessed unless that exact step was part of the model's recorded training preprocessing.
3. **A model enters in shadow mode.** Its assessments are recorded (`mode: "shadow"`) but never drive or appear as the displayed decision.
4. **Every model score is traceable**: model version, artifact SHA-256, feature schema version, and a hash of the exact input payload (already required by `RiskAssessmentSchema`).
5. **Uncalibrated scores are never shown as probabilities** (`scoreSemantics` enforces this; a probability requires a calibration study reference).

## 2. Model package (what must exist before serving)

A servable model is a directory with a manifest. Fields marked → map onto existing `RiskAssessment` fields.

| Manifest field | Meaning | Maps to |
|---|---|---|
| `family`, `model_version` | e.g. `paysim-temporal-transformer`, `seeds-v1-seed42` | → `assessor.family`, `assessor.modelVersion` |
| `artifact_sha256` | Hash of the weights file; checked at load and recorded per score | → `assessor.artifactSha256` |
| `feature_schema_version` | Exact input contract (§3) the model was trained on | → `featureSchemaVersion` |
| `preprocessing_id` + code hash | The deterministic transform from contract input to tensor | (in manifest) |
| `score_scale`, `score_semantics`, `calibration_ref` | e.g. logit on (−∞, ∞), `uncalibrated-model-score`, null | → `scoreScale`, `scoreSemantics`, `calibrationRef` |
| `threshold`, `threshold_source` | Value and how it was chosen (split, metric, frozen when) | → `threshold` |
| `training_data_ref` | Dataset id + hash, split definition, population (e.g. "synthetic PaySim C-recipients") | (in manifest) |
| `evaluation_report` | Path + hash of the report backing any quality claim | (in manifest) |
| `intended_population`, `prohibited_uses` | Where the model may and may not be used | (in manifest) |
| `runtime` | Interpreter and package lock (e.g. `ml/requirements-lock-observed.txt`) | (in manifest) |

A model without a complete manifest, or whose artifact hash does not match, fails closed: it is not loaded.

## 3. Input contract

Each model declares a versioned input schema, validated server-side before scoring:

- **Fields and types**, with allowed vocabularies (e.g. transaction type enum) and numeric ranges seen in training.
- **Units**: currency and amount scale. A model trained on one currency or on synthetic units (PaySim) does not score other currencies. No FX conversion is performed (no authorised rate source; see `CURRENCY_HANDLING_v1.md`).
- **Entity and history requirements** for temporal models: which entity (sender, recipient, card, device), how history is keyed, the history window, and the causal rule (only strictly earlier events, no same-step or future events, no labels).
- **Rejection reasons** are enumerated (missing field, out-of-vocabulary, out-of-range, insufficient history, unsupported currency) and recorded as a skipped assessment, not as a low score.

Today no existing model's contract can be satisfied by app records (P2 plan §4): the ULB models need PCA features that cannot be derived from analyst input, and the PaySim models need PaySim types, units and recipient history the app does not capture.

## 4. Product data a temporal model would need

Required before any history-based model (such as the PaySim Transformer design) could be trained or served on product data:

1. A **persistent, pseudonymised entity id** (D4: keyed HMAC at ingest) for the entity the model scores, and for counterparties if the model uses them.
2. A **server-side history store** of transaction facts with event time (blocked on persistence, deferred by instruction).
3. **Labels from case dispositions only** (`confirmed_fraud` / `not_fraud`), never from scores or AI output, with label time recorded so training can exclude labels not yet known at scoring time.
4. A **chronological holdout** that is not used for tuning.

## 5. Serving path and failure behaviour

Inference runs server-side only, behind the existing request guard and per-request limits. Implementation options (to decide at integration time, not now): a Python function bundling the model and the pinned runtime, or an exported format (e.g. ONNX) evaluated in the Node runtime. Either must reproduce the recorded validation metrics on the stored validation set before it is allowed to serve.

| Situation | Behaviour |
|---|---|
| Contract not satisfied | No model score; record a skipped assessment with its reason; the rules decision stands |
| Model error or timeout (bounded, e.g. 1–2 s) | Same as above; never retried into a different model or version |
| Artifact hash mismatch at load | Model is not loaded; the server reports it unavailable |
| Model succeeds (shadow) | Record the assessment (`mode: "shadow"`); the UI shows only the rules decision |
| Model succeeds (after promotion) | Show the model decision labelled by assessor and version, with the rules result also recorded |

There is no silent fallback that presents a rules score as a model score, or the reverse.

## 6. Shadow evaluation and promotion

1. Shadow assessments accumulate alongside rules assessments.
2. Promotion criteria are **preregistered before shadow data is examined**: minimum number of dispositioned cases, primary metric (e.g. AP on dispositioned cases), comparison against the rules baseline with an interval, and the alert-volume impact at the frozen threshold.
3. Evaluation uses case dispositions as labels, which are biased toward transactions that were reviewed; the report must state this.
4. Promotion is an owner decision recorded as an audit event. Demotion is always available and immediate.

## 7. Monitoring (once anything serves)

Per model version: request count, contract-rejection rate by reason, error/timeout rate, latency, score distribution and decision rate over time (drift), and input-field distribution against training ranges. No raw identifiers or payloads in logs or metrics (DATA_CONTRACT invariant 11).

## 8. Open decisions for the owner

| # | Decision | Notes |
|---|---|---|
| M1 | Which entity a product model scores (sender account, recipient, card, device) | Determines what must be captured in §4 |
| M2 | Dataset for a product-relevant model | Blocker B2 in the P2 plan (no qualified dataset yet) |
| M3 | Serving option (Python function vs exported model in Node) | Decide at integration time |
| M4 | Promotion criteria values | Must be fixed before shadow data is examined |

## 9. Explicitly not done

No model, endpoint, adapter, schema change or UI change was added for this document. The PaySim Transformer and ULB models remain research artifacts; their results (e.g. `ml/reports/paysim-transformer-seeds-v1.md`) are not product performance claims.
