from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKTREE_ROOT = REPO_ROOT.parent / ".codex-worktrees" / "reflex-pass2" / "program-a"
SEAMS = {
    "temporal_fidelity", "action_chunk_representation", "recording_integrity",
    "trajectory_segmentation", "dataset_quality", "data_selection", "loss_weighting",
    "failed_data", "diversity_mixture", "normalization_transform", "lineage_provenance",
    "active_collection", "representation", "other", "unclear",
}
RETAINED_CLASSES = {"GEM", "KEEP", "RESERVE", "NEEDS_DEEP_REVIEW"}
TERMINAL_CLASSES = {"DROP", "RETRIEVAL_FAILED"}
REQUIRED = {
    "paper_id", "paper_title", "year", "source_lane", "first_pass_classification",
    "mechanism_id", "mechanism_name", "exact_mechanism", "input_signal",
    "operation_or_intervention", "domain_independent_primitive", "primary_lane",
    "supporting_lanes", "secondary_lanes", "recognition_uncertainty",
    "possible_reflex_seam", "reflex_transfer_hypothesis", "strongest_empirical_result",
    "strongest_empirical_result_status", "supporting_passages", "evidence_status",
    "second_pass_classification", "classification_reason", "unresolved_question",
}
EVIDENCE_FIELDS = {
    "exact_mechanism", "input_signal", "operation_or_intervention",
    "domain_independent_primitive", "lane_assignment", "reflex_transfer_hypothesis",
    "strongest_empirical_result",
}


worker = int(sys.argv[1])
xx = f"{worker:02d}"
shard_path = REPO_ROOT / "pass2" / "assignments" / "program-a" / f"a-{xx}.csv"
output_dir = WORKTREE_ROOT / f"a-{xx}" / "pass2" / "program-a"
jsonl_path = output_dir / f"agent-{xx}-mechanisms.jsonl"
log_path = output_dir / f"agent-{xx}-paper-log.csv"

errors: list[str] = []
try:
    with shard_path.open(encoding="utf-8-sig", newline="") as handle:
        shard = list(csv.DictReader(handle))
except Exception as exc:
    raise SystemExit(f"shard parse error: {exc}")
try:
    with log_path.open(encoding="utf-8-sig", newline="") as handle:
        logs = list(csv.DictReader(handle))
except Exception as exc:
    raise SystemExit(f"log parse error: {exc}")
objects = []
try:
    with jsonl_path.open(encoding="utf-8-sig") as handle:
        for line_number, line in enumerate(handle, 1):
            if line.strip():
                objects.append(json.loads(line))
except Exception as exc:
    raise SystemExit(f"JSONL parse error: {exc}")

shard_ids = [row["paper_id"] for row in shard]
log_ids = [row.get("paper_id", "") for row in logs]
if len(logs) != len(shard):
    errors.append(f"paper-log rows {len(logs)} != assigned {len(shard)}")
if len(log_ids) != len(set(log_ids)):
    errors.append("duplicate paper_id in paper log")
if set(log_ids) != set(shard_ids):
    errors.append(f"paper-log ownership mismatch: missing={sorted(set(shard_ids)-set(log_ids))[:5]} extra={sorted(set(log_ids)-set(shard_ids))[:5]}")

outcome_by_paper: dict[str, set[str]] = {paper_id: set() for paper_id in shard_ids}
for index, obj in enumerate(objects, 1):
    paper_id = obj.get("paper_id")
    if paper_id not in outcome_by_paper:
        errors.append(f"object {index}: unassigned paper_id {paper_id!r}")
        continue
    if "terminal_outcome" in obj:
        if set(obj) != {"paper_id", "paper_title", "terminal_outcome", "reason"}:
            errors.append(f"{paper_id}: DROP/retrieval object has wrong fields")
        outcome = obj.get("terminal_outcome")
        if outcome not in TERMINAL_CLASSES:
            errors.append(f"{paper_id}: invalid terminal_outcome {outcome!r}")
        outcome_by_paper[paper_id].add(str(outcome))
        continue
    missing = REQUIRED.difference(obj)
    if missing:
        errors.append(f"{paper_id}: missing retained fields {sorted(missing)}")
    classification = obj.get("second_pass_classification")
    if classification not in RETAINED_CLASSES:
        errors.append(f"{paper_id}: invalid classification {classification!r}")
    outcome_by_paper[paper_id].add(str(classification))
    if obj.get("possible_reflex_seam") not in SEAMS:
        errors.append(f"{paper_id}: invalid seam {obj.get('possible_reflex_seam')!r}")
    if obj.get("primary_lane") not in {*(f"A{i}" for i in range(1, 16)), "UNKNOWN"}:
        errors.append(f"{paper_id}: invalid primary_lane {obj.get('primary_lane')!r}")
    if not isinstance(obj.get("supporting_lanes"), list) or not isinstance(obj.get("secondary_lanes"), list):
        errors.append(f"{paper_id}: lane lists are not arrays")
    passages = obj.get("supporting_passages")
    if not isinstance(passages, list) or not (1 <= len(passages) <= 3):
        errors.append(f"{paper_id}: supporting_passages must contain 1-3 passages")
    elif any(not isinstance(passage, dict) or set(passage) != {"text", "source_location"} for passage in passages):
        errors.append(f"{paper_id}: malformed supporting_passages")
    evidence = obj.get("evidence_status")
    if not isinstance(evidence, dict) or set(evidence) != EVIDENCE_FIELDS:
        errors.append(f"{paper_id}: malformed evidence_status mapping")
    if classification == "NEEDS_DEEP_REVIEW" and not obj.get("unresolved_question"):
        errors.append(f"{paper_id}: deep review lacks unresolved_question")
    if classification != "NEEDS_DEEP_REVIEW" and obj.get("unresolved_question") is not None:
        errors.append(f"{paper_id}: non-deep-review unresolved_question must be null")

for paper_id, outcomes in outcome_by_paper.items():
    if not outcomes:
        errors.append(f"{paper_id}: no terminal outcome object")
    if outcomes.intersection(TERMINAL_CLASSES) and len(outcomes) > 1:
        errors.append(f"{paper_id}: conflicting terminal outcomes {sorted(outcomes)}")

print(json.dumps({
    "worker": f"A{xx}",
    "assigned": len(shard),
    "log_rows": len(logs),
    "objects": len(objects),
    "errors": errors[:100],
    "error_count": len(errors),
}, indent=2))
raise SystemExit(1 if errors else 0)
