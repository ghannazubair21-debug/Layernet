# LAYERNET_SOURCE_AUDIT (renamed from REPORT_SOURCE_AUDIT.md; updated 2026-11-23)

Evidence base: the live repository `layernet-consolidation` at commit `ca7d595` (2026-11-23). This is the **source of truth for implementation facts**.

`LayerNet-audit.zip` (dated 2026-11-21) is an **older snapshot**. It predates the ULB benchmark replay (`app/api/benchmark`, `app/benchmark`), the redesigned shell (`AppShell`, `charts.tsx`, `StatCard`), and `/playground`. It still contains the deleted `Navigation.tsx`, `MetricCard.tsx` and `ChartCard.tsx`. Use it only to trace history, never to describe the current system.

`LayerNet_Research_Documentation.zip` holds 7 Markdown documents (~10.2k words): PROJECT_BRIEF, REQUIREMENTS, RESEARCH, TECHNICAL_DESIGN, SOURCE_OF_TRUTH, IMPLEMENTATION_PLAN, CLAUDE_CONTEXT. PROJECT_BRIEF and SOURCE_OF_TRUTH **differ** from the repo copies; the later versions are reconciled against code during the fact-verification pass.

## 1. Technology stack (verified in package.json)

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.3.1 |
| UI | React / React DOM | 19.2.8 |
| Language | TypeScript (strict) | ^5 |
| Styling | Tailwind CSS v4 + CSS custom-property design tokens | ^4 |
| UI primitives | @base-ui/react, lucide-react icons, shadcn utilities | 1.7 / 1.33 |
| AI chat | Vercel AI SDK `ai` 7, `@ai-sdk/react` 4, `@ai-sdk/google` 4 (Gemini `gemini-2.5-flash`) | — |
| Validation | zod 4 | — |
| Tests | Vitest 3 + Testing Library + jsdom; Node test runner; Playwright 1.63 | — |
| ML research | Python 3.12 package `layernet_ml` (scikit-learn, XGBoost, pandas, …) in `ml/.venv` | see `ml/requirements*.txt` |

## 2. Routes and pages (verified by `next build`: 13 routes)

| Route | Type | Purpose (as implemented) |
|---|---|---|
| `/` | static | Landing page: scope statement and entry links |
| `/dashboard` | client | Total/High/Medium/Low counts, score trend, risk donut, high-risk alerts, recent table, system status, quick actions (all from saved browser records) |
| `/analysis` | client | Transaction form (ID, optional account ID, amount, type, location, channel, optional device ID, timestamp) → rules-baseline result dossier → saved to History |
| `/history` | client | Search, risk/type filters, sorting, responsive table/cards, detail drawer |
| `/analytics` | client | Score trend, risk distribution, type/channel breakdowns, high-priority watchlist, explicit "not fraud rates" notice |
| `/benchmark` | client + API | ULB CSV upload → server-side Python inference with saved XGBoost and Random Forest models → per-row scores, agreement, optional uploaded-row metrics, recorded held-out metrics (reference) |
| `/health` | client | Local probes: scoring engine, artifact presence, AI key configured, browser storage; ML readiness stages |
| `/settings` | client | Theme (System/Light/Dark, `layernet-settings`), clear local vault (with confirmation), AI and benchmark scope, Component Lab |
| `/micro-interactions`, `/playground` | client | Component Lab (interaction and accessibility demos from earlier phases) |
| `/api/chat` | dynamic | Gemini streaming chat (general investigation questions only) |
| `/api/benchmark` | dynamic | GET: artifact availability probe; POST: CSV → Python inference subprocess |

## 3. Core application logic

- `lib/fraudAnalysis.ts`: **rules-based heuristic** "LayerNet rules baseline v1". It produces a 0–100 uncalibrated priority score from a log-scaled amount baseline plus type, channel and UTC-hour adjustments, then maps the score to Low/Medium/High and Clear/Review/Block, with human-readable factors and limitations.
- `lib/featureEngineering.ts` and `lib/behavioralBaseline.ts`: account history and velocity features. They are computed and **displayed but do not change the score**.
- `lib/transactionService.ts`: analyse and save orchestration; the repository is injected.
- `lib/transactionStorage.ts`: browser `localStorage` key `layernet-transactions`, with legacy migration and upsert by transaction ID. **No server database and no authentication.**
- `lib/transactionMetrics.ts`: summary counts. Its comments state explicitly that these are not fraud labels or model metrics.
- `components/theme.ts`: `layernet-settings` validation and persistence (FE-03 rules).
- `app/api/benchmark/route.ts`: spawns `ml/.venv` Python, enforces the CSV schema (Time, Amount, V1–V28, optional Class), and limits uploads to 5,000 rows / 2 MB.

## 4. ML research package (`ml/src/layernet_ml`, 18 entries in the directory listing (17 modules plus `__pycache__`), 11 test files in `ml/tests`)

- **Track A — ULB/Worldline credit-card benchmark.** Chronological 60/20/20 split after duplicate removal (283,726 rows, 473 fraud). XGBoost, Random Forest, Isolation Forest and a weighted ensemble, with saved artifacts under `ml/artifacts/*-v1`.
- **Track B — PaySim recipient-history ablation (core research question).** Synthetic PaySim v2 (6,362,620 rows), with C-prefixed `nameDest` recipients and a chronological split by hourly step. Pre-registered comparison of `current_only` vs `history_enabled` (SGD logistic, 3 seeds), with Average Precision as the primary metric. Status in the results manifest: **PARTIAL**.

## 5. Tests (executed 2026-11-23 in this session)

| Suite | Result |
|---|---|
| Vitest (component, page, API route) | 37 / 37 passed (8 files) |
| Node unit tests (`npm test`) | 11 / 11 passed |
| Playwright E2E (`analysis-flow.spec.ts`) | 1 / 1 passed |
| `next build` | passed, 13 routes |
| Python `ml/tests` | **not run**: pytest is not installed in `ml/.venv` |

## 6. Deployment

There is no deployment configuration in the repo (no `vercel.json`, `vercel.ts` or `.vercel`). The verified runtime is **local** (`npm run dev` / `next build` + `next start`). The benchmark route needs a local Python virtualenv, so it cannot run on a generic serverless host without changes. The deployment diagram must therefore show the **verified local/single-host deployment**; any cloud deployment is labelled *proposed*.

## 7. Discrepancies found

| Claim | Source | Finding |
|---|---|---|
| "AI model based on a Transformer architecture" | `CLAUDE.md`, both proposals | **Corrected 2026-11-23:** a one-layer PyTorch `TransformerEncoder` exists **offline only**, in `ml/src/layernet_ml/paysim_temporal.py` (PaySim Phase 12; test AP 0.1458, per `ml/reports/research-findings-v1.md`). The web app has no Transformer: `ModelFamily` lists "temporal-transformer", but there is no adapter, and live scoring is rules-based. Wording: "offline research experiment on one synthetic split". |
| Stack "React + Vite" | `CLAUDE.md` FE-01 plan | The implementation is **Next.js 16**, not Vite. |
| Older docs vs repo | zip `PROJECT_BRIEF.md`, `SOURCE_OF_TRUTH.md` | The files differ from the repo copies; reconcile against code. |
| Live ML scoring | — | Trained models are used **only** in ULB benchmark replay. Live transaction scoring is rules-based. |

## 8. Planning documents vs implementation (added 2026-11-23)

| Document | Promises | Reality in code |
|---|---|---|
| `LayerNet_2.0_Professional_FYP_Master_Proposal.docx` (4,276 w), `LayerNet_FYP_Master_Proposal_Roadmap_v2.docx` (2,477 w, 22 Sep 2026) | Title "LAYERNET 2.0 Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System"; 8 intelligence layers; web **and mobile** app; roles (analysts, managers, compliance, ML engineers); Transformer + classical + ensemble in the product; explainable AI | Web only (responsive; no mobile app). Single user; no roles or auth. Live score = rules baseline v1. Classical models and the ensemble are offline, and only XGBoost and Random Forest are exposed, via the Benchmark page. Transformer offline only. Explanations = rule contributions (no SHAP/LIME). Several layers (context intelligence, investigation intelligence beyond the dossier) are **planned/not implemented**. |
| `LayerNet_FYP_Chapters_1-4_Explained_Guide.docx` (4,758 w, 68 tables, 12 images) | A study guide following NUML Appendix H, with the recipient-history research direction | Consistent with the current report structure. A guide, not evidence. |
| `LayerNet_Project_Documents_Download.zip` (Oct 2026, 6 md) and `LayerNet_Project_Documentation.zip` (Nov 17, 11 md: PRD, ARCHITECTURE, RULES, TECHSTACK, docs/*) | Earlier product and design intent | Historical. Superseded by the repo where they conflict. The `(1)` copy is byte-identical. |
