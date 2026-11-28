# Research Log

Chronological, append-only. Times are UTC unless marked; Git commit dates are the committer's local time (UTC+05:00). Entries before 2026-11-28 are **reconstructed (R)** from manifests, reports and Git history; they are not contemporaneous notes.

| Date | Type | Entry | Evidence |
|---|---|---|---|
| 2026-10-03 (local file times) | R | ULB CSV and PaySim v2 archive present locally. File times are not evidence of acquisition date; acquisition date NOT RECORDED. | `DATASET_REGISTER.md` |
| 2026-10-04 (commit) | R | Phase 11 research pipeline committed. | `45dd436` |
| NOT RECORDED | R | ULB XGBoost, Random Forest, Isolation Forest, selectors and ensemble trained (EXP-ULB-*). Run dates and commits were not recorded in their manifests. | ULB manifests |
| NOT VERIFIABLE | R | Phase 12 PaySim temporal models trained (EXP-PS-TEMPORAL-v1). Manifest unreadable since at least 2026-11-27 (D-007). | research inventory (2026-10-25) |
| before 2026-10-25 | R | Phase 13B replay PASS; Phase 14 row-level export. | reproduction and export reports |
| 2026-10-25 13:37Z | C | Phase 16 attempt 1 started; failed 13:47Z (D-001). | attempt-1 manifest |
| 2026-10-25 13:58Z | C | Phase 16 training run; thresholds frozen; test scoring aborted 14:43Z (D-002). | ablation manifest |
| 2026-10-25 14:56–15:04Z | C | Phase 16 replay-only test scoring completed; phase PARTIAL. | replay manifest |
| 2026-10-25 | R | Phase 15 consolidation: research findings, evidence inventory and thesis notes written; hashes re-verified. | `research-evidence-inventory-v1.md` |
| 2026-11-23 (commit) | R | ML experiments, thesis work and ULB benchmark replay committed to Git. | `91b751b`, `60a91e9` |
| 2026-11-27 | C | P2 inventory: `paysim-temporal-v1` found unreadable (D-007). P2 plan and seed-replication preregistration written. | `docs/ml/P2_ML_INTEGRATION_PLAN_v1.md` |
| 2026-11-27 18:47–20:38Z | C | EXP-PS-TSEEDS-v1 run; seed-42 reproduction PASS; primary difference not established; deviation D-005. | seeds manifest, `bc93ea1` |
| 2026-11-27 | C | CRLF/LF hash defect found and fixed (D-006). | `b86544c` |
| 2026-11-28 | C | EXP-PS-TSEEDS-v1 independently verified (66 checks); report committed. | `0dcb67b` |
| 2026-11-28 | C | ML environment lock recorded; model serving contract written. | `007ad90` |
| 2026-11-28 | C | CI runs the ML unit suite on Linux with the pinned lock: green on `main` (`8acd7da`). | GitHub Actions |
| 2026-11-28 | C | Research evidence system created (`ml/research/`). All 52 manifest-pinned file hashes re-verified (match); Phase 12 still inaccessible; CreditTransAct hash recorded for the first time; experiment registry, claims matrix, deviation log D-001–D-008 written. | `evidence-snapshot-2026-11-28.json` |
