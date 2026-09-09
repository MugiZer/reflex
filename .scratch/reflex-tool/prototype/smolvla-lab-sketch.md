# PROTOTYPE (revised after human reaction R1–R4): SmolVLA lab interface

Ticket: #122. Real builder + replay module get written under #123 following
whatever this becomes.

## 1. Repo-committed (frozen, reviewed diffs only)

```text
workloads/smolvla/          # workloads/ parent: OpenVLA/etc. later, same shape
  corpora/
    main-1000.jsonl    # 1,000 frozen frames: {frame_id, episode_idx, frame_idx}
    smoke-250.jsonl    # 250 smoke IDs referencing main frame_ids (no duplication)
    HEADER (first line or sidecar *.header.json):
      dataset id+rev, frozen instruction bytes, six preprocessing pins +
      stats hashes, warmup holdout frame list (5 pinned frames)
  replay.py            # device(fault, seed) seam impl (written under #123)
  build_corpus.py      # deterministic manifest builder (written under #123)
  validate_corpus.py   # frozen-manifest validator + tests (written under #123)
```

Contract, frozen corpora, and implementation stay adjacent.

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
                             # dataset.jsonl. Natural replay and synthetic fault
                             # runs have different semantics; separation must not
                             # depend on key structure alone.
```

Seeds 11/17/23 via the existing REFLEX_SEEDS override. Drive backup reuses the
Cell 7 pattern (`.../reflex-colab-t4/<date>/`, whole tree).

## 3. Baseline-vs-candidate interface (no new tooling)

```text
known-good COMMIT  -> fixed replay -> smolvla-dataset.jsonl @ <COMMIT-good>/
candidate COMMIT   -> SAME replay -> smolvla-dataset.jsonl @ <COMMIT-cand>/
```

- Same notebook, same corpus SHA, same seeds; only the checked-out ref differs.
- Candidate runs use fault="candidate" = "revision being compared", never a
  fault label or diagnosis. Pairing healthy baseline ↔ candidate revision
  matches on workload/corpus, repeat, hardware/context.
- pair_corpus reuse VERIFIED mechanical (collect.py:740-763: plain dict
  grouping on (workload, seed, hardware) with "healthy" as the baseline slot —
  exactly our semantics), with three recorded caveats:
  1. Output labels say "faulty"/embed the fault name — consumers must not read
     a diagnosis into the label.
  2. Version skew is out of the key (collect.py:769-770): two candidate
     revisions in one cell keep the LAST record silently. One candidate per
     cell at a time; history across revisions is the regression effort's
     problem (neutral layer or revision-distinct handling then).
  3. Downstream voices/outcomes/calibration assume fakegpu vocabulary
     (collect.py:764-768): pairs feed retrieval/hand comparison only, never
     calibration, until the real-data semantic adapter exists.
- Corpus SHA is not in the pair key: a corpus change must bump the workload
  version (smolvla-replay-v2), never silently re-base v1.
- No slowdown injection anywhere on this path, by construction.

Core rule: share infrastructure where semantics are identical; separate
anything whose meaning differs.

## 4. Colab entry: separate notebook reusing the 7-cell pattern

New `colab/SmolVLA_T4_replay.ipynb` — never a mode flag on the synthetic
fault-matrix runner (no branching risk there). Genuinely shared helpers get
extracted later from proven duplication, not upfront.

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
