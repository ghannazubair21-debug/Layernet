# PaySim Temporal Row-Level Prediction Export

**Result:** PASS

## Export

- File: `ml\artifacts\paysim-temporal-v1\test-predictions-v1.csv.gz` (SHA-256 `b38d07121fdb7dc66355935802f50b4a1098aeafd7635c49c2a504fccb064df9`)
- Rows: `817649`; schema: `layernet-paysim-row-predictions.v1`
- Source archive: `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d`; CSV member: `PS_20174392719_1491204439457_log.csv`
- Contract SHA-256: `acfd3223b58ee1b58b7c6a522e82dcd8b38e1d0e811c385d5ca60def0834ace7`
- Temporal manifest SHA-256: `5d0189b421c7d23a3d8ffe8434a26eafde29eafedc490a155e4e4bfb9ef64b20`
- Source row ordinal is zero-based over CSV data records (header excluded); row key hashes archive SHA-256, member name, and ordinal.
- Ground-truth labels are evaluation-only fields; scoring and thresholding use model scores and frozen manifest thresholds.

## Source-code provenance

- Git commit: `efc584e061231d583f1aeb97fef42e5154d9e4e2`
- Relevant source files are fingerprinted in the adjacent JSON export manifest; dirty/clean status is recorded per file.
- Runtime: Python `3.12.14` on `Windows-11-10.0.26200-SP0`.

## Reproduced test metrics

| Model | Threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 | TP | TN | FP | FN | Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| current_only_control | 5.8692464828491211 | 0.0335730019849 | 0.0386077592867 | 0.835571639648 | 0.0275240040126 | 0.723058823529 | 0.0530293879101 | 3073 | 704824 | 108575 | 1177 | True |
| temporal_baseline | 11.335100173950195 | 0.0796073292477 | 0.0803969248906 | 0.86737272779 | 0.133440961977 | 0.564 | 0.21581956512 | 2397 | 797833 | 15566 | 1853 | True |
| temporal_transformer | -0.35194271802902222 | 0.147599997196 | 0.14578967124 | 0.89407556468 | 0.161237785016 | 0.559058823529 | 0.250289687138 | 2376 | 801039 | 12360 | 1874 | True |

## Limitations

These are regenerated row-keyed predictions from the saved models and pinned source, not retained original predictions. PaySim is synthetic and the scope remains C-prefixed recipient histories; this does not establish sender-personalized or real-world banking performance.
