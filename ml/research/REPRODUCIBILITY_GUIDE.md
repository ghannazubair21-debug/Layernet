# Reproducibility Guide

## 1. Environment

- **Python:** CPython 3.12.14, venv at `ml/.venv`. Exact packages: `ml/requirements-lock-observed.txt` (matches `pip freeze` of the environment that produced EXP-PS-TSEEDS-v1).
- **Risk:** the venv's base interpreter lives in a tool runtime cache (`%USERPROFILE%\.cache\codex-runtimes\...`), not a standalone install. If that cache is removed, rebuild from the lock (instructions in its header).
- **Linux:** the lock installs and the full ML unit suite passes on GitHub Actions `ubuntu-latest` (CI job "ML unit tests (Python)", first green on `main` at `8acd7da`, 2026-11-28).
- **Hardware recorded so far:** CPU only, 4 torch threads, Windows 11 (build 26300). CPU model and RAM were **not recorded** for past runs.
- **Bit-exact reproduction** of saved models assumes the same platform class: deterministic algorithms are enabled, but floating-point summation can differ across CPUs/BLAS builds.

## 2. Commands (run from the repository root)

```powershell
# ML unit tests (Windows)
$env:PYTHONPATH = "ml/src;ml/tests"; ml/.venv/Scripts/python.exe -m unittest discover -s ml/tests

# Re-verify all evidence hashes and write a dated snapshot (read-only)
ml/.venv/Scripts/python.exe -I ml/research/tools/verify_evidence.py > ml/research/evidence-snapshot-YYYY-MM-DD.json

# Phase 13B replay of Phase 12 (needs read access to ml/artifacts/paysim-temporal-v1)
ml/.venv/Scripts/python.exe -m layernet_ml.cli verify-paysim-temporal --archive ml/data/paysim/paysim-author-release-v2.zip --contract ml/reports/paysim-sequence-contract-v1.json --artifacts ml/artifacts/paysim-temporal-v1 --report <new-report-path>

# Transformer seed replication (refuses an existing output directory)
ml/.venv/Scripts/python.exe -m layernet_ml.paysim_transformer_seeds --output ml/artifacts/<new-run-directory>
```

Never point a run at an existing output or report path: runners refuse existing output directories, and new reports get new file names.

## 3. Before a new experiment (mandatory)

1. Reserve an ID in `EXPERIMENT_REGISTRY.md` with status `PLANNED`.
2. Write a preregistration (`ml/reports/<id>-prereg-vN.md`): research question, hypothesis, dataset + hash, split, frozen configuration, seeds, primary and secondary metrics, analysis and interpretation rules.
3. Put machine-readable settings in `ml/reports/<id>-config-vN.json`; quote its SHA-256 in the preregistration; the runner must refuse to start if they disagree.
4. **Commit** the runner, config and preregistration before launching (avoids a repeat of D-005), and record the exact launch command.
5. Register any new dataset in `DATASET_REGISTER.md` first.

Exploratory/diagnostic runs are allowed only if labelled `EXPLORATORY` in the registry and documented afterwards; they cannot support paper claims.

## 4. After the run (mandatory)

1. Keep raw outputs untouched (manifest, logs, scores, labels, checkpoints). Summaries go in separate files.
2. Independently recompute the headline metrics from raw scores/labels with a separate implementation; record agreement.
3. Write the results report (`ml/reports/<id>-vN.md`) including failures, deviations and what the result does **not** show.
4. Update `EXPERIMENT_REGISTRY.md`, `CLAIMS_EVIDENCE_MATRIX.md`, `DEVIATION_LOG.md` (if anything departed from the plan), `RESEARCH_LOG.md`.
5. Run `tools/verify_evidence.py` and commit a new dated snapshot.
6. Commit documentation and evidence references; large artifacts stay Git-ignored but are referenced by path and hash.
