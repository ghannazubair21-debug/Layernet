# LayerNet Technical Requirements Document

**Baseline:** commit ca7d595cfd19fe307f7c5fc5e479c101931748e6, branch layernet-consolidation; audit date 2026-11-25.
**Architecture status:** current implementation is separated from the proposed target.

## 1. Technology stack

| Layer | Audited version / technology | Evidence and notes |
|---|---|---|
| Web framework | Next.js 16.3.1 App Router | package.json, app/, next.config.ts |
| UI runtime | React / React DOM 19.2.8 | package.json |
| Language | TypeScript 5.9.3 | package.json and tsconfig files |
| Styling | Tailwind CSS 4.3.3, CSS custom properties | package.json, app/globals.css |
| Components | Base UI React 1.7.0; shadcn CLI dependency; Lucide React 1.33.0 | package.json and components |
| AI | AI SDK 7.0.74, @ai-sdk/google 4.0.49, @ai-sdk/react 4.0.77 | package.json |
| Validation | Zod 4.4.3 installed; audited API routes do not use Zod | package.json and routes |
| Web tests | Vitest 3.2.7, Testing Library, Node test runner, Playwright 1.63.0 | package.json and test/config files |
| ML | Python 3.12.14 in ml/.venv; pandas 3.0.6, scikit-learn 1.9.1, XGBoost 3.4.1, joblib 1.6.0, PyTorch 2.6.0+cpu | audited local environment |
| Runtime | Node v24.12.0/npm 11.19.1 locally; CI uses Node 22 | runtime inspection and CI workflow |

These versions describe the audited lock/runtime snapshot, not a guarantee about future compatible updates. Use the installed Next.js docs for framework changes.

## 2. Current architecture

~~~mermaid
flowchart LR
  Browser[Browser: Next.js React UI]
  Local[(Browser localStorage)]
  Service[TransactionService]
  Rules[Rules baseline v1]
  Chat[/api/chat]
  Gemini[Google Gemini 2.5 Flash]
  Benchmark[/api/benchmark]
  Python[Python benchmark_replay process]
  Models[(Saved ULB XGBoost and RF artifacts)]
  Research[Offline Python research pipeline]
  Data[(Ignored datasets and experiment artifacts)]
  Browser --> Service
  Service --> Local
  Service --> Rules
  Browser --> Chat
  Chat --> Gemini
  Browser --> Benchmark
  Benchmark --> Python
  Python --> Models
  Research --> Data
  Research -. not registered in normal analysis .-> Browser
~~~

The browser application, Node route handlers, Gemini provider, and local Python benchmark runtime exist. No SQL/NoSQL database, ORM, migration set, authentication/session system, deployed backend service, or production deployment configuration was found.

## 3. Frontend architecture

- app/ contains App Router pages, layout, global styles and route handlers.
- components/AppShell.tsx provides shared navigation/shell; components/ui/ contains primitives.
- components/ThemeProvider.tsx and settings persist the Light/Dark/System preference.
- lib/ contains domain types, feature engineering, behavioral baseline, scoring, repository/service, summaries and benchmark request types.
- Client pages use browser APIs when required. Transaction history and settings are origin-local localStorage, not server records.
- Styling uses the Rose Quartz token system in app/globals.css and responsive utility classes.

## 4. Backend and API architecture

Two Next.js Node route handlers exist:

1. GET/POST /api/chat in app/api/chat/route.ts.
2. GET/POST /api/benchmark in app/api/benchmark/route.ts.

These are backend functions, not a durable transaction backend. There is no transaction CRUD API. Benchmark invokes a child process at ml/.venv; it does not connect browser application records to a model.

POST /api/benchmark reads JSON, expects a non-empty csv string, then checks a 2,000,000-byte UTF-8 limit and invokes python -m layernet_ml.benchmark_replay. Python accepts up to 5,000 rows with Time, Amount, V1–V28; optional Class is evaluation-only. A 120-second process limit applies. Model artifacts stay server-side. The size check occurs after JSON materialization, so it does not bound parser memory.

Neither route uses Zod. Chat checks only that messages is an array before converting to model messages; explicit message count, text size, and total body bounds are absent. No authentication or rate limiter is configured.

## 5. Gemini integration

- Provider import: @ai-sdk/google; model: gemini-2.5-flash.
- Server-only key name: GOOGLE_GENERATIVE_AI_API_KEY.
- GET /api/chat returns { configured: boolean }, never the key.
- POST passes current chat messages to streamText with a fixed system prompt, temperature 0.35, topP 0.9, max output 600 tokens, request abort signal, and streamed UI response.
- Route maximum duration is 30 seconds.
- Prompt says there is no automatic transaction/browser context and the assistant cannot know why a score was assigned.
- Live route smoke returned HTTP 200 with a streamed response. This verifies the local integration at audit time, not quota, uptime, or production secret configuration.
- .env.example currently uses GEMINI_API_KEY, which does not match the route.

## 6. ML and research architecture

### Application boundary

lib/types.ts declares future TrainedFraudModel, ModelPrediction and EnsembleScorer interfaces. lib/transactionService.ts computes features and a baseline then calls analyzeTransaction; it does not invoke these interfaces. No research model is connected to normal analysis.

### Separate ULB benchmark

ml/src/layernet_ml/ contains intake, schema/feature contracts, chronological split and preprocessing, trainers/adapters, shared evaluation, selector artifacts, ensemble experiment and benchmark replay. XGBoost and Random Forest are the only models served by the web benchmark route. Isolation Forest and ensemble are research artifacts only. ULB has no persistent account identifier and cannot support user-level temporal histories.

The audited ULB manifest values below refer to the chronological held-out test split (56,746 rows, including 74 fraud labels). They are dataset-specific, uncalibrated benchmark results, not expected application performance.

| Model | Threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| XGBoost | 0.5 | 0.7722870806297158 | 0.7725965689814533 | 0.9802946209196209 | 0.3391812865497076 | 0.7837837837837838 | 0.47346938775510206 |
| Random Forest | 0.5 | 0.8070187152386684 | 0.8072680865582504 | 0.9779061732186732 | 0.9814814814814815 | 0.7162162162162162 | 0.828125 |
| Isolation Forest | 0 | 0.03479275685126939 | 0.03573313815796601 | 0.9431369893326415 | 0.026899480887210947 | 0.7702702702702703 | 0.05198358413132695 |
| Validation-selected ensemble | 0.9941616001409815 | 0.6087938217094901 | 0.6109966561114698 | 0.9794835287362461 | 0.6231884057971014 | 0.581081081081081 | 0.6013986013986014 |

The shared evaluator reports trapezoidal PR-AUC and Average Precision separately. Do not rank these models as a general winner or infer performance outside this split.

### Dataset qualification snapshot

| Dataset | Repository evidence/status | Research boundary |
|---|---|---|
| ULB / Worldline | Local raw CSV validated; four completed benchmark artifact families are recorded | Tabular benchmark only; no persistent account identifier |
| PaySim author release v2 | Local archive and causal recipient sequence evidence recorded in Phase 10–16 reports | Synthetic C-prefixed destination-recipient histories; exposed chronology means Phase 17 cannot reuse it as an independent window |
| IEEE-CIS | Dataset strategy records terms/schema as a possible separate card/device/context track; no local files or experiment manifest found | Not person/account-personalized evidence; any access must follow Kaggle terms |
| FCA APP | DATASET_STRATEGY.md records NO-GO pending verified current schema/access and dataset-specific use terms | Do not integrate or claim fields unavailable in public evidence |
| Fraud Detection Handbook simulator | Candidate recorded; dataset-artifact license remains unresolved | Do not use until the data license and exact release are verified |
| CreditTransAct | Prior qualification records no true chronological timestamp suitable for event ordering; this audit could not independently read the local Parquet schema because no reader was installed | Not currently qualified for temporal replication; schema detail remains a verification limitation |

### PaySim research

The replay report records the PaySim test values below. It states that metrics were reproduced from saved models and streamed inputs; original training-time per-row predictions were not retained. The Phase 12 artifact directory could not be independently opened during this audit, so model files and hashes are not newly verified here.

| Model | Frozen validation threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current-only control | 5.869246482849121 | 0.033573001984945054 | 0.03860775928674746 | 0.8355716396475126 | 0.027524004012611063 | 0.7230588235294118 | 0.05302938791005885 |
| Temporal SGD baseline | 11.335100173950195 | 0.07960732924771989 | 0.0803969248906291 | 0.867372727790131 | 0.133440961977398 | 0.564 | 0.2158195651195246 |
| Temporal Transformer | -0.3519427180290222 | 0.14759999719607347 | 0.14578967124048028 | 0.8940755646801805 | 0.16123778501628663 | 0.5590588235294117 | 0.25028968713789107 |

The PaySim contract uses C-prefixed nameDest recipients, step as hourly time, current isFraud as target, and strictly earlier step history. Recorded whole-step partitions: train 1–281, validation 282–355, test 356–743. Inputs exclude labels, isFlaggedFraud, balances, entity IDs, same-step and future events.

Phase 12's report records a current-only control, history-aware SGD baseline, and a small Transformer. Phase 13B's replay report records aggregate metric reproduction with frozen validation thresholds. Phase 16 is PARTIAL: seeds 42, 123, and 2026 completed; history-arm Average Precision was higher for each; mean paired change +0.04810744, sample SD 0.02491858, and descriptive 95% Student-t interval [-0.01379374, 0.11000862]. The interval includes zero, so statistical significance was not established. The report records an aborted initial test-score stream and missing prospective per-batch loss history. Phase 17 remains BLOCKED pending a qualified, unexposed chronological dataset. These are synthetic recipient-history results, not real-bank or sender-personalized performance.

The saved Phase 12 model folder was inaccessible to the current audit due to filesystem access denial. Historical replay reports record hashes/metrics, but those inaccessible model files are UNVERIFIED in this audit. Phase 16 accessible reports/exports were inspected; this pack does not alter prior experiment evidence.

## 7. Data and persistence

| Data | Location | Scope and limitation |
|---|---|---|
| Transaction analysis | Browser key layernet-transactions | One browser origin/profile; no server sync or shared identity |
| Settings | Browser key layernet-settings | Theme and client preferences |
| ULB raw dataset | Ignored ml/data/raw/creditcard.csv when supplied | Never commit; subject to source terms |
| PaySim and other dataset copies | Ignored ml/data/ | Keep dataset-specific contracts/terms |
| Model/experiment artifacts | Ignored ml/artifacts/ | Local research outputs; not automatically deployed |
| Chat messages | Active UI request to /api/chat and Google | No automatic history or transaction context attachment |

## 8. Environment and configuration

Web development requires Node/npm and dependencies from the lockfile. Gemini is optional; configure GOOGLE_GENERATIVE_AI_API_KEY in the server environment. The .env.example mismatch should be corrected in a separately authorized change.

Benchmark expects ml/.venv/Scripts/python.exe on Windows or ml/.venv/bin/python on Unix and local artifact paths. Setup/commands are documented in ml/README.md. Do not install packages beyond declared requirements without review.

## 9. Errors and observability

- Chat: 503 if key missing, 400 for non-array messages, generic 500/stream errors otherwise; caught exception is logged. No structured request telemetry, explicit quota mapping, or redaction policy was verified.
- Benchmark: structured failures for input/model/internal/timeout; stderr is reduced to a tail. Route tests cover malformed JSON, missing input, byte limit, and subprocess behavior.
- No centralized monitoring, tracing, alerting, rate-limit store, or audit-log service was found.

## 10. Security and privacy requirements

### Confirmed risks

- No authentication/authorization or rate limiting on chat and benchmark routes.
- Chat body validation is minimal; benchmark parses JSON before enforcing CSV size.
- Benchmark may start Python/model loading for every request; public exposure can consume compute.
- Public chat access may incur provider cost/quota use.
- localStorage is readable by same-origin JavaScript; no shared-backend retention policy exists.
- No explicit security-header configuration was found in next.config.ts.
- npm audit --omit=dev reported 21 production dependency advisories: 2 critical, 11 high, 8 moderate. Zod 4.4.3 falls within a reported advisory range. Counts are not proof that a particular route is exploitable; no dependency changed.
- dangerouslySetInnerHTML is used for a fixed theme bootstrap constant only; no user-controlled value was found at that sink.

### Required before external deployment — PLANNED

Authenticate and authorize users; validate payloads and sizes before expensive processing; add per-user/IP limits and concurrency bounds; define CSRF/CORS for the actual origin; establish security headers; triage dependencies; redact logs; document provider/browser data handling; add abuse and outage controls.

## 11. Performance and reliability

- 19 first-party .next/static/chunks JavaScript chunks totaled 1,079,868 uncompressed bytes. This is not compressed-transfer, Lighthouse, or field performance.
- Dashboard/history read local records and calculate summaries client-side. Storage is unbounded; JSON parse/stringify and history filtering/sorting scale with all saved rows.
- Benchmark starts Python and loads models per request; JSON body parses before the size limit. The 120-second timeout is long for interactive use.
- next/font/google made a sandboxed offline build fail; production build succeeded when network access for fonts was allowed. Self-hosting fonts is a possible reliability improvement.
- No Lighthouse/Web Vitals measurement was taken.

## 12. Testing and deployment

CI in .github/workflows/ci.yml runs npm ci, TypeScript, Node tests, Vitest, Playwright browser install and E2E. It does not run ESLint, production build, Python ML tests/validation, or npm audit.

Audit checks: typecheck passed; focused ESLint passed; Node tests 11/11; Vitest 37/37; Python compile check passed; ULB validator passed on ignored local data. Production build passed with network. Ten page routes returned HTTP 200; generic Gemini stream and five-row unlabeled ULB request succeeded. Local Playwright E2E was skipped because no usable browser binary was available; Python pytest was skipped because pytest is absent in the current venv. npm audit findings are listed above.

No Vercel configuration, container deployment, production URL, or evidence that a deployed version matches this commit was found. Hosting is UNVERIFIED.

## 13. Proposed target architecture — NOT IMPLEMENTED

~~~mermaid
flowchart LR
  UI[Analyst web client] --> API[Authenticated application API]
  API --> Tx[(Durable transactions and cases)]
  API --> Audit[(Append-only audit events)]
  API --> Inference[Versioned inference service]
  Inference --> Registry[(Approved model artifacts and schemas)]
  API --> Explain[Evidence-bound explanation]
  Explain --> Provider[Optional external LLM]
  API --> Reports[Auditable investigation reports]
~~~

This proposal requires decisions on identity, authorization, data controller, retention, qualified model output and deployment. It is not current code.

## 14. Technical constraints and risks

1. Browser-only persistence prevents multi-user work, durable audit and server history.
2. Application, ULB and PaySim schemas are not interchangeable.
3. No unexposed temporal dataset has been qualified for Phase 17.
4. APIs are resource/cost-sensitive without access control and throttling.
5. Builds require remote fonts in the current setup.
6. Dependency advisories require triage before public deployment.

## Evidence references

package.json; README.md; app/api/chat/route.ts; app/api/benchmark/route.ts; lib/benchmark.ts; lib/types.ts; lib/transactionService.ts; ml/src/layernet_ml/; ml/README.md; DATASET_STRATEGY.md; ml/reports/paysim-history-ablation-v1.md; ml/reports/paysim-temporal-reproduction-v1.md; next.config.ts; .github/workflows/ci.yml.
