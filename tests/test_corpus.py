"""Ticket 04 proofs: 11-family corpus, hidden ground truth, deterministic regen."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.corpus import (EXPECTED_METRIC, FAMILIES, LABELS, SEED_TABLE, corpus_report,
                           generate_case, generate_corpus, imports_corpus_source,
                           label_importers, record_corpus, signature)
from reflex.fakegpu import PRESETS, generate
from reflex.ledger import Ledger

N = 8


def test_all_eleven_presets_generate_and_validate(tmp_path: Path) -> None:
    assert len(FAMILIES) == 11 and set(FAMILIES) | {"healthy"} == set(PRESETS)
    assert sorted(LABELS.values()) == sorted(FAMILIES)  # table covers each family once
    assert len({s for s, _, _ in SEED_TABLE}) == 11
    ledger = Ledger(tmp_path / "corpus.jsonl")
    recorded = record_corpus(ledger, N)  # every bundle through the real Ledger API
    assert set(recorded) == set(LABELS) and all(len(t) == N for t in recorded.values())
    assert len(ledger.traces) == 11 * N
    assert all(t.synthetic and t.correlation_id for t in ledger.traces.values())
    assert all(e.synthetic and e.correlation_id for e in ledger.evidence.values())
    assert Ledger(tmp_path / "corpus.jsonl").snapshot() == ledger.snapshot()


def test_signatures_distinguishable_in_report() -> None:
    report = corpus_report(N)
    assert set(report) == set(FAMILIES)
    for preset, entry in report.items():
        assert entry["seed"] in LABELS and LABELS[entry["seed"]] == preset
        for key in EXPECTED_METRIC[preset]:  # live bundles, no hardcoded values
            assert key in entry["distinguishing"], (preset, key)
            if key == "serialized":
                assert entry["signature"][key] is True and entry["baseline"][key] is False
            else:
                assert entry["signature"][key] > entry["baseline"][key], (preset, key)
    vecs = [json.dumps(signature(generate(7, f, N)), sort_keys=True) for f in FAMILIES]
    healthy = json.dumps(signature(generate(7, "healthy", N)), sort_keys=True)
    assert len(set(vecs)) == 11 and healthy not in set(vecs)  # pairwise distinct families


def test_labels_hidden_from_diagnosis_path(tmp_path: Path) -> None:
    assert label_importers() == []  # real AST scan of the reflex package
    # red-capability: the scanner flags real offender shapes, passes clean ones
    for bad in ("from reflex.corpus import LABELS\n", "from .corpus import SEED_TABLE\n",
                "import reflex.corpus\n", "from . import corpus\n",
                "def f():\n    from reflex.corpus import EXPECTED_METRIC\n"):
        assert imports_corpus_source(bad), bad
    for good in ("from .fakegpu import PRESETS\n", "from reflex.ledger import Ledger\n",
                 "import ast\n", "x = 'reflex.corpus'\n"):
        assert imports_corpus_source(good) == [], good
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "corpus.py").write_text("LABELS = {}\n", encoding="utf-8")
    (pkg / "offender.py").write_text("from .corpus import LABELS\n", encoding="utf-8")
    (pkg / "clean.py").write_text("from .fakegpu import PRESETS\n", encoding="utf-8")
    found = label_importers(pkg)  # the real scanner, not the helper, convicts
    assert len(found) == 1 and found[0].endswith("offender.py:1")


def test_corpus_regenerates_deterministically_from_table() -> None:
    first, second = generate_corpus(N), generate_corpus(N)  # regen proves it, no hashes
    assert first == second
    for seed, preset, _ in SEED_TABLE:
        assert first[seed] == generate_case(seed, N) == generate(seed, preset, N)
        assert first[seed]["profile"] == preset
    assert {seed for seed, _, _ in SEED_TABLE} == set(first)
