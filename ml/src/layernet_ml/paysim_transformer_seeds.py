"""PaySim temporal Transformer seed replication (experiment ``paysim-transformer-seeds-v1``).

Retrains the unchanged Phase 12 Transformer configuration with several seeds, selects each threshold on
validation only, freezes all thresholds, and only then scores the held-out test partition once. Existing
Phase 12/16 artifacts and reports are read, never written. See
``ml/reports/paysim-transformer-seeds-prereg-v1.md`` for the frozen design and analysis.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.metadata
import json
import math
import platform
import random
import subprocess
import time
from pathlib import Path
from typing import Any, Literal

import numpy as np
import scipy.stats
import torch
from torch import nn

from .evaluation import evaluate_scores
from .paysim_data import PAYSIM_ARCHIVE_SHA256, PaySimSequenceReader, open_paysim_sequence_reader
from .paysim_temporal import (
    TRANSFORMER_CONFIG,
    PaySimTemporalTransformer,
    _batch_iterator,
    _score_bundle,
    _training_class_counts,
    choose_validation_f1_threshold,
    sha256_file,
)

EXPERIMENT_ID = "paysim-transformer-seeds-v1"
CONFIG_PATH = Path("ml/reports/paysim-transformer-seeds-config-v1.json")
PREREG_PATH = Path("ml/reports/paysim-transformer-seeds-prereg-v1.md")
SOURCE_FILES = (
    "ml/src/layernet_ml/paysim_transformer_seeds.py",
    "ml/src/layernet_ml/paysim_temporal.py",
    "ml/src/layernet_ml/paysim_data.py",
    "ml/src/layernet_ml/evaluation.py",
)
# The Phase 12 configuration this experiment must reuse unchanged (copied from the Phase 12 report/manifest).
PHASE12_TRANSFORMER_CONFIG: dict[str, Any] = {
    "algorithm": "PyTorch TransformerEncoder binary classifier",
    "input_projection_dimension": 32,
    "positional_representation": "learned embedding over 17 left-padded history slots plus current-target slot",
    "layers": 1,
    "attention_heads": 2,
    "feedforward_dimension": 64,
    "dropout": 0.1,
    "pooling": "encoded current-target token at final sequence position",
    "output_head": "linear 32-to-1 logit; positive logit means more suspicious",
    "loss": "BCEWithLogitsLoss with training-only positive-class weight",
    "optimizer": "AdamW",
    "learning_rate": 0.001,
    "weight_decay": 0.0001,
    "gradient_clip_norm": 1.0,
    "batch_size": 2048,
    "epochs": 2,
    "cpu_threads": 4,
    "shuffle": "deterministic permutation within each streaming batch",
}
REPORTED_METRICS = (
    "average_precision",
    "pr_auc",
    "roc_auc",
    "precision_at_threshold",
    "recall_at_threshold",
    "f1_at_threshold",
)
COUNT_METRICS = ("true_positives", "true_negatives", "false_positives", "false_negatives")
SCORE_BATCH_SIZE = 8192


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _write_json(path: Path, value: Any) -> None:
    path.write_bytes((json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8"))


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout.strip()


def source_provenance() -> dict[str, Any]:
    return {
        "git_commit": _git("rev-parse", "HEAD"),
        "working_tree_status": _git("status", "--short", "--untracked-files=all"),
        "source_files": {name: sha256_file(Path(name)) for name in SOURCE_FILES},
    }


def runtime_metadata() -> dict[str, Any]:
    packages = ("numpy", "pandas", "scikit-learn", "scipy", "torch")
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "packages": {name: importlib.metadata.version(name) for name in packages},
        "torch_threads": int(TRANSFORMER_CONFIG["cpu_threads"]),
    }


def verify_preregistration(config_path: Path, prereg_path: Path) -> tuple[dict[str, Any], str, str]:
    """The preregistration must quote the exact configuration hash, and the model config must be unchanged."""
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config_hash = sha256_file(config_path)
    if f"Configuration SHA-256 (exact file bytes): `{config_hash}`" not in prereg_path.read_text(encoding="utf-8"):
        raise ValueError("Preregistration does not record the current configuration hash.")
    if config.get("experiment_id") != EXPERIMENT_ID:
        raise ValueError("Configuration experiment ID does not match this runner.")
    if TRANSFORMER_CONFIG != PHASE12_TRANSFORMER_CONFIG:
        raise ValueError("TRANSFORMER_CONFIG differs from the Phase 12 configuration this experiment must reuse.")
    if config["dataset"]["archive_sha256"] != PAYSIM_ARCHIVE_SHA256:
        raise ValueError("Configured archive hash differs from the pinned PaySim release.")
    return config, config_hash, sha256_file(prereg_path)


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(int(TRANSFORMER_CONFIG["cpu_threads"]))
    torch.use_deterministic_algorithms(True)


def train_transformer_seed(
    reader: PaySimSequenceReader, negative: int, positive: int, seed: int
) -> tuple[PaySimTemporalTransformer, list[float], list[float]]:
    """Phase 12 training loop (paysim_temporal._train_transformer) with the seed as a parameter."""
    seed_everything(seed)
    model = PaySimTemporalTransformer().cpu()
    loss_function = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([negative / positive], dtype=torch.float32))
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(TRANSFORMER_CONFIG["learning_rate"]),
        weight_decay=float(TRANSFORMER_CONFIG["weight_decay"]),
    )
    batch_size = int(TRANSFORMER_CONFIG["batch_size"])
    epochs = int(TRANSFORMER_CONFIG["epochs"])
    expected = int(next(s["customer_recipient_targets"] for s in reader.audit["splits"] if s["name"] == "train"))
    losses: list[float] = []
    seconds: list[float] = []
    for epoch in range(epochs):
        started = time.perf_counter()
        model.train()
        rng = np.random.default_rng(seed + epoch)
        total, seen = 0.0, 0
        for tokens, masks, labels in _batch_iterator(reader, "train", batch_size):
            permutation = rng.permutation(len(labels))
            optimizer.zero_grad(set_to_none=True)
            logits = model(torch.from_numpy(tokens[permutation]), torch.from_numpy(masks[permutation]))
            loss = loss_function(logits, torch.from_numpy(labels[permutation].astype(np.float32)))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), float(TRANSFORMER_CONFIG["gradient_clip_norm"]))
            optimizer.step()
            total += float(loss.detach()) * len(labels)
            seen += len(labels)
        if seen != expected:
            raise ValueError(f"Seed {seed} epoch {epoch + 1} yielded {seen} train targets; expected {expected}.")
        losses.append(total / seen)
        seconds.append(time.perf_counter() - started)
        print(f"  seed {seed} epoch {epoch + 1}/{epochs}: weighted loss {losses[-1]:.6f} ({seconds[-1]:.0f}s)", flush=True)
    model.eval()
    return model, losses, seconds


def save_transformer(path: Path, model: PaySimTemporalTransformer, seed: int, losses: list[float]) -> str:
    torch.save(
        {
            "state_dict": model.state_dict(),
            "configuration": TRANSFORMER_CONFIG,
            "random_seed": seed,
            "epoch_weighted_losses": losses,
        },
        path,
    )
    return sha256_file(path)


def load_transformer(path: Path, expected_sha256: str) -> PaySimTemporalTransformer:
    if sha256_file(path) != expected_sha256:
        raise ValueError(f"Saved Transformer hash changed: {path}")
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if payload.get("configuration") != TRANSFORMER_CONFIG:
        raise ValueError("Saved Transformer configuration does not match this experiment.")
    model = PaySimTemporalTransformer().cpu()
    model.load_state_dict(payload["state_dict"], strict=True)
    model.eval()
    return model


def score_split(
    reader: PaySimSequenceReader,
    split: Literal["validation", "test"],
    models: dict[int, PaySimTemporalTransformer],
) -> tuple[np.ndarray, dict[int, np.ndarray]]:
    """Score every seed's model in one pass over the split; labels are returned separately from scores."""
    labels_out: list[np.ndarray] = []
    scores_out: dict[int, list[np.ndarray]] = {seed: [] for seed in models}
    with torch.no_grad():
        for tokens, masks, labels in _batch_iterator(reader, split, SCORE_BATCH_SIZE):
            labels_out.append(labels)
            token_tensor, mask_tensor = torch.from_numpy(tokens), torch.from_numpy(masks)
            for seed, model in models.items():
                scores_out[seed].append(np.asarray(model(token_tensor, mask_tensor).cpu().numpy(), dtype=np.float64))
    labels = np.concatenate(labels_out)
    return labels, {seed: np.concatenate(values) for seed, values in scores_out.items()}


def evaluate(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, Any]:
    return evaluate_scores(labels, _score_bundle(None, "temporal_transformer", scores), threshold)


def check_reproduction(metrics: dict[str, Any], expected: dict[str, Any], *, atol: float = 1e-9) -> dict[str, Any]:
    """Compare seed-42 validation metrics with the Phase 12 values recorded in the replay report."""
    comparisons = {}
    for key, value in expected.items():
        actual = metrics[key]
        if key in COUNT_METRICS:
            match = int(actual) == int(value)
        else:
            match = math.isclose(float(actual), float(value), rel_tol=0.0, abs_tol=atol)
        comparisons[key] = {"expected": value, "actual": actual, "match": bool(match)}
    return {"matches": all(item["match"] for item in comparisons.values()), "comparisons": comparisons}


def describe(values: list[float]) -> dict[str, Any]:
    mean = float(np.mean(values))
    entry: dict[str, Any] = {"values": values, "mean": mean}
    if len(values) >= 2:
        sd = float(np.std(values, ddof=1))
        half = float(scipy.stats.t.ppf(0.975, df=len(values) - 1)) * sd / math.sqrt(len(values))
        entry.update(sample_standard_deviation=sd, descriptive_95_percent_student_t_interval=[mean - half, mean + half])
    return entry


def paired_comparison(transformer_ap: dict[int, float], comparator_ap: dict[int, float]) -> dict[str, Any]:
    seeds = sorted(transformer_ap)
    if seeds != sorted(comparator_ap):
        raise ValueError("Transformer and comparator seeds differ.")
    differences = [float(transformer_ap[s]) - float(comparator_ap[s]) for s in seeds]
    summary = describe(differences)
    interval = summary.get("descriptive_95_percent_student_t_interval")
    return {
        "metric": "test average_precision",
        "direction": "Transformer minus Phase 16 history-enabled SGD",
        "seeds": seeds,
        **summary,
        "interval_includes_zero": None if interval is None else bool(interval[0] <= 0.0 <= interval[1]),
        "interpretation": "descriptive seed variability on one fixed synthetic test split; no significance claim",
    }


def load_comparator(path: Path, expected_sha256: str, seeds: list[int]) -> dict[int, dict[str, Any]]:
    if sha256_file(path) != expected_sha256:
        raise ValueError("Phase 16 comparator manifest hash differs from the preregistration.")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    return {seed: manifest["runs"][str(seed)]["history_enabled"]["test_metrics"] for seed in seeds}


def run(archive_path: Path, contract_path: Path, output: Path, config_path: Path, prereg_path: Path) -> dict[str, Any]:
    config, config_hash, prereg_hash = verify_preregistration(config_path, prereg_path)
    if sha256_file(contract_path) != config["dataset"]["sequence_contract_sha256"]:
        raise ValueError("Sequence contract hash differs from the preregistration.")
    seeds = [int(seed) for seed in config["seeds"]]
    comparator = load_comparator(Path(config["comparator"]["path"]), config["comparator"]["sha256"], seeds)
    output.mkdir(parents=True, exist_ok=False)  # refuse to reuse or overwrite a run directory

    manifest: dict[str, Any] = {
        "experiment_id": EXPERIMENT_ID,
        "created_utc": _now(),
        "status": "started",
        "preregistration": {"config_path": str(config_path), "config_sha256": config_hash, "path": str(prereg_path), "sha256": prereg_hash},
        "source_provenance": source_provenance(),
        "runtime": runtime_metadata(),
        "transformer_configuration": TRANSFORMER_CONFIG,
        "seeds": seeds,
        "events": [],
    }
    manifest_path = output / "manifest.json"

    def record(event: str, **details: Any) -> None:
        manifest["events"].append({"utc": _now(), "event": event, **details})
        _write_json(manifest_path, manifest)

    try:
        record("verified_preregistration")
        reader = open_paysim_sequence_reader(archive_path, contract_path)
        negative, positive = _training_class_counts(reader)
        expected_targets = config["split"]["recipient_targets"]
        for split in reader.audit["splits"]:
            if int(split["customer_recipient_targets"]) != int(expected_targets[split["name"]]):
                raise ValueError(f"{split['name']} target count differs from the preregistration.")
        manifest["training"] = {"train_negative_targets": negative, "train_positive_targets": positive, "positive_class_weight": negative / positive, "seeds": {}}
        record("verified_dataset", archive_sha256=reader.audit["source"]["archive_sha256"])

        artifacts: dict[int, str] = {}
        for seed in seeds:
            print(f"Training seed {seed} on train targets only...", flush=True)
            model, losses, seconds = train_transformer_seed(reader, negative, positive, seed)
            seed_dir = output / f"seed-{seed}"
            seed_dir.mkdir()
            path = seed_dir / "temporal_transformer.pt"
            artifacts[seed] = save_transformer(path, model, seed, losses)
            manifest["training"]["seeds"][str(seed)] = {
                "artifact": str(path.relative_to(output)),
                "artifact_sha256": artifacts[seed],
                "epoch_weighted_losses": losses,
                "epoch_seconds": seconds,
            }
            record("trained_seed", seed=seed)

        loaded = {seed: load_transformer(output / f"seed-{seed}" / "temporal_transformer.pt", artifacts[seed]) for seed in seeds}
        print("Scoring validation and selecting thresholds...", flush=True)
        started = time.perf_counter()
        validation_labels, validation_scores = score_split(reader, "validation", loaded)
        validation_seconds = time.perf_counter() - started
        selection: dict[str, Any] = {}
        validation_metrics: dict[str, Any] = {}
        for seed in seeds:
            threshold, details = choose_validation_f1_threshold(validation_labels, validation_scores[seed])
            selection[str(seed)] = {"threshold": threshold, "selection": details, "artifact_sha256": artifacts[seed]}
            validation_metrics[str(seed)] = evaluate(validation_labels, validation_scores[seed], threshold)
        reproduction = check_reproduction(validation_metrics["42"], config["reproduction_check"]["expected_validation"]) if 42 in seeds else None

        freeze = {"experiment_id": EXPERIMENT_ID, "frozen_utc": _now(), "rule": "score >= threshold", "seeds": selection}
        _write_json(output / "selection-freeze.json", freeze)
        manifest.update(
            validation={"targets": int(len(validation_labels)), "positives": int(validation_labels.sum()), "scoring_seconds": validation_seconds, "metrics": validation_metrics},
            selection_freeze={"path": "selection-freeze.json", "sha256": sha256_file(output / "selection-freeze.json")},
            reproduction_check=reproduction,
        )
        record("thresholds_frozen", reproduction_matches=None if reproduction is None else reproduction["matches"])

        # First point at which test labels enter this experiment.
        print("Thresholds frozen; scoring the test partition once...", flush=True)
        record("test_opened")
        started = time.perf_counter()
        test_labels, test_scores = score_split(reader, "test", loaded)
        test_seconds = time.perf_counter() - started
        test_metrics = {str(seed): evaluate(test_labels, test_scores[seed], selection[str(seed)]["threshold"]) for seed in seeds}
        np.savez_compressed(output / "test-scores.npz", **{f"seed_{seed}": test_scores[seed] for seed in seeds})
        np.savez_compressed(output / "test-labels.npz", labels=test_labels.astype(np.int8))

        prevalence = {"validation": float(validation_labels.mean()), "test": float(test_labels.mean())}
        manifest.update(
            test={"targets": int(len(test_labels)), "positives": int(test_labels.sum()), "scoring_seconds": test_seconds, "metrics": test_metrics},
            prevalence=prevalence,
            analysis={
                "primary": paired_comparison(
                    {s: test_metrics[str(s)]["average_precision"] for s in seeds},
                    {s: comparator[s]["average_precision"] for s in seeds},
                ),
                "comparator_test_metrics": {str(s): comparator[s] for s in seeds},
                "transformer_across_seeds": {
                    split: {metric: describe([float(metrics[str(s)][metric]) for s in seeds]) for metric in REPORTED_METRICS}
                    for split, metrics in (("validation", validation_metrics), ("test", test_metrics))
                },
                "average_precision_lift": {
                    split: {str(s): float(metrics[str(s)]["average_precision"]) / prevalence[split] for s in seeds}
                    for split, metrics in (("validation", validation_metrics), ("test", test_metrics))
                },
            },
            outputs={
                "test_scores": {"path": "test-scores.npz", "sha256": sha256_file(output / "test-scores.npz")},
                "test_labels": {"path": "test-labels.npz", "sha256": sha256_file(output / "test-labels.npz")},
                "row_order": "reader iteration order of test recipient targets (same order as Phase 12 scoring)",
            },
            status="complete",
            completed_utc=_now(),
        )
        record("completed")
    except BaseException as error:  # record any failure, including interruption, before re-raising
        manifest["status"] = "failed"
        manifest["failure"] = {"type": type(error).__name__, "message": str(error)[:500]}
        record("failed")
        raise
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--archive", type=Path, default=Path("ml/data/paysim/paysim-author-release-v2.zip"))
    parser.add_argument("--contract", type=Path, default=Path("ml/reports/paysim-sequence-contract-v1.json"))
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/paysim-transformer-seeds-v1"))
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--prereg", type=Path, default=PREREG_PATH)
    args = parser.parse_args(argv)
    manifest = run(args.archive, args.contract, args.output, args.config, args.prereg)
    print(json.dumps({"status": manifest["status"], "primary": manifest["analysis"]["primary"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
