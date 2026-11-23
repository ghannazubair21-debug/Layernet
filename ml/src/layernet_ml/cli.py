from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
from pathlib import Path
import subprocess
import sys

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

    paysim_replay = commands.add_parser(
        "verify-paysim-temporal",
        help="Replay saved PaySim models and verify validation/test metrics without training",
    )
    paysim_replay.add_argument(
        "--archive",
        type=Path,
        default=Path("ml/data/paysim/paysim-author-release-v2.zip"),
        help="Path to the verified PaySim author-release archive",
    )
    paysim_replay.add_argument(
        "--contract",
        type=Path,
        default=PAYSIM_CONTRACT_PATH,
        help="Phase 10 sequence-contract JSON path",
    )
    paysim_replay.add_argument(
        "--artifacts",
        type=Path,
        default=Path("ml/artifacts/paysim-temporal-v1"),
        help="Existing temporal model artifacts to load (never modified)",
    )
    paysim_replay.add_argument(
        "--report",
        type=Path,
        default=Path("ml/reports/paysim-temporal-reproduction-v1.md"),
        help="New report path; an existing report is never overwritten",
    )

    paysim_export = commands.add_parser(
        "export-paysim-temporal-predictions",
        help="Replay saved PaySim models and export row-keyed test predictions without training",
    )
    paysim_export.add_argument(
        "--archive",
        type=Path,
        default=Path("ml/data/paysim/paysim-author-release-v2.zip"),
        help="Path to the verified PaySim author-release archive",
    )
    paysim_export.add_argument(
        "--contract",
        type=Path,
        default=PAYSIM_CONTRACT_PATH,
        help="Phase 10 sequence-contract JSON path",
    )
    paysim_export.add_argument(
        "--artifacts",
        type=Path,
        default=Path("ml/artifacts/paysim-temporal-v1"),
        help="Existing temporal model artifacts to load (never modified)",
    )
    paysim_export.add_argument(
        "--output",
        type=Path,
        default=Path("ml/artifacts/paysim-temporal-v1/test-predictions-v1.csv.gz"),
        help="New compressed row-level prediction file; an existing file is never overwritten",
    )
    paysim_export.add_argument(
        "--manifest",
        type=Path,
        default=Path("ml/artifacts/paysim-temporal-v1/test-predictions-v1.manifest.json"),
        help="New export provenance/validation manifest; an existing file is never overwritten",
    )
    paysim_export.add_argument(
        "--report",
        type=Path,
        default=Path("ml/reports/paysim-temporal-prediction-export-v1.md"),
        help="New concise research report; an existing file is never overwritten",
    )
    paysim_export.add_argument("--batch-size", type=int, default=8192)

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

    if args.command == "verify-paysim-temporal":
        from .paysim_temporal import PaySimReplayValidationError, replay_paysim_temporal_metrics

        if args.report.exists():
            raise SystemExit(f"Refusing to overwrite existing reproduction report: {args.report}")
        repo_root_result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=Path.cwd(),
            check=True,
            capture_output=True,
            text=True,
        )
        repo_root = Path(repo_root_result.stdout.strip())
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        working_tree = subprocess.run(
            ["git", "status", "--short", "--branch"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        environment = {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "packages": {
                name: importlib.metadata.version(name)
                for name in ("numpy", "pandas", "scikit-learn", "joblib", "torch")
            },
        }
        try:
            report = replay_paysim_temporal_metrics(
                args.archive,
                args.artifacts,
                contract_path=args.contract,
            )
        except PaySimReplayValidationError as error:
            report = error.report
            report["passed"] = False
            report["result"] = "BLOCKED: validation replay did not match; test evaluation was not run"
        else:
            report["result"] = "PASS" if report["passed"] else "FAIL"
        report["provenance"] = {
            "source_commit": commit,
            "working_tree_status_before_report": working_tree,
            "replay_command": subprocess.list2cmdline(
                [sys.executable, "-m", "layernet_ml.cli", *sys.argv[1:]]
            ),
            "environment": environment,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(_format_paysim_reproduction_report(report), encoding="utf-8")
        print(json.dumps(report, indent=2, allow_nan=False))
        if not report.get("passed", False):
            raise SystemExit(1)
        return

    if args.command == "export-paysim-temporal-predictions":
        from .paysim_prediction_export import export_paysim_temporal_predictions

        result = export_paysim_temporal_predictions(
            args.archive,
            args.artifacts,
            args.contract,
            args.output,
            args.manifest,
            args.report,
            batch_size=args.batch_size,
        )
        print(json.dumps(result, indent=2, allow_nan=False))
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


def _format_paysim_reproduction_report(report: dict[str, object]) -> str:
    """Render the compact, separate research-result record for a replay run."""
    provenance = report["provenance"]
    dataset = report["dataset"]
    replay = report["replay"]
    assert isinstance(provenance, dict) and isinstance(dataset, dict) and isinstance(replay, dict)
    lines = [
        "# PaySim Temporal Metric Reproduction",
        "",
        f"**Result:** {report['result']}",
        "",
        "## Provenance",
        "",
        f"- Source commit: `{provenance['source_commit']}`",
        "- Working-tree status before report creation:",
        "",
        "```text",
        str(provenance["working_tree_status_before_report"]),
        "```",
        f"- Replay command: `{provenance['replay_command']}`",
        f"- Python/platform: `{provenance['environment']['python']}` / `{provenance['environment']['platform']}`",
        f"- Packages: `{json.dumps(provenance['environment']['packages'], sort_keys=True)}`",
        f"- Dataset SHA-256: `{dataset['archive_sha256']}`",
        f"- Contract SHA-256: `{dataset['contract_sha256']}`",
        f"- Dataset/sequence/feature schemas: `{dataset['schema_version']}` / `"
        f"{dataset['sequence_contract_version']}` / `{dataset['feature_schema_version']}`",
        "",
        "| Model artifact | SHA-256 | Loaded |",
        "|---|---|---|",
    ]
    artifacts = report["artifacts"]
    assert isinstance(artifacts, dict)
    for name, entry in artifacts.items():
        lines.append(f"| `{name}` (`{entry['file']}`) | `{entry['sha256']}` | {entry['loaded']} |")
    lines.extend(
        [
            "",
            "## Leakage controls",
            "",
            f"- Training executed: `{replay['training_executed']}`",
            f"- Test-based selection: `{replay['test_based_selection']}`",
            f"- Label columns parsed during preflight: `{replay['preflight_label_columns_parsed']}`",
            f"- Validation stream row limit: `{replay['validation_stream_max_source_rows']}`",
            f"- Test stream opened only after validation checks passed: `{replay['test_label_stream_opened_after_validation_checks']}`",
            f"- Numeric tolerance: absolute `{replay['float_absolute_tolerance']}`, relative `{replay['float_relative_tolerance']}`; confusion counts exact.",
            "",
            "## Reproduced metrics",
            "",
            "Each cell shows `stored / replayed`; all ranking/operating metrics are compared, and counts must match exactly.",
            "",
            "| Split | Model | Threshold | PR-AUC | Average Precision | ROC-AUC | Precision | Recall | F1 | TP / TN / FP / FN | Match |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
        ]
    )
    split_names = ["validation"] + (["test"] if "test" in report else [])
    for split_name in split_names:
        split = report[split_name]
        assert isinstance(split, dict)
        metrics_by_model = split["metrics"]
        assert isinstance(metrics_by_model, dict)
        for name, comparison in metrics_by_model.items():
            metric_fields = comparison["metrics"]
            threshold = metric_fields["threshold"]
            if split_name == "validation":
                selected = report["validation"]["thresholds"][name]
                threshold_display = f"{selected['manifest_threshold']:.17g} / {selected['reproduced']:.17g}"
            else:
                threshold_display = f"{threshold['stored']:.17g} / {threshold['reproduced']:.17g}"
            confusion = " / ".join(
                f"{metric_fields[key]['stored']} / {metric_fields[key]['reproduced']}"
                for key in ("true_positives", "true_negatives", "false_positives", "false_negatives")
            )
            pair = lambda key: f"{metric_fields[key]['stored']:.12g} / {metric_fields[key]['reproduced']:.12g}"
            lines.append(
                f"| {split_name} | `{name}` | {threshold_display} | {pair('pr_auc')} | {pair('average_precision')} | "
                f"{pair('roc_auc')} | {pair('precision_at_threshold')} | {pair('recall_at_threshold')} | "
                f"{pair('f1_at_threshold')} | {confusion} | {comparison['matches']} |"
            )
    lines.extend(
        [
            "",
            "## Outcome and limitations",
            "",
            f"- Validation targets: `{report['validation']['target_count']}`; validation checks passed: `{report['validation']['passed']}`.",
            f"- Test targets: `{report.get('test', {}).get('target_count', 'not evaluated')}`.",
            f"- Final result passed: `{report.get('passed', False)}`.",
            "- No row-level prediction arrays were persisted; metrics were recomputed from saved models and streamed inputs.",
            "- The PaySim archive is synthetic and this replay verifies only the saved recipient-history experiment on its fixed chronological split.",
            "",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    main()
