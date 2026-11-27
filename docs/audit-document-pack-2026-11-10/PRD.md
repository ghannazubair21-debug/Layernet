# LayerNet Product Requirements Document

**Audit baseline:** repository commit ca7d595cfd19fe307f7c5fc5e479c101931748e6 on branch layernet-consolidation; reviewed 2026-11-25.
**Product status:** research prototype. Each requirement distinguishes current implementation from future intent.

## 1. Product overview

LayerNet is a browser-based financial transaction analysis and investigation prototype. It lets an analyst enter a transaction, receive a transparent rules-based priority score with listed contributing factors, review prior locally saved analyses, and inspect heuristic summaries. A separate benchmark screen can replay two saved ULB benchmark models against a small uploaded ULB-shaped CSV. Optional Gemini chat supports general investigation discussion when the server has a configured key.

LayerNet is not a bank transaction gateway, production fraud decision service, durable case-management system, or application-connected trained-model platform.

## 2. Problem statement and product vision

Fraud analysts need a coherent place to inspect suspicious transactions, understand the evidence behind a risk signal, compare relevant context, and record investigation outcomes. LayerNet currently demonstrates the front-end investigation flow and research boundaries, but its score is a heuristic, its history is browser-local, and it has no shared identity or case backend.

**Vision:** provide a research-grounded investigation workspace where an analyst can detect, analyze, explain, investigate, and document transaction risk. Future features must be gated by verified data, validated models, evidence provenance, access control, and durable storage.

## 3. Objectives

### Current objectives

- Make heuristic scoring understandable and explicitly label it as an uncalibrated priority score.
- Capture a consistent transaction record and show its analysis result.
- Preserve and browse local analysis history.
- Provide heuristic summaries without presenting them as ground-truth fraud statistics.
- Keep model research separate from normal application scoring.

### Future objectives — PLANNED

- Replace local-only persistence with an authorized, durable backend and explicit user/tenant access controls.
- Introduce validated trained-model inference only after reproducible model artifacts and compatible input schemas are approved.
- Support evidence-linked investigations, analyst decisions, audit history, and report export.
- Add behavioral and temporal product claims only when the connected dataset and model support those claims.

## 4. Target users and personas

| Persona | Need | Current support |
|---|---|---|
| Fraud analyst | Enter and review transactions, understand score contributions, inspect prior results | PARTIALLY IMPLEMENTED through analysis, dashboard, and history |
| Researcher / FYP evaluator | Inspect benchmark methodology and distinguish measured results from heuristic UI values | PARTIALLY IMPLEMENTED through ML reports and isolated ULB benchmark |
| Workspace administrator | Manage users, permissions, retention, model versions, and audit policy | NOT IMPLEMENTED; no authentication or administration backend exists |

## 5. Primary use cases

1. **Analyze a transaction.** Enter facts, submit, receive a rules-baseline result and evidence contribution list, then optionally save it to browser history.
2. **Review prior analyses.** Filter local history and inspect one transaction's recorded fields and heuristic result.
3. **Understand activity summaries.** View counts and trends calculated from saved heuristic records; these are not fraud-label metrics.
4. **Replay a research benchmark.** Upload a small CSV conforming to the ULB feature contract and receive server-side XGBoost and Random Forest outputs.
5. **Ask a general investigation question.** Send user-written chat messages to Gemini; the application does not attach saved transactions or score evidence automatically.
6. **Check local readiness and preferences.** Inspect browser storage, benchmark artifact availability, AI-key configuration, and choose a persisted theme.

## 6. User workflow

~~~mermaid
flowchart TD
  A[Open LayerNet] --> B[Dashboard]
  B --> C[Analysis form]
  C --> D[Rules baseline and evidence factors]
  D --> E{Save analysis?}
  E -->|Yes| F[Browser localStorage history]
  E -->|No| G[Continue without persistence]
  F --> H[History and heuristic analytics]
  B --> I[Benchmark page]
  I --> J[Upload genuine ULB-shaped CSV]
  J --> K[Server-side XGBoost and Random Forest replay]
  B --> L[General Gemini chat]
~~~

This is the current flow only. There is no deployed transaction feed, database-backed case workflow, or live application ML inference path.

## 7. Functional requirements

| ID | Requirement | Status | Acceptance criteria |
|---|---|---|---|
| FR-01 | Capture transaction ID, timestamp, amount, type, and optional account, location, channel, device, and upstream velocity fields | IMPLEMENTED | Form validation prevents invalid required values; optional facts remain optional |
| FR-02 | Calculate deterministic, explainable rules-baseline score | IMPLEMENTED | Output identifies LayerNet rules baseline v1, lists contributions, clamps to 0–100, and says it is not a probability |
| FR-03 | Calculate historical behavioral statistics from strictly earlier same-account records | IMPLEMENTED | Missing account ID/no prior row produces empty or nullable baseline; same-time/future rows excluded |
| FR-04 | Use behavioral statistics to alter risk score | NOT IMPLEMENTED | Any future use needs a feature contract and validation |
| FR-05 | Save, replace by transaction ID, list, and clear analysis records | IMPLEMENTED, browser-local | Records persist under layernet-transactions in current browser origin |
| FR-06 | Show dashboard summaries of recorded analyses | IMPLEMENTED | Summaries are explicitly heuristic and not fraud rates |
| FR-07 | Show analytics grouped by saved type/channel and recorded risk | IMPLEMENTED | Analytics are local-history summaries, not evaluation metrics |
| FR-08 | Search/filter history and inspect a record | IMPLEMENTED | Detail view supports close/Escape and focus handling in source |
| FR-09 | Persist Light, Dark, or System theme | IMPLEMENTED | Preference uses layernet-settings and is applied before first paint |
| FR-10 | Report local storage, AI configuration, and benchmark availability | IMPLEMENTED | Health probes expose configuration/availability only, not secrets |
| FR-11 | Replay saved ULB XGBoost and Random Forest artifacts | IMPLEMENTED, isolated benchmark | Genuine ULB columns required; optional Class is evaluation-only; scores are uncalibrated |
| FR-12 | Connect research models to normal transaction analysis | NOT IMPLEMENTED | No app model is registered; never map app fields to ULB PCA columns |
| FR-13 | Offer optional general investigation chat | IMPLEMENTED | Explicit chat messages go through /api/chat; local history and scores are not attached |
| FR-14 | Create durable cases, assign analysts, record decisions, or export reports | NOT IMPLEMENTED | Needs product/API, identity, storage, authorization, and audit design |

## 8. Fraud detection requirements

### Current behavior — IMPLEMENTED

The active function is **lib/fraudAnalysis.ts**. Its base is min(50, floor(log10(max(1, amount)) × 10)); it adds points for Refund (+10), Withdrawal (+15), Mobile (+5), Web (+8), and UTC hours 00–05 (+12), subtracts 5 for POS, then clamps to 0–100. Risk bands are Low below 40, Medium from 40, High from 80. Decisions are Clear below 60, Review from 60, and Block from 85. Location is collected but not used by this rule. This is a heuristic priority score, not a fraud probability, calibrated confidence, or trained-model prediction.

### Future requirements — PLANNED

- Identify model/rule version, input schema, score meaning, timestamp, and evidence provenance with each result.
- Do not expose trained-model scores as probabilities without calibration evidence.
- Select thresholds on validation data and freeze before final test measurement.
- Keep a human review decision separate from model output.
- Explanations must refer only to recorded input evidence; generated text must not fabricate device, location, or historical facts.
- Define monitoring and rollback before operational use.

## 9. Gemini requirements

**Current:** @ai-sdk/google calls gemini-2.5-flash from the server route. The key is GOOGLE_GENERATIVE_AI_API_KEY; GET /api/chat reveals only a configured Boolean. The system prompt says the assistant cannot inspect app state or claim why a transaction was scored. The live route returned a streamed response during the audit.

**Before broader use — PLANNED:** validate message schema, payload size and count; add abuse/cost controls; clarify privacy and retention; make provider outages and quota errors actionable; preserve server-only secrets; keep AI content advisory and separate from score generation.

## 10. Dashboard, analytics, history, and settings

- **Dashboard — IMPLEMENTED:** summaries and charts over locally stored heuristic analyses, with time-range controls.
- **Analytics — IMPLEMENTED:** aggregate transaction count, score/risk distribution, and breakdowns over saved records. No ground-truth labels exist.
- **History — IMPLEMENTED:** local list/filter, detail dialog, and clear-history action.
- **Settings — IMPLEMENTED:** theme preference and local-history management; Gemini configuration is reported, not edited in-browser.
- **Health — IMPLEMENTED:** browser storage probe, API-key configured flag, and ULB artifact availability probe. It does not certify accuracy or external uptime.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Research integrity | Never label heuristics as ML, mock data as real, or uncalibrated score as probability |
| Privacy | Minimize transaction data; document provider transmission and browser-local retention |
| Security | Keep secrets out of client bundles; validate inputs; protect costly routes; add authorization before shared/public use |
| Accessibility | Semantic labels, visible focus, keyboard-operable dialogs, reduced-motion support, contrast, and announced status |
| Reliability | Deterministic scoring, explicit errors, and no silent model fallback |
| Performance | Bound record history and upload sizes; avoid unbounded localStorage parsing and repeated model startup in public service |
| Compatibility | Current application is Next.js App Router; audited CI uses Node 22 |
| Observability | Add privacy-safe errors/model-version telemetry before deployment; do not log secrets or raw payment data |

## 12. Acceptance criteria

### Current prototype acceptance

- Valid analysis returns a reproducible heuristic score, method label, factors, and limitations.
- Invalid inputs receive accessible feedback.
- Saving and reloading in the same browser preserves a record.
- Dashboard/history/analytics label data as local heuristic analysis rather than fraud truth.
- Gemini works only with server configuration and receives no transaction context automatically.
- Benchmark accepts valid ULB input within limits and labels outputs uncalibrated.

### Target product acceptance — PLANNED

- Authenticated tenant-scoped analyst can access only authorized transactions and cases.
- Verified backend stores immutable transaction evidence, model/version, decision, and investigation actions.
- Model output can be independently recomputed from immutable input snapshot.
- Server validation, limits, audit records, retention/deletion, backup and recovery are tested.
- Accessibility and responsive behavior are checked by keyboard, assistive technology and browser viewport tests.

## 13. Scope and non-goals

**Current scope:** local research prototype, heuristic analysis, browser history, summaries, settings, general Gemini conversation, and separate limited ULB replay.

**Not current scope:** production authorization, banking connectivity, automatic payment blocking, real-time monitoring, shared backend, investigator case queues, calibrated live ML, graph fraud, or device/geolocation evidence.

## 14. Known limitations and open decisions

1. What analyst roles, tenant boundary, identity provider, and permission model are required?
2. What data-retention, deletion, audit, and legal requirements apply?
3. Which transaction source and stable identifiers are authorized?
4. Which qualified dataset can support an unexposed chronological temporal replication? Phase 17 remains BLOCKED.
5. What evidence is required before promoting a model to the UI?
6. How should analyst feedback be captured without contaminating labels or model selection?
7. Which operating threshold reflects a defined review capacity and cost function?
8. How should provider privacy, quotas, and outage handling be explained?

CreditTransAct qualification did not establish a true timestamp for causal event history; its Parquet schema was not independently re-read in this audit because a reader was unavailable. PaySim is synthetic C-recipient data. Existing reports do not establish banking or Pakistani banking performance.

## 15. Future opportunities

After identity, dataset, privacy and evaluation gates: durable transaction/case APIs; evidence-linked analyst notes; event audit trail; report export; a qualified data-backed temporal study; approved inference service; and model monitoring. These are PLANNED, not current features.

## Evidence references

- Routes: app/page.tsx, app/dashboard/page.tsx, app/analysis/page.tsx, app/analytics/page.tsx, app/health/page.tsx, app/history/page.tsx, app/settings/page.tsx, app/benchmark/page.tsx.
- Domain/scoring/storage: lib/types.ts:17-120, lib/fraudAnalysis.ts:3-67, lib/featureEngineering.ts:24-85, lib/behavioralBaseline.ts:8-75, lib/transactionStorage.ts:3-4,81-114, lib/transactionService.ts:8-33.
- Server/API: app/api/chat/route.ts:16-67, app/api/benchmark/route.ts:13-16,80-160, lib/ai-config.ts:1-25, lib/benchmark.ts:1-91.
- Research: README.md:3-19, DATASET_STRATEGY.md:42-104, ml/reports/paysim-history-ablation-v1.md, ml/reports/paysim-temporal-reproduction-v1.md.
- Governance discrepancy: root AGENTS.md describes Vite/no application source; package scripts, app/, and next.config.ts show the actual Next.js application. Planning documents are not runtime evidence.
