from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

TRANSACTION_REQUIRED = ("TransactionID", "isFraud", "TransactionDT", "TransactionAmt")
IDENTITY_KEY = "TransactionID"
CARD_FIELDS = ("card1", "card2", "card3", "card4", "card5", "card6")
DEVICE_FIELDS = ("DeviceType", "DeviceInfo")
IDENTITY_AUXILIARY_FIELDS = tuple(f"id_{index}" for index in range(12, 39))
FEATURE_GROUPS = {
    "transaction_product_context": ("ProductCD",),
    "card_attributes": CARD_FIELDS,
    "coded_address_attributes": ("addr1", "addr2"),
    "device_context": DEVICE_FIELDS,
    "identity_auxiliary_fields": IDENTITY_AUXILIARY_FIELDS,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_csv(path: Path, name: str) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"{name} CSV not found: {path}")
    frame = pd.read_csv(path)
    if frame.empty:
        raise ValueError(f"{name} CSV is empty.")
    if frame.columns.duplicated().any():
        raise ValueError(f"{name} CSV contains duplicate column names.")
    return frame


def _numeric_id(series: pd.Series, name: str) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    raw = values.to_numpy(dtype=np.float64)
    if not np.isfinite(raw).all() or (raw < 0).any() or not np.equal(raw, np.floor(raw)).all():
        raise ValueError(f"{name} must contain finite, non-negative integer identifiers.")
    return values.astype("int64")


def _feature_availability(
    frame: pd.DataFrame,
    transaction_columns: set[str],
    identity_columns: set[str],
) -> dict[str, Any]:
    field_report: dict[str, dict[str, dict[str, Any]]] = {}
    group_presence: dict[str, pd.Series] = {}
    for group, fields in FEATURE_GROUPS.items():
        field_report[group] = {}
        for field in fields:
            identity_field = field in DEVICE_FIELDS or field in IDENTITY_AUXILIARY_FIELDS
            source_columns = identity_columns if identity_field else transaction_columns
            available = field in source_columns and field in frame.columns
            observed = frame[field].notna() if available else pd.Series(False, index=frame.index)
            field_report[group][field] = {
                "available_in_schema": available,
                "non_missing_transactions": int(observed.sum()),
                "missing_transactions": len(frame) - int(observed.sum()),
            }
        observed_fields = [
            frame[field].notna()
            for field in fields
            if field in frame.columns
            and field
            in (
                identity_columns
                if field in DEVICE_FIELDS or field in IDENTITY_AUXILIARY_FIELDS
                else transaction_columns
            )
        ]
        group_presence[group] = (
            pd.concat(observed_fields, axis=1).any(axis=1)
            if observed_fields
            else pd.Series(False, index=frame.index)
        )

    has_card = group_presence["card_attributes"]
    has_device = group_presence["device_context"]
    return {
        "groups": field_report,
        "transactions_with_any_card_attribute": int(has_card.sum()),
        "transactions_with_any_device_field": int(has_device.sum()),
        "transactions_with_card_and_device_fields": int((has_card & has_device).sum()),
    }


def _chronological_ranges(
    frame: pd.DataFrame,
    transaction_columns: set[str],
    identity_columns: set[str],
) -> list[dict[str, Any]]:
    ordered = frame.sort_values("TransactionDT", kind="mergesort").reset_index(drop=True)
    times = ordered["TransactionDT"].to_numpy(dtype=np.float64)

    def boundary(target: int) -> int:
        index = max(1, min(target, len(ordered) - 1))
        while index < len(ordered) and times[index] == times[index - 1]:
            index += 1
        return index

    if len(ordered) < 3:
        raise ValueError("At least three labeled transactions are required for chronological reporting.")
    first = boundary(int(len(ordered) * 0.6))
    second = boundary(int(len(ordered) * 0.8))
    if first >= second or second >= len(ordered):
        raise ValueError("Timestamp groups are too large to create non-empty chronological splits.")
    ranges = ((0, first), (first, second), (second, len(ordered)))
    names = ("train", "validation", "test")
    result = []
    for name, (start, end) in zip(names, ranges, strict=True):
        part = ordered.iloc[start:end]
        result.append(
            {
                "name": name,
                "rows": len(part),
                "fraud_count": int(part["isFraud"].sum()),
                "time_start": float(part["TransactionDT"].iloc[0]),
                "time_end": float(part["TransactionDT"].iloc[-1]),
                "feature_availability": _feature_availability(
                    part,
                    transaction_columns,
                    identity_columns,
                ),
            }
        )
    return result


def validate_ieee_cis(
    transactions_path: Path,
    identity_path: Path,
) -> dict[str, Any]:
    """Validate local labeled IEEE-CIS train files and report schema/coverage only.

    This intentionally performs no feature fitting, model training, or prediction.
    """
    transactions_path = transactions_path.resolve()
    identity_path = identity_path.resolve()
    transactions = _read_csv(transactions_path, "Transaction")
    identity = _read_csv(identity_path, "Identity")

    missing = sorted(set(TRANSACTION_REQUIRED) - set(transactions.columns))
    if missing:
        raise ValueError(f"Transaction CSV is missing required columns: {', '.join(missing)}")
    if IDENTITY_KEY not in identity.columns:
        raise ValueError(f"Identity CSV is missing required column: {IDENTITY_KEY}")

    transactions = transactions.copy()
    identity = identity.copy()
    transactions[IDENTITY_KEY] = _numeric_id(transactions[IDENTITY_KEY], "Transaction.TransactionID")
    identity[IDENTITY_KEY] = _numeric_id(identity[IDENTITY_KEY], "Identity.TransactionID")
    if transactions[IDENTITY_KEY].duplicated().any():
        raise ValueError("Transaction CSV contains duplicate TransactionID values.")
    if identity[IDENTITY_KEY].duplicated().any():
        raise ValueError("Identity CSV contains duplicate TransactionID values.")

    labels = pd.to_numeric(transactions["isFraud"], errors="coerce")
    if labels.isna().any() or not set(labels.unique().tolist()).issubset({0, 1}):
        raise ValueError("Transaction.isFraud must contain only binary labels 0 and 1.")
    if set(labels.unique().tolist()) != {0, 1}:
        raise ValueError("Labeled training transactions must contain both fraud classes.")
    transactions["isFraud"] = labels.astype("int8")

    elapsed = pd.to_numeric(transactions["TransactionDT"], errors="coerce")
    amount = pd.to_numeric(transactions["TransactionAmt"], errors="coerce")
    if elapsed.isna().any() or not np.isfinite(elapsed.to_numpy(dtype=np.float64)).all() or (elapsed < 0).any():
        raise ValueError("TransactionDT must contain finite, non-negative relative time values.")
    if amount.isna().any() or not np.isfinite(amount.to_numpy(dtype=np.float64)).all() or (amount < 0).any():
        raise ValueError("TransactionAmt must contain finite, non-negative numeric values.")
    transactions["TransactionDT"] = elapsed.astype("float64")

    transaction_ids = set(transactions[IDENTITY_KEY].tolist())
    identity_ids = set(identity[IDENTITY_KEY].tolist())
    unknown_ids = identity_ids - transaction_ids
    if unknown_ids:
        raise ValueError(f"Identity CSV contains {len(unknown_ids)} TransactionID values absent from transactions.")

    joined = transactions.merge(
        identity,
        on=IDENTITY_KEY,
        how="left",
        validate="one_to_one",
        indicator=True,
        suffixes=("", "_identity"),
    )
    identity_row_count = int((joined["_merge"] == "both").sum())
    transaction_columns = set(transactions.columns)
    identity_columns = set(identity.columns)
    source_order_monotonic = bool(transactions["TransactionDT"].is_monotonic_increasing)
    split_report = _chronological_ranges(joined, transaction_columns, identity_columns)
    return {
        "dataset": "IEEE-CIS Fraud Detection",
        "scope": "schema, join, coverage, and chronological split validation only; no model or performance results",
        "files": {
            "transactions": {"sha256": sha256_file(transactions_path), "rows": len(transactions)},
            "identity": {"sha256": sha256_file(identity_path), "rows": len(identity)},
        },
        "transaction_columns": list(transactions.columns),
        "identity_columns": list(identity.columns),
        "transaction_count": len(transactions),
        "fraud_count": int(transactions["isFraud"].sum()),
        "legitimate_count": int((transactions["isFraud"] == 0).sum()),
        "fraud_fraction": float(transactions["isFraud"].mean()),
        "time_range": {
            "start": float(transactions["TransactionDT"].min()),
            "end": float(transactions["TransactionDT"].max()),
            "semantics": "relative TransactionDT; not a calendar timestamp",
            "source_rows_chronological": source_order_monotonic,
        },
        "feature_availability": _feature_availability(joined, transaction_columns, identity_columns),
        "identity_join": {
            "key": IDENTITY_KEY,
            "identity_rows_matching_transactions": identity_row_count,
            "transactions_with_identity_row": identity_row_count,
            "transactions_without_identity_row": len(transactions) - identity_row_count,
            "transaction_identity_coverage": identity_row_count / len(transactions),
            "identity_fields_are_not_person_or_account_ids": True,
        },
        "chronological_splits": split_report,
        "leakage_controls": [
            "TransactionID is validated as a unique join key; this validator does not produce a model feature matrix.",
            "Splits are contiguous in TransactionDT order and equal TransactionDT groups stay together.",
            "The official unlabeled test files are not accepted by this labeled-training intake command.",
            "No preprocessing, feature selection, threshold selection, model fitting, or test evaluation is performed.",
        ],
    }
