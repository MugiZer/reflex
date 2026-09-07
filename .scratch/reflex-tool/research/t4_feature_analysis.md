# T4 trace feature analysis

Source: [Drive collection folder](https://drive.google.com/drive/folders/1c76xMtbfajVQyhlmIVIv3Z5XtZy7EsOS), aggregate dataset.jsonl, run 20260906T035951Z-e5fe9621, commit ed66056.

## Method

Computed one row per collected bundle (36 rows: 12 fault labels × 3 seeds). Each fault row is compared with the healthy row for the same seed, on the same Tesla T4/software context. Percent deltas compare the mean of the three fault rows with the mean of the three healthy baselines. trace_span_ms is the span of recorded Kineto events, not wall-clock runtime.

Features include CPU launch count and duration, GPU kernel count and duration, transfer count/bytes, synchronization edges, p95 durations, CPU→GPU correlation rate, estimated achieved occupancy, stream/thread counts, and bundle coverage flags.

## Quality

- Collection coverage: 36/36 bundles completed; no collection failures, remaining cells, or coverage gaps.
- CPU→GPU correlation: 100% for every bundle.
- Synchronization edges extracted: 0 total.
- Coverage flags (timeline/counters/stalls/tensors): true/false/false/false. Counters, stall metrics, and tensor metadata were not present in this export.

## Same-seed fault comparison

| Fault | GPU kernels healthy → fault | GPU time ms healthy → fault | Transfers healthy → fault | Transfer bytes healthy → fault | Occupancy % healthy → fault | Direction by seed (kernels / bytes) |
|---|---:|---:|---:|---:|---:|---|
| batching_delay | 60 → 73.67 (22.78%) | 0.68 → 1.89 (179.34%) | 0 → 6.33 | 0 → 3242.67 | 56.67 → 77.33 | +++ / +++ |
| bw_pressure | 60 → 40 (-33.33%) | 0.68 → 3.22 (377.2%) | 0 → 20 | 0 → 80 | 56.67 → 100 | --- / +++ |
| competing_workload | 60 → 80 (33.33%) | 0.68 → 3.1 (359.08%) | 0 → 0 | 0 → 0 | 56.67 → 55 | +++ / === |
| cpu_starvation | 60 → 40 (-33.33%) | 0.68 → 1.67 (147.27%) | 0 → 0 | 0 → 0 | 56.67 → 55 | --- / === |
| kernel_regression | 60 → 120 (100%) | 0.68 → 1.15 (70.86%) | 0 → 0 | 0 → 0 | 56.67 → 33.33 | +++ / === |
| launch_overhead | 60 → 180 (200%) | 0.68 → 1.04 (54.49%) | 0 → 0 | 0 → 0 | 56.67 → 1.22 | +++ / === |
| preprocessing_interference | 60 → 20 (-66.67%) | 0.68 → 1.11 (64.25%) | 0 → 20 | 0 → 20971520 | 56.67 → 10 | --- / +++ |
| queue_contention | 60 → 80 (33.33%) | 0.68 → 3.53 (422.93%) | 0 → 0 | 0 → 0 | 56.67 → 55 | +++ / === |
| stalls | 60 → 60 (0%) | 0.68 → 0.42 (-37.77%) | 0 → 0 | 0 → 0 | 56.67 → 56.67 | === / === |
| sync_serialization | 60 → 40 (-33.33%) | 0.68 → 1.1 (62.93%) | 0 → 0 | 0 → 0 | 56.67 → 55 | --- / === |
| transfer_heavy | 60 → 20 (-66.67%) | 0.68 → 6.65 (884.71%) | 0 → 60 | 0 → 167782400 | 56.67 → 50 | --- / +++ |

The clearest signatures are transfer-related faults (nonzero transfer counts/bytes), launch overhead (3× kernel count and sharply lower occupancy), kernel regression (2× kernel count with lower occupancy), and queue/competing workload (higher GPU time with more kernels). stalls has weak separation in these selected features and needs richer stall/counter instrumentation.

## Artifacts

- [Per-run feature table](./t4_feature_table.csv)
- [Fault-vs-healthy summary](./t4_fault_vs_healthy.csv)
- Raw [collection folder](https://drive.google.com/drive/folders/1c76xMtbfajVQyhlmIVIv3Z5XtZy7EsOS)

