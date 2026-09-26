# Collected SmolVLA/T4 network evidence

This directory preserves all locally retained evidence from six farm runs: 1,663 requests across 237 blocks. See [the results](../../workloads/smolvla/network-results.md) for measurements and physical validation limits.

The seven original archives contain raw client/server/relay evidence, event streams, population manifests, selective CUDA profiler traces, frozen corpus inputs, and private manipulation/restoration records. `supplemental-analysis.tar.gz` preserves later Root ledgers and evaluations that were generated after the original archives. Adjacent JSON files contain summaries, environments, and aggregate counts; Python scripts record the collection and analysis procedure.

Verify adjacent files using `sha256.json`. After extracting all archives into the same directory, verify the original evidence files using `extracted-sha256.json`. Individual runs also contain their original `checksums.json`. Supplemental analyses have their own hashes in the inventory.

**Root input boundary:** feed only each run's `public/` manifests/events to Root. The `private/` directories contain injected assignments and experiment ground truth; publishing them here does not make them valid Root inputs. Keep them separate during evaluation.

These are real SmolVLA/T4 requests over same-host TCP through an application relay. They do not establish separate-host network paths, native packet loss, or verified causal diagnosis. The single initial T4 smoke request was observed during setup but has no separately retained artifact; the preserved totals exclude it.
