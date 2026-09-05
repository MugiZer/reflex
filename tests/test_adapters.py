"""Adapter registry proofs: resolve, fail loudly, end-to-end through registry."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import adapters as A


def test_builtins_registered_once():
    assert A.available() == {
        "framework": ["torch-aten"],
        "profiler": ["kineto", "nsys-subset"],
        "device": [],
        "storage": ["local-fs"],
    }


def test_unknown_kind_or_name_fails_loudly():
    with pytest.raises(ValueError):
        A.get("nope", "x")
    with pytest.raises(ValueError):
        A.register("nope", "x", object())
    with pytest.raises(ValueError):
        A.register("framework", "", object())
    try:
        A.get("profiler", "nsys-full")
    except KeyError as exc:
        assert "nsys-subset" in str(exc)  # lists what exists
    else:
        raise AssertionError("expected KeyError")


def test_register_returns_obj_for_decorator_use():
    sentinel = object()
    assert A.register("device", "tmp-fake", sentinel) is sentinel
    assert A.get("device", "tmp-fake") is sentinel
    del A._registry["device"]["tmp-fake"]  # suite-local cleanup, not product API
    assert A.available("device") == {"device": []}


def test_profiler_adapter_end_to_end(tmp_path):
    from reflex.fakegpu import generate, write_nsys_sqlite
    bundle = generate(7, "transfer_heavy", 4)
    db = tmp_path / "subset.db"
    write_nsys_sqlite(bundle, db)  # real writer output
    read = A.get("profiler", "nsys-subset")
    back = read(db)  # resolved through the registry, not imported directly
    assert [g["correlation_id"] for g in back["gpu_kernel"]] == \
        [g["correlation_id"] for g in bundle["gpu_kernel"]]
    lin = A.get("framework", "torch-aten")
    assert isinstance(lin(bundle), list) and lin(bundle)
    assert A.get("storage", "local-fs")(tmp_path) == str(tmp_path)
