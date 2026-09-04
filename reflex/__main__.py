"""reflex CLI: show-me (render), eval (harness), demo (target story)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _cmd_showme(args) -> int:
    from .ledger import Ledger
    from .report import render_showme, resolve_report
    ledger = Ledger(args.ledger)
    if args.incident not in ledger.incidents:
        print(f"error: unknown incident {args.incident!r} in {args.ledger}",
              file=sys.stderr)
        return 2
    summary = json.loads(Path(args.summary).read_text(encoding="utf-8"))
    text = render_showme(args.ledger, args.incident, summary)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    verdict = resolve_report(text, ledger)
    if not verdict["ok"]:
        print("oracle violations: %s" % verdict["violations"], file=sys.stderr)
        return 1
    return 0


def _cmd_eval(args) -> int:
    from .eval import run_eval
    rep = run_eval(args.faults, args.seeds, args.out)
    sys.stdout.write("Top-1 %d/%d  Top-3 %d/%d  verified %d/%d  "
                     "meas %.2f  wall %.1fs\n" % (
                         rep["top1"], rep["n"], rep["top3"], rep["n"],
                         rep["verified"], rep["n"], rep["mean_measurements"],
                         rep["wall_s"]))
    return 0


def _cmd_demo(args) -> int:
    from .eval import run_demo
    from .ledger import Ledger
    from .report import resolve_report
    demo = run_demo(args.out)
    sys.stdout.write(demo["report"])
    ledger = Ledger(demo["case"]["ledger_path"])
    verdict = resolve_report(demo["report"], ledger)
    if not verdict["ok"]:
        print("oracle violations: %s" % verdict["violations"], file=sys.stderr)
        return 1
    ver = demo["case"]["verified"]
    if not ver or not ver["measured_ms"] or ver["measured_ms"] <= 0:
        print("error: demo did not reach a measured recovery", file=sys.stderr)
        return 1
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="reflex",
                                 description="Reflex performance investigator")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("show-me", help="render one incident investigation")
    p.add_argument("--ledger", required=True)
    p.add_argument("--incident", required=True)
    p.add_argument("--summary", required=True,
                   help="run_case summary JSON (computed context lives here)")
    p.add_argument("--out", default=None)
    p.set_defaults(fn=_cmd_showme)
    p = sub.add_parser("eval", help="hidden-fault eval harness")
    p.add_argument("--faults", nargs="+", default=None)
    p.add_argument("--seeds", nargs="+", type=int, default=None)
    p.add_argument("--out", default="eval-out")
    p.set_defaults(fn=_cmd_eval)
    p = sub.add_parser("demo", help="doc target story end to end")
    p.add_argument("--out", default="demo-out")
    p.set_defaults(fn=_cmd_demo)
    args = ap.parse_args(argv)
    if args.cmd == "eval":
        from .eval import FAULT_CAUSE
        if not args.faults:
            args.faults = sorted(FAULT_CAUSE)
        if not args.seeds:
            args.seeds = [11]
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
