"""Ticket 14 proofs: E1-positive/negative + M1 through the real CLI, eval, demo."""
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.eval import run_eval
from reflex.ledger import Ledger
from reflex.report import render_showme, resolve_report, run_case

EV_RE = re.compile(r"\bev:([0-9a-f]{32})\b")


def _cli(*args, cwd):
    return subprocess.run([sys.executable, "-m", "reflex", *args], capture_output=True,
                          text=True, cwd=str(cwd), timeout=600)


@pytest.fixture(scope="module")
def positive(tmp_path_factory):
    d = tmp_path_factory.mktemp("pos")
    case = run_case(11, "cpu_starvation", d / "cases", 8)
    return d, case


def test_e1_positive_verified_through_real_cli(positive):
    d, case = positive
    assert case["verified"] and case["verified"]["measured_ms"] > 0
    summary = d / "cases" / "case_cpu_starvation_11.json"
    assert summary.exists()  # run_case persists its own context
    r = _cli("show-me", "--ledger", case["ledger_path"], "--incident",
             case["incident_id"], "--summary", str(summary), cwd=ROOT)
    assert r.returncode == 0, r.stderr
    assert "VERIFIED" in r.stdout and "ABSTAIN" not in r.stdout
    assert "suggested" in r.stdout and "executed" in r.stdout  # no silent substitution
    verdict = resolve_report(r.stdout, Ledger(case["ledger_path"]))
    assert verdict["ok"], verdict["violations"]


def test_e1_negative_abstains_without_fix(tmp_path):
    case = run_case(21, "stalls", tmp_path / "cases", 8)
    assert case["verified"] is None  # genuinely unverified, not staged
    text = render_showme(case["ledger_path"], case["incident_id"], case)
    assert "ABSTAIN" in text
    assert not any(ln.startswith("VERIFIED") for ln in text.splitlines())
    assert resolve_report(text, Ledger(case["ledger_path"]))["ok"]


def test_m1_broken_route_fails_oracle(positive):
    d, case = positive
    summary = d / "cases" / "case_cpu_starvation_11.json"
    r = _cli("show-me", "--ledger", case["ledger_path"], "--incident",
             case["incident_id"], "--summary", str(summary), cwd=ROOT)
    assert r.returncode == 0
    good = resolve_report(r.stdout, Ledger(case["ledger_path"]))
    assert good["ok"]  # control: honest output passes first
    real_id = EV_RE.findall(r.stdout)[0]
    mutated = r.stdout.replace(f"ev:{real_id}", "ev:" + "0" * 32)
    bad = resolve_report(mutated, Ledger(case["ledger_path"]))
    assert not bad["ok"] and any("unresolvable" in v for v in bad["violations"])
    fake_verified = "VERIFIED oom via reboot: measured 99ms\n"
    led = Ledger(case["ledger_path"])
    assert not resolve_report(fake_verified, led)["ok"]  # no experiment behind it


def test_eval_subset_aggregates(tmp_path):
    rep = run_eval(["cpu_starvation", "kernel_regression"], [11], tmp_path / "eval", 8)
    assert rep["n"] == 2 and rep["top1"] >= 1
    assert (tmp_path / "eval" / "eval.json").exists()
    assert (tmp_path / "eval" / "eval.md").exists()
    assert set(rep) >= {"top1", "top3", "verified", "mean_measurements",
                        "mean_wall_s", "brier", "rows"}


def test_demo_end_to_end(tmp_path):
    r = _cli("demo", "--out", str(tmp_path / "demo"), cwd=ROOT)
    assert r.returncode == 0, r.stderr
    demo_md = tmp_path / "demo" / "demo.md"
    assert demo_md.exists()
    ledgers = sorted((tmp_path / "demo" / "cases").glob("case_cpu_starvation_11.jsonl"))
    assert ledgers  # demo ran the real pipeline, not a fixture
    case = json.loads((tmp_path / "demo" / "cases" / "case_cpu_starvation_11.json").read_text())
    assert case["verified"] and case["verified"]["measured_ms"] > 0  # measured recovery
    assert resolve_report(demo_md.read_text(), Ledger(str(ledgers[0])))["ok"]


def test_unmapped_cause_cannot_verify(tmp_path):
    # transfer_heavy has no discriminating intervention mapped: even a perfect
    # fix may not verify the cause. The report must abstain, never promote.
    case = run_case(31, "transfer_heavy", tmp_path / "cases", 8)
    assert case["verified"] is None
    assert case["next_measurement"] is not None
