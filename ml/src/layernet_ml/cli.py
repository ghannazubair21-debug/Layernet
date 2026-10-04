from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .data import chronological_split, validate_dataset
from .ieee_data import validate_ieee_cis
from .paysim_data import (
    PAYSIM_CONTRACT_PATH,
    PAYSIM_SEQUENCE_REPORT_PATH,
    materialize_paysim_sequence_report,
    validate_paysim_archive,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LayerNet fraud model research pipeline")
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate", help="Validate the local ULB credit-card CSV schema")
    validate.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))

    ieee = commands.add_parser(
        "validate-ieee-cis",
        help="Validate local labeled IEEE-CIS files and report coverage/splits only",
    )
    ieee.add_argument("--transactions", type=Path, required=True, help="Path to train_transaction.csv")
    ieee.add_argument("--identity", type=Path, required=True, help="Path to train_identity.csv")
    ieee.add_argument("--output", type=Path, help="Optional path for the JSON intake report")

    paysim = commands.add_parser(
        "validate-paysim-sequences",
        help="Validate the pinned PaySim release and report causal customer-recipient sequence coverage",
    )
    paysim.add_argument(
        "--archive",
        type=Path,
        default=Path("ml/data/paysim/paysim-author-release-v2.zip"),
        help="Path to the verified PaySim author-release archive",
    )
    paysim.add_argument("--output", type=Path, help="Optional path for the JSON sequence-contract report")

    paysim_materialize = commands.add_parser(
        "materialize-paysim-sequences",
        help="Stream contract-compliant sequence examples and write a compact validation manifest",
    )
    paysim_materialize.add_argument(
        "--archive",
        type=Path,
        default=Path("ml/data/paysim/paysim-author-release-v2.zip"),
        help="Path to the verified PaySim author-release archive",
    )
    paysim_materialize.add_argument(
        "--contract",
        type=Path,
        default=PAYSIM_CONTRACT_PATH,
        help="Phase 10 sequence-contract JSON path",
    )
    paysim_materialize.add_argument(
        "--output",
        type=Path,
        default=PAYSIM_SEQUENCE_REPORT_PATH,
        help="Path for the compact materialization-validation manifest",
    )

    paysim_temporal = commands.add_parser(
        "train-paysim-temporal",
        help="Train and evaluate the PaySim recipient sequence baseline and one temporal Transformer",
    )
    paysim_temporal.add_argument(
        "--archive",
        type=Path,
        default=Path("ml/data/paysim/paysim-author-release-v2.zip"),
        help="Path to the verified PaySim author-release archive",
    )
    paysim_temporal.add_argument(
        "--contract",
        type=Path,
        default=PAYSIM_CONTRACT_PATH,
        help="Phase 10 sequence-contract JSON path",
    )
    paysim_temporal.add_argument(
        "--artifacts",
        type=Path,
        default=Path("ml/artifacts/paysim-temporal-v1"),
        help="New experiment artifact directory (existing directories are never overwritten)",
    )

    train = commands.add_parser("train-xgboost", help="Train, validate, test, and save the XGBoost baseline")
    train.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    train.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/xgboost-v1"))

    random_forest = commands.add_parser(
        "train-random-forest",
        help="Train, validate, test, and save the Random Forest experiment",
    )
    random_forest.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    random_forest.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/random-forest-v1"))

    isolation_forest = commands.add_parser(
        "train-isolation-forest",
        help="Train, validate, test, and save the Isolation Forest anomaly baseline",
    )
    isolation_forest.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    isolation_forest.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/isolation-forest-v1"))

    selectors = commands.add_parser(
        "train-ensemble-selectors",
        help="Fit train-only XGBoost and Random Forest selectors and save validation scores",
    )
    selectors.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    selectors.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/ensemble-selectors-v1"))

    ensemble = commands.add_parser(
        "train-ensemble",
        help="Select a validation-only ensemble configuration and evaluate it on the held-out test partition",
    )
    ensemble.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    ensemble.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/ensemble-v1"))

    verify_ensemble = commands.add_parser(
        "verify-ensemble",
        help="Reproduce saved ensemble selection and held-out test metrics",
    )
    verify_ensemble.add_argument("--data", type=Path, default=Path("ml/data/raw/creditcard.csv"))
    verify_ensemble.add_argument("--artifacts", type=Path, default=Path("ml/artifacts/ensemble-v1"))
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "validate-ieee-cis":
        report = validate_ieee_cis(args.transactions, args.identity)
        serialized = json.dumps(report, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(serialized, encoding="utf-8")
        print(serialized, end="")
        return

    if args.command == "validate-paysim-sequences":
        report = validate_paysim_archive(args.archive)
        serialized = json.dumps(report, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(serialized, encoding="utf-8")
        print(serialized, end="")
        return

    if args.command == "materialize-paysim-sequences":
        report = materialize_paysim_sequence_report(args.archive, args.contract)
        serialized = json.dumps(report, indent=2) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
        print(serialized, end="")
        return

    if args.command == "train-paysim-temporal":
        from .paysim_temporal import train_and_evaluate_paysim_temporal

        manifest = train_and_evaluate_paysim_temporal(
            args.archive,
            args.artifacts,
            contract_path=args.contract,
        )
        print(json.dumps(manifest, indent=2, allow_nan=False))
        return

    if not args.data.is_file():
        raise SystemExit(
            f"Dataset file not found: {args.data}\n"
            "Download the public ULB/Worldline credit-card fraud CSV and place it at this path. "
            "The dataset is not bundled or generated by this project."
        )

    if args.command == "validate":
        cleaned, summary = validate_dataset(pd.read_csv(args.data))
        splits = chronological_split(cleaned)
        print(json.dumps({"dataset": summary.__dict__, "chronological_splits": [len(split) for split in splits]}, indent=2))
        return

    if args.command == "train-xgboost":
        from .pipeline import train_and_evaluate

        manifest = train_and_evaluate(args.data, args.artifacts)
    elif args.command == "train-random-forest":
        from .random_forest import train_and_evaluate_random_forest

        manifest = train_and_evaluate_random_forest(args.data, args.artifacts)
    elif args.command == "train-isolation-forest":
        from .isolation_forest import train_and_evaluate_isolation_forest

        manifest = train_and_evaluate_isolation_forest(args.data, args.artifacts)
    elif args.command == "train-ensemble":
        from .ensemble import run_ensemble_experiment

        manifest = run_ensemble_experiment(args.data, args.artifacts)
    elif args.command == "verify-ensemble":
        from .ensemble import verify_ensemble_artifacts

        manifest = verify_ensemble_artifacts(args.data, args.artifacts)
    else:
        from .selector_artifacts import train_selector_artifacts

        manifest = train_selector_artifacts(args.data, args.artifacts)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
