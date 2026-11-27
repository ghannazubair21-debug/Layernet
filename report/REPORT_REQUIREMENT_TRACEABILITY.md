# REPORT_REQUIREMENT_TRACEABILITY (2026-11-23)

Requirement IDs match Tables 3.3, 3.4 and 3.9 in the current build. Paths were verified with `ls`/`find` on `ca7d595`. "Test" lists only tests that exist in the repo. Test files map to requirements by their file names only; their individual assertions were not mapped. "Manual/QA" means the scripted QA sweep or the screenshot run of 2026-11-23.

| ID | Requirement (short) | Report § | Design element | Source file(s) | Verification | Status |
|---|---|---|---|---|---|---|
| FR-01 | Enter a transaction | 3.3, 4.4 | Analysis page | `app/analysis/page.tsx` | `app/analysis/__tests__/page.test.tsx`; `e2e/analysis-flow.spec.ts` | Implemented |
| FR-02 | Validate fields, `aria-invalid` | 3.3, 4.5.2 | Activity/state diagrams | `app/analysis/page.tsx` | page test; Fig 4.6 screenshot | Implemented |
| FR-03 | Rules baseline score and contributions | 3.3, 4.5.1 | `fraudAnalysis` module | `lib/fraudAnalysis.ts` | `tests/feature-engineering.test.mjs` (Node): heuristic fallback test; E2E | Implemented |
| FR-04 | Behavioural features (display only) | 3.3 | `featureEngineering`, `behavioralBaseline` | `lib/featureEngineering.ts`, `lib/behavioralBaseline.ts` | `tests/feature-engineering.test.mjs` (Node): 5 feature tests; Fig 4.5 | Implemented (display only) |
| FR-05 | Save to `layernet-transactions` | 3.3, 4.6 | Repository | `lib/transactionStorage.ts`, `lib/transactionService.ts` | `tests/feature-engineering.test.mjs` (Node): repository migration/upsert and service tests; E2E | Implemented |
| FR-06 | Dashboard indicators | 3.3, 4.4 | Dashboard | `app/dashboard`, `lib/transactionMetrics.ts` | `tests/feature-engineering.test.mjs` (Node): metrics tests; Fig 4.4 | Implemented |
| FR-07 | History search/filter/sort/drawer | 3.3, 3.5 UC-03 | History, TransactionTable | `app/history`, `components/TransactionTable.tsx` | Manual/QA (Fig 4.7) | Implemented |
| FR-08 | Analytics breakdowns | 3.3 | Analytics | `app/analytics` | Manual/QA (Fig 4.8) | Implemented |
| FR-09 | ULB CSV benchmark replay | 3.3, 3.5 UC-05, 4.5.2 | Benchmark route, Python replay | `app/api/benchmark/route.ts`, `lib/benchmark.ts`, `ml/src/layernet_ml/benchmark_replay.py` | `app/api/benchmark/__tests__/route.test.ts`, `app/benchmark/__tests__/page.test.tsx`; screenshot run (2,575 rows) | Implemented |
| FR-10 | Theme System/Light/Dark persisted | 3.3 | Settings | `components/theme.ts`, `components/ThemeSettings.tsx` | `components/__tests__/ThemeSettings.test.tsx` | Implemented |
| FR-11 | Optional Gemini assistant | 3.3 UC-07 | Chat route | `app/api/chat/route.ts`, `components/AIChat.tsx`, `lib/ai-config.ts` | `app/api/chat/__tests__/route.test.ts`, `components/__tests__/AIChat.test.tsx` | Implemented (needs key) |
| FR-12 | Health page | 3.3 UC-08 | Health | `app/health` | Manual/QA (Fig 4.10) | Implemented |
| RFR-01…06 | Offline pipeline (split, train, manifests, as-of history, ablation, replay) | 3.3 Table 3.4, 4.2 | Research pipeline (Fig 4.3) | `ml/src/layernet_ml/*` | `ml/tests/test_*.py` exist, **not run** this session; results in `ml/reports` | Implemented (ablation PARTIAL) |
| RFR-07 | Second real dataset | 3.3 | — | `ml/src/layernet_ml/ieee_data.py` (loader only) | — | Not implemented |
| NFR-01 | Single-record performance | 3.6 | — | — | Manual/E2E run | Met (observed) |
| NFR-02 | Benchmark within 120 s / 5,000 rows | 3.6 | Benchmark route | `app/api/benchmark/route.ts` | route test; 2,575-row run | Met |
| NFR-03 | Corrupt storage tolerated | 3.6 | Storage, theme | `lib/transactionStorage.ts`, `components/theme.ts` | Code review; ThemeSettings test | Met (review) |
| NFR-04 | API key server-only | 3.6 | Chat route | `app/api/chat/route.ts`, `lib/ai-config.ts` | chat route test (503 without key) | Met |
| NFR-05 | SHA-256 model integrity | 3.6 | Python replay | `ml/src/layernet_ml/benchmark_replay.py` | `ml/tests/test_benchmark_replay.py` (not run) | Implemented |
| NFR-06 | Honest labelling | 3.6 | All pages | pages and `lib/transactionMetrics.ts` | Page review | Met |
| NFR-07 | Accessibility and responsiveness | 3.6 | AppShell, forms | `components/AppShell.tsx`, forms | Playwright role locators; QA sweep | Met (scripted sweep) |
| NFR-08 | Maintainability (typed modules, repository) | 3.6, 4.3 | Layered design | `lib/types.ts`, `lib/transactionService.ts` | Code structure | Met |
