# LayerNet Application Flow

**Evidence baseline:** local Next.js application at commit ca7d595cfd19fe307f7c5fc5e479c101931748e6; audit date 2026-11-25. Statuses describe verified code paths, not plans.

## 1. Entry and navigation

**IMPLEMENTED.** The root page is the landing route (app/page.tsx). Shared navigation and shell live in components/AppShell.tsx. App Router pages provide Dashboard, Analysis, Analytics, Health, History, Settings, Benchmark and utility screens. Production smoke checks returned HTTP 200 for ten pages: /, /dashboard, /analysis, /analytics, /health, /history, /settings, /benchmark, /micro-interactions, and /playground. HTTP 200 confirms rendering, not full interaction or mobile correctness.

~~~mermaid
flowchart TD
  Entry["/"] --> Shell[Shared AppShell navigation]
  Shell --> Dashboard["/dashboard"]
  Shell --> Analysis["/analysis"]
  Shell --> Analytics["/analytics"]
  Shell --> Health["/health"]
  Shell --> History["/history"]
  Shell --> Settings["/settings"]
  Shell --> Benchmark["/benchmark"]
  Shell --> Utilities["/micro-interactions and /playground"]
~~~

## 2. Transaction analysis and score flow

**IMPLEMENTED** for heuristic analysis. The controlled analysis form validates required values, builds a TransactionRecord, and calls the transaction service. The service reads browser history, computes engineered features and a same-account baseline, and calls the rules baseline. It returns AnalysisResult; the page presents score, risk/decision, listed factors and recommendation. Saving is a separate user action.

~~~mermaid
sequenceDiagram
  actor Analyst
  participant Page as Analysis page
  participant Service as TransactionService
  participant Repo as LocalStorage repository
  participant Features as Feature and baseline utilities
  participant Rule as Rules baseline
  Analyst->>Page: Enter and submit transaction
  Page->>Service: analyze(TransactionRecord)
  Service->>Repo: list prior analyses
  Repo-->>Service: browser-local records
  Service->>Features: engineer features and baseline
  Service->>Rule: analyze transaction facts
  Rule-->>Service: heuristic score and factors
  Service-->>Page: AnalysisResult
  Page-->>Analyst: show score, factors, limitations
  Analyst->>Page: Optional save
  Page->>Service: save(Transaction projection)
  Service->>Repo: upsert by transactionId
~~~

The behavioral baseline uses only same-account records strictly earlier than the target timestamp (lib/behavioralBaseline.ts). Location/channel/device summary features exist but do not currently change the risk score. The score is not a fraud probability.

## 3. Model scoring flow

### Normal transaction analysis — IMPLEMENTED heuristic; NOT IMPLEMENTED trained inference

There is no flow from the normal analysis service to XGBoost, Random Forest, Isolation Forest, ensemble, or temporal artifacts. TrainedFraudModel and EnsembleScorer in lib/types.ts are contracts only. The separate ULB replay is not production transaction scoring.

### ULB benchmark replay — IMPLEMENTED separate research utility

The researcher uploads a small CSV in the Benchmark page. The browser reads file text and posts it to /api/benchmark. The server checks the request, enforces a 2 MB CSV string limit, and starts the Python replay process. Python validates ULB columns, loads saved XGBoost and Random Forest models, and returns row scores and metrics. Class is optional and used only for uploaded-row evaluation; without it, metrics are unavailable. The page shows no more than 100 detailed result rows. The input contract requires actual ULB columns and does not map application transactions to anonymized PCA features.

~~~mermaid
sequenceDiagram
  actor Researcher
  participant UI as Benchmark page
  participant API as POST /api/benchmark
  participant Python as benchmark_replay process
  participant Models as Saved ULB XGBoost and RF
  Researcher->>UI: Select ULB-shaped CSV
  UI->>API: JSON containing csv
  API->>API: Parse, validate string and size
  API->>Python: Start bounded process and send CSV
  Python->>Python: Validate schema and optional labels
  Python->>Models: Load and check saved artifacts
  Models-->>Python: Scores
  Python-->>API: JSON outputs and metrics
  API-->>UI: Success or structured error
  UI-->>Researcher: Uncalibrated research results
~~~

## 4. Gemini conversation flow

**IMPLEMENTED** as general chat only. User messages are posted to /api/chat. The server checks key presence, converts UI messages, invokes Gemini 2.5 Flash with a fixed system prompt, and streams its response. The route does not read localStorage and does not attach a transaction, score, factor or history record.

~~~mermaid
sequenceDiagram
  actor Analyst
  participant Chat as Chat UI
  participant Route as POST /api/chat
  participant Google as Gemini provider
  Analyst->>Chat: Type explicit prompt
  Chat->>Route: Active UI messages
  Route->>Route: Check key and array shape
  Route->>Google: streamText with system prompt
  Google-->>Route: Streaming response
  Route-->>Chat: UI message stream
  Chat-->>Analyst: Display answer
~~~

Failure path: missing key returns 503; malformed JSON falls back to an empty messages array and then returns 400; non-array messages returns 400; provider/stream errors produce generic error output. Route maximum duration is 30 seconds. No explicit rate or per-message size limit was found.

## 5. Dashboard and analytics

- **Dashboard — IMPLEMENTED:** reads browser-saved transactions, applies a selected time range, and shows heuristic summaries/trends.
- **Analytics — IMPLEMENTED:** derives risk distribution, type/channel counts and trend data from browser records. It has no fraud ground truth.
- Loading and empty states exist in the page code; visual behavior was not exhaustively inspected in a browser.

## 6. History flow

**IMPLEMENTED.** History reads localStorage, supports search/filter and sorting in the client, opens a transaction detail dialog, and allows clearing local history. The detail dialog implements Escape and focus-management behavior in source. It is not an investigator case list, shared history, or immutable audit trail.

## 7. Settings and health

- **Settings — IMPLEMENTED:** persists Light, Dark or System theme using layernet-settings; supports local history management. Gemini model/configuration is displayed; the page does not edit a server secret.
- **Health — IMPLEMENTED:** browser storage probe, /api/chat configured flag, and /api/benchmark runtime/artifact availability probe. Available means local probes pass, not model quality or production readiness.
- Theme bootstrap reads saved settings before first paint. The inline script in app/layout.tsx is fixed code, not user HTML.

## 8. Error, empty, and loading paths

| Area | Current path | Status |
|---|---|---|
| Analysis form | Field validation and result/error presentation | IMPLEMENTED |
| Local storage | Invalid/missing values are decoded or treated as empty; save/clear emits update event | IMPLEMENTED |
| Gemini | Missing-key 503, minimal request 400, generic server/stream failure | PARTIALLY IMPLEMENTED; quota-specific recovery and abuse limits absent |
| Benchmark | Invalid input, unavailable runtime/model, internal failure and timeout responses | IMPLEMENTED; full JSON is parsed before CSV cap |
| Dataset model in normal scoring | No model route in analysis path | NOT IMPLEMENTED |
| Durable backend, authentication, cases | No route or service | NOT IMPLEMENTED |

## 9. Browser-to-server data movement

| Flow | Data sent | Destination | Boundary |
|---|---|---|---|
| Normal analysis | Transaction and local previous records stay in browser | No server required for heuristic | Persisted only on user save |
| AI chat | User-entered active chat messages | Next route then Google | No transaction context attached automatically |
| ULB benchmark | Uploaded CSV text, configured 2,000,000-byte cap | Next route then local Python process | ULB schema only; optional label used for evaluation |
| Health | Configuration/availability requests | Local routes | Secret itself is never returned |

## 10. Not implemented flows

- Bank/payment ingestion or real-time fraud event streams.
- Server-side transaction CRUD.
- Trained inference in normal analysis.
- Case creation, assignment, comments, decisions, approvals or evidence locking.
- Report generation, notification or external export.
- Authenticated identity, roles, tenant boundaries or permission workflow.
- Model monitoring and analyst feedback loop.

## 11. Verification limits and evidence

Route sources: app/page.tsx, app/dashboard/page.tsx, app/analysis/page.tsx, app/analytics/page.tsx, app/health/page.tsx, app/history/page.tsx, app/settings/page.tsx, app/benchmark/page.tsx; APIs: app/api/chat/route.ts and app/api/benchmark/route.ts; domain flow: lib/transactionService.ts, lib/fraudAnalysis.ts, lib/behavioralBaseline.ts and lib/transactionStorage.ts.

Production route smoke checks returned HTTP 200; actual generic Gemini route and five-row unlabeled ULB benchmark smoke succeeded. Playwright interactions were not run because no usable browser binary was available.
