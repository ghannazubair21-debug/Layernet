# LayerNet

LayerNet is a Next.js research prototype for transaction analysis and fraud investigation. It currently supports a transparent heuristic priority score, evidence contributions, optional account-scoped behavioral context from earlier browser-saved transactions, and analysis history.

## Current capabilities and limits

- The active scoring method is `LayerNet rules baseline v1`. Its uncalibrated 0–100 priority score uses amount, selected transaction types, selected channels, and UTC hour. It is not a fraud probability or trained-model prediction.
- Behavioral features are calculated only when an account ID and earlier saved records are available. Those features do not currently affect the score.
- Transaction history and analytics are read from this browser's local storage. They are not a durable shared database.
- No trained XGBoost, Random Forest, Isolation Forest, or Transformer inference adapter is connected to the application.
- Dashboard summaries describe heuristic decisions only. They are not ground-truth fraud rates or model evaluation metrics.
- The current ULB pipeline is a separate traditional benchmark and cannot support account-level personalization. Dataset decisions and remaining gates are in [DATASET_STRATEGY.md](./DATASET_STRATEGY.md).

## Project structure

- `app/`, `components/` — Next.js UI and routes.
- `lib/` — transaction domain types, browser repository/service, feature engineering, behavioral baselines, heuristic scoring, and summaries.
- `ml/` — isolated Python data-validation and ULB/XGBoost benchmark pipeline. It does not bundle data or report results until run on a verified local dataset.
- `tests/` — Node tests for feature engineering, temporal safeguards, repository behavior, and heuristic summary calculations.

## Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

Run project checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The ML subproject setup and commands are documented in [`ml/README.md`](./ml/README.md). Do not treat test fixtures as training data or report model metrics unless a real dataset has been validated and an experiment has actually run.
