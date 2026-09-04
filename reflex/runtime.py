"""Async observation->action loop on monotonic clocks + calibration harness (ticket 03)."""
from __future__ import annotations

import asyncio
import random
import statistics
import time
from collections import deque
from pathlib import Path

from .fakegpu import generate
from .ledger import Evidence, Ledger

PROVENANCE = "runtime"


class HindsightRing:
    """Bounded nonblocking hindsight buffer; drops oldest, counts every drop."""

    def __init__(self, capacity: int = 16) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self._buf: deque = deque(maxlen=capacity)
        self.dropped = 0

    def push(self, obs: dict) -> None:  # never blocks: evict-oldest + count
        if len(self._buf) == self._buf.maxlen:
            self.dropped += 1
        self._buf.append(obs)

    def snapshot(self) -> list:
        return list(self._buf)

    def clear(self) -> None:
        self._buf.clear()

    def __len__(self) -> int:
        return len(self._buf)


class Runtime:
    """Monotonic-clock async loop driven by FakeGPU bundles; flushes via Ledger."""

    def __init__(self, path: str | Path, ring_capacity: int = 16, tick_ms: float = 2.0,
                 seed: int = 7, profile: str = "healthy") -> None:
        self.ledger = Ledger(path)
        self.ring = HindsightRing(ring_capacity)
        self.tick_ms = tick_ms
        self.seed = seed
        self.profile = profile

    def _obs(self, bundle: dict, i: int) -> dict:
        return {"correlation_id": bundle["gpu_kernel"][i]["correlation_id"],
                "l1": bundle["l1"][i], "kernel": bundle["gpu_kernel"][i]["kernel_name"]}

    async def run(self, n_ticks: int, flush_every: int = 0) -> dict:
        bundle = generate(self.seed, self.profile, max(n_ticks, 1))
        t_start = time.monotonic_ns()
        tick_ns = int(self.tick_ms * 1e6)
        intervals, base_dropped = [], self.ring.dropped
        t_next = t_start
        for i in range(n_ticks):
            t0 = time.monotonic_ns()
            self.ring.push(self._obs(bundle, i))
            if flush_every and (i + 1) % flush_every == 0:
                await self.flush()
            t_next += tick_ns  # deadline scheduling: flush cost never shifts the next tick
            delay_s = (t_next - time.monotonic_ns()) / 1e9
            if delay_s > 0:
                await asyncio.sleep(delay_s)
            intervals.append((time.monotonic_ns() - t0) / 1e6)
        new_drops = self.ring.dropped - base_dropped
        if new_drops:
            await asyncio.to_thread(self.ledger.append_evidence, Evidence(
                correlation_id="ring-pressure", provenance=PROVENANCE,
                kind="ring_drop", payload={"dropped": new_drops, "capacity": self.ring._buf.maxlen}))
        return {"ticks": n_ticks, "elapsed_s": (time.monotonic_ns() - t_start) / 1e9,
                "intervals_ms": intervals, "dropped": new_drops, "ring_len": len(self.ring)}

    async def flush(self) -> int:
        snap = self.ring.snapshot()
        for obs in snap:  # ponytail: one Evidence per obs, no batching/coalescing; add batching if flush cost matters
            await asyncio.to_thread(self.ledger.append_evidence, Evidence(
                correlation_id=obs["correlation_id"], provenance=PROVENANCE,
                kind="hindsight", payload={"l1": obs["l1"], "kernel": obs["kernel"]}, synthetic=True))
        self.ring.clear()
        return len(snap)

    async def run_with_trigger(self, n_ticks: int, trigger_at: int, post_window: int) -> dict:
        total = max(n_ticks, trigger_at + 1 + post_window)
        bundle = generate(self.seed, self.profile, total)
        pre: list = []
        for i in range(n_ticks):
            self.ring.push(self._obs(bundle, i))
            if i == trigger_at:
                pre = self.ring.snapshot()
            await asyncio.sleep(self.tick_ms / 1000.0)
        post = []
        for i in range(trigger_at + 1, min(total, trigger_at + 1 + post_window)):
            self.ring.push(self._obs(bundle, i))
            post.append(self.ring.snapshot()[-1])  # preserved from the live ring, not the bundle
            await asyncio.sleep(self.tick_ms / 1000.0)
        return {"pre": pre, "post": post}


async def _measure_pair(extra_s: float, rate: float, ticks: int, tick_ms: float, seed: int
                     ) -> tuple[list[float], list[float]]:
    """Interleaved off/on samples in one loop: load drift hits both sides equally
    and cancels in the delta (sequential off-then-on blocks alias drift as cost)."""
    rng = random.Random(seed)
    off, on = [], []
    for _ in range(ticks):
        t0 = time.monotonic_ns()
        await asyncio.sleep(tick_ms / 1000.0)
        off.append((time.monotonic_ns() - t0) / 1e6)
        t1 = time.monotonic_ns()
        if rng.random() < rate and extra_s > 0:
            await asyncio.sleep(extra_s)
        await asyncio.sleep(tick_ms / 1000.0)
        on.append((time.monotonic_ns() - t1) / 1e6)
    return off, on


async def calibrate(ledger: Ledger, collectors: dict[str, float], rates: list[float],
                    ticks: int = 20, tick_ms: float = 1.0, seed: int = 0,
                    min_samples: int = 2) -> dict:
    """Paired off/on latency+jitter deltas per collector; best = least-perturbing
    rate still useful (rate*ticks >= min_samples). collectors: name -> extra_s cost."""
    # ponytail: mean+pstdev only, no histograms/distribution fits; add when tail attribution matters
    report: dict = {}
    for ci, (name, extra_s) in enumerate(collectors.items()):
        deltas, best, best_cost = {}, None, None
        for ri, r in enumerate(rates):
            off, on = await _measure_pair(extra_s, r, ticks, tick_ms, seed + ci * 7919 + ri)
            off_m, off_j = statistics.mean(off), (statistics.pstdev(off) if len(off) > 1 else 0.0)
            on_m, on_j = statistics.mean(on), (statistics.pstdev(on) if len(on) > 1 else 0.0)
            d = {"d_mean_ms": on_m - off_m, "d_jitter_ms": on_j - off_j,
                 "on_mean_ms": on_m, "off_mean_ms": off_m, "rate": r}
            deltas[r] = d
            if r * ticks >= min_samples and (best_cost is None or d["d_mean_ms"] < best_cost):
                best, best_cost = r, d["d_mean_ms"]
            await asyncio.to_thread(ledger.append_evidence, Evidence(
                correlation_id=f"calibration:{name}", provenance=PROVENANCE,
                kind="calibration", payload={"collector": name, **d}))
        report[name] = {"deltas": deltas, "best_rate": best}
    return report
