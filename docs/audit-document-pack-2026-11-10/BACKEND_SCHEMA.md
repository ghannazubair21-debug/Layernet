# LayerNet Backend Schema and Data Contracts

**Status:** describes current Next.js handlers, TypeScript domain objects, Python benchmark contract, and browser persistence. **No database is implemented.** A possible future schema is isolated at the end.

## 1. Backend inventory

| Endpoint | Methods | Current purpose | Persistence |
|---|---|---|---|
| /api/chat | GET, POST | Gemini configuration probe and streamed general investigation conversation | No LayerNet database; provider receives explicit active messages |
| /api/benchmark | GET, POST | Local artifact/virtualenv availability probe and ULB model replay on uploaded CSV | No persistent upload; Python process reads model files |

There is no transaction CRUD API, authentication API, case API, database driver, migration, ORM model, SQL/NoSQL database, or server-side session store in the audited repository.

## 2. Transaction domain schema

Source: lib/types.ts:17-41.

| Field | Type | Required | Validation / purpose | Relationship |
|---|---|---|---|---|
| transactionId | string | Yes | Stable transaction identifier for local upsert | Local repository finds existing row by this value |
| accountId | string | No | Optional account key for prior-account context | Not an authenticated user identity |
| timestamp | string | Yes | Transaction event time; parsed for features | Must parse to compute time context |
| amount | number | Yes | Transaction amount | Heuristic and feature input |
| type | string | Yes | Transaction category | Selected values affect heuristic |
| location | string | No | Supplied location text | Collected, not scored by rules |
| channel | string | No | Supplied channel | Selected values affect heuristic |
| deviceId | string | No | Optional device identifier | Context only |
| deviceInfo | object | No | Optional type, operatingSystem, browser | No validated device intelligence source |
| velocity | object | No | Optional upstream snapshot | asOf must be strictly earlier; counts/amount optional |
| riskScore | number | Result only | Heuristic priority score, not probability | Stored UI projection |
| risk | Low / Medium / High | Result only | Presentation band | Stored UI projection |
| status | Cleared / Flagged / Reviewed | Result only | Local workflow projection | Not a formal case state machine |

The local decoder in lib/transactionStorage.ts checks and normalizes stored values. This is not a server transport schema.

## 3. Feature and behavioral contracts

Sources: lib/types.ts:43-80, lib/featureEngineering.ts and lib/behavioralBaseline.ts.

TransactionFeatures has version layernet.transaction-features.v1:

- amount and amountLog1p;
- hourUtc, hourSin, hourCos, dayOfWeekUtc, isWeekendUtc;
- minutesSincePreviousTransaction;
- transactionsLastHour, transactionsLast24Hours, amountLast24Hours;
- locationChanged, channelChanged, deviceChanged;
- userBehavior with historicalTransactionCount, averageAmount, amountStandardDeviation, amountZScore.

BehavioralBaseline contains optional accountId, asOf, historical count/time range, amount statistics, and most-common location/channel/device ID. History is restricted to same-account rows strictly earlier than the current timestamp. These values are contextual output; the active rules function does not consume them.

AnalysisResult includes transactionId, riskScore, risk, decision, factors, recommendation, explanation, method, scoreMeaning, limitations, features and behavioralBaseline.

## 4. Browser history storage

Source: lib/transactionStorage.ts.

- Key: layernet-transactions.
- Value: JSON array of Transaction projections in browser localStorage.
- Save: upsert by transactionId; otherwise append.
- Clear: remove key.
- Update notification: layernet-transactions-updated browser custom event.
- Scope: browser profile and origin; no cross-device synchronization, server backup, tenant boundary, retention limit or audit trail.
- Decoder supports migration from an older { id, device } record shape.

Settings use layernet-settings, including theme preference. This is client preference storage, not backend configuration.

## 5. Chat API contract

Sources: app/api/chat/route.ts and lib/ai-config.ts.

### GET /api/chat

Response: JSON { configured: boolean }. The API key is not returned.

### POST /api/chat

Expected shape: JSON { messages: UIMessage[] }, with UIMessage imported from the AI SDK. Actual runtime validation checks only that messages is an array. No Zod parsing, message count cap, text-length cap, or explicit request-size cap was found.

Success is an AI SDK UI message stream, not a JSON object. Provider is Google Gemini 2.5 Flash. The system prompt requires uncertainty and evidence discipline, and says no browser history or transaction context is attached.

| Condition | HTTP / response |
|---|---|
| GOOGLE_GENERATIVE_AI_API_KEY missing | 503 JSON { error } |
| Invalid JSON fallback or missing/non-array messages | 400 JSON { error } |
| Synchronous failure | 500 generic JSON { error } |
| Provider/stream failure | Generic stream error text |

The route logs caught exceptions. No provider-code mapping or request correlation ID exists.

## 6. ULB benchmark API contract

Sources: app/api/benchmark/route.ts, lib/benchmark.ts and ml/src/layernet_ml/benchmark_replay.py.

### GET /api/benchmark

Returns JSON availability metadata. A small Python probe checks local XGBoost and Random Forest manifest files. The response includes ok/available, model flags or a reason. It does not test predictive quality.

### POST /api/benchmark

Request: JSON object { csv: string }. The server parses full JSON, verifies a non-empty string, then applies a 2,000,000-byte UTF-8 CSV limit and a 120-second process timeout.

Python input:

- required columns: Time, Amount, V1–V28;
- optional Class must be binary 0/1 and is used only for evaluation;
- maximum 5,000 rows;
- values numeric and finite; Time and Amount non-negative;
- no missing required values or duplicate column names.

No schema is synthesized and no application transaction values are mapped to PCA features.

Successful response:

| Field | Meaning |
|---|---|
| ok | true |
| benchmark, note | Name and research/uncalibrated scope |
| row_count, labels_present | Accepted row count and Class presence |
| models[] | Model family/version, threshold, score meaning, recorded test metrics metadata |
| rows[] | Input index, Time, Amount, nullable class, XGBoost and RF score/prediction |
| comparison | Agreement count/rate, positive counts and mean scores |
| uploaded_row_metrics | Per-model metrics if labels exist; otherwise null |
| metrics_note | Scope/availability note |

Failure shape: { ok: false, error_kind: input | model | internal | timeout, error: string }. Python exit codes distinguish invalid input (2), model availability failure (3), and internal failure (4); the Node handler maps them to HTTP responses. The UI limits detailed display to 100 rows. Uploads are not persisted.

## 7. Research model input/output contracts

Sources: lib/types.ts:3-7,83-120; Python ml/src/layernet_ml/contracts.py, evaluation.py and pipeline.py.

The TypeScript app declares ModelFamily, ModelInferenceInput, ModelPrediction, TrainedFraudModel, EnsembleScore and EnsembleScorer. These are contracts only; TransactionService does not register or call a trained adapter.

Python experiments use separate dataset/schema contracts, score orientation (higher means more suspicious/anomalous), preprocessing and evaluation. ULB and PaySim schemas are not interchangeable with app transaction fields. Scores are uncalibrated unless valid calibration exists. Evaluators report PR-AUC separately from Average Precision, ROC-AUC, thresholded precision/recall/F1 and confusion counts.

## 8. Analytics structures

There is no API-level analytics aggregate. app/analytics/page.tsx, app/dashboard/page.tsx and lib/transactionMetrics.ts derive counts, risk summaries, trends and type/channel breakdowns from local Transaction[] records. These are heuristic history summaries, not labeled fraud outcomes.

## 9. Database inventory, retention and privacy

**Database tables, columns, relationships, indexes and migrations: none implemented.**

Current retention is user/browser-managed localStorage until cleared or site data is removed. There is no server retention schedule, backup, erasure workflow or data-export API. Chat content exists in the active UI/provider request path; no LayerNet server persistence was found.

## 10. Proposed future schema — PROPOSED, NOT IMPLEMENTED

This is a design option requiring approval, privacy review and identity decisions; it is not an existing contract.

| Proposed entity | Candidate fields | Purpose / constraints |
|---|---|---|
| workspace | id, display_name, created_at | Tenant boundary; authorization required |
| workspace_member | workspace_id, user_id, role, created_at | Membership/grants; unique workspace/user |
| transaction_record | id, workspace_id, source_transaction_id, event_time, amount, type, channel, location_ref, device_ref, source_payload_hash, created_at | Immutable source facts with provenance |
| risk_assessment | id, transaction_id, method, model_version, feature_schema_version, score, score_meaning, decision, threshold, evaluated_at, input_hash | Append-only assessment linked to transaction |
| investigation_case | id, workspace_id, status, owner_user_id, opened_at, closed_at | Human workflow; no inferred fraud label |
| case_event | id, case_id, actor_user_id, event_type, payload, created_at | Append-only action/decision history |

Minimize raw account/device identifiers. Define encryption, retention, deletion and pseudonymization before adopting a schema. This proposal is not a migration plan.

## Evidence references

lib/types.ts; lib/transactionStorage.ts; lib/transactionService.ts; lib/featureEngineering.ts; lib/behavioralBaseline.ts; lib/fraudAnalysis.ts; lib/benchmark.ts; app/api/chat/route.ts; app/api/benchmark/route.ts; ml/src/layernet_ml/benchmark_replay.py; lib/transactionMetrics.ts.
