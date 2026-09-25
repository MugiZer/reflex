"""Async observation->action loop on monotonic clocks + calibration harness (ticket 03)."""
from __future__ import annotations

import asyncio
import random
import statistics
import time
import json
import queue
import threading
from collections import deque
from pathlib import Path

from .ledger import Evidence, Ledger

PROVENANCE = "runtime"


class HindsightRing:
    """Bounded nonblocking hindsight buffer; drops oldest, counts every drop."""

    def __init__(self, capacity: int = 16, *, byte_limit: int = 1_048_576,
                 age_s: float = 60, pin_bytes: int = 1_048_576, clock=time.monotonic) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self._buf: deque = deque(maxlen=capacity)
        self.dropped = 0
        self.byte_limit, self.age_s, self.pin_bytes = byte_limit, age_s, pin_bytes
        if byte_limit < 1 or age_s <= 0 or pin_bytes < 1:
            raise ValueError("positive retention limits required")
        self._meta = deque()
        self._bytes = 0
        self._clock = clock
        self._lock = threading.Lock()
        self._pins = {}
        self._pinned_bytes = 0
        self._sequence = 0

    def _evict(self, now, incoming=0):
        while self._buf and (len(self._buf) == self._buf.maxlen and incoming or
                             self._bytes + incoming > self.byte_limit or
                             now - self._meta[0][0] > self.age_s):
            self._buf.popleft()
            self._bytes -= self._meta.popleft()[1]
            self.dropped += 1

    def push(self, obs: dict) -> None:  # never blocks: evict-oldest + count
        size = len(json.dumps(obs, allow_nan=False).encode())
        with self._lock:
            now = self._clock()
            self._sequence += 1
            if size > self.byte_limit:
                self.dropped += 1
                return
            self._evict(now, size)
            self._buf.append(obs)
            self._meta.append((now, size, self._sequence))
            self._bytes += size
            for pin in self._pins.values():
                if pin["remaining"] > 0:
                    pin["remaining"] -= 1
                    self._retain(pin, obs, size, self._sequence)

    def snapshot(self) -> list:
        with self._lock:
            self._evict(self._clock())
            return list(self._buf)

    def take(self):
        with self._lock:
            self._evict(self._clock())
            records = list(self._buf)
            self._buf.clear()
            self._meta.clear()
            self._bytes = 0
            return records

    def _retain(self, pin, obs, size, seq):
        if self._pinned_bytes + size > self.pin_bytes:
            pin["lost_sequences"].append(seq)
        else:
            pin["records"].append(obs)
            pin["sequences"].append(seq)
            pin["bytes"] += size
            self._pinned_bytes += size

    def pin(self, identity, predicate=lambda row: True, post_window=0):
        with self._lock:
            if not 0 <= post_window <= self._buf.maxlen:
                raise ValueError("post-trigger window exceeds bounded ring capacity")
            self._evict(self._clock())
            if identity in self._pins:
                return self._pins[identity]
            if len(self._pins) >= self._buf.maxlen:
                return {"records":[],"sequences":[],"lost_sequences":[m[2] for m in self._meta],
                        "bytes":0,"remaining":0,"unavailable_predecessors":self.dropped,
                        "reason":"pin count capacity exhausted"}
            pin = dict(records=[], sequences=[], lost_sequences=[], bytes=0,
                       remaining=post_window, unavailable_predecessors=self.dropped)
            for obs, (_, size, seq) in zip(self._buf, self._meta):
                if predicate(obs):
                    self._retain(pin, obs, size, seq)
            self._pins[identity] = pin
            return pin

    def release_pin(self, identity):
        with self._lock:
            pin = self._pins.pop(identity)
            self._pinned_bytes -= pin["bytes"]
            return pin

    def clear(self) -> None:
        self.take()

    def __len__(self) -> int:
        with self._lock:
            return len(self._buf)


class BoundedDrain:
    """Disk I/O never runs in the producer; loss is explicit when capacity is spent."""

    def __init__(self, write, capacity=256):
        self.queue = queue.Queue(capacity)
        self.write = write
        self.dropped = 0
        self.error = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def push(self, record):
        try:
            self.queue.put_nowait(record)
            return True
        except queue.Full:
            self.dropped += 1
            return False

    def _run(self):
        while not self._stop.is_set() or not self.queue.empty():
            try:
                item = self.queue.get(timeout=.05)
            except queue.Empty:
                continue
            try:
                self.write(item)
            except Exception as exc:
                self.error = str(exc)
                self.dropped += 1
            finally:
                self.queue.task_done()

    def close(self, timeout=5):
        self._stop.set()
        self._thread.join(timeout)
        return {"dropped": self.dropped, "pending": self.queue.qsize(),
                "complete": not self._thread.is_alive() and self.error is None,
                "error": self.error}


def measure_collector_overhead(workload, collector, pairs=8, seed=0):
    """Measure actual off/on assigned blocks; workload returns deadline/tail and coverage outcomes."""
    from .network_analysis import paired_schedule
    rows = []
    for block, arm in enumerate(paired_schedule(pairs, seed)):
        cpu, start = time.process_time(), time.monotonic()
        handle = None
        cleanup = None
        try:
            if arm == "treatment":
                handle = collector.start()
            outcomes = workload(block, arm)
            if not {"eligible", "deadline_misses", "tail", "coverage"} <= outcomes.keys():
                raise ValueError("deadline, tail and coverage outcomes required")
        finally:
            if handle is not None:
                cleanup = collector.stop(handle)
        rows.append({"block":block,"arm":arm,"outcomes":outcomes,"collector":cleanup,
                     "seconds":time.monotonic()-start,"cpu_seconds":time.process_time()-cpu})
    return {"blocks":rows,"assignment_seed":seed,
            "limitation":"observed block effects; historical mean overhead does not certify tail bounds"}


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
        from .fakegpu import generate
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
        snap = self.ring.take()
        for obs in snap:  # ponytail: one Evidence per obs, no batching/coalescing; add batching if flush cost matters
            await asyncio.to_thread(self.ledger.append_evidence, Evidence(
                correlation_id=obs["correlation_id"], provenance=PROVENANCE,
                kind="hindsight", payload={"l1": obs["l1"], "kernel": obs["kernel"]}, synthetic=True))
        return len(snap)

    async def run_with_trigger(self, n_ticks: int, trigger_at: int, post_window: int) -> dict:
        from .fakegpu import generate
        total = max(n_ticks, trigger_at + 1 + post_window)
        bundle = generate(self.seed, self.profile, total)
        pre: list = []
        post = []
        for i in range(total):
            self.ring.push(self._obs(bundle, i))
            if i == trigger_at:
                pre = self.ring.snapshot()
            elif trigger_at < i <= trigger_at + post_window:
                post.append(self.ring.snapshot()[-1])
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
