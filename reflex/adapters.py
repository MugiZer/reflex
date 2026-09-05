"""Adapter registry: named plug points, no framework.

Kinds and contracts (duck-typed; a mismatch raises KeyError/TypeError at
lookup, never silently):
- framework(name) -> fn(bundle) -> lineage list (see reconstruct.adapt_lineage).
- profiler(name) -> fn(source) -> bundle dict. kineto takes a parsed
  Chrome-trace doc; nsys-subset takes a sqlite path.
- device(name) -> fn(fault, seed) -> {artifact_name: bytes} (see collect()).
  No builtin: devices are environment-bound (Colab nsys vs test fake);
  register yours at the call site.
- storage(name) -> path-like root for collection trees (see collect()).
  "local-fs" is the identity: the path itself.

Second adapters (second framework, AMD/ROCm profiler, Drive/GCS storage)
register one line each; nothing here changes. Unregistered names raise with
the available list so typos fail loudly.
"""
from __future__ import annotations

KINDS = ("framework", "profiler", "device", "storage")

_registry: dict[str, dict[str, object]] = {k: {} for k in KINDS}


def register(kind: str, name: str, obj: object) -> object:
    """Register (and return) obj so @register can decorate factories."""
    if kind not in _registry:
        raise ValueError(f"unknown adapter kind {kind!r}; kinds: {KINDS}")
    if not name or not isinstance(name, str):
        raise ValueError(f"adapter name must be a non-empty string: {name!r}")
    _registry[kind][name] = obj
    return obj


def get(kind: str, name: str) -> object:
    """Resolve one adapter; KeyError lists what exists (typos fail loudly)."""
    try:
        table = _registry[kind]
    except KeyError:
        raise ValueError(f"unknown adapter kind {kind!r}; kinds: {KINDS}") from None
    try:
        return table[name]
    except KeyError:
        raise KeyError(
            f"no {kind} adapter {name!r}; available: {sorted(table)}") from None


def available(kind: str | None = None) -> dict[str, list[str]]:
    """Snapshot of registered names per kind (or one kind)."""
    if kind is not None:
        if kind not in _registry:
            raise ValueError(f"unknown adapter kind {kind!r}; kinds: {KINDS}")
        return {kind: sorted(_registry[kind])}
    return {k: sorted(v) for k, v in _registry.items()}


def _builtins() -> None:
    from . import collect as _collect
    from . import reconstruct as _recon
    register("framework", "torch-aten", _recon.adapt_lineage)
    register("profiler", "kineto", _collect.kineto_to_bundle)
    register("profiler", "nsys-subset", _collect.nsys_subset_to_bundle)
    register("storage", "local-fs", lambda root: str(root))


_builtins()
