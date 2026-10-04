from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import platform
import random
import tempfile
from pathlib import Path
from typing import Any, Iterable, Literal

import joblib
import numpy as np
import torch
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import precision_recall_curve
from torch import nn

from .contracts import ExperimentConfig, ModelScores
from .evaluation import evaluate_scores
from .paysim_data import (
    PAYSIM_ARCHIVE_SHA256,
    PAYSIM_DATASET_SCHEMA_VERSION,
    PAYSIM_MAX_SEQUENCE_LENGTH,
    PAYSIM_SEQUENCE_SCHEMA_VERSION,
    PAYSIM_TYPES,
    SPLIT_BOUNDARIES,
    PaySimCausalExample,
    PaySimSequenceReader,
    open_paysim_sequence_reader,
)

TEMPORAL_FEATURE_SCHEMA_VERSION = "layernet-paysim-causal-model-input.v1"
TEMPORAL_ARTIFACT_DIRECTORY = Path("ml/artifacts/paysim-temporal-v1")
TEMPORAL_RANDOM_SEED = 42
HISTORY_BUCKET_FEATURES = tuple(f"log1p_count_{transaction_type}" for transaction_type in PAYSIM_TYPES) + (
    "mean_log1p_amount_div_20",
    "step_gap_fraction_of_743",
)
MODEL_INPUT_WIDTH = len(HISTORY_BUCKET_FEATURES)
MODEL_INPUT_FEATURES = HISTORY_BUCKET_FEATURES
SEQUENCE_TOKEN_COUNT = PAYSIM_MAX_SEQUENCE_LENGTH + 1
SGD_CONFIG: dict[str, Any] = {
    "algorithm": "sklearn.linear_model.SGDClassifier",
    "loss": "log_loss",
    "penalty": "l2",
    "alpha": 0.0001,
    "learning_rate": "optimal",
    "average": True,
    "epochs": 1,
    "batch_size": 4096,
    "shuffle": "deterministic permutation within each streaming batch",
}
TRANSFORMER_CONFIG: dict[str, Any] = {
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
MODEL_KEYS = ("current_only_control", "temporal_baseline", "temporal_transformer")
METRIC_KEYS = (
    "pr_auc",
    "average_precision",
    "roc_auc",
    "precision_at_threshold",
    "recall_at_threshold",
    "f1_at_threshold",
    "true_positives",
    "true_negatives",
    "false_positives",
    "false_negatives",
    "threshold",
)

TransactionType = Literal["CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"]


class PaySimTemporalTransformer(nn.Module):
    """Small sequence classifier over prior step-bucket set tokens and the current target token."""

    def __init__(self) -> None:
        super().__init__()
        dimension = int(TRANSFORMER_CONFIG["input_projection_dimension"])
        self.input_projection = nn.Linear(MODEL_INPUT_WIDTH, dimension)
        self.position_embedding = nn.Embedding(SEQUENCE_TOKEN_COUNT, dimension)
        layer = nn.TransformerEncoderLayer(
            d_model=dimension,
            nhead=int(TRANSFORMER_CONFIG["attention_heads"]),
            dim_feedforward=int(TRANSFORMER_CONFIG["feedforward_dimension"]),
            dropout=float(TRANSFORMER_CONFIG["dropout"]),
            activation="gelu",
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=int(TRANSFORMER_CONFIG["layers"]))
        self.output_head = nn.Linear(dimension, 1)

    def forward(self, tokens: torch.Tensor, padding_mask: torch.Tensor) -> torch.Tensor:
        if tokens.ndim != 3 or tuple(tokens.shape[1:]) != (SEQUENCE_TOKEN_COUNT, MODEL_INPUT_WIDTH):
            raise ValueError("Transformer input must have shape (batch, 18, 7).")
        if padding_mask.shape != tokens.shape[:2] or padding_mask.dtype != torch.bool:
            raise ValueError("Transformer padding mask must be boolean with shape (batch, 18).")
        if padding_mask[:, -1].any():
            raise ValueError("The current-target token cannot be masked.")
        positions = torch.arange(SEQUENCE_TOKEN_COUNT, device=tokens.device).unsqueeze(0)
        projected = self.input_projection(tokens) + self.position_embedding(positions)
        encoded = self.encoder(projected, src_key_padding_mask=padding_mask)
        return self.output_head(encoded[:, -1, :]).squeeze(-1)


def encode_sequence_example(example: PaySimCausalExample) -> tuple[np.ndarray, np.ndarray]:
    """Encode allowed fields only; labels and entity IDs remain outside the model input."""
    if len(example.history) > PAYSIM_MAX_SEQUENCE_LENGTH:
        raise ValueError("Sequence history exceeds the accepted 17-bucket cap.")
    tokens = np.zeros((SEQUENCE_TOKEN_COUNT, MODEL_INPUT_WIDTH), dtype=np.float32)
    padding_mask = np.zeros(SEQUENCE_TOKEN_COUNT, dtype=np.bool_)
    padding_count = PAYSIM_MAX_SEQUENCE_LENGTH - len(example.history)
    padding_mask[:padding_count] = True

    type_index = {name: index for index, name in enumerate(PAYSIM_TYPES)}
    for position, bucket in enumerate(example.history, start=padding_count):
        if bucket.step_gap <= 0:
            raise ValueError("History must be strictly earlier than its target.")
        if not bucket.events:
            raise ValueError("A historical step bucket must contain at least one transaction.")
        counts = np.zeros(len(PAYSIM_TYPES), dtype=np.float32)
        log_amounts: list[float] = []
        for event in bucket.events:
            if event.transaction_type not in type_index or not math.isfinite(event.amount) or event.amount < 0:
                raise ValueError("Historical event contains an invalid allowed feature.")
            counts[type_index[event.transaction_type]] += 1.0
            log_amounts.append(math.log1p(event.amount))
        tokens[position, : len(PAYSIM_TYPES)] = np.log1p(counts)
        tokens[position, len(PAYSIM_TYPES)] = float(np.mean(log_amounts)) / 20.0
        tokens[position, -1] = bucket.step_gap / 743.0

    if example.target_type not in type_index or not math.isfinite(example.target_amount) or example.target_amount < 0:
        raise ValueError("Current transaction contains an invalid allowed feature.")
    current_position = PAYSIM_MAX_SEQUENCE_LENGTH
    tokens[current_position, type_index[example.target_type]] = math.log1p(1.0)
    tokens[current_position, len(PAYSIM_TYPES)] = math.log1p(example.target_amount) / 20.0
    # Target label, entity ID, rule flag, balances, and all identifiers are deliberately not encoded.
    return tokens, padding_mask


def encode_sequence_batch(examples: list[PaySimCausalExample]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if not examples:
        raise ValueError("Cannot encode an empty sequence batch.")
    encoded = [encode_sequence_example(example) for example in examples]
    tokens = np.stack([item[0] for item in encoded]).astype(np.float32, copy=False)
    masks = np.stack([item[1] for item in encoded]).astype(np.bool_, copy=False)
    labels = np.asarray([example.target_label for example in examples], dtype=np.int64)
    if not np.isin(labels, (0, 1)).all():
        raise ValueError("Sequence targets must be binary labels kept separately from input tokens.")
    return tokens, masks, labels


def make_sgd_classifier(positive_class_weight: float, *, seed: int = TEMPORAL_RANDOM_SEED) -> SGDClassifier:
    if not math.isfinite(positive_class_weight) or positive_class_weight <= 0:
        raise ValueError("positive_class_weight must be finite and positive.")
    return SGDClassifier(
        loss="log_loss",
        penalty="l2",
        alpha=float(SGD_CONFIG["alpha"]),
        learning_rate="optimal",
        average=True,
        shuffle=True,
        class_weight={0: 1.0, 1: positive_class_weight},
        random_state=seed,
    )


def choose_validation_f1_threshold(labels: np.ndarray, scores: np.ndarray) -> tuple[float, dict[str, Any]]:
    """Choose a threshold from validation labels only; ties prefer precision, then higher threshold."""
    actual = np.asarray(labels, dtype=np.int64)
    values = np.asarray(scores, dtype=np.float64)
    if actual.ndim != 1 or values.ndim != 1 or len(actual) != len(values) or not len(actual):
        raise ValueError("Validation labels and scores must be aligned one-dimensional arrays.")
    if not np.isin(actual, (0, 1)).all() or set(actual.tolist()) != {0, 1}:
        raise ValueError("Validation threshold selection requires both binary classes.")
    if not np.isfinite(values).all():
        raise ValueError("Validation scores must be finite.")
    precision, recall, thresholds = precision_recall_curve(actual, values)
    if not len(thresholds):
        raise ValueError("Validation scores do not provide a usable decision threshold.")
    precision_at_threshold = precision[:-1]
    recall_at_threshold = recall[:-1]
    f1 = np.divide(
        2.0 * precision_at_threshold * recall_at_threshold,
        precision_at_threshold + recall_at_threshold,
        out=np.zeros_like(precision_at_threshold),
        where=(precision_at_threshold + recall_at_threshold) > 0,
    )
    maximum = float(np.max(f1))
    candidates = np.flatnonzero(f1 == maximum)
    selected = max(candidates, key=lambda index: (precision_at_threshold[index], thresholds[index]))
    threshold = float(thresholds[int(selected)])
    return threshold, {
        "source_split": "validation",
        "metric": "F1",
        "procedure": "maximize validation F1 over precision_recall_curve thresholds; ties prefer higher precision, then higher threshold",
        "validation_f1_at_selected_threshold": maximum,
        "validation_precision_at_selected_threshold": float(precision_at_threshold[int(selected)]),
        "selected_threshold": threshold,
    }


def _batch_iterator(
    reader: PaySimSequenceReader,
    split: Literal["train", "validation", "test"],
    batch_size: int,
    *,
    shuffle_seed: int | None = None,
) -> Iterable[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    examples: list[PaySimCausalExample] = []
    rng = np.random.default_rng(shuffle_seed) if shuffle_seed is not None else None

    def emit() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        batch = examples.copy()
        if rng is not None:
            order = rng.permutation(len(batch))
            batch = [batch[int(index)] for index in order]
        return encode_sequence_batch(batch)

    for example in reader.iter_examples({split}):
        examples.append(example)
        if len(examples) == batch_size:
            yield emit()
            examples.clear()
    if examples:
        yield emit()


def _training_class_counts(reader: PaySimSequenceReader) -> tuple[int, int]:
    train_split = next(split for split in reader.audit["splits"] if split["name"] == "train")
    positive = int(train_split["customer_recipient_fraud_targets"])
    negative = int(train_split["customer_recipient_nonfraud_targets"])
    if positive <= 0 or negative <= 0:
        raise ValueError("PaySim train recipient targets must contain both fraud and non-fraud labels.")
    return negative, positive


def _train_linear_baselines(reader: PaySimSequenceReader, negative: int, positive: int) -> dict[str, SGDClassifier]:
    weight = negative / positive
    current_only = make_sgd_classifier(weight, seed=TEMPORAL_RANDOM_SEED)
    temporal = make_sgd_classifier(weight, seed=TEMPORAL_RANDOM_SEED)
    classes = np.asarray([0, 1], dtype=np.int64)
    row_count = 0
    print("Training current-only control and sequence-aware SGD baseline on train targets...", flush=True)
    for tokens, _padding, labels in _batch_iterator(
        reader, "train", int(SGD_CONFIG["batch_size"]), shuffle_seed=TEMPORAL_RANDOM_SEED
    ):
        current_features = tokens[:, -1, :]
        sequence_features = tokens.reshape(len(tokens), -1)
        current_only.partial_fit(current_features, labels, classes=classes if row_count == 0 else None)
        temporal.partial_fit(sequence_features, labels, classes=classes if row_count == 0 else None)
        row_count += len(labels)
    expected = int(next(split["customer_recipient_targets"] for split in reader.audit["splits"] if split["name"] == "train"))
    if row_count != expected:
        raise ValueError(f"Sequence train stream yielded {row_count} targets; expected {expected}.")
    return {"current_only_control": current_only, "temporal_baseline": temporal}


def _seed_torch(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(int(TRANSFORMER_CONFIG["cpu_threads"]))
    torch.use_deterministic_algorithms(True)


def _train_transformer(reader: PaySimSequenceReader, negative: int, positive: int) -> PaySimTemporalTransformer:
    _seed_torch(TEMPORAL_RANDOM_SEED)
    model = PaySimTemporalTransformer().cpu()
    positive_weight = torch.tensor([negative / positive], dtype=torch.float32)
    loss_function = nn.BCEWithLogitsLoss(pos_weight=positive_weight)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(TRANSFORMER_CONFIG["learning_rate"]),
        weight_decay=float(TRANSFORMER_CONFIG["weight_decay"]),
    )
    batch_size = int(TRANSFORMER_CONFIG["batch_size"])
    epochs = int(TRANSFORMER_CONFIG["epochs"])
    expected = int(next(split["customer_recipient_targets"] for split in reader.audit["splits"] if split["name"] == "train"))
    epoch_losses: list[float] = []
    print("Training one-layer temporal Transformer on train targets only...", flush=True)
    for epoch in range(epochs):
        model.train()
        rng = np.random.default_rng(TEMPORAL_RANDOM_SEED + epoch)
        total_loss = 0.0
        rows_seen = 0
        for tokens, masks, labels in _batch_iterator(reader, "train", batch_size):
            permutation = rng.permutation(len(labels))
            token_tensor = torch.from_numpy(tokens[permutation])
            mask_tensor = torch.from_numpy(masks[permutation])
            label_tensor = torch.from_numpy(labels[permutation].astype(np.float32))
            optimizer.zero_grad(set_to_none=True)
            logits = model(token_tensor, mask_tensor)
            loss = loss_function(logits, label_tensor)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), float(TRANSFORMER_CONFIG["gradient_clip_norm"]))
            optimizer.step()
            total_loss += float(loss.detach()) * len(labels)
            rows_seen += len(labels)
        if rows_seen != expected:
            raise ValueError(f"Transformer train epoch yielded {rows_seen} targets; expected {expected}.")
        epoch_losses.append(total_loss / rows_seen)
        print(f"Transformer epoch {epoch + 1}/{epochs} complete; train weighted loss={epoch_losses[-1]:.6f}", flush=True)
    model.eval()
    model._layernet_epoch_losses = epoch_losses  # type: ignore[attr-defined]
    return model


def _load_transformer(path: Path) -> tuple[PaySimTemporalTransformer, list[float]]:
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if payload.get("configuration") != TRANSFORMER_CONFIG:
        raise ValueError("Saved Transformer configuration does not match this experiment implementation.")
    model = PaySimTemporalTransformer().cpu()
    model.load_state_dict(payload["state_dict"], strict=True)
    model.eval()
    return model, [float(value) for value in payload.get("epoch_weighted_losses", [])]


def _predict_batches(
    reader: PaySimSequenceReader,
    split: Literal["validation", "test"],
    models: dict[str, Any],
    *,
    batch_size: int = 8192,
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    labels_out: list[np.ndarray] = []
    scores_out: dict[str, list[np.ndarray]] = {name: [] for name in MODEL_KEYS}
    models["temporal_transformer"].eval()
    with torch.no_grad():
        for tokens, masks, labels in _batch_iterator(reader, split, batch_size):
            labels_out.append(labels)
            values = tokens.reshape(len(tokens), -1)
            scores_out["current_only_control"].append(
                np.asarray(models["current_only_control"].decision_function(tokens[:, -1, :]), dtype=np.float64)
            )
            scores_out["temporal_baseline"].append(
                np.asarray(models["temporal_baseline"].decision_function(values), dtype=np.float64)
            )
            logits = models["temporal_transformer"](
                torch.from_numpy(tokens), torch.from_numpy(masks)
            ).cpu().numpy()
            scores_out["temporal_transformer"].append(np.asarray(logits, dtype=np.float64))
    labels = np.concatenate(labels_out) if labels_out else np.empty(0, dtype=np.int64)
    scores = {
        name: np.concatenate(values) if values else np.empty(0, dtype=np.float64)
        for name, values in scores_out.items()
    }
    return labels, scores


def _score_bundle(estimator: Any, model_name: str, values: np.ndarray) -> ModelScores:
    return ModelScores(
        values=values,
        score_meaning=f"Uncalibrated {model_name} fraud ranking score; higher indicates greater suspicion.",
        calibrated_probability=False,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_temporal_artifact_manifest(artifact_directory: Path) -> dict[str, Any]:
    manifest_path = artifact_directory / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Temporal experiment manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("dataset", {}).get("archive_sha256") != PAYSIM_ARCHIVE_SHA256:
        raise ValueError("Temporal manifest does not identify the pinned PaySim source archive.")
    if manifest.get("sequence_contract_version") != PAYSIM_SEQUENCE_SCHEMA_VERSION:
        raise ValueError("Temporal manifest sequence contract version is inconsistent.")
    if manifest.get("feature_schema_version") != TEMPORAL_FEATURE_SCHEMA_VERSION:
        raise ValueError("Temporal manifest feature schema version is inconsistent.")
    if manifest.get("split_boundaries") != {
        name: {"step_start": bounds[0], "step_end": bounds[1]} for name, bounds in SPLIT_BOUNDARIES.items()
    }:
        raise ValueError("Temporal manifest split boundaries differ from the accepted sequence contract.")
    models = manifest.get("models")
    if not isinstance(models, dict) or set(models) != set(MODEL_KEYS):
        raise ValueError("Temporal manifest must contain the two baselines and one Transformer.")
    for name, model in models.items():
        artifact_name = model.get("artifact")
        if not isinstance(artifact_name, str) or Path(artifact_name).name != artifact_name:
            raise ValueError(f"Temporal model artifact path is invalid for {name}.")
        artifact_path = artifact_directory / artifact_name
        if not artifact_path.is_file() or sha256_file(artifact_path) != model.get("artifact_sha256"):
            raise ValueError(f"Temporal model artifact hash is missing or inconsistent for {name}.")
        if model.get("threshold_selection", {}).get("source_split") != "validation":
            raise ValueError(f"Temporal decision threshold was not recorded as validation-selected for {name}.")
        if float(model.get("threshold", math.nan)) != float(model["threshold_selection"]["selected_threshold"]):
            raise ValueError(f"Temporal threshold and selection record differ for {name}.")
        for metric_name in ("validation_metrics", "test_metrics"):
            metrics = model.get(metric_name)
            if not isinstance(metrics, dict) or set(METRIC_KEYS).difference(metrics):
                raise ValueError(f"Temporal {metric_name} are incomplete for {name}.")
            if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in metrics.values()):
                raise ValueError(f"Temporal {metric_name} contain a non-finite or non-numeric value for {name}.")
            if float(metrics["threshold"]) != float(model["threshold"]):
                raise ValueError(f"Temporal {metric_name} threshold differs from the frozen threshold for {name}.")
    return manifest


def _manifest_model(
    name: str,
    artifact_name: str,
    artifact_path: Path,
    configuration: dict[str, Any],
    threshold: float,
    selection: dict[str, Any],
    validation_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    *,
    score_semantics: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "model_family": "transformer" if name == "temporal_transformer" else "sequence_baseline",
        "artifact": artifact_name,
        "artifact_sha256": sha256_file(artifact_path),
        "configuration": configuration,
        "threshold": threshold,
        "threshold_selection": selection,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
        "score_semantics": score_semantics,
        "calibrated_probability": False,
    }


def train_and_evaluate_paysim_temporal(
    archive_path: Path,
    artifact_directory: Path = TEMPORAL_ARTIFACT_DIRECTORY,
    *,
    contract_path: Path,
) -> dict[str, Any]:
    """Train sequence baselines and one small Transformer, select thresholds on validation, evaluate test once."""
    artifact_directory = artifact_directory.resolve()
    if artifact_directory.exists():
        raise FileExistsError(f"Refusing to overwrite existing temporal experiment artifacts: {artifact_directory}")
    artifact_directory.parent.mkdir(parents=True, exist_ok=True)
    print("Validating pinned PaySim archive and Phase 10 sequence contract...", flush=True)
    reader = open_paysim_sequence_reader(archive_path, contract_path)
    negative, positive = _training_class_counts(reader)
    train_weight = negative / positive
    train_expected = int(next(part["customer_recipient_targets"] for part in reader.audit["splits"] if part["name"] == "train"))
    print(
        f"PaySim source verified; train recipient targets={train_expected}, positive-class weight={train_weight:.6f}.",
        flush=True,
    )

    with tempfile.TemporaryDirectory(prefix=".paysim-temporal-", dir=artifact_directory.parent) as temporary:
        staging = Path(temporary)
        print("Fitting train-only linear baselines...", flush=True)
        linear_models = _train_linear_baselines(reader, negative, positive)
        current_path = staging / "current_only_control.joblib"
        baseline_path = staging / "temporal_sgd_baseline.joblib"
        joblib.dump(linear_models["current_only_control"], current_path)
        joblib.dump(linear_models["temporal_baseline"], baseline_path)

        transformer = _train_transformer(reader, negative, positive)
        transformer_path = staging / "temporal_transformer.pt"
        torch.save(
            {
                "state_dict": transformer.state_dict(),
                "configuration": TRANSFORMER_CONFIG,
                "epoch_weighted_losses": transformer._layernet_epoch_losses,  # type: ignore[attr-defined]
            },
            transformer_path,
        )

        # Reload saved artifacts before any validation or test scoring.
        loaded_models: dict[str, Any] = {
            "current_only_control": joblib.load(current_path),
            "temporal_baseline": joblib.load(baseline_path),
        }
        loaded_transformer, epoch_losses = _load_transformer(transformer_path)
        loaded_models["temporal_transformer"] = loaded_transformer

        print("Selecting each operating threshold on validation only...", flush=True)
        validation_labels, validation_scores = _predict_batches(reader, "validation", loaded_models)
        thresholds: dict[str, float] = {}
        selections: dict[str, dict[str, Any]] = {}
        validation_metrics: dict[str, dict[str, Any]] = {}
        for name in MODEL_KEYS:
            threshold, selection = choose_validation_f1_threshold(validation_labels, validation_scores[name])
            thresholds[name] = threshold
            selections[name] = selection
            validation_metrics[name] = evaluate_scores(
                validation_labels,
                _score_bundle(loaded_models[name], name, validation_scores[name]),
                threshold,
            )

        # This is the first point at which test target labels enter experiment evaluation.
        print("Thresholds frozen; evaluating saved models once on the held-out test partition...", flush=True)
        test_labels, test_scores = _predict_batches(reader, "test", loaded_models)
        test_metrics = {
            name: evaluate_scores(
                test_labels,
                _score_bundle(loaded_models[name], name, test_scores[name]),
                thresholds[name],
            )
            for name in MODEL_KEYS
        }

        train_configuration = {
            **SGD_CONFIG,
            "random_seed": TEMPORAL_RANDOM_SEED,
            "class_weight_strategy": "class_weighted log-loss; weights computed only from train recipient targets",
            "class_weight": {"0": 1.0, "1": train_weight},
            "train_negative_targets": negative,
            "train_positive_targets": positive,
            "train_rows_seen": train_expected,
            "input_dimension": SEQUENCE_TOKEN_COUNT * MODEL_INPUT_WIDTH,
            "current_only_input_dimension": MODEL_INPUT_WIDTH,
        }
        transformer_configuration = {
            **TRANSFORMER_CONFIG,
            "random_seed": TEMPORAL_RANDOM_SEED,
            "class_weight_strategy": "BCEWithLogitsLoss pos_weight computed only from train recipient targets",
            "positive_class_weight": train_weight,
            "train_negative_targets": negative,
            "train_positive_targets": positive,
            "train_rows_seen_per_epoch": train_expected,
            "epoch_weighted_losses": epoch_losses,
            "device": "cpu",
            "input_shape": [SEQUENCE_TOKEN_COUNT, MODEL_INPUT_WIDTH],
        }
        model_records = {
            "current_only_control": _manifest_model(
                "current_only_control",
                current_path.name,
                current_path,
                {**train_configuration, "input_definition": "current transaction token only; ablation control"},
                thresholds["current_only_control"],
                selections["current_only_control"],
                validation_metrics["current_only_control"],
                test_metrics["current_only_control"],
                score_semantics="Uncalibrated linear SGD decision margin; higher indicates greater suspicion.",
            ),
            "temporal_baseline": _manifest_model(
                "temporal_baseline",
                baseline_path.name,
                baseline_path,
                {**train_configuration, "input_definition": "flattened 17 prior step-bucket tokens plus current token"},
                thresholds["temporal_baseline"],
                selections["temporal_baseline"],
                validation_metrics["temporal_baseline"],
                test_metrics["temporal_baseline"],
                score_semantics="Uncalibrated linear SGD decision margin; higher indicates greater suspicion.",
            ),
            "temporal_transformer": _manifest_model(
                "temporal_transformer",
                transformer_path.name,
                transformer_path,
                transformer_configuration,
                thresholds["temporal_transformer"],
                selections["temporal_transformer"],
                validation_metrics["temporal_transformer"],
                test_metrics["temporal_transformer"],
                score_semantics="Uncalibrated Transformer fraud logit; higher indicates greater suspicion.",
            ),
        }
        experiment = ExperimentConfig(
            experiment_id="paysim-recipient-temporal-v1",
            model_families=("sequence_baseline", "transformer"),
            input_modality="sequence",
            dataset_schema_version=PAYSIM_DATASET_SCHEMA_VERSION,
            feature_schema_version=TEMPORAL_FEATURE_SCHEMA_VERSION,
            random_seed=TEMPORAL_RANDOM_SEED,
        )
        split_metadata = [
            {
                "name": part["name"],
                "step_start": part["step_start"],
                "step_end": part["step_end"],
                "source_rows": part["rows"],
                "recipient_targets": part["customer_recipient_targets"],
                "fraud_targets": part["customer_recipient_fraud_targets"],
                "nonfraud_targets": part["customer_recipient_nonfraud_targets"],
                "targets_with_history": part["targets_with_prior_history"],
            }
            for part in reader.audit["splits"]
        ]
        manifest: dict[str, Any] = {
            "experiment": experiment.to_dict(),
            "experiment_status": "completed",
            "dataset": {
                "name": "PaySim synthetic mobile-money transactions; C-prefixed recipient histories only",
                "source_archive": str(archive_path),
                "archive_sha256": reader.audit["source"]["archive_sha256"],
                "csv_member": reader.audit["source"]["csv_member"],
                "source_release": reader.audit["source"]["release"],
                "dataset_schema_version": PAYSIM_DATASET_SCHEMA_VERSION,
                "sequence_contract_version": PAYSIM_SEQUENCE_SCHEMA_VERSION,
                "source_row_count": reader.audit["schema"]["row_count"],
                "target": "isFraud for the current recipient transaction; never an input feature",
                "entity": "nameDest values beginning with C; recipient-side, not sender-personalized",
            },
            "sequence_contract_version": PAYSIM_SEQUENCE_SCHEMA_VERSION,
            "feature_schema_version": TEMPORAL_FEATURE_SCHEMA_VERSION,
            "feature_definition": {
                "allowed_source_fields": ["type", "amount", "step gap to target"],
                "sequence_unit": "17 distinct prior step buckets plus one current-target token",
                "bucket_type_channels": [
                    f"log1p count of {transaction_type} events in the simultaneous bucket"
                    for transaction_type in PAYSIM_TYPES
                ],
                "bucket_amount_channel": "mean(log1p(amount)) divided by 20 across events in a simultaneous bucket",
                "bucket_time_channel": "strictly positive step_gap_to_target divided by 743",
                "current_token": "log1p count=1 for the current type, log1p(current amount)/20, zero gap",
                "derived_aggregation_justification": "Count/log aggregation encodes the multiset of allowed type and amount fields within a simultaneous step bucket without asserting within-step ordering.",
                "padding": "left-pad history to 17 step buckets with zero tokens; padding mask marks them; current token is always unmasked",
                "history_order": "ascending source step, oldest retained bucket first; current target is the final token",
                "entity_identifier_is_model_feature": False,
                "excluded_features": list(reader.contract["sequence_contract"]["excluded_features"]),
                "input_channel_names": list(MODEL_INPUT_FEATURES),
                "input_width": MODEL_INPUT_WIDTH,
                "learned_preprocessing": "none; log1p transforms and fixed divisors are deterministic, non-learned transforms",
            },
            "split_strategy": reader.audit["split_strategy"],
            "split_boundaries": {
                name: {"step_start": bounds[0], "step_end": bounds[1]}
                for name, bounds in SPLIT_BOUNDARIES.items()
            },
            "splits": split_metadata,
            "models": model_records,
            "leakage_controls": {
                "all_training_examples_in_train_steps_only": True,
                "validation_and_test_history_uses_only_strictly_earlier_steps": True,
                "same_step_transactions_are_not_history": True,
                "current_label_and_historical_labels_are_not_inputs": True,
                "rule_flags_balances_and_entity_ids_are_not_inputs": True,
                "learned_preprocessing_fitted_on_train_only": "none; input transforms are fixed and deterministic",
                "class_weight_source": "train C-recipient target labels only",
                "threshold_selection": "each model's threshold selected independently on validation F1 only",
                "test_labels_used_for_selection": False,
                "test_evaluation_order": "all model artifacts were saved and reloaded; validation thresholds were frozen before opening the test sequence stream",
                "test_partition_used_once_for_final_measurement": True,
            },
            "environment": {
                "python": platform.python_version(),
                "packages": {
                    package: importlib.metadata.version(package)
                    for package in ("numpy", "pandas", "scikit-learn", "joblib", "torch")
                },
                "platform": platform.platform(),
            },
            "comparison_scope": "descriptive comparison on this PaySim chronological test split only; no claim beyond this synthetic recipient-history setup",
        }
        (staging / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        verify_temporal_artifact_manifest(staging)
        staging.rename(artifact_directory)

    return verify_temporal_artifact_manifest(artifact_directory)
