"""Ticket 15: James-Stein shrinkage over per-family voice accuracies.

Takes measured per-family voice accuracies (tournament benchmark rows:
``voice_agree`` per family, or per-voice correctness rates over fit families)
and returns positive-part James-Stein-shrunk estimates that feed
``confidence.fit_values`` unchanged (same ``{voice: float}`` table shape).

Estimator (homoscedastic, shrink toward the grand mean; needs p >= 3)::

    grand = mean(y); S = sum((y - grand)^2); s2 = mean(variances)
    c = max(0, 1 - (p - 2) * s2 / S);  shrunk = grand + c * (y - grand)

``c`` is the shrinkage factor (1 = raw passthrough, 0 = full pooling to the
grand mean). S is centered: shrinkage is toward the grand mean (the
uncentered ``||y||^2`` form shrinks toward zero instead).

Wiring recipe: per-voice correctness over fit families -> per-voice means +
binomial variances -> ``shrink`` across voices (p = 6 >= 3) -> the returned
``shrunk`` dict goes straight into ``confidence.fit_values``.

Degenerate inputs fall back to raw means with factor 1.0 (never NaN, never
fabricated precision): fewer than 3 groups, identical values (S = 0), or
zero sampling variance. Variances are required input -- without a noise
scale there is nothing honest to shrink by, so ``variances=None`` raises
instead of inventing one.

# ponytail: pooled (homoscedastic) s2 = mean(variances); the NEST
# heteroscedastic form (per-group s2_i inside the factor) is the documented
# upgrade when groups have very unequal precision -- not this slice.
"""
from __future__ import annotations

import math
import statistics

METHOD = ("james-stein-positive-part toward grand mean "
          "(pooled homoscedastic s2; NEST heteroscedastic is the upgrade)")


def shrink(means: dict, variances: dict | None = None) -> dict:
    """Shrink per-group estimates toward their grand mean.

    Args:
        means: {group: observed mean} (all finite floats).
        variances: {group: sampling variance of the mean}, same keys.
            Required -- see module docstring.

    Returns {"shrunk": {group: float}, "factor": c, "method": str,
    "grand_mean": float}. Degenerate cases return the raw means with
    factor 1.0 and the reason appended to "method".
    """
    if not means:
        raise ValueError("shrink needs at least one estimate")
    if variances is None:
        raise ValueError("shrink needs sampling variances (refusing to invent a noise scale)")
    if set(variances) != set(means):
        raise ValueError("means/variances key mismatch: %s vs %s"
                         % (sorted(means), sorted(variances)))
    for k in means:
        for v, tag in ((means[k], "means"), (variances[k], "variances")):
            if not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError("non-finite %s[%r]: %r" % (tag, k, v))
            if tag == "variances" and v < 0:
                raise ValueError("negative variances[%r]: %r" % (k, v))
    keys = list(means)
    y = [float(means[k]) for k in keys]
    p = len(keys)
    grand = statistics.fmean(y)
    if p < 3:
        return {"shrunk": dict(zip(keys, y)), "factor": 1.0,
                "method": METHOD + "; p=%d<3: James-Stein needs p>=3, raw means" % p,
                "grand_mean": grand}
    S = math.fsum((v - grand) ** 2 for v in y)
    s2 = statistics.fmean(float(variances[k]) for k in keys)
    if S <= 0:
        return {"shrunk": dict(zip(keys, y)), "factor": 1.0,
                "method": METHOD + "; identical values (S=0): raw means",
                "grand_mean": grand}
    if s2 <= 0:
        return {"shrunk": dict(zip(keys, y)), "factor": 1.0,
                "method": METHOD + "; zero sampling variance: raw means",
                "grand_mean": grand}
    c = min(1.0, max(0.0, 1.0 - (p - 2) * s2 / S))
    return {"shrunk": {k: grand + c * (v - grand) for k, v in zip(keys, y)},
            "factor": c, "method": METHOD + "; applied", "grand_mean": grand}
