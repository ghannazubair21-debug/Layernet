# REPORT_SCREENSHOT_PLAN (final, 2026-11-23)

The screenshots were captured on 2026-11-23 by `report-shots.mjs` (headless Playwright, light theme, 1440 × 900 at 1.5× scale) against the local dev server. The three records were created only through the real Analysis form:
- TX-RPT-001: Medium, 60.
- TX-RPT-002: High, 80, Review.
- TX-RPT-003: Low, 8.

The benchmark run used 2,575 genuine ULB test-window rows (all 75 raw frauds included):
- XGBoost: AP 0.8799.
- Random Forest: AP 0.9012.
- Model agreement: 99.6 %.

Only the Next.js development-tools badge was hidden; the text states this. The screens contain no keys or personal data, and none are mock-ups.

| Fig | File (`figures/screens/`) | Screen | Status |
|---|---|---|---|
| 4.4 | dashboard.png | Dashboard with 3 records | Final |
| 4.5 | analysis-result.png | Analysis result dossier (TX-RPT-002) | Final |
| 4.6 | analysis-validation.png | Validation errors with aria-invalid | Final |
| 4.7 | history-drawer.png | History with the details drawer | Final |
| 4.8 | analytics.png | Analytics | Final |
| 4.9 | benchmark-results.png | Benchmark replay results | Final |
| 4.10 | health.png | Health page | Final |
| 4.11 | mobile-dashboard.png | Dashboard at 390 px | Final |
| — | history.png, settings.png | Captured but not used in the report | Spare |

## Additions under directive v2
| ID | Page/state | § | Status / blocker |
|---|---|---|---|
| S-11 | Settings (theme, storage, scope notes) | 4.4.1 | **Used: Figure 4.11** (`settings.png`) |
| S-12 | AI Assistant panel (open, before sending) | 4.4.1 | **Used: Figure 4.12** (`ai-assistant.png`, panel only, no request sent, fresh profile). Default applied: no live Gemini call. |
| S-13 | History table without the drawer | 4.4.1 | Captured (`history.png`); optional |
| S-14 | Dark theme of one page | 4.4.1 | Optional. Demonstrates FR-10 |
All captures: real app, `localhost:3000`, no mock-ups; resolution 2160 × 1350 px (1440 × 900 at 1.5×).


## Final figure numbers (v2 build)
Screenshots: 4.4 Dashboard, 4.5 Analysis result, 4.6 Validation, 4.7 History drawer, 4.8 Analytics, 4.9 Benchmark, 4.10 Health, 4.11 Settings, 4.12 AI panel, 4.13 Mobile dashboard. S-13 and S-14 are not used.
