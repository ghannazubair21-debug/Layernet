# LAYERNET_IMPLEMENTATION_INVENTORY (2026-11-23, repo `layernet-consolidation@ca7d595`)

Status key:
- **IMPL**: implemented and verified in code or a run.
- **PART**: partial.
- **EXP**: offline experiment.
- **PLAN**: planned, not built.
- **OUT**: out of scope.

## Web application
| Feature | Evidence (verified path) | Status | Notes |
|---|---|---|---|
| Transaction entry with validation | `app/analysis/page.tsx`, `app/analysis/__tests__/page.test.tsx` | IMPL | Controlled inputs, `aria-invalid`, four required-field messages |
| Rules baseline v1 scoring | `lib/fraudAnalysis.ts` | IMPL | Uncalibrated 0–100 priority score; not ML |
| Feature engineering and account baseline | `lib/featureEngineering.ts`, `lib/behavioralBaseline.ts` | PART | Computed and displayed; **not used in the score** |
| Analyse and save orchestration | `lib/transactionService.ts` | IMPL | Repository injected |
| Browser persistence | `lib/transactionStorage.ts`, `lib/useStoredTransactions.ts` | IMPL | localStorage `layernet-transactions`; no server DB |
| Dashboard | `app/dashboard`, `components/StatCard.tsx`, `components/charts.tsx` | IMPL | Derived from saved records |
| History (search, risk/type filters, sort, drawer) | `app/history`, `components/TransactionTable.tsx` | IMPL | No status filter |
| Analytics | `app/analytics`, `lib/transactionMetrics.ts` | IMPL | Shows a "not fraud rates" notice |
| ULB benchmark replay | `app/benchmark`, `app/api/benchmark/route.ts`, `lib/benchmark.ts`, `ml/src/layernet_ml/benchmark_replay.py` | IMPL | XGBoost and RF only; SHA-256 checked; 2 MB / 5,000 rows / 120 s |
| Health page | `app/health` | PART | Shows artefact presence; loadability is proven only by a benchmark run |
| Settings and theme | `app/settings`, `components/theme.ts`, `components/ThemeSettings.tsx`, `components/ThemeProvider.tsx` | IMPL | System/Light/Dark, `layernet-settings` |
| AI assistant (Gemini 2.5 Flash) | `app/api/chat/route.ts`, `components/AIChat.tsx`, `lib/ai-config.ts` | IMPL | Requires an API key; general questions only; no access to records |
| Component Lab | `app/micro-interactions`, `app/playground` | IMPL | Development demos; not a product feature |
| Responsive layout | `components/AppShell.tsx`, QA sweep | IMPL | Verified at 1440, 1280, 768, 390 and 360 px |

## Research (offline, `ml/`)
| Item | Evidence | Status |
|---|---|---|
| ULB chronological benchmark (XGB, RF, IF, ensemble) | `ml/reports/research-findings-v1.md`, `ml/artifacts/*-v1/manifest.json` | EXP (results recorded) |
| PaySim Phase 12 temporal experiment (current-only, temporal linear, 1-layer Transformer) | `ml/src/layernet_ml/paysim_temporal.py`, findings lines 70–97 | EXP |
| PaySim Phase 16 history ablation (3 seeds) | `paysim-history-ablation-v1-test-replay-v1/results.md` | EXP, PARTIAL |
| IEEE-CIS loader | `ml/src/layernet_ml/ieee_data.py`, `ml/tests/test_ieee_data.py` | PLAN (no results) |
| Python tests (11 files) | `ml/tests/` | Exist; **not run** this session |

## Tests (run 2026-11-23)
- Vitest: 37/37 tests in 8 files, including `components/__tests__/*`, `app/*/__tests__/*` and `smoke.test.tsx`.
- Node: 11/11.
- Playwright: `e2e/analysis-flow.spec.ts`, 1/1.
- `next build`: passed.

## Planned or out of scope (from the proposals; must not be described as built)
- Native mobile app.
- Multi-user roles and authentication.
- Server database and audit trail.
- Trained model or Transformer in live scoring.
- Ensemble in the product.
- SHAP/LIME explanations.
- Context and investigation "intelligence layers" beyond the dossier.
- Cloud deployment.
- Real bank integration.
- External validation on a second real dataset.
