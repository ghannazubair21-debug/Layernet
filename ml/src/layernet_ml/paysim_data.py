from __future__ import annotations

import hashlib
import json
import math
import struct
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Literal

import numpy as np
import pandas as pd

PAYSIM_ARCHIVE_SHA256 = "f7eef9ffad5cfa64a034143a5c9b30491d189420b273d5ad5723ca40b596613d"
PAYSIM_RELEASE_VERSION = "kaggle-author-release-v2"
PAYSIM_DATASET_SCHEMA_VERSION = "layernet-paysim-release-v2.schema.v1"
PAYSIM_SEQUENCE_SCHEMA_VERSION = "layernet-paysim-c-recipient-causal-sequence.v1"
PAYSIM_REPRESENTATION_VERSION = "layernet-paysim-ragged-step-buckets.v1"
PAYSIM_CSV_MEMBER = "PS_20174392719_1491204439457_log.csv"
PAYSIM_CONTRACT_PATH = Path("ml/reports/paysim-sequence-contract-v1.json")
PAYSIM_SEQUENCE_REPORT_PATH = Path("ml/reports/paysim-sequence-materialization-v1.json")
PAYSIM_MAX_SEQUENCE_LENGTH = 17

PAYSIM_COLUMNS = (
    "step",
    "type",
    "amount",
    "nameOrig",
    "oldbalanceOrg",
    "newbalanceOrig",
    "nameDest",
    "oldbalanceDest",
    "newbalanceDest",
    "isFraud",
    "isFlaggedFraud",
)
PAYSIM_TYPES = ("CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER")
PAYSIM_EXCLUDED_FEATURES = (
    "isFraud (supervised target only)",
    "isFlaggedFraud (rule-derived flag)",
    "oldbalanceOrg (excluded balance field)",
    "newbalanceOrig (excluded balance field)",
    "oldbalanceDest (excluded balance field)",
    "newbalanceDest (excluded balance field)",
    "nameOrig (not the selected entity; excluded from features)",
    "nameDest (entity key only; not a model feature)",
    "same-step and future transactions",
)

SPLIT_BOUNDARIES = {
    "train": (1, 281),
    "validation": (282, 355),
    "test": (356, 743),
}
SPLIT_STRATEGY = "whole-step chronological split: train 1-281, validation 282-355, test 356-743"
HISTORY_POLICY = (
    "causal cross-partition context: each target can use earlier events from preceding partitions and its own "
    "partition, but only at strictly smaller steps; training targets therefore use training history only"
)

_NUMERIC_COLUMNS = (
    "step",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
    "isFraud",
    "isFlaggedFraud",
)
_SEQUENCE_COLUMNS = ("step", "type", "amount", "nameDest", "isFraud")
_TYPE_TO_CODE = {name: index for index, name in enumerate(PAYSIM_TYPES)}
_CODE_TO_TYPE = dict(enumerate(PAYSIM_TYPES))
_EVENT_RECORD = struct.Struct("<Bd")
_HISTORY_BUCKET_HEADER = struct.Struct("<hI")


@dataclass(frozen=True, slots=True)
class PaySimHistoryEvent:
    """A historical transaction's allowed event features; no entity or label is included."""

    transaction_type: str
    amount: float


@dataclass(frozen=True, slots=True)
class PaySimHistoryStep:
    """A simultaneous hourly bucket; its events have no asserted within-step order."""

    step_gap: int
    events: tuple[PaySimHistoryEvent, ...]


@dataclass(frozen=True, slots=True)
class PaySimCausalExample:
    """One customer-recipient target and its strictly earlier grouped history."""

    entity_id: str
    target_step: int
    target_type: str
    target_amount: float
    target_label: int
    split: Literal["train", "validation", "test"]
    history: tuple[PaySimHistoryStep, ...]


def split_for_step(step: int) -> Literal["train", "validation", "test"]:
    for name, (start, end) in SPLIT_BOUNDARIES.items():
        if start <= step <= end:
            return name  # type: ignore[return-value]
    raise ValueError(f"PaySim step {step} is outside the established split range 1-743.")


def _validate_frame_schema(frame: pd.DataFrame, *, archive_schema: bool) -> None:
    if frame.empty:
        raise ValueError("PaySim dataset is empty.")
    if frame.columns.duplicated().any():
        raise ValueError("PaySim dataset contains duplicate column names.")
    columns = tuple(frame.columns)
    if archive_schema:
        if columns != PAYSIM_COLUMNS:
            raise ValueError(
                "PaySim release schema does not match the expected ordered 11-column contract: "
                f"{columns!r}"
            )
    else:
        missing = sorted(set(_SEQUENCE_COLUMNS) - set(columns))
        if missing:
            raise ValueError(f"PaySim sequence input is missing columns: {', '.join(missing)}")


def _validate_chunk(frame: pd.DataFrame, *, previous_step: int | None) -> int:
    _validate_frame_schema(frame, archive_schema=True)
    if frame.loc[:, PAYSIM_COLUMNS].isna().any().any():
        missing = sorted(frame.columns[frame.isna().any()].tolist())
        raise ValueError(f"PaySim release contains missing values in: {', '.join(missing)}")

    for column in _NUMERIC_COLUMNS:
        values = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=np.float64)
        if not np.isfinite(values).all():
            raise ValueError(f"PaySim field {column} contains non-finite or non-numeric values.")

    step_values = frame["step"].to_numpy(dtype=np.float64)
    if (step_values < 1).any() or (step_values > 743).any() or not np.equal(step_values, np.floor(step_values)).all():
        raise ValueError("PaySim step must be an integer in the verified range 1-743.")
    if (np.diff(step_values) < 0).any():
        raise ValueError("PaySim source rows are not chronological by step.")
    if previous_step is not None and int(step_values[0]) < previous_step:
        raise ValueError("PaySim source rows are not chronological by step.")
    if (frame["amount"].to_numpy(dtype=np.float64) < 0).any():
        raise ValueError("PaySim amount must be non-negative.")
    for column in ("isFraud", "isFlaggedFraud"):
        if not set(frame[column].unique()).issubset({0, 1}):
            raise ValueError(f"PaySim {column} must contain only binary values 0 and 1.")
    if not set(frame["type"].astype(str).unique()).issubset(PAYSIM_TYPES):
        raise ValueError("PaySim type contains a value outside the verified release categories.")
    for column in ("nameOrig", "nameDest"):
        ids = frame[column].astype("string")
        if ids.str.len().eq(0).any():
            raise ValueError(f"PaySim {column} must not contain empty identifiers.")
    if not frame["nameDest"].astype("string").str.startswith(("C", "M")).all():
        raise ValueError("PaySim nameDest contains an unrecognized recipient identifier prefix.")
    return int(step_values[-1])


def _split_name(step: int) -> Literal["train", "validation", "test"]:
    return split_for_step(step)


class _CausalSequenceBuilder:
    """Build step-grouped examples while retaining compact encoded history per entity."""

    def __init__(self, max_sequence_length: int):
        if isinstance(max_sequence_length, bool) or not isinstance(max_sequence_length, int) or max_sequence_length < 1:
            raise ValueError("max_sequence_length must be a positive integer number of step buckets.")
        self.max_sequence_length = max_sequence_length
        # One compact bytearray per entity: bucket count, then (step, event count, packed events).
        self._history: dict[str, bytearray] = {}

    @staticmethod
    def _decode_history(payload: bytearray, target_step: int) -> tuple[PaySimHistoryStep, ...]:
        bucket_count = payload[0]
        position = 1
        history: list[PaySimHistoryStep] = []
        for _ in range(bucket_count):
            prior_step, event_count = _HISTORY_BUCKET_HEADER.unpack_from(payload, position)
            position += _HISTORY_BUCKET_HEADER.size
            event_bytes = event_count * _EVENT_RECORD.size
            events_view = memoryview(payload)[position : position + event_bytes]
            events = tuple(
                PaySimHistoryEvent(transaction_type=_CODE_TO_TYPE[type_code], amount=amount)
                for type_code, amount in _EVENT_RECORD.iter_unpack(events_view)
            )
            position += event_bytes
            history.append(PaySimHistoryStep(step_gap=target_step - prior_step, events=events))
        return tuple(history)

    def _append_bucket(self, entity_id: str, step: int, event_payload: bytes) -> None:
        state = self._history.get(entity_id)
        if state is None:
            state = bytearray((0,))
            self._history[entity_id] = state
        bucket_count = state[0]
        if bucket_count == self.max_sequence_length:
            _, oldest_event_count = _HISTORY_BUCKET_HEADER.unpack_from(state, 1)
            oldest_length = _HISTORY_BUCKET_HEADER.size + oldest_event_count * _EVENT_RECORD.size
            del state[1 : 1 + oldest_length]
        else:
            state[0] = bucket_count + 1
        event_count = len(event_payload) // _EVENT_RECORD.size
        state.extend(_HISTORY_BUCKET_HEADER.pack(step, event_count))
        state.extend(event_payload)

    def add_step(
        self, step_frame: pd.DataFrame, *, include_targets: bool = True
    ) -> Iterator[PaySimCausalExample]:
        if step_frame.empty:
            return
        step_values = step_frame["step"].unique()
        if len(step_values) != 1:
            raise ValueError("A sequence-builder batch must contain exactly one whole step.")
        step = int(step_values[0])
        split = split_for_step(step)
        customer_rows = step_frame.loc[step_frame["nameDest"].astype("string").str.startswith("C")]
        if customer_rows.empty:
            return

        events_by_entity: dict[str, list[tuple[str, float, int, int]]] = {}
        for _, transaction_type, amount, entity_value, label, source_order in customer_rows.itertuples(
            index=False, name=None
        ):
            entity_id = str(entity_value)
            events_by_entity.setdefault(entity_id, []).append(
                (str(transaction_type), float(amount), int(label), int(source_order))
            )
        for rows in events_by_entity.values():
            rows.sort(key=lambda row: (row[0], row[1], row[3]))

        if include_targets:
            for entity_id in sorted(events_by_entity):
                rows = events_by_entity[entity_id]
                prior = self._history.get(entity_id)
                history = self._decode_history(prior, step) if prior is not None else ()
                for transaction_type, amount, label, _source_order in rows:
                    yield PaySimCausalExample(
                        entity_id=entity_id,
                        target_step=step,
                        target_type=transaction_type,
                        target_amount=amount,
                        target_label=label,
                        split=split,
                        history=history,
                    )

        # Add the complete simultaneous step only after every target in the step was emitted.
        for entity_id in sorted(events_by_entity):
            rows = events_by_entity[entity_id]
            event_payload = bytearray()
            for transaction_type, amount, _label, _source_order in rows:
                event_payload.extend(_EVENT_RECORD.pack(_TYPE_TO_CODE[transaction_type], amount))
            self._append_bucket(entity_id, step, bytes(event_payload))


def _validate_sequence_frame(frame: pd.DataFrame) -> pd.DataFrame:
    _validate_frame_schema(frame, archive_schema=False)
    selected = frame.loc[:, _SEQUENCE_COLUMNS].copy()
    for column in ("step", "amount", "isFraud"):
        selected[column] = pd.to_numeric(selected[column], errors="coerce")
    if selected.isna().any().any():
        raise ValueError("PaySim sequence inputs must not contain missing or non-numeric required values.")
    if not np.isfinite(selected[["step", "amount", "isFraud"]].to_numpy(dtype=np.float64)).all():
        raise ValueError("PaySim sequence inputs must be finite.")
    steps = selected["step"].to_numpy(dtype=np.float64)
    if (steps < 1).any() or (steps > 743).any() or not np.equal(steps, np.floor(steps)).all():
        raise ValueError("PaySim step must contain integer values from the verified range 1-743.")
    if (selected["amount"] < 0).any():
        raise ValueError("PaySim amount must be non-negative.")
    if not set(selected["isFraud"].unique()).issubset({0, 1}):
        raise ValueError("PaySim isFraud must contain only binary target values.")
    if not set(selected["type"].astype(str).unique()).issubset(PAYSIM_TYPES):
        raise ValueError("PaySim type contains an unknown release category.")
    ids = selected["nameDest"].astype("string")
    if ids.isna().any() or ids.str.len().eq(0).any():
        raise ValueError("PaySim nameDest must not contain missing or empty identifiers.")
    if not ids.str.startswith(("C", "M")).all():
        raise ValueError("PaySim nameDest contains an unrecognized recipient identifier prefix.")
    selected["step"] = selected["step"].astype("int16")
    selected["_source_order"] = np.arange(len(selected), dtype=np.int64)
    return selected


def iter_causal_examples(frame: pd.DataFrame, max_sequence_length: int) -> Iterator[PaySimCausalExample]:
    """Yield deterministic causal examples from a small/in-memory frame for unit-level consumers."""
    selected = _validate_sequence_frame(frame)
    builder = _CausalSequenceBuilder(max_sequence_length)
    for _, step_frame in selected.groupby("step", sort=True):
        yield from builder.add_step(step_frame)


def _nearest_rank(histogram: Counter[int], quantile: float) -> int:
    total = sum(histogram.values())
    if total == 0:
        return 0
    rank = max(1, math.ceil(quantile * total))
    cumulative = 0
    for value in sorted(histogram):
        cumulative += histogram[value]
        if cumulative >= rank:
            return value
    raise AssertionError("Histogram rank calculation failed.")


def _history_group_counts(frame: pd.DataFrame) -> pd.Series:
    customer_rows = frame.loc[frame["nameDest"].astype("string").str.startswith("C"), ["step", "nameDest"]]
    if customer_rows.empty:
        return pd.Series(dtype="int64")
    return customer_rows.groupby(["step", "nameDest"], sort=True, observed=True).size()


def validate_paysim_archive(
    archive_path: Path,
    *,
    expected_sha256: str = PAYSIM_ARCHIVE_SHA256,
    chunksize: int = 100_000,
) -> dict[str, object]:
    """Validate the pinned PaySim archive and report causal recipient-history coverage without materializing sequences."""
    if not archive_path.is_file():
        raise FileNotFoundError(f"PaySim archive not found: {archive_path}")
    if chunksize < 1:
        raise ValueError("chunksize must be positive.")

    digest = hashlib.sha256()
    with archive_path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    archive_hash = digest.hexdigest()
    if archive_hash != expected_sha256:
        raise ValueError(
            "PaySim archive SHA-256 does not match the verified author release: "
            f"expected {expected_sha256}, got {archive_hash}."
        )

    numeric_dtypes = {column: "float64" for column in _NUMERIC_COLUMNS}
    numeric_dtypes["step"] = "int16"
    numeric_dtypes["isFraud"] = "int8"
    numeric_dtypes["isFlaggedFraud"] = "int8"
    dtypes = {**numeric_dtypes, "type": "string", "nameOrig": "string", "nameDest": "string"}
    row_count = 0
    fraud_count = 0
    flagged_count = 0
    split_rows: Counter[str] = Counter()
    split_fraud: Counter[str] = Counter()
    split_customer_fraud: Counter[str] = Counter()
    unique_steps: set[int] = set()
    observed_types: set[str] = set()
    previous_source_step: int | None = None

    prior_step_count: Counter[str] = Counter()
    split_sequence_examples: Counter[str] = Counter()
    split_with_history: Counter[str] = Counter()
    split_history_step_tokens: Counter[str] = Counter()
    train_history_lengths: Counter[int] = Counter()
    pending_step: int | None = None
    pending_entities: Counter[str] = Counter()

    def flush_step(step: int, entity_counts: Counter[str]) -> None:
        split = _split_name(step)
        for entity, event_count in entity_counts.items():
            earlier_steps = prior_step_count[entity]
            split_sequence_examples[split] += event_count
            if earlier_steps:
                split_with_history[split] += event_count
                split_history_step_tokens[split] += event_count * earlier_steps
            if split == "train":
                train_history_lengths[earlier_steps] += event_count
            prior_step_count[entity] += 1

    with zipfile.ZipFile(archive_path) as archive:
        files = [info for info in archive.infolist() if not info.is_dir()]
        if len(files) != 1 or files[0].filename != PAYSIM_CSV_MEMBER:
            raise ValueError(
                "PaySim archive must contain only the verified release CSV "
                f"{PAYSIM_CSV_MEMBER!r}."
            )

        with archive.open(PAYSIM_CSV_MEMBER) as header_source:
            header = tuple(pd.read_csv(header_source, nrows=0).columns)
        if header != PAYSIM_COLUMNS:
            raise ValueError(f"PaySim release header differs from the expected schema: {header!r}")

        with archive.open(PAYSIM_CSV_MEMBER) as csv_source:
            chunks = pd.read_csv(csv_source, dtype=dtypes, chunksize=chunksize)
            for chunk in chunks:
                previous_source_step = _validate_chunk(chunk, previous_step=previous_source_step)
                row_count += len(chunk)
                fraud_count += int(chunk["isFraud"].sum())
                flagged_count += int(chunk["isFlaggedFraud"].sum())
                observed_types.update(chunk["type"].astype(str).unique())
                steps = chunk["step"].to_numpy(dtype=np.int64)
                unique_steps.update(int(value) for value in np.unique(steps))
                step_rows = chunk.groupby("step", sort=True).size()
                for step_value, count in step_rows.items():
                    split_rows[_split_name(int(step_value))] += int(count)
                fraud_by_step = chunk.groupby("step", sort=True)["isFraud"].sum()
                for step_value, count in fraud_by_step.items():
                    split_fraud[_split_name(int(step_value))] += int(count)

                customer_mask = chunk["nameDest"].astype("string").str.startswith("C")
                customer_rows = chunk.loc[customer_mask]
                customer_fraud_by_step = customer_rows.groupby("step", sort=True)["isFraud"].sum()
                for step_value, count in customer_fraud_by_step.items():
                    split_customer_fraud[_split_name(int(step_value))] += int(count)

                grouped = _history_group_counts(chunk)
                if grouped.empty:
                    continue
                for step_value, counts in grouped.groupby(level=0, sort=True):
                    step = int(step_value)
                    current = Counter({str(entity): int(count) for entity, count in counts.droplevel(0).items()})
                    if pending_step is None:
                        pending_step, pending_entities = step, current
                    elif step == pending_step:
                        pending_entities.update(current)
                    else:
                        flush_step(pending_step, pending_entities)
                        pending_step, pending_entities = step, current

    if pending_step is not None:
        flush_step(pending_step, pending_entities)
    if row_count == 0:
        raise ValueError("PaySim CSV contains no data rows.")
    if unique_steps != set(range(1, 744)):
        raise ValueError("PaySim steps must cover the verified whole-hour range 1-743.")
    if observed_types != set(PAYSIM_TYPES):
        raise ValueError("PaySim transaction types do not match the verified release categories.")

    train_target_count = sum(train_history_lengths.values())
    max_sequence_length = _nearest_rank(train_history_lengths, 0.95)
    if max_sequence_length < 1:
        raise ValueError("Training partition has no recipient history; a temporal sequence contract cannot be formed.")

    split_report = []
    for name, (step_start, step_end) in SPLIT_BOUNDARIES.items():
        split_report.append(
            {
                "name": name,
                "step_start": step_start,
                "step_end": step_end,
                "rows": split_rows[name],
                "fraud_labels": split_fraud[name],
                "customer_recipient_targets": split_sequence_examples[name],
                "customer_recipient_fraud_targets": split_customer_fraud[name],
                "customer_recipient_nonfraud_targets": split_sequence_examples[name] - split_customer_fraud[name],
                "targets_with_prior_history": split_with_history[name],
                "targets_without_prior_history": split_sequence_examples[name] - split_with_history[name],
                "prior_step_history_tokens": split_history_step_tokens[name],
            }
        )

    training_distribution = {
        "target_count": train_target_count,
        "p50_prior_distinct_steps_nearest_rank": _nearest_rank(train_history_lengths, 0.50),
        "p95_prior_distinct_steps_nearest_rank": max_sequence_length,
        "maximum_prior_distinct_steps": max(train_history_lengths),
        "cap_selection": "nearest-rank 95th percentile of prior distinct step buckets per training target; training partition only",
    }

    return {
        "scope": "PaySim schema and causal customer-recipient sequence feasibility only; no model training or performance results",
        "source": {
            "release": PAYSIM_RELEASE_VERSION,
            "archive": str(archive_path),
            "archive_sha256": archive_hash,
            "csv_member": PAYSIM_CSV_MEMBER,
        },
        "schema": {
            "dataset_schema_version": PAYSIM_DATASET_SCHEMA_VERSION,
            "sequence_schema_version": PAYSIM_SEQUENCE_SCHEMA_VERSION,
            "columns": list(PAYSIM_COLUMNS),
            "row_count": row_count,
            "fraud_label_count": fraud_count,
            "rule_flag_positive_count": flagged_count,
            "observed_step_count": len(unique_steps),
            "step_min": min(unique_steps),
            "step_max": max(unique_steps),
            "transaction_types": sorted(observed_types),
        },
        "entity": {
            "definition": "nameDest values beginning with C (customer recipients only)",
            "entity_identifier_preserved_in_metadata": "nameDest",
            "entity_identifier_is_not_a_model_feature": True,
            "customer_recipient_entities": len(prior_step_count),
            "entities_with_multiple_distinct_steps": sum(count > 1 for count in prior_step_count.values()),
            "customer_recipient_transaction_rows": sum(split_sequence_examples.values()),
            "rows_with_at_least_one_strictly_earlier_entity_event": sum(split_with_history.values()),
        },
        "time_and_target": {
            "time_field": "step (hourly integer boundary)",
            "target_field": "isFraud (supervised target; never a feature/history field)",
            "transaction_identifier": None,
        },
        "split_strategy": SPLIT_STRATEGY,
        "splits": split_report,
        "sequence_contract": {
            "history_rule": "history(entity,t) contains eligible nameDest=C transactions only when history.step < target.step",
            "same_step_policy": "all events at one step are simultaneous; no event in that step is prior history for another",
            "partition_history_policy": HISTORY_POLICY,
            "sequence_unit": "distinct prior hourly step buckets; all events in a bucket are simultaneous and retained together",
            "maximum_sequence_length": max_sequence_length,
            "maximum_sequence_length_unit": "distinct prior step buckets",
            "truncation": "retain the most recent maximum_sequence_length buckets; discard oldest buckets; never split a bucket",
            "ordering": "ascending step order across buckets; events inside a bucket are an unordered set with canonical type/amount serialization only",
            "empty_history": "emit target example with an empty history tuple",
            "short_history": "retain all available prior step buckets",
            "history_event_features": ["transaction_type", "amount", "step_gap_to_target"],
            "current_target_features": ["transaction_type", "amount"],
            "entity_key": "nameDest is retained only as example metadata and is not a model feature",
            "target_label": "isFraud is stored separately from input features",
            "excluded_features": list(PAYSIM_EXCLUDED_FEATURES),
            "cap_training_history_distribution": training_distribution,
        },
        "leakage_controls": {
            "source_rows_chronological": True,
            "whole_step_splits": True,
            "training_history_is_train_only": True,
            "validation_and_test_can_use_only_strictly_earlier_partitions_and_steps": True,
            "validation_test_events_never_enter_earlier_training_histories": True,
            "labels_and_rule_flag_excluded_from_history_features": True,
            "balance_fields_excluded_from_features": True,
            "no_transaction_identifier_claimed": True,
        },
        "leakage_tests": {
            "test_file": "ml/tests/test_paysim_data.py",
            "covered_invariants": [
                "history steps are strictly smaller than target steps",
                "same-step events are not prior history",
                "changing labels does not change history features",
                "labels, rule flags, balances, and entity IDs are absent from history-event features",
                "training targets do not consume validation/test events",
                "merchant recipients are excluded and source entity IDs are preserved",
                "step ordering, bucket truncation, and repeated construction are deterministic",
                "streaming audit carries same-step recipient groups across CSV chunk boundaries",
            ],
        },
    }


def load_paysim_sequence_contract(contract_path: Path = PAYSIM_CONTRACT_PATH) -> dict[str, object]:
    """Load and strictly validate the accepted Phase 10 sequence contract."""
    if not contract_path.is_file():
        raise FileNotFoundError(f"Phase 10 PaySim sequence contract not found: {contract_path}")
    try:
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read the Phase 10 PaySim contract: {error}") from error
    if not isinstance(contract, dict):
        raise ValueError("Phase 10 PaySim contract must contain a JSON object.")

    source = contract.get("source")
    schema = contract.get("schema")
    time_target = contract.get("time_and_target")
    entity = contract.get("entity")
    splits = contract.get("splits")
    sequence = contract.get("sequence_contract")
    if not all(isinstance(value, dict) for value in (source, schema, time_target, entity, sequence)):
        raise ValueError("Phase 10 PaySim contract is missing required object sections.")
    if source.get("archive_sha256") != PAYSIM_ARCHIVE_SHA256:
        raise ValueError("Phase 10 contract source hash does not match the pinned PaySim release.")
    if schema.get("dataset_schema_version") != PAYSIM_DATASET_SCHEMA_VERSION:
        raise ValueError("Phase 10 contract dataset schema version is unsupported.")
    if schema.get("sequence_schema_version") != PAYSIM_SEQUENCE_SCHEMA_VERSION:
        raise ValueError("Phase 10 contract sequence schema version is unsupported.")
    if schema.get("row_count") != 6_362_620:
        raise ValueError("Phase 10 contract row count does not match the verified PaySim release.")
    if time_target != {
        "time_field": "step (hourly integer boundary)",
        "target_field": "isFraud (supervised target; never a feature/history field)",
        "transaction_identifier": None,
    }:
        raise ValueError("Phase 10 contract time, target, or transaction-ID semantics have changed.")
    if entity.get("definition") != "nameDest values beginning with C (customer recipients only)":
        raise ValueError("Phase 10 contract entity definition is unsupported.")
    if not isinstance(splits, list) or [
        (part.get("name"), part.get("step_start"), part.get("step_end"))
        for part in splits
        if isinstance(part, dict)
    ] != [(name, *SPLIT_BOUNDARIES[name]) for name in SPLIT_BOUNDARIES]:
        raise ValueError("Phase 10 split boundaries differ from the accepted whole-step split.")
    if sequence.get("maximum_sequence_length") != PAYSIM_MAX_SEQUENCE_LENGTH:
        raise ValueError("Phase 10 maximum sequence length must remain 17 step buckets.")
    if sequence.get("history_event_features") != ["transaction_type", "amount", "step_gap_to_target"]:
        raise ValueError("Phase 10 historical feature list is unsupported.")
    if sequence.get("current_target_features") != ["transaction_type", "amount"]:
        raise ValueError("Phase 10 current-target feature list is unsupported.")
    if sequence.get("target_label") != "isFraud is stored separately from input features":
        raise ValueError("Phase 10 target-label separation contract is missing.")
    excluded = sequence.get("excluded_features")
    required_exclusions = {
        "isFraud (supervised target only)",
        "isFlaggedFraud (rule-derived flag)",
        "oldbalanceOrg (excluded balance field)",
        "newbalanceOrig (excluded balance field)",
        "oldbalanceDest (excluded balance field)",
        "newbalanceDest (excluded balance field)",
        "nameOrig (not the selected entity; excluded from features)",
        "nameDest (entity key only; not a model feature)",
        "same-step and future transactions",
    }
    if not isinstance(excluded, list) or not required_exclusions.issubset(excluded):
        raise ValueError("Phase 10 contract is missing one or more required feature exclusions.")
    return contract


def _verify_archive_against_contract(
    audited: dict[str, object], contract: dict[str, object]
) -> None:
    actual_schema = audited["schema"]
    expected_schema = contract["schema"]
    if actual_schema["row_count"] != expected_schema["row_count"]:
        raise ValueError("PaySim row count differs from the Phase 10 sequence contract.")
    if audited["source"]["archive_sha256"] != contract["source"]["archive_sha256"]:
        raise ValueError("PaySim source hash differs from the Phase 10 sequence contract.")
    actual_splits = {part["name"]: part for part in audited["splits"]}
    expected_splits = {part["name"]: part for part in contract["splits"]}
    for name in SPLIT_BOUNDARIES:
        for key in ("rows", "fraud_labels", "customer_recipient_targets", "targets_with_prior_history"):
            if actual_splits[name][key] != expected_splits[name][key]:
                raise ValueError(f"PaySim {name} split {key} differs from the Phase 10 report.")
    if audited["sequence_contract"]["maximum_sequence_length"] != contract["sequence_contract"]["maximum_sequence_length"]:
        raise ValueError("PaySim empirical training sequence cap differs from the Phase 10 report.")


class PaySimSequenceReader:
    """Replayable, validated streaming source for the pinned PaySim sequence contract."""

    def __init__(
        self,
        archive_path: Path,
        contract: dict[str, object],
        audit: dict[str, object],
        chunksize: int,
    ) -> None:
        self.archive_path = archive_path
        self.contract = contract
        self.audit = audit
        self.chunksize = chunksize
        self.max_sequence_length = int(contract["sequence_contract"]["maximum_sequence_length"])

    def iter_examples(
        self, splits: Iterable[Literal["train", "validation", "test"]] | None = None
    ) -> Iterator[PaySimCausalExample]:
        """Yield selected partitions while still building every strictly-past history bucket."""
        selected = None if splits is None else frozenset(splits)
        if selected is not None and (not selected or not selected.issubset(SPLIT_BOUNDARIES)):
            raise ValueError("splits must be a non-empty subset of train, validation, and test.")
        digest = hashlib.sha256()
        with self.archive_path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != self.audit["source"]["archive_sha256"]:
            raise ValueError("PaySim archive changed after sequence-source validation.")

        yield from _iter_validated_archive_sequences(
            self.archive_path,
            self.max_sequence_length,
            self.chunksize,
            target_splits=selected,
        )


def open_paysim_sequence_reader(
    archive_path: Path,
    contract_path: Path = PAYSIM_CONTRACT_PATH,
    *,
    chunksize: int = 100_000,
) -> PaySimSequenceReader:
    """Validate source and contract once, then expose integrity-checked replayable streams."""
    if chunksize < 1:
        raise ValueError("chunksize must be positive.")
    contract = load_paysim_sequence_contract(contract_path)
    audit = validate_paysim_archive(archive_path, chunksize=chunksize)
    _verify_archive_against_contract(audit, contract)
    return PaySimSequenceReader(archive_path, contract, audit, chunksize)


def _iter_complete_step_frames(archive_path: Path, chunksize: int) -> Iterator[pd.DataFrame]:
    """Read only sequence columns and retain the trailing tied-step group across chunks."""
    dtypes = {"step": "int16", "type": "string", "amount": "float64", "nameDest": "string", "isFraud": "int8"}
    row_offset = 0
    pending: pd.DataFrame | None = None
    with zipfile.ZipFile(archive_path) as archive:
        with archive.open(PAYSIM_CSV_MEMBER) as source:
            chunks = pd.read_csv(source, usecols=list(_SEQUENCE_COLUMNS), dtype=dtypes, chunksize=chunksize)
            for chunk in chunks:
                chunk["_source_order"] = np.arange(row_offset, row_offset + len(chunk), dtype=np.int64)
                row_offset += len(chunk)
                if pending is not None:
                    chunk = pd.concat((pending, chunk), ignore_index=True)
                last_step = int(chunk["step"].iloc[-1])
                complete = chunk.loc[chunk["step"] < last_step]
                pending = chunk.loc[chunk["step"] == last_step].copy()
                for _, step_frame in complete.groupby("step", sort=True):
                    yield step_frame

    if pending is not None and not pending.empty:
        yield pending


def _iter_validated_archive_sequences(
    archive_path: Path,
    max_sequence_length: int,
    chunksize: int,
    target_splits: frozenset[str] | None = None,
) -> Iterator[PaySimCausalExample]:
    builder = _CausalSequenceBuilder(max_sequence_length)
    for step_frame in _iter_complete_step_frames(archive_path, chunksize):
        step = int(step_frame["step"].iloc[0])
        if target_splits is not None and step > max(SPLIT_BOUNDARIES[name][1] for name in target_splits):
            break
        include_targets = target_splits is None or split_for_step(step) in target_splits
        yield from builder.add_step(step_frame, include_targets=include_targets)


def iter_paysim_archive_sequences(
    archive_path: Path,
    contract_path: Path = PAYSIM_CONTRACT_PATH,
    *,
    chunksize: int = 100_000,
) -> Iterator[PaySimCausalExample]:
    """Validate the pinned archive/Phase 10 report, then lazily yield causal examples in source time order."""
    if chunksize < 1:
        raise ValueError("chunksize must be positive.")
    reader = open_paysim_sequence_reader(archive_path, contract_path, chunksize=chunksize)
    yield from reader.iter_examples()


def materialize_paysim_sequence_report(
    archive_path: Path,
    contract_path: Path = PAYSIM_CONTRACT_PATH,
    *,
    chunksize: int = 100_000,
) -> dict[str, object]:
    """Stream all sequence examples for validation and return a compact manifest, not an expanded dataset copy."""
    if chunksize < 1:
        raise ValueError("chunksize must be positive.")
    reader = open_paysim_sequence_reader(archive_path, contract_path, chunksize=chunksize)
    contract = reader.contract
    audited = reader.audit
    sequence_contract = contract["sequence_contract"]
    cap = int(sequence_contract["maximum_sequence_length"])
    by_split: dict[str, dict[str, int]] = {
        name: {"examples": 0, "examples_with_history": 0, "history_step_buckets": 0, "fraud_targets": 0}
        for name in SPLIT_BOUNDARIES
    }
    maximum_observed_history = 0
    for example in reader.iter_examples():
        sequence_length = len(example.history)
        if sequence_length > cap:
            raise AssertionError("Materialized history exceeds the Phase 10 sequence cap.")
        summary = by_split[example.split]
        summary["examples"] += 1
        summary["examples_with_history"] += int(sequence_length > 0)
        summary["history_step_buckets"] += sequence_length
        summary["fraud_targets"] += example.target_label
        maximum_observed_history = max(maximum_observed_history, sequence_length)

    expected_splits = {part["name"]: part for part in audited["splits"]}
    for name, summary in by_split.items():
        expected = expected_splits[name]
        if summary["examples"] != expected["customer_recipient_targets"]:
            raise ValueError(f"Materialized {name} example count differs from the Phase 10 contract.")
        if summary["examples_with_history"] != expected["targets_with_prior_history"]:
            raise ValueError(f"Materialized {name} history coverage differs from the Phase 10 contract.")
        if summary["fraud_targets"] != expected["customer_recipient_fraud_targets"]:
            raise ValueError(f"Materialized {name} recipient fraud-label count differs from the archive audit.")

    return {
        "scope": "PaySim sequence loader/materialization validation only; no model training or performance results",
        "source": audited["source"],
        "dataset_schema_version": audited["schema"]["dataset_schema_version"],
        "sequence_contract_version": audited["schema"]["sequence_schema_version"],
        "representation_version": PAYSIM_REPRESENTATION_VERSION,
        "split_strategy": audited["split_strategy"],
        "splits": [
            {
                "name": name,
                "step_start": SPLIT_BOUNDARIES[name][0],
                "step_end": SPLIT_BOUNDARIES[name][1],
                **summary,
                "examples_without_history": summary["examples"] - summary["examples_with_history"],
                "nonfraud_targets": summary["examples"] - summary["fraud_targets"],
            }
            for name, summary in by_split.items()
        ],
        "representation": {
            "entity": "nameDest customer recipients (C-prefixed), metadata only",
            "time": "step; strict history condition history_step < target_step",
            "target": "isFraud, stored separately from input features",
            "current_features": sequence_contract["current_target_features"],
            "historical_event_features": sequence_contract["history_event_features"],
            "excluded_features": sequence_contract["excluded_features"],
            "maximum_sequence_length": cap,
            "maximum_sequence_length_unit": "distinct step buckets",
            "truncation": "retain newest whole buckets; never split a tied step",
            "within_step_order": "unordered event set serialized by transaction type, amount, then source row for exact ties; no temporal interpretation",
            "padding_and_masking": "no padding in examples; ragged tuples; a future batch collator can pad and derive masks",
            "empty_history": "empty tuple",
            "ordering": "target step ascending; history buckets chronological; deterministic source-order tie resolution",
        },
        "materialization": {
            "mode": "streaming lazy iterator",
            "examples_emitted_and_counted": sum(part["examples"] for part in by_split.values()),
            "maximum_observed_history_buckets": maximum_observed_history,
            "sequence_payload_persisted": False,
            "raw_csv_copied": False,
            "selection_or_randomness": "none",
            "reproducibility": "pinned archive hash, Phase 10 contract, fixed schema/splits/cap, and deterministic ordering",
        },
    }
