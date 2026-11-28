"""Re-verify LayerNet research evidence: recompute SHA-256 for every file a manifest pins.

Read-only. Walks each readable ml/artifacts/*/manifest.json for objects that pair a file path with a
SHA-256, recomputes the hash of the referenced file, and records match / mismatch / missing /
inaccessible. Also hashes ml/reports/* and the local datasets. Prints a JSON snapshot to stdout.

Usage (from the repository root):
    ml/.venv/Scripts/python.exe -I ml/research/tools/verify_evidence.py > ml/research/evidence-snapshot-<date>.json
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path.cwd()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_file(path: Path, expected: str | None) -> dict[str, Any]:
    entry: dict[str, Any] = {"path": (path.resolve().relative_to(ROOT.resolve()).as_posix() if path.resolve().is_relative_to(ROOT.resolve()) else "OUTSIDE-REPOSITORY"), "expected_sha256": expected}
    try:
        actual = sha256(path)
    except FileNotFoundError:
        entry["status"] = "missing"
        return entry
    except PermissionError as error:
        entry["status"] = "inaccessible"
        entry["error"] = type(error).__name__
        return entry
    entry["actual_sha256"] = actual
    entry["bytes"] = path.stat().st_size
    entry["status"] = "recorded-only" if expected is None else ("match" if actual == expected else "MISMATCH")
    return entry


PAIRS = (("path", "sha256"), ("config_path", "config_sha256"), ("configuration_path", "configuration_sha256"),
         ("manifest_path", "manifest_sha256"), ("artifact", "artifact_sha256"), ("source", "source_sha256"),
         ("file", "sha256"), ("model_file", "model_sha256"), ("artifact", "model_sha256"),
         ("reference_artifact", "reference_sha256"), ("validation_selector_artifact", "validation_selector_sha256"))


def resolve(target: str, base: Path, own: Path) -> Path:
    candidate = Path(target.replace("\\", "/"))
    if candidate.is_absolute():
        return candidate
    for root in (base, ROOT, own, ROOT / "ml/artifacts"):
        if (root / candidate).exists():
            return root / candidate
    return base / candidate


def pinned_files(node: Any, base: Path, found: list[tuple[Path, str, str]], trail: str = "", own: Path | None = None) -> None:
    """Collect (file, sha256, json-pointer) for each explicit path/hash key pair in an object.

    Paths are resolved against the object's own `artifact_directory` when it has one (replay manifests
    reference models kept in the original training directory), else the repository root, else the
    manifest's directory.
    """
    if isinstance(node, dict):
        local_base = Path(node["artifact_directory"]) if isinstance(node.get("artifact_directory"), str) else base
        if isinstance(node.get("directory"), str):  # sibling artifact directory named relative to ml/artifacts
            local_base = ROOT / "ml/artifacts" / node["directory"]
        for path_key, hash_key in PAIRS:
            target, digest = node.get(path_key), node.get(hash_key)
            if isinstance(target, str) and isinstance(digest, str) and len(digest) == 64:
                found.append((resolve(target, local_base, own or base), digest, f"{trail}/{path_key}"))
        for key, value in node.items():
            pinned_files(value, base, found, f"{trail}/{key}", own)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            pinned_files(value, base, found, f"{trail}/{index}", own)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False).stdout.strip()


snapshot: dict[str, Any] = {
    "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
    "git_commit": git("rev-parse", "HEAD"),
    "git_status": git("status", "--short"),
    "python": platform.python_version(),
    "platform": platform.platform(),
    "manifests": {},
    "model_files": [],
    "reports": [],
    "datasets": [],
}

for directory in sorted((ROOT / "ml/artifacts").iterdir()):
    if not directory.is_dir():
        continue
    manifest_path = directory / "manifest.json"
    record: dict[str, Any] = {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except PermissionError as error:
        snapshot["manifests"][directory.name] = {"status": "inaccessible", "error": type(error).__name__}
        continue
    except FileNotFoundError:
        snapshot["manifests"][directory.name] = {"status": "no-manifest"}
        continue
    record["manifest_sha256"] = sha256(manifest_path)
    record["recorded_status"] = manifest.get("status", "NOT RECORDED")
    found: list[tuple[Path, str, str]] = []
    training_source = manifest.get("training_source")
    base = Path(training_source["artifact_directory"]) if isinstance(training_source, dict) and "artifact_directory" in training_source else directory
    pinned_files(manifest, base, found, own=directory)
    record["pinned_files"] = [{**check_file(path, digest), "pointer": pointer} for path, digest, pointer in found]
    # Older ULB manifests pin the model by a top-level model_sha256 with no path: match against the directory's model file.
    if isinstance(manifest.get("model_sha256"), str):
        models = sorted(p for p in directory.iterdir() if p.suffix in (".joblib", ".pt", ".json", ".ubj") and p.name != "manifest.json")
        for model in models:
            snapshot["model_files"].append({**check_file(model, manifest["model_sha256"]), "manifest": directory.name})
    snapshot["manifests"][directory.name] = record

for report in sorted((ROOT / "ml/reports").iterdir()):
    if report.is_file():
        snapshot["reports"].append(check_file(report, None))

for dataset in sorted(p for p in (ROOT / "ml/data").rglob("*") if p.is_file()):
    snapshot["datasets"].append(check_file(dataset, None))

json.dump(snapshot, sys.stdout, indent=1)
sys.stdout.write("\n")
