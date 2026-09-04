from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKTREE_ROOT = REPO_ROOT.parent / ".codex-worktrees" / "reflex-pass2" / "program-a"
CANONICAL_ROOT = REPO_ROOT / "pass2" / "program-a"
MANIFEST = REPO_ROOT / "pass2" / "assignments" / "program-a" / "manifest.csv"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


with MANIFEST.open(encoding="utf-8-sig", newline="") as handle:
    manifest = list(csv.DictReader(handle))

errors: list[dict[str, str]] = []
manifest_by_id = {row["paper_id"]: row for row in manifest}
if len(manifest_by_id) != len(manifest):
    raise SystemExit("manifest paper_id values are not unique")

all_logs: list[tuple[int, dict[str, str]]] = []
all_objects: list[tuple[int, dict]] = []
parse_errors = 0
for worker in range(1, 14):
    xx = f"{worker:02d}"
    jsonl = CANONICAL_ROOT / f"agent-{xx}-mechanisms.jsonl"
    log = CANONICAL_ROOT / f"agent-{xx}-paper-log.csv"
    worker_jsonl = WORKTREE_ROOT / f"a-{xx}" / "pass2" / "program-a" / jsonl.name
    worker_log = WORKTREE_ROOT / f"a-{xx}" / "pass2" / "program-a" / log.name
    for canonical, source in ((jsonl, worker_jsonl), (log, worker_log)):
        if not canonical.exists():
            errors.append({"paper_id": "", "pass2_index": "", "expected_worker": str(worker), "observed_worker/output": str(canonical), "violated_invariant": "missing canonical output file"})
            continue
        if not source.exists() or digest(canonical) != digest(source):
            errors.append({"paper_id": "", "pass2_index": "", "expected_worker": str(worker), "observed_worker/output": str(canonical), "violated_invariant": "canonical copy differs from validated worker output"})
    try:
        with log.open(encoding="utf-8-sig", newline="") as handle:
            all_logs.extend((worker, row) for row in csv.DictReader(handle))
    except Exception as exc:
        parse_errors += 1
        errors.append({"paper_id": "", "pass2_index": "", "expected_worker": str(worker), "observed_worker/output": str(log), "violated_invariant": f"CSV parse error: {exc}"})
    try:
        with jsonl.open(encoding="utf-8-sig") as handle:
            for line_number, line in enumerate(handle, 1):
                if line.strip():
                    all_objects.append((worker, json.loads(line)))
    except Exception as exc:
        parse_errors += 1
        errors.append({"paper_id": "", "pass2_index": "", "expected_worker": str(worker), "observed_worker/output": f"{jsonl}:{line_number}", "violated_invariant": f"JSONL parse error: {exc}"})

logs_by_id: dict[str, list[tuple[int, dict[str, str]]]] = defaultdict(list)
for worker, row in all_logs:
    paper_id = row.get("paper_id", "")
    logs_by_id[paper_id].append((worker, row))
    expected = manifest_by_id.get(paper_id)
    if expected is None:
        errors.append({"paper_id": paper_id, "pass2_index": row.get("pass2_index", ""), "expected_worker": "none", "observed_worker/output": str(worker), "violated_invariant": "paper outside frozen population was processed"})
    elif int(expected["assigned_agent"]) != worker:
        errors.append({"paper_id": paper_id, "pass2_index": expected["pass2_index"], "expected_worker": expected["assigned_agent"], "observed_worker/output": str(worker), "violated_invariant": "paper-log ownership violation"})

for paper_id, expected in manifest_by_id.items():
    observed = logs_by_id.get(paper_id, [])
    if len(observed) != 1:
        errors.append({"paper_id": paper_id, "pass2_index": expected["pass2_index"], "expected_worker": expected["assigned_agent"], "observed_worker/output": ",".join(str(worker) for worker, _ in observed), "violated_invariant": f"paper processed {len(observed)} times"})

objects_by_id: dict[str, list[tuple[int, dict]]] = defaultdict(list)
for worker, obj in all_objects:
    paper_id = obj.get("paper_id", "")
    objects_by_id[paper_id].append((worker, obj))
    expected = manifest_by_id.get(paper_id)
    if expected is None:
        errors.append({"paper_id": paper_id, "pass2_index": "", "expected_worker": "none", "observed_worker/output": str(worker), "violated_invariant": "mechanism/terminal object outside frozen population"})
    elif int(expected["assigned_agent"]) != worker:
        errors.append({"paper_id": paper_id, "pass2_index": expected["pass2_index"], "expected_worker": expected["assigned_agent"], "observed_worker/output": str(worker), "violated_invariant": "object ownership violation"})

unresolved = 0
for paper_id, expected in manifest_by_id.items():
    objects = [obj for _, obj in objects_by_id.get(paper_id, [])]
    retained = [obj for obj in objects if "second_pass_classification" in obj]
    zero = [obj for obj in objects if "terminal_outcome" in obj]
    valid = bool(retained) ^ (len(zero) == 1)
    if zero and len(objects) != 1:
        valid = False
    if not valid:
        unresolved += 1
        errors.append({"paper_id": paper_id, "pass2_index": expected["pass2_index"], "expected_worker": expected["assigned_agent"], "observed_worker/output": str(len(objects)), "violated_invariant": "paper lacks exactly one paper-level terminal outcome"})

classification_counts = Counter()
for _, obj in all_objects:
    if "second_pass_classification" in obj:
        classification_counts[obj["second_pass_classification"]] += 1
    else:
        classification_counts[obj.get("terminal_outcome", "UNKNOWN")] += 1

duplicate_processing = sum(max(0, len(rows) - 1) for rows in logs_by_id.values())
missing_papers = sum(1 for paper_id in manifest_by_id if paper_id not in logs_by_id)
ownership_violations = sum(1 for error in errors if "ownership violation" in error["violated_invariant"])
result = {
    "processed_papers": len(all_logs),
    "mechanisms_emitted": sum(classification_counts[name] for name in ("GEM", "KEEP", "RESERVE", "NEEDS_DEEP_REVIEW")),
    "GEM": classification_counts["GEM"],
    "KEEP": classification_counts["KEEP"],
    "RESERVE": classification_counts["RESERVE"],
    "NEEDS_DEEP_REVIEW": classification_counts["NEEDS_DEEP_REVIEW"],
    "DROP": classification_counts["DROP"],
    "RETRIEVAL_FAILED": classification_counts["RETRIEVAL_FAILED"],
    "missing_papers": missing_papers,
    "duplicate_processing": duplicate_processing,
    "ownership_violations": ownership_violations,
    "parse_errors": parse_errors,
    "unresolved_papers": unresolved,
    "integrity_error_count": len(errors),
    "errors": errors,
}
print(json.dumps(result, indent=2))
raise SystemExit(1 if errors else 0)
