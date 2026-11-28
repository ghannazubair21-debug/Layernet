# LayerNet Research — Master Index

Entry point to LayerNet's research record. Established 2026-11-28. It **extends** the existing records (Phase 15 consolidation of 2026-10-25) rather than replacing them; nothing below was rewritten.

## 1. Where the evidence lives

| Layer | Location | What it is | Editable? |
|---|---|---|---|
| Raw run evidence | `ml/artifacts/<run>/` (Git-ignored) | Manifests, freeze files, models, score/label files, logs written by the runs | **Never** edited |
| Raw data | `ml/data/` (Git-ignored) | ULB CSV, PaySim archive, CreditTransAct parquet | **Never** edited |
| Preregistrations, configs, result reports | `ml/reports/` (byte-exact in Git) | Per-experiment documents; hashes pinned by manifests | Never rewritten; new versions get new files |
| Phase 15 consolidation | `ml/reports/research-findings-v1.md`, `research-evidence-inventory-v1.md`, `thesis-writing-notes-v1.md` | Findings, evidence inventory and thesis guidance through Phase 14 | Historical; kept as written |
| Dataset decisions | `DATASET_STRATEGY.md` | Candidate datasets, licences, go/no-go | Decision record |
| ML plans and contracts | `docs/ml/` | P2 plan, model serving contract | Living documents |
| **Research system (this folder)** | `ml/research/` | Registry, claims, deviations, datasets, decisions, logs, verification tool and snapshots | Append-only logs; dated snapshots |

## 2. Documents in this folder

| File | Purpose |
|---|---|
| `EXPERIMENT_REGISTRY.md` | Permanent IDs for all 14 recorded runs, status, dates, commits, key results, per-field provenance |
| `CLAIMS_EVIDENCE_MATRIX.md` | Every research and product claim with evidence and SUPPORTED / UNSUPPORTED status |
| `DEVIATION_LOG.md` | Failed/aborted runs, procedure departures and integrity problems (D-001 …) |
| `DATASET_REGISTER.md` | Local datasets with recomputed hashes, licences, counts, qualification |
| `METRICS_AND_EVALUATION.md` | Exact metric definitions, thresholding and uncertainty rules |
| `REPRODUCIBILITY_GUIDE.md` | Environment, commands, and the mandatory before/after experiment workflow |
| `DECISION_LOG.md` | Methodological decisions (RD-01 …) |
| `RESEARCH_LOG.md` | Chronological log (reconstructed entries marked R) |
| `OPEN_RESEARCH_QUESTIONS.md` | Questions the evidence raises, and what would answer them |
| `PAPER_OUTLINE.md` | Paper structure with the evidence and gaps for each section |
| `tools/verify_evidence.py` | Read-only re-verification of every manifest-pinned hash |
| `evidence-snapshot-YYYY-MM-DD.json` | Dated output of the verifier (one per verification, never overwritten) |

## 3. Current state (2026-11-28, repository `8acd7da`)

- **14 runs registered**: 5 ULB, 2 PaySim data-construction, Phase 12, Phase 13B replay, Phase 14 export, 3 Phase 16 records (1 failed, 1 partial, 1 replay), and the 3-seed Transformer replication.
- **Integrity:** 52 of 52 manifest-pinned file hashes recomputed and matched. ULB CSV and PaySim archive hashes match their recorded values. **Phase 12 (`paysim-temporal-v1`) is inaccessible** and could not be re-verified.
- **Supported claims:** ULB supervised rankers far above base rate; Transformer seed stability and exact reproduction of Phase 12 (synthetic scope).
- **Not established:** history-vs-current SGD gain (Phase 16) and Transformer-vs-SGD gain (P2-1): both 95% intervals include zero.
- **Product:** the live app uses a rules baseline; no trained model is integrated.

## 4. Research blockers

| # | Blocker | Evidence | Impact | Required action |
|---|---|---|---|---|
| B1 | `ml/artifacts/paysim-temporal-v1` unreadable | `Permission denied` / *Access is denied* (also `icacls`), D-007 | Phase 12 manifest, models and Phase 14 export manifest cannot be re-verified | Owner runs, in an **elevated** PowerShell: `takeown /f "<repo>\ml\artifacts\paysim-temporal-v1" /r /d y` then `icacls "<repo>\ml\artifacts\paysim-temporal-v1" /grant "${env:USERNAME}:(OI)(CI)R" /t`, then re-run `tools/verify_evidence.py` |
| B2 | No qualified real (non-synthetic) dataset with entity history | `DATASET_REGISTER.md`, `DATASET_STRATEGY.md` | Every temporal claim is synthetic-only; no product-relevant model possible | Owner dataset decision (e.g. accept IEEE-CIS academic terms; or pursue FCA APP access) |
| B3 | Comparisons rest on 3 seeds on one split | C5, C8 | Differences cannot be established | Preregister more comparator seeds (Q1) — CPU time only |
| B4 | Literature review and verified references not yet done | `PAPER_OUTLINE.md` §2 | Related work and research gap unsupported | Build verified reference list in `report/REPORT_REFERENCE_REGISTER.md` |

## 5. Maintenance rule

After any session that touches research: update the registry, claims matrix, deviation log and research log as applicable, run `tools/verify_evidence.py` into a new dated snapshot, and commit. If a document did not need updating, say so in the session report.
