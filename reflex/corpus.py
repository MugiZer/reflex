"""Seeded eleven-fault corpus with a hidden ground-truth seed table.

Eval/test code imports LABELS/SEED_TABLE freely; no other reflex/ module may
(enforced by label_importers, AST-scanned in tests/test_corpus.py). Generation
delegates to reflex.fakegpu knobs; persistence delegates to to_ledger (real
Ledger API). Stdlib only.
"""
from __future__ import annotations

import ast
from pathlib import Path

from .fakegpu import PRESETS, generate as _generate, to_ledger

FAMILIES: tuple[str, ...] = tuple(n for n in PRESETS if n != "healthy")

# ponytail: fixed 11-row table, one seed per family; append rows when new fault families land.
SEED_TABLE: tuple[tuple[int, str, tuple[str, ...]], ...] = (
    (101, "cpu_starvation", ("cpu_gap",)),
    (102, "launch_overhead", ("launch_gap",)),
    (103, "bw_pressure", ("dur",)),
    (104, "stalls", ("stall",)),
    (105, "sync_serialization", ("cpu_gap", "blocked", "serialized")),
    (106, "transfer_heavy", ("tx",)),
    (107, "batching_delay", ("cpu_gap", "cpu_dur", "qdepth")),
    (108, "queue_contention", ("qdepth", "streams", "kernels")),
    (109, "competing_workload", ("qdepth", "streams", "kernels")),
    (110, "kernel_regression", ("dur",)),
    (111, "preprocessing_interference", ("cpu_gap", "cpu_dur", "qdepth")),
)
LABELS: dict[int, str] = {seed: preset for seed, preset, _ in SEED_TABLE}
EXPECTED_METRIC: dict[str, tuple[str, ...]] = {preset: keys for _, preset, keys in SEED_TABLE}


def signature(bundle: dict) -> dict:
    """Mean-per-bundle metric vector; same seed => untouched metrics exactly equal."""
    starts = [c["start_ns"] for c in bundle["cpu_launch"]]
    return {
        "cpu_gap": sum(j - i for i, j in zip(starts, starts[1:])) / (len(starts) - 1),
        "cpu_dur": sum(c["end_ns"] - c["start_ns"] for c in bundle["cpu_launch"]) / len(bundle["cpu_launch"]),
        "launch_gap": sum(g["launch_gap_ns"] for g in bundle["gpu_kernel"]) / len(bundle["gpu_kernel"]),
        "dur": sum(g["dur_ns"] for g in bundle["gpu_kernel"]) / len(bundle["gpu_kernel"]),
        "stall": sum(r["stall_hist"]["long_scoreboard"] for r in bundle["l3_pc"]),
        "blocked": sum(s["blocked_ns"] for s in bundle["sync_edge"]) / len(bundle["sync_edge"]),
        "tx": sum(t["bytes"] for t in bundle["transfer"]) / len(bundle["transfer"]),
        "qdepth": sum(r["queue_depth"] for r in bundle["l1"]) / len(bundle["l1"]),
        "streams": max(r["active_streams"] for r in bundle["l1"]),
        "kernels": sum(r["active_kernels"] for r in bundle["l1"]) / len(bundle["l1"]),
        "serialized": any(s["serialized"] for s in bundle["sync_edge"]),
    }


def generate_case(seed: int, n_kernels: int = 8) -> dict:
    return _generate(seed, LABELS[seed], n_kernels)


def generate_corpus(n_kernels: int = 8) -> dict[int, dict]:
    return {seed: generate_case(seed, n_kernels) for seed, _, _ in SEED_TABLE}


def corpus_report(n_kernels: int = 8) -> dict:
    """Per-family signature vs same-seed healthy baseline + differing keys."""
    # ponytail: mean-vector report only; add quantiles when distribution overlap matters.
    report = {}
    for seed, preset, _ in SEED_TABLE:
        sig, base = signature(generate_case(seed, n_kernels)), signature(_generate(seed, "healthy", n_kernels))
        report[preset] = {"seed": seed, "signature": sig, "baseline": base,
                          "distinguishing": sorted(k for k in sig if sig[k] != base[k])}
    return report


def record_corpus(ledger, n_kernels: int = 8) -> dict:
    return {seed: to_ledger(generate_case(seed, n_kernels), ledger) for seed, _, _ in SEED_TABLE}


def imports_corpus_source(source: str) -> list[int]:
    """Line numbers importing reflex.corpus (absolute or relative); [] when clean."""
    hits = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            if any(n.name == "reflex.corpus" or n.name.startswith("reflex.corpus.") for n in node.names):
                hits.append(node.lineno)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if node.level == 0:
                if mod == "reflex.corpus" or mod.startswith("reflex.corpus.") \
                        or (mod == "reflex" and any(n.name == "corpus" for n in node.names)):
                    hits.append(node.lineno)
            elif mod == "corpus" or (mod == "" and any(n.name == "corpus" for n in node.names)):
                hits.append(node.lineno)
    return sorted(hits)


def label_importers(root: str | Path | None = None) -> list[str]:
    """reflex/ files (excluding corpus.py) importing the corpus labels, as path:line."""
    root = Path(root) if root else Path(__file__).resolve().parent
    offenders = []
    for path in sorted(root.rglob("*.py")):
        if path.name == "corpus.py" or "__pycache__" in path.parts:
            continue
        for lineno in imports_corpus_source(path.read_text(encoding="utf-8")):
            offenders.append(f"{path}:{lineno}")
    return offenders
