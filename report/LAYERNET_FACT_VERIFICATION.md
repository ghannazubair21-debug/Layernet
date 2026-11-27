# LAYERNET_FACT_VERIFICATION (renamed from REPORT_FACT_VERIFICATION.md) — claim-to-evidence matrix (final for Chapters 1–4, 2026-11-23)

Status legend: **IMPL** = fully implemented and verified · **PART** = partial · **PROTO** = prototype/demo · **RES** = offline research artefact · **PLAN** = planned/future · **ABSENT** = in docs but not in code.

| # | Claim / feature | Evidence | Status | Permitted report wording |
|---|---|---|---|---|
| 1 | Web app built with Next.js 16 / React 19 / TS / Tailwind v4 | `package.json`, `next build` | IMPL | "implemented with Next.js 16.3 (App Router), React 19 and TypeScript" |
| 2 | Live transaction risk scoring | `lib/fraudAnalysis.ts` | IMPL (rules) | "a transparent rules-based baseline producing an uncalibrated 0–100 priority score"; never "ML prediction" or "fraud probability" |
| 3 | Behavioural/velocity features | `lib/featureEngineering.ts`, Analysis dossier | PART | "computed and displayed as context; not used in the score" |
| 4 | Persistent storage | `lib/transactionStorage.ts` (`localStorage`) | IMPL (browser only) | "stored in the browser's localStorage; no server-side database" |
| 5 | Relational database / ERD tables | none | ABSENT | The ERD must be labelled a **logical data model of the browser-stored records** (or a *proposed* schema) |
| 6 | Authentication / roles | none | ABSENT | "single-user local prototype; no authentication" |
| 7 | Gemini assistant | `app/api/chat/route.ts`, `components/AIChat.tsx`, `lib/ai-config.ts` | IMPL | "general investigation chat; cannot read saved history or change scores; requires `GOOGLE_GENERATIVE_AI_API_KEY`" |
| 8 | Trained ML models in the app | `app/api/benchmark/route.ts`, `ml/artifacts/xgboost-v1`, `random-forest-v1` | IMPL (benchmark only) | "server-side inference on uploaded ULB-format rows only; not connected to live scoring" |
| 9 | ULB held-out metrics (e.g. RF test AP 0.8073, XGB 0.7726) | `ml/reports/research-findings-v1.md`, artifact manifests | RES | Quote as "recorded on one chronological held-out split (74 fraud cases)"; no generalisation claims |
| 10 | PaySim history ablation: mean AP gain +0.0481 | `ml/artifacts/paysim-history-ablation-v1-test-replay-v1/results.md` | RES (PARTIAL) | "history-enabled AP was higher in all three seeds (mean +0.048); the descriptive 95 % t-interval [−0.014, 0.110] includes zero, so no significance is claimed" |
| 11 | Recipient-history leakage safety | `ml/src/layernet_ml/paysim_*.py`, tests `test_paysim_*.py`, sequence contract JSON | RES | Describe the as-of construction; the tests were **not re-run** in this session (pytest missing) |
| 12 | Independent/external validation dataset | IEEE-CIS loader `ieee_data.py` exists | PLAN/unverified | "not completed"; must not be claimed |
| 13 | Transformer model | Offline only: PaySim Phase 12 temporal experiment (`ml/reports`, manifests); `ModelFamily` lists "temporal-transformer" but the app has no adapter | RES (offline) | "a one-layer Transformer in the offline PaySim experiment recorded test AP 0.1458 (current-only 0.0386, temporal linear 0.0804)"; never described as part of the app or the live score |
| 14 | Deployment to cloud | no config | ABSENT | "runs locally"; cloud deployment = future work |
| 15 | Automated tests | Vitest 37, Node 11, Playwright 1 (run 2026-11-23) | IMPL | Cite counts with the date; Python tests not run |
| 16 | Responsive + accessible UI | QA sweep at 1440/1280/768/390/360 px, focus traps, ARIA | IMPL | "verified by a scripted headless sweep" |
| 17 | Theme persistence (System/Light/Dark) | `components/theme.ts`, layout init script | IMPL | as stated |
| 19 | PaySim dataset size and targets | `ml/reports/research-findings-v1.md` | RES | "6,362,620 rows, 8,213 fraud; 817,649 recipient targets with 4,250 fraud" |
| 20 | Benchmark demonstration upload | `report/figures/screens/shots-log.json`, Fig. 4.9 | IMPL | "2,575 rows from the ULB test window with an enriched fraud share; metrics apply to the uploaded rows only and are not comparable to Table 4.2" |
| 18 | Health page proves model health | `app/health/page.tsx` | PART | "reports artifact presence; loadability and inference are verified only by a completed benchmark upload" |

All claims in `source/chapters_1_4.txt` were checked against this matrix before the final build. Over-claims found during review and corrected in the text: the History status filter (it filters by risk and type only), storage unit tests, Gemini free usage, and supervisor review frequency.

## Additions (2026-11-23, directive v2)
| # | Claim | Evidence | Status | Permitted wording |
|---|---|---|---|---|
| 21 | Project title | Proposals use "LayerNet 2.0 Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System" | RESOLVED | The user chose the proposal title on 2026-11-23. It is used verbatim on the cover, the Certificate and the Plagiarism page, and in `props.title`. §1.5 states which planned layers were built. |
| 22 | Campus / degree / department | Template and sample: NUML **Multan Campus**, Faculty of Engineering & CS. The current cover says "Islamabad", which was **not evidenced** | FIX | Placeholder until the user confirms |
| 23 | Mobile application | Proposals only | PLAN / out of scope | "responsive web UI verified at 390 px; no native mobile app" |
| 24 | User roles / multi-user | Proposals only | ABSENT | "single-user local prototype" |
| 25 | Explainable AI (SHAP etc.) | none | ABSENT | "rule-contribution explanations only" |
| 26 | Turnitin similarity | not supplied | PENDING | Leave blank; never estimate |
