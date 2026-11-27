# PaySim Temporal Metric Reproduction

**Result:** PASS

## Provenance

- Source commit: `efc584e061231d583f1aeb97fef42e5154d9e4e2`
- Working-tree status before report creation:

```text
## main...origin/main
 M ml/src/layernet_ml/cli.py
 M ml/src/layernet_ml/paysim_data.py
 M ml/src/layernet_ml/paysim_temporal.py
?? IMPLEMENTATION_PLAN.md
?? PROJECT_BRIEF.md
?? REQUIREMENTS.md
?? SOURCE_OF_TRUTH.md
?? TECHNICAL_DESIGN.md
?? ml/tests/test_paysim_replay.py
```
- Replay command (from repository root): `ml/.venv/Scripts/python.exe -m layernet_ml.cli verify-paysim-temporal --archive ml/data/paysim/paysim-author-release-v2.zip --contract ml/reports/paysim-sequence-contract-v1.json --artifacts ml/artifacts/paysim-temporal-v1 --report ml/reports/paysim-temporal-reproduction-v1.md`
- Python/platform: `3.12.14` / `Windows-11-10.0.26200-SP0`
- Packages: `{"joblib": "1.6.0", "numpy": "2.5.3", "pandas": "3.0.6", "scikit-learn": "1.9.1", "torch": "2.6.0+cpu"}`
- Dataset SHA-256: `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d`
- Contract SHA-256: `acfd3223b58ee1b58b7c6a522e82dcd8b38e1d0e811c385d5ca60def0834ace7`
- Dataset/sequence/feature schemas: `layernet-paysim-release-v2.schema.v1` / `layernet-paysim-c-recipient-causal-sequence.v1` / `layernet-paysim-causal-model-input.v1`

| Model artifact | SHA-256 | Loaded |
|---|---|---|
| `current_only_control` (`current_only_control.joblib`) | `8c3dd1697cf9e8762d96f70051225a075afbbbac9cd83a1eb45dfa4772c8ad85` | True |
| `temporal_baseline` (`temporal_sgd_baseline.joblib`) | `eaa89c5f1f67993a1089c7969da9bba504dd6c4c2327a96f28c303470da47dfb` | True |
| `temporal_transformer` (`temporal_transformer.pt`) | `e20d084ebf2a1b23abb34e90bc460ae8081d49a2b8db4a7ad55fd71dd639a312` | True |

## Leakage controls

- Training executed: `False`
- Test-based selection: `False`
- Label columns parsed during preflight: `False`
- Validation stream row limit: `5113884`
- Test stream opened only after validation checks passed: `True`
- Numeric tolerance: absolute `1e-10`, relative `1e-10`; confusion counts exact.

## Reproduced metrics

Each cell shows `stored / replayed`; all ranking/operating metrics are compared, and counts must match exactly.

| Split | Model | Threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 | TP / TN / FP / FN | Match |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| validation | `current_only_control` | 5.8692464828491211 / 5.8692464828491211 | 0.00309246935053 / 0.00309246935053 | 0.00310814842121 / 0.00310814842121 | 0.824703990791 / 0.824703990791 | 0.00489672364672 / 0.00489672364672 | 0.714285714286 / 0.714285714286 | 0.00972676629233 / 0.00972676629233 | 550 / 550 / 747496 / 747496 / 111770 / 111770 / 220 / 220 | True |
| validation | `temporal_baseline` | 11.335100173950195 / 11.335100173950195 | 0.0120347130387 / 0.0120347130387 | 0.0120906572882 / 0.0120906572882 | 0.860872864128 / 0.860872864128 | 0.0249020059949 / 0.0249020059949 | 0.561038961039 / 0.561038961039 | 0.0476873827133 / 0.0476873827133 | 432 / 432 / 842350 / 842350 / 16916 / 16916 / 338 / 338 | True |
| validation | `temporal_transformer` | -0.35194271802902222 / -0.35194271802902222 | 0.0149095095671 / 0.0149095095671 | 0.0149986165289 / 0.0149986165289 | 0.888624439385 / 0.888624439385 | 0.0306708806206 / 0.0306708806206 | 0.554545454545 / 0.554545454545 | 0.0581268717669 / 0.0581268717669 | 427 / 427 / 845771 / 845771 / 13495 / 13495 / 343 / 343 | True |
| test | `current_only_control` | 5.8692464828491211 / 5.8692464828491211 | 0.0335730019849 / 0.0335730019849 | 0.0386077592867 / 0.0386077592867 | 0.835571639648 / 0.835571639648 | 0.0275240040126 / 0.0275240040126 | 0.723058823529 / 0.723058823529 | 0.0530293879101 / 0.0530293879101 | 3073 / 3073 / 704824 / 704824 / 108575 / 108575 / 1177 / 1177 | True |
| test | `temporal_baseline` | 11.335100173950195 / 11.335100173950195 | 0.0796073292477 / 0.0796073292477 | 0.0803969248906 / 0.0803969248906 | 0.86737272779 / 0.86737272779 | 0.133440961977 / 0.133440961977 | 0.564 / 0.564 | 0.21581956512 / 0.21581956512 | 2397 / 2397 / 797833 / 797833 / 15566 / 15566 / 1853 / 1853 | True |
| test | `temporal_transformer` | -0.35194271802902222 / -0.35194271802902222 | 0.147599997196 / 0.147599997196 | 0.14578967124 / 0.14578967124 | 0.89407556468 / 0.89407556468 | 0.161237785016 / 0.161237785016 | 0.559058823529 / 0.559058823529 | 0.250289687138 / 0.250289687138 | 2376 / 2376 / 801039 / 801039 / 12360 / 12360 / 1874 / 1874 | True |

## Outcome and limitations

- Validation targets: `860036`; validation checks passed: `True`.
- Test targets: `817649`.
- Final result passed: `True`.
- Focused replay-safety tests: `2 passed`; complete ML unit suite: `47 passed`.
- Python compile check, replay CLI help check, and `git diff --check`: passed.
- Post-replay archive and all three model hashes still match the manifest; the manifest write time was unchanged.
- No row-level prediction arrays were persisted; metrics were recomputed from saved models and streamed inputs.
- No training, test-based threshold selection, or model selection was performed.
- No metric or split-method deviation occurred; the recorded command string was corrected after the run to match the actual module invocation.
- The PaySim archive is synthetic and this replay verifies only the saved recipient-history experiment on its fixed chronological split.
