# Experiment Registry

Every LayerNet research run has a permanent ID here. IDs are never reused or renumbered. This registry **indexes** the primary records (manifests and reports); it does not replace or restate them in full. When a value here disagrees with a primary record, the primary record wins and the disagreement must be logged in `DEVIATION_LOG.md`.

**Evidence type**
- **C** = contemporaneous: written by the run itself (manifest/log produced during execution).
- **R** = reconstructed: assembled later from surviving files; never presented as an original record.
- **NR** = NOT RECORDED: the field was not captured and cannot be recovered. Not guessed.

**Integrity column:** result of `ml/research/tools/verify_evidence.py` on 2026-11-28 (snapshot `ml/research/evidence-snapshot-2026-11-28.json`, repository at `8acd7da`). "52/52" means every file hash pinned by a readable manifest was recomputed and matched.

## Summary

| ID | Phase | Question (short) | Status | Run date (UTC) | Git commit at run | Primary record | Integrity 2026-11-28 |
|---|---|---|---|---|---|---|---|
| EXP-ULB-XGB-v1 | ULB track | XGBoost on ULB chronological split | COMPLETE | NR | NR | `ml/artifacts/xgboost-v1/manifest.json` | model hash match |
| EXP-ULB-RF-v1 | ULB track | Random Forest on ULB chronological split | COMPLETE | NR | NR | `ml/artifacts/random-forest-v1/manifest.json` | model hash match |
| EXP-ULB-IF-v1 | ULB track | Isolation Forest (unsupervised) on ULB | COMPLETE | NR | NR | `ml/artifacts/isolation-forest-v1/manifest.json` | model hash match |
| EXP-ULB-SEL-v1 | ULB track | Train-only selector models for ensemble weighting | COMPLETE (test unused) | NR | NR | `ml/artifacts/ensemble-selectors-v1/manifest.json` | 6/6 match |
| EXP-ULB-ENS-v1 | ULB track | Validation-selected weighted ensemble | COMPLETE | NR | NR | `ml/artifacts/ensemble-v1/manifest.json` | 6/6 match |
| EXP-PS-CONTRACT-v1 | Phase 10 | PaySim schema audit and causal sequence contract | COMPLETE (data construction, no model) | NR | NR | `ml/reports/paysim-sequence-contract-v1.json` | report hashed |
| EXP-PS-MAT-v1 | Phase 11 | Deterministic sequence materialization | COMPLETE (validation report) | NR | NR | `ml/reports/paysim-sequence-materialization-v1.json` | report hashed |
| EXP-PS-TEMPORAL-v1 | Phase 12 | Current-only SGD vs temporal SGD vs Transformer (seed 42) | COMPLETE | NOT VERIFIABLE (manifest unreadable) | NOT VERIFIABLE | `ml/artifacts/paysim-temporal-v1/manifest.json` | **INACCESSIBLE** (Access denied) |
| EXP-PS-REPLAY-v1 | Phase 13B | Replay saved Phase 12 models; reproduce metrics | PASS | NR in this registry (see report) | NR | `ml/reports/paysim-temporal-reproduction-v1.md` | report hashed; models it names are in the inaccessible folder |
| EXP-PS-EXPORT-v1 | Phase 14 | Row-level regenerated test predictions | COMPLETE | NR | NR | `ml/reports/paysim-temporal-prediction-export-v1.md` + `ml/artifacts/paysim-temporal-v1/test-predictions-v1.manifest.json` | export manifest **INACCESSIBLE** |
| EXP-PS-ABL-v1-A1 | Phase 16 | History ablation, attempt 1 | **FAILED** (OSError in memory sampler, 13:47:23Z) | 2026-10-25 13:37:59 | `efc584e` | `ml/artifacts/paysim-history-ablation-v1-attempt-1-partial/manifest.json` | 2/2 match |
| EXP-PS-ABL-v1 | Phase 16 | History ablation, training + frozen validation; aborted test scoring | **PARTIAL** (ValueError on row-order assertion, 14:43:48Z) | 2026-10-25 13:58:38 | `efc584e` | `ml/artifacts/paysim-history-ablation-v1/manifest.json` | 9/9 match |
| EXP-PS-ABL-v1-REPLAY | Phase 16 | Replay-only test scoring of the frozen models | COMPLETE test scoring; experiment status **PARTIAL** | 2026-10-25 14:56:06 → 15:04:40 | `efc584e` | `ml/artifacts/paysim-history-ablation-v1-test-replay-v1/manifest.json`, `ml/reports/paysim-history-ablation-v1.md` | 18/18 match |
| EXP-PS-TSEEDS-v1 | P2-1 | Transformer seed replication (42, 123, 2026) vs Phase 16 SGD | COMPLETE (deviation D-005) | 2026-11-27 18:47:53 → 20:38:12 | `fc0a68d` (runner committed in `bc93ea1` during run) | `ml/artifacts/paysim-transformer-seeds-v1/manifest.json`, `ml/reports/paysim-transformer-seeds-v1.md` | 8/8 match |

## Key results (copied from primary records; test split unless stated)

### ULB / Worldline (two-day anonymised card data; test = last 20% chronologically, 56,746 rows, **74 frauds**)

| ID | Test AP | Test PR-AUC | Test ROC-AUC | Source |
|---|---:|---:|---:|---|
| EXP-ULB-XGB-v1 | 0.772597 | 0.772287 | 0.980295 | manifest `test_metrics` |
| EXP-ULB-RF-v1 | 0.807268 | 0.807019 | 0.977906 | manifest `test_metrics` |
| EXP-ULB-IF-v1 | 0.035733 | 0.034793 | 0.943137 | manifest `test_metrics` |
| EXP-ULB-ENS-v1 | 0.610997 | 0.608794 | 0.979484 | manifest `test_metrics` |

With 74 test positives, a difference of a few true positives moves AP noticeably; no interval was computed for these single runs, so the ordering RF > XGB is **not** established as a reliable difference. The validation-selected ensemble scored below both supervised components on test.

### PaySim synthetic C-recipient temporal track (test: 817,649 targets, 4,250 fraud, prevalence 0.5198%)

| ID | Model / arm | Test AP | Test PR-AUC | Test ROC-AUC | Source |
|---|---|---:|---:|---:|---|
| EXP-PS-TEMPORAL-v1 (via REPLAY) | current-only SGD | 0.0386077592867 | 0.0335730019849 | 0.835571639648 | reproduction report (manifest unreadable) |
| EXP-PS-TEMPORAL-v1 (via REPLAY) | temporal SGD | 0.0803969248906 | 0.0796073292477 | 0.86737272779 | reproduction report |
| EXP-PS-TEMPORAL-v1 (via REPLAY) | Transformer (seed 42) | 0.14578967124 | 0.147599997196 | 0.89407556468 | reproduction report |
| EXP-PS-ABL-v1-REPLAY | history-enabled SGD, seeds 42/123/2026 | 0.080397 / 0.043284 / 0.114185 | 0.079607 / 0.043122 / 0.110542 | 0.867373 / 0.861514 / 0.868851 | replay manifest |
| EXP-PS-ABL-v1-REPLAY | current-only SGD, seeds 42/123/2026 | 0.038608 / 0.016328 / 0.038608 | 0.033573 / 0.016270 / 0.033573 | 0.835572 / 0.709352 / 0.835572 | replay manifest |
| EXP-PS-TSEEDS-v1 | Transformer, seeds 42/123/2026 | 0.145790 / 0.145887 / 0.145838 | 0.147600 / 0.147698 / 0.147649 | 0.894076 / 0.895424 / 0.894564 | seeds manifest; independently recomputed from raw scores |

Paired analyses (descriptive 95% Student-t intervals, df = 2, one shared synthetic test split; **no significance claims**):

| Comparison | Mean diff (test AP) | Interval | Includes zero | Source |
|---|---:|---|:-:|---|
| Phase 16: history-enabled − current-only SGD | +0.048107 | [−0.013794, +0.110009] | yes | replay manifest `analysis` |
| P2-1: Transformer − history-enabled SGD | +0.066550 | [−0.021610, +0.154709] | yes | seeds manifest `analysis.primary` |

## Per-experiment record status (fields required by the research workflow)

`✓` recorded in the primary record · `R` reconstructed · `NR` not recorded · `NV` not verifiable (record inaccessible).

| Field | ULB (5 runs) | PS-CONTRACT / MAT | PS-TEMPORAL-v1 | PS-REPLAY / EXPORT | PS-ABL-v1 (3 records) | PS-TSEEDS-v1 |
|---|---|---|---|---|---|---|
| Research question / hypothesis | R (`research-findings-v1.md`) | ✓ | NV | ✓ | ✓ (prereg) | ✓ (prereg) |
| Preregistration before run | NR | n/a | NR | n/a | ✓ | ✓ |
| Run start/end time | NR | NR | NV | NR | ✓ | ✓ |
| Git commit + working-tree status | NR | NR | NV (inventory: no immutable source snapshot) | NR | ✓ | ✓ (deviation D-005) |
| Environment (Python, packages, OS) | ✓ | NR | NV | NR | ✓ | ✓ |
| Hardware (CPU/RAM) | NR | NR | NV | NR | partial (process memory sampled) | NR (CPU, 4 threads) |
| Exact command | NR | NR | NV | REPLAY ✓ (report line 22; string corrected after the run, as the report states) · EXPORT NR | NR | R (module `layernet_ml.paysim_transformer_seeds` with default arguments; the launch command line was not captured) |
| Dataset hash | ✓ | ✓ | NV | ✓ | ✓ | ✓ |
| Split definition | ✓ | ✓ | NV | ✓ | ✓ | ✓ |
| Seeds | ✓ (in config) | n/a | NV (42 per later records) | n/a | ✓ | ✓ |
| Artifact hashes | ✓ (verified) | n/a | NV | NV | ✓ (verified) | ✓ (verified) |
| Raw predictions retained | NR | n/a | NR (Phase 14 regenerated, not original) | ✓ regenerated export (NV now) | ✓ (`test-predictions-seed-*.csv.gz`) | ✓ (`test-scores.npz`) |
| Training log | NR | n/a | NR (inventory) | n/a | ✓ in manifest | ✓ (`paysim-transformer-seeds-v1.log`) |
| Independent metric verification | NR | n/a | ✓ via REPLAY | ✓ | NR (replay computed; not re-derived separately) | ✓ (66 checks) |

## Adding a new experiment

Follow `REPRODUCIBILITY_GUIDE.md` §3 (pre-run) and §4 (post-run). Reserve the ID here **before** running, with status `PLANNED`, then update the row when the run finishes, fails or is aborted. Failed and aborted runs keep their row.
