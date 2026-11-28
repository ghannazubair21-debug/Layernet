# Dataset Register

Local datasets used or held for LayerNet research. Raw data is Git-ignored (`/ml/data/`) and never committed. Licence and source details are taken from `DATASET_STRATEGY.md`, which remains the decision record; this register adds the verified local file identity. Hashes were recomputed on 2026-11-28 (`evidence-snapshot-2026-11-28.json`).

| Dataset | Local file | Bytes | SHA-256 (recomputed 2026-11-28) | Matches recorded hash | Licence / terms (from `DATASET_STRATEGY.md`) | Used by | Status |
|---|---|---:|---|---|---|---|---|
| ULB / Worldline Credit Card Fraud | `ml/data/raw/creditcard.csv` | 150,828,752 | `76274b691b16a6c49d3f159c883398e03ccd6d1ee12d9d8ee38f4b4b98551a89` | Yes (`raw_csv_sha256` in all ULB manifests) | Kaggle access/terms; BERD record states no licence. Retain Kaggle's current terms with any copy. | EXP-ULB-* | Qualified for the conventional tabular benchmark only |
| PaySim author release v2 | `ml/data/paysim/paysim-author-release-v2.zip` | 186,385,561 | `f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d` | Yes (`PAYSIM_ARCHIVE_SHA256` in code; config and manifests) | CC BY-SA 4.0 (author-attributed Kaggle v2): attribution and ShareAlike apply | EXP-PS-* | Qualified for a synthetic C-recipient history study only |
| CreditTransAct | `ml/data/credittransact/credit_card_fraud.parquet` | 510,958,545 | `4a33623216213beb121cdc85006cf36f336601af7645e73feabe1abdf94e0823` | **No recorded hash existed**; this is the first recorded value | **NOT RECORDED** (source, version and licence not documented in the repository) | None | **Not qualified.** Prior qualification found no true chronological timestamp (`docs/audit-document-pack-2026-11-10/TRD.md`). Schema **NOT VERIFIABLE** with the current environment (no Parquet engine in `ml/.venv`; not installed, to keep the research environment unchanged). |

## Dataset facts recorded in primary records

| Dataset | Rows | Positives | Prevalence | Split used | Source |
|---|---:|---:|---:|---|---|
| ULB (after exact de-duplication) | 283,726 (1,081 duplicates removed) | 473 | 0.167% | Chronological 60/20/20 by `Time`, ties grouped: 170,235 / 56,745 / 56,746; **74 test positives** | ULB manifests, research inventory |
| PaySim v2 (raw) | 6,362,620 | 8,213 `isFraud` | 0.129% | — | `DATASET_STRATEGY.md`, sequence contract |
| PaySim C-recipient targets | 2,533,440 / 860,036 / 817,649 | 3,193 / 770 / 4,250 | 0.126% / 0.0895% / 0.5198% | Whole steps 1–281 / 282–355 / 356–743 | seeds config + manifest |

Test prevalence on PaySim is 5.8× validation prevalence; AP/PR-AUC must not be compared across these splits.

## Candidates (not held locally; no experiments run)

IEEE-CIS (non-commercial academic use, no redistribution; requires accepting Kaggle competition terms), FCA APP synthetic data (NO-GO: terms and schema unverified), Fraud Detection Handbook simulator (data licence unresolved). See `DATASET_STRATEGY.md`. A dataset selection decision is an owner decision (blocker B2).

## Rules

- Never merge datasets into one training table or one headline score (`DATASET_STRATEGY.md`).
- A new dataset is registered here **before** any experiment uses it: source URL, version, licence, file hashes, row counts, label meaning, time field, identifier coverage.
