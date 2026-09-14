"""Shard splitter contract: contiguous, order-preserving, never empty."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from workloads.smolvla.replay import _chunks


def test_single_shard_identity():
    xs = list(range(10))
    assert _chunks(xs, 1) == [xs]


def test_even_split_preserves_order():
    out = _chunks(list(range(1000)), 4)
    assert len(out) == 4
    assert [len(c) for c in out] == [250, 250, 250, 250]
    assert [x for c in out for x in c] == list(range(1000))


def test_uneven_split_covers_all():
    out = _chunks(list(range(10)), 3)
    assert [x for c in out for x in c] == list(range(10))
    assert all(out)


def test_more_shards_than_items():
    out = _chunks([1, 2], 5)
    assert [x for c in out for x in c] == [1, 2]
    assert all(out)


def test_invalid_shards():
    import pytest
    with pytest.raises(ValueError):
        _chunks([1], 0)
