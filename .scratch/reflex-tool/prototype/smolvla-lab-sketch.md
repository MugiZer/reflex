# PROTOTYPE (rough, reactable): SmolVLA lab interface + layout + Colab entry

Ticket: #122. Status: sketch for human reaction — nothing here is decided until
grilled. Real builder + replay module get written under #123 following whatever
this becomes.

## 1. Repo-committed (frozen, reviewed diffs only)

```text
smolvla/
  corpora/
    main-1000.jsonl    # 1,000 frozen frames: {frame_id, episode_idx, frame_idx}
    smoke-250.jsonl    # 250 smoke IDs referencing main frame_ids (no duplication)
    HEADER (first line or sidecar *.header.json):
      dataset id+rev, frozen instruction bytes, six preprocessing pins +
      stats hashes, warmup holdout frame list (5 pinned frames)
  replay.py            # device(fault, seed) seam impl (written under #123)
  build_corpus.py      # deterministic manifest builder/validator + tests (#123)
```

## 2. Colab runtime layout (existing `<root>/<fault>/<seed>` pattern, unchanged)

```text
/content/reflex_runs/<COMMIT>/
  smolvla-replay-v1/
    healthy/
      11/ 17/ 23/            # repeat IDs, one dir per repeat
        manifest.json        # pre-run pins: software sidecar, corpus path+SHA,
                             # RNG constants, warmup spec, commit (never unknown)
        trace.json           # Kineto chrome export, measured region only
        metrics.json         # per-request arrays + derived summaries + warmup medians
        fingerprints.json    # per-frame facts: id/shape/dtype/chunk/mean+std/sha
        stats.json           # harness counters (dropped/correlation misses)
        freeze.txt           # pip freeze audit
        DONE                 # atomic last, sha-verified (existing semantics)
  smolvla-dataset.jsonl      # ingest output — SEPARATE file from the fault-matrix
                             # dataset.jsonl (no mixed vocabularies in one pool)
```

Seeds 11/17/23 via the existing REFLEX_SEEDS override. Drive backup reuses the
Cell 7 pattern (`.../reflex-colab-t4/<date>/`, whole tree).

## 3. Baseline-vs-candidate interface (no new tooling)

```text
known-good COMMIT  -> fixed replay -> smolvla-dataset.jsonl @ <COMMIT-good>/
candidate COMMIT   -> SAME replay -> smolvla-dataset.jsonl @ <COMMIT-cand>/
```

- Same notebook, same corpus SHA, same seeds; only the checked-out ref differs.
- Candidate runs use fault="candidate" (never the suspected cause); pairing falls
  out of the existing pair_corpus key (workload, seed, hardware) — "candidate"
  structurally occupies the faulty side against "healthy".
- No slowdown injection anywhere on this path, by construction (nothing to inject
  with — the harness has no fault knob).

## 4. Colab entry: separate notebook reusing the 7-cell pattern

New `colab/SmolVLA_T4_replay.ipynb` (fault-matrix runner untouched):

| Cell | Does | Reuses |
|------|------|--------|
| 1 | T4 probe + RUNS dir | Cell 1 verbatim |
| 2 | clone @ REFLEX_REF, COMMIT, install lerobot pins + ffmpeg | Cell 2 pattern, SmolVLA pins |
| 3 | import probe: SmolVLAPolicy + dataset read, no hardware extras | new (fails fast on import) |
| 4 | matrix: workload smolvla-replay-v1, faults (healthy,), seeds, corpus load + SHA check | Cell 4 pattern |
| 5 | device(): setup → 5×2 warmup → sync → Kineto(measured) → events/wall timing → 4 artifacts + freeze | Cell 5 pattern + #120/#121 contracts |
| 6 | run_pipeline + publish (commit, corpus SHA, pipeline, gaps) | Cell 6 pattern |
| 7 | optional Drive backup | Cell 7 verbatim |

Restartable from a clean runtime: no undocumented steps, resume via DONE scan,
corpus SHA mismatch aborts before profiling (never silently re-base).

## Open points for reaction (R1–R4 below)
