"""Issue #12: trace envelope stamper. Stdlib only.

Every pushed trace carries commit + fault + seed + env + failure_signature
so the loop diagnoses against the right code. Values are injected by the
caller; this module never reads git/env itself except via git_commit(),
which Ledger/collect never call (they take injected strings).
"""
from __future__ import annotations

UNKNOWN = "unknown"


def stamp(commit: str = UNKNOWN, fault: str = UNKNOWN, seed: int | None = None,
          hardware: str = UNKNOWN, collector_version: str = UNKNOWN,
          timing_model_version: str = UNKNOWN, outcome: str = UNKNOWN,
          reason: str = "", extra_env: dict | None = None) -> dict:
    """Build the envelope dict. extra_env carries device/driver/cuda/
    software/stats only where the caller already collects them."""
    env = {"hardware": hardware, "collector_version": collector_version,
           "timing_model_version": timing_model_version}
    if extra_env:
        env.update(dict(extra_env))
    return {"commit": commit, "fault": fault, "seed": seed, "env": env,
            "failure_signature": {"outcome": outcome, "reason": reason}}


def git_commit(default: str = UNKNOWN) -> str:
    """Full SHA for top-level callers to inject (Ledger/collect never call)."""
    try:
        import subprocess
        from pathlib import Path
        top = Path(__file__).resolve().parents[1]
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=top,
                             capture_output=True, text=True, timeout=10)
        sha = (out.stdout or "").strip()
        return sha if out.returncode == 0 and sha else default
    except Exception:
        return default
