from __future__ import annotations

import csv
import os
from pathlib import Path


SOURCE = Path(r"C:\Users\moham\Downloads\paper csv's\program a\program-a-paper-master.csv")
REPO_ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = REPO_ROOT / "pass2" / "input" / "program-a-high-medium.csv"
ASSIGNMENT_DIR = REPO_ROOT / "pass2" / "assignments" / "program-a"
MANIFEST_PATH = ASSIGNMENT_DIR / "manifest.csv"
WORKER_COUNT = 13


def write_csv_atomic(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


with SOURCE.open("r", encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    source_fields = list(reader.fieldnames or [])
    source_rows = list(reader)

required = {"id", "paper_name", "triage_label", "lanes", "paper_id"}
missing = required.difference(source_fields)
if missing:
    raise SystemExit(f"Missing required source columns: {sorted(missing)}")

normalized_labels = [row["triage_label"].strip().upper() for row in source_rows]
counts = {label: normalized_labels.count(label) for label in {"HIGH", "MEDIUM"}}
selected = [
    (row, label)
    for row, label in zip(source_rows, normalized_labels, strict=True)
    if label in {"HIGH", "MEDIUM"}
]

# The source `id` is populated and unique across the full corpus. It is the
# existing stable corpus identifier and therefore the canonical `paper_id`.
canonical_ids = [row["id"].strip() for row, _ in selected]
if any(not paper_id for paper_id in canonical_ids):
    raise SystemExit("Selected population contains a blank stable id")
if len(set(canonical_ids)) != len(canonical_ids):
    raise SystemExit("Selected population contains duplicate stable ids")

output_fields = [
    "pass2_index",
    "paper_id",
    "assigned_agent",
    "first_pass_classification",
    "source_lane",
    *["source_paper_id" if field == "paper_id" else field for field in source_fields],
]

frozen: list[dict[str, str]] = []
for index, ((source_row, label), canonical_id) in enumerate(zip(selected, canonical_ids, strict=True)):
    output = {
        "pass2_index": str(index),
        "paper_id": canonical_id,
        "assigned_agent": str((index % WORKER_COUNT) + 1),
        "first_pass_classification": label,
        "source_lane": source_row["lanes"].strip(),
    }
    for field in source_fields:
        output["source_paper_id" if field == "paper_id" else field] = source_row[field]
    frozen.append(output)

write_csv_atomic(INPUT_PATH, output_fields, frozen)

shards: dict[int, list[dict[str, str]]] = {worker: [] for worker in range(1, WORKER_COUNT + 1)}
for row in frozen:
    shards[int(row["assigned_agent"])].append(row)
for worker, rows in shards.items():
    write_csv_atomic(ASSIGNMENT_DIR / f"a-{worker:02d}.csv", output_fields, rows)

manifest_fields = [
    "pass2_index",
    "paper_id",
    "assigned_agent",
    "first_pass_classification",
    "source_lane",
]
write_csv_atomic(
    MANIFEST_PATH,
    manifest_fields,
    [{field: row[field] for field in manifest_fields} for row in frozen],
)

# Mechanical launcher invariants.
population_ids = [row["paper_id"] for row in frozen]
shard_ids = [row["paper_id"] for worker in range(1, WORKER_COUNT + 1) for row in shards[worker]]
if len(population_ids) != len(set(population_ids)):
    raise SystemExit("Frozen paper_id values are not unique")
if len(shard_ids) != len(set(shard_ids)):
    raise SystemExit("Shard paper_id values are not pairwise disjoint")
if set(shard_ids) != set(population_ids):
    raise SystemExit("Shard union does not equal the frozen population")
floor_size = len(frozen) // WORKER_COUNT
ceil_size = floor_size + (1 if len(frozen) % WORKER_COUNT else 0)
if any(len(rows) not in {floor_size, ceil_size} for rows in shards.values()):
    raise SystemExit("A shard has an invalid size")

print(f"source_rows={len(source_rows)}")
print(f"HIGH={counts['HIGH']}")
print(f"MEDIUM={counts['MEDIUM']}")
print(f"excluded={len(source_rows) - len(selected)}")
print("duplicates_removed=0")
print(f"frozen={len(frozen)}")
for worker in range(1, WORKER_COUNT + 1):
    print(f"A{worker:02d}={len(shards[worker])}")
