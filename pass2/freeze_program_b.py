import csv
import json
import sys
from collections import Counter
from pathlib import Path


def canonical_id(row: dict[str, str]) -> str:
    return (row.get("paper_id") or row.get("primary_id") or row.get("id") or "").strip()


def main() -> None:
    source = Path(sys.argv[1]).resolve()
    repo = Path(sys.argv[2]).resolve()
    input_path = repo / "pass2" / "input" / "program-b-high-medium.csv"
    assignment_dir = repo / "pass2" / "assignments" / "program-b"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    assignment_dir.mkdir(parents=True, exist_ok=True)

    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        source_fields = list(reader.fieldnames or [])
        source_rows = list(reader)

    if not source_fields or "triage_label" not in source_fields:
        raise SystemExit("Missing triage_label column")

    selected = []
    labels = Counter()
    for source_index, row in enumerate(source_rows):
        label = (row.get("triage_label") or "").strip().upper()
        labels[label] += 1
        if label in {"HIGH", "MEDIUM"}:
            pid = canonical_id(row)
            if not pid:
                raise SystemExit(f"No stable identifier at source row {source_index + 2}")
            selected.append((source_index, pid, label, row))

    frozen = []
    seen: set[str] = set()
    duplicates = []
    for source_index, pid, label, row in selected:
        if pid in seen:
            duplicates.append({"paper_id": pid, "source_row": source_index + 2})
            continue
        seen.add(pid)
        frozen.append((pid, label, row))

    if len(seen) != len(frozen):
        raise SystemExit("Canonical paper_id uniqueness check failed")

    metadata_fields = [
        "pass2_index",
        "assigned_agent",
        "paper_id",
        "paper_title",
        "first_pass_classification",
        "source_lane",
    ]
    preserved_fields = ["source_paper_id" if field == "paper_id" else field for field in source_fields]
    output_fields = metadata_fields + preserved_fields

    canonical_rows = []
    shards = {agent: [] for agent in range(1, 6)}
    for index, (pid, label, row) in enumerate(frozen):
        agent = (index % 5) + 1
        preserved = {
            ("source_paper_id" if key == "paper_id" else key): value
            for key, value in row.items()
        }
        output = {
            "pass2_index": index,
            "assigned_agent": agent,
            "paper_id": pid,
            "paper_title": row.get("paper_name", ""),
            "first_pass_classification": label,
            "source_lane": row.get("lanes", ""),
            **preserved,
        }
        canonical_rows.append(output)
        shards[agent].append(output)

    def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    write_csv(input_path, output_fields, canonical_rows)
    for agent, rows in shards.items():
        write_csv(assignment_dir / f"b-{agent:02}.csv", output_fields, rows)

    manifest_fields = [
        "pass2_index",
        "paper_id",
        "assigned_agent",
        "first_pass_classification",
        "source_lane",
    ]
    write_csv(assignment_dir / "manifest.csv", manifest_fields, canonical_rows)

    population_ids = [row["paper_id"] for row in canonical_rows]
    shard_ids = [row["paper_id"] for agent in range(1, 6) for row in shards[agent]]
    errors = []
    if len(population_ids) != len(set(population_ids)):
        errors.append("frozen population contains duplicate paper_id")
    if len(shard_ids) != len(set(shard_ids)):
        errors.append("shards are not pairwise disjoint")
    if set(shard_ids) != set(population_ids):
        errors.append("shard union differs from frozen population")
    floor_size = len(canonical_rows) // 5
    ceil_size = floor_size + (1 if len(canonical_rows) % 5 else 0)
    if any(len(rows) not in {floor_size, ceil_size} for rows in shards.values()):
        errors.append("invalid shard size")
    if errors:
        raise SystemExit("; ".join(errors))

    report = {
        "source_rows": len(source_rows),
        "HIGH": labels["HIGH"],
        "MEDIUM": labels["MEDIUM"],
        "excluded": len(source_rows) - len(selected),
        "duplicates_removed": len(duplicates),
        "frozen_population": len(canonical_rows),
        "frozen_HIGH": sum(row["first_pass_classification"] == "HIGH" for row in canonical_rows),
        "frozen_MEDIUM": sum(row["first_pass_classification"] == "MEDIUM" for row in canonical_rows),
        "shards": {f"B{agent:02}": len(rows) for agent, rows in shards.items()},
        "duplicate_source_rows_removed": duplicates,
        "validation": "PASS",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
