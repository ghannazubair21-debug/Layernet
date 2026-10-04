# LayerNet research pipeline (Phase 2)

This subproject implements a reproducible supervised baseline around the public **ULB / Worldline Credit Card Fraud Detection** dataset. The published data contain real 2013 credit-card transactions, a binary `Class` target, elapsed `Time`, `Amount`, and 28 anonymized PCA features. They do not contain customer/account IDs, merchant, location, channel, or device fields, so this benchmark cannot validate personalized behavior or those contextual features. It must not be presented as evidence that account-level features generalize.

The pipeline does not generate or bundle a dataset. Download the CSV from the [dataset page](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud) under its terms, then place it at `ml/data/raw/creditcard.csv`. Data and trained artifacts are ignored by Git.

## Setup

Use Python 3.10 or newer in a project virtual environment, then install the bounded-version requirements and package:

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install -r ml/requirements.txt
ml/.venv/Scripts/python -m pip install -e ./ml
```

## Validate and train

```powershell
ml/.venv/Scripts/python -m layernet_ml.cli validate --data ml/data/raw/creditcard.csv
ml/.venv/Scripts/python -m layernet_ml.cli train-xgboost --data ml/data/raw/creditcard.csv --artifacts ml/artifacts/xgboost-v1
```

Validation checks the complete expected schema, finite numeric values, non-negative time and amount, binary labels, and both classes. It drops exact duplicate rows before splitting and reports the number removed. Extra columns are ignored rather than treated as model inputs.

The chronological 60/20/20 split keeps equal timestamps together. Feature engineering is fixed and label-free: `log1p(Amount)`, a cyclic phase derived from elapsed seconds, and `V1`–`V28`. `Class` and absolute `Time` are excluded from the feature matrix. The validation partition selects the XGBoost tree count through early stopping; the final model is refit on train plus validation and evaluated once on the later test partition. Class weighting is calculated from training labels only.

The saved artifact directory contains a model and a JSON manifest with raw-data/model SHA-256 hashes, schema version, ordered feature names, split ranges, and metrics from that run. Metrics are emitted only after a caller supplies the dataset and executes training. The fixed 0.5 operating threshold is a baseline, and `predict_proba` output is recorded as an **uncalibrated ranking score**, not a calibrated fraud probability. Calibration, threshold selection, and ensemble comparison are later research tasks.

## Research experiment contracts

`ExperimentConfig` records model families, input modality, dataset/feature schema versions, seed, and an optional decision threshold without selecting dataset-specific features. `ModelTrainer` receives `ModelFitData` containing train and validation partitions only; the final test set is intentionally outside that fit interface. The `RiskScorer` contract requires higher scores to mean greater suspicion. `PositiveClassProbabilityAdapter` maps a fitted binary estimator's class-1 output to that contract and labels it uncalibrated; `IsolationForestScoreAdapter` reverses the normality direction into an anomaly ranking score. These adapters do not train models. `fit_preprocessor_on_train` fits a learned transform only on training rows, then transforms validation and test separately while checking input/output schema consistency. `evaluate_scores` provides trapezoidal PR-AUC, average precision (reported separately), ROC-AUC, thresholded precision/recall/F1, and complete confusion counts, rejecting invalid or single-class evaluation inputs. The XGBoost run manifest now records separate dataset and feature schema versions, experiment definition, runtime package versions, and exact selection/final-fit parameters alongside existing hashes and split information.

These contracts allow experiments to share score semantics and reporting. They do not calibrate outputs or define ensemble weights. The PaySim temporal experiment below uses its accepted causal sequence contract and does not register an application model adapter.

`layernet_ml.pipeline.score_transaction` is a schema-checked inference adapter for the ULB feature contract. The current LayerNet form has different fields and cannot be mapped to `V1`–`V28`; it intentionally does not call this model. Connecting a suitable account-aware dataset and defining a defensible feature mapping are prerequisites to serving this artifact from the app.

## IEEE-CIS intake (validation only)

The separate `validate-ieee-cis` command prepares a local, labeled IEEE-CIS training release for a possible card/device/context research track. Use it only after accepting the applicable Kaggle competition terms for the intended academic use. It does not retrieve data, establish legal permission, create customer histories, fit preprocessing, train a model, or calculate model metrics. It requires the labeled transaction and identity CSV files and reports their hashes, schema, `TransactionID` join integrity, and availability/missingness for documented product, card, coded-address, device, and `id_12`–`id_38` fields. The `id_*` values are inventoried without assigning semantics beyond their field names. It also reports card/device co-observation overall and by chronological 60/20/20 split, label counts, relative time range, and whether the raw transaction rows were already chronological. Splitting sorts by `TransactionDT`; equal timestamps stay in one split. The official unlabeled test files are not part of this intake.

```powershell
ml/.venv/Scripts/python -m layernet_ml.cli validate-ieee-cis `
  --transactions ml/data/ieee-cis/train_transaction.csv `
  --identity ml/data/ieee-cis/train_identity.csv `
  --output ml/reports/ieee-cis-intake.json
```

`TransactionDT` is relative time, not a calendar timestamp. `addr1`/`addr2` are reported only as coded address attributes; the tool does not interpret them as geographic locations. IEEE-CIS card attributes and device fields do not establish a person/account identifier; co-observation reports only fields appearing on the same transaction and must not be presented as a verified customer/device relationship or personalized behavior. The intake tool does not prove that a dataset's terms were accepted or that a dataset release matches the published schema. Review the resulting report and source terms before deciding whether any modeling work is in scope. No IEEE-CIS data or results are included in this repository.

## PaySim recipient sequence contract (validation only)

The pinned PaySim author release is stored locally as `ml/data/paysim/paysim-author-release-v2.zip` and is Git-ignored. `validate-paysim-sequences` checks its verified SHA-256 and exact CSV member/schema, validates all rows in chunks, and emits a coverage/sequence-contract report without extracting a second CSV or building a materialized sequence dataset:

```powershell
ml/.venv/Scripts/python -m layernet_ml.cli validate-paysim-sequences `
  --archive ml/data/paysim/paysim-author-release-v2.zip `
  --output ml/reports/paysim-sequence-contract-v1.json
```

The scoped entity is a recipient whose source `nameDest` begins with `C`; this is not sender-personalized modeling. `step` is the hourly boundary and `isFraud` is the supervised target. Each target receives only that entity's transactions from strictly smaller steps. Same-step events are simultaneous, so history is grouped by step; events within a group are an unordered set, not an asserted event order. Validation/test may use earlier historical context from preceding partitions, while a training target can only see earlier training steps. The maximum history length is selected as the nearest-rank 95th percentile of prior distinct step buckets for training targets only; truncation retains the most recent whole buckets. History input features are transaction type, amount, and step gap. `isFraud`, `isFlaggedFraud`, all balance fields, source identifiers as model features, and same-step/future events are excluded. This command does not train a model or report model performance.

`iter_paysim_archive_sequences` in `layernet_ml.paysim_data` consumes the Phase 10 report, revalidates its pinned source/schema/counts, and yields examples lazily from CSV chunks. It carries the final tied step across chunk boundaries and stores entity histories as compact encoded event groups capped at 17 prior step buckets. Examples are ragged tuples: no padding is introduced here, and a later batch collator can create padding/masks. Within-step events are encoded deterministically by type, amount, then source row for exact ties; that serialization order has no temporal meaning.

To stream the full dataset through the loader and verify counts against the Phase 10 report without saving millions of expanded histories, run:

```powershell
ml/.venv/Scripts/python -m layernet_ml.cli materialize-paysim-sequences `
  --archive ml/data/paysim/paysim-author-release-v2.zip `
  --contract ml/reports/paysim-sequence-contract-v1.json `
  --output ml/reports/paysim-sequence-materialization-v1.json
```

The resulting small JSON manifest records source/contract/schema versions, split coverage, representation details, and reproducibility metadata. It does not persist sequence payloads or copy the raw CSV.

## PaySim temporal-model experiment

The Phase 12 experiment uses the same C-prefixed `nameDest` recipient histories and strict earlier-step rule. It trains two lightweight SGD logistic models (a current-transaction-only control and a sequence-aware linear baseline) and one modest one-layer Transformer. The control helps distinguish signal in the allowed historical representation from signal in current transaction type/amount; the sequence baseline and Transformer use the same 17 prior whole-step buckets plus the current target token.

The batch representation encodes the unordered events in each step bucket with log type counts, mean `log1p(amount)`, and the contract's target-step gap. It does not treat same-step transactions as ordered. Histories are left-padded and masked only in model batches; the current token is always unmasked. These fixed `log1p` and gap transforms are not fitted on any partition. All labels, rule flags, balances, identifiers, and future events are excluded from inputs. Class weights use train recipient-target labels only. Each model's decision threshold is selected by maximum validation F1 (ties prefer higher precision, then a higher threshold); the final test stream is opened only after all thresholds have been frozen.

Install the optional CPU temporal dependency after the normal ML setup:

```powershell
ml/.venv/Scripts/python -m pip install -r ml/requirements-temporal.txt
```

Run the experiment with:

```powershell
ml/.venv/Scripts/python -m layernet_ml.cli train-paysim-temporal `
  --archive ml/data/paysim/paysim-author-release-v2.zip `
  --contract ml/reports/paysim-sequence-contract-v1.json `
  --artifacts ml/artifacts/paysim-temporal-v1
```

The run saves the three model artifacts and their source hash, feature/schema definition, split counts, training configuration, validation threshold selections, package versions, and held-out test metrics in `ml/artifacts/paysim-temporal-v1/manifest.json`. It reports uncalibrated ranking scores and is scoped to the synthetic PaySim recipient-history experiment; it is not sender-personalized modeling or evidence of generalization to real financial accounts. The artifact directory is Git-ignored. Existing ULB experiment artifacts are not touched.

## License and limitations

The raw dataset remains subject to the source host's terms and is never copied into this repository. Its anonymized PCA columns prevent human-readable evidence explanations, and its short time span and absent account IDs limit temporal/personalized conclusions. Report its results as benchmark results on this dataset only, not as production or general fraud performance.
