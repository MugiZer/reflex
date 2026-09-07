"""Replay one failed ops-trace line through the real controller. Red-capable loop for /diagnosing-bugs.

Usage: python pass2/replay_failure.py <trace.jsonl> <paper_id>
   or: python pass2/replay_failure.py '<trace-line JSON>' (single pulled line on argv)
   or: echo '<trace-line JSON>' | python pass2/replay_failure.py (stdin)
A pulled line may carry #12 envelope fields (commit/fault/seed/env/signature); they pin
payload + code version and otherwise pass through untouched.
Exit 1 = reproduced (RED), 0 = fixed (GREEN), 2 = cannot replay.
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from luna_pass2_controller import ControllerConfig, MockAdapter, read_csv, run_controller


def _as_event(raw):
    raw = (raw or "").strip()
    if not raw.startswith("{"):
        return None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) and obj.get("paper_id") else None


def _stdin_text():
    try:
        return "" if sys.stdin.isatty() else sys.stdin.read()
    except OSError:
        return ""


args = sys.argv[1:]
# ponytail: argv-JSON, then bare-argv-JSON, then stdin-JSON; file lookup is the last resort.
event = ((_as_event(args[1]) if len(args) >= 2 else None)
         or (_as_event(args[0]) if len(args) == 1 else None)
         or (_as_event(_stdin_text()) if len(args) <= 2 else None))
trace_path = Path(args[0]) if args and not (len(args) == 1 and event is not None) else None

if event is None:
    if trace_path is None or len(args) < 2:
        print("usage: replay_failure.py <trace.jsonl> <paper_id> | '<trace-line JSON>'", file=sys.stderr)
        raise SystemExit(2)
    paper_id = args[1]
    try:
        text = trace_path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"cannot read {trace_path}: {exc}", file=sys.stderr)
        raise SystemExit(2)
    failures = [json.loads(line) for line in text.splitlines()
                if line.strip() and (e := json.loads(line))["outcome"] == "failure"
                and e["paper_id"] == paper_id]
    if not failures:
        print(f"no failure for {paper_id} in {trace_path.name}", file=sys.stderr)
        raise SystemExit(2)
    event = max(failures, key=lambda e: e["ended_at"])
else:
    paper_id = event["paper_id"]

name = trace_path.name if trace_path is not None else ""
if "program-a" in name or "program-b" in name:
    program = "A" if "program-a" in name else "B"
else:
    program = "B" if (event.get("worker") or "").lower().startswith("b-") else "A"
logs_dir = trace_path.parent if trace_path is not None else Path(__file__).resolve().parent / "luna-controller-logs"
ended = datetime.fromisoformat(event["ended_at"]) if event.get("ended_at") else None

candidates = sorted((logs_dir / "rejected-output").glob(f"{paper_id.replace(':', '_')}-*.json"))
payloads = [p for p in candidates if ended is None or datetime.strptime(p.stem.rsplit("-", 1)[1].rstrip("Z"), "%Y%m%dT%H%M%S").replace(tzinfo=ended.tzinfo) <= ended]
if payloads:
    result = json.loads(payloads[-1].read_text(encoding="utf-8"))
else:
    result = [{"paper_id": f"{paper_id}-mismatch"}]  # fallback: no preserved payload (all 74 p-1 lines are synthetic); minimal wrong-id still trips the :393 guard so replay goes RED instead of exit 2

work = Path(tempfile.mkdtemp(prefix="replay-"))
master_copy = work / "master.csv"
shutil.copy2(ControllerConfig(program).master, master_copy)
fields, rows = read_csv(master_copy)  # blank the cell in the *copy* so the row reselects
found = False
for row in rows:
    if row.get("paper_id") == paper_id:
        row["pass2_result"] = ""
        found = True
worker = event.get("worker")
manifest = None
if not found or not worker:
    if not found:
        rows.append({"paper_id": paper_id, "triage_label": "HIGH", "pass2_result": ""})  # synthetic row keeps select_rows -> analyze -> validate_result routing for ids absent from master
    worker = None
    manifest = work / "no-manifest.csv"  # absent on purpose: allowed=None, so the triage filter admits the row
with master_copy.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)

config = ControllerConfig(program, worker, master_path=master_copy, manifest_path=manifest, log_dir=work / "logs")
report = run_controller(config, MockAdapter({paper_id: result}))
mine = [f for f in report.failures if f.paper_id == paper_id]
# ponytail: other selected rows fail as "mock result not supplied" by design; verdict filters to target paper.
if mine and mine[0].reason == event.get("reason"):
    print(f"RED  {paper_id}: {mine[0].reason}")
    raise SystemExit(1)
if mine:
    print(f"RED-DRIFT {paper_id}: trace={event.get('reason')!r} replay={mine[0].reason!r}")
    raise SystemExit(1)
print(f"GREEN {paper_id}: no failure on replay")
