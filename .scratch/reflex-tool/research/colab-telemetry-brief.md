# Research brief: Colab/NVIDIA telemetry — what hardware actually yields

Date: 2026-09-04. Three tracks. Bottom line up front: L1/L2 evidence is
collectible on Colab today; L3 deep profiling is host-blocked on every tier
including Pro. The architecture's escalation ladder survives contact with
reality intact — L3 stays synthetic until admin hardware.

## Verdict table (Colab free / Pro / Kaggle)

- `nsys profile --trace=cuda,nvtx,osrt`: CONDITIONAL-WORKS everywhere
  (install per session; CUPTI/driver version skew is the failure mode).
- `nsys stats` + sqlite/csv export: WORKS everywhere (offline, no perms).
- `nvidia-smi` queries: WORKS everywhere (NVML, not perf counters).
- CUPTI Activity/Callbacks (custom tracer, incl. cupti-python): WORKS
  unprivileged — explicitly exempt from HWPM restrictions since CUDA 10.2
  (NVIDIA forum #358215). Same version-skew caveat.
- CUPTI counters / `--gpu-metrics-*`: BLOCKED all tiers (notebook root is
  not host admin; `NVreg_RestrictProfilingToAdminUsers` and R610+ caps nodes
  are host-side, unreachable).
- PC sampling / Nsight Compute source-level: BLOCKED all tiers (HWPM).
- Pro changes GPU availability only, never permissions.

## Corrections to our premises

- Colab free HAS root/sudo — install via runfile `--toolkit` or .deb works;
  `nvidia-smi`-level queries fine. "No sudo" lore is stale (2019).
- nsys is NOT preinstalled — budget reinstall every session (VMs ephemeral);
  pin the version in the manifest (schema/behavior skew across versions).
- Dominant hardware: T4 (cc7.5) free; P100/T4x2 Kaggle; L4/A100 paywalled
  and never guaranteed. Design the corpus around T4, record the card.
- Session limits: ~12h/90min-idle free, 24h Pro, 9h + 30h/week Kaggle.
  Artifacts must leave the VM immediately (Drive mount / Kaggle output).

## Consequences for our code (action list)

1. Collector recipe: per-session nsys install (pinned) → `nsys profile
   -o run --force-overwrite --export=sqlite --trace=cuda,nvtx,osrt
   --sample=none --cpuctxsw=none [--cuda-event-trace=true] workload` →
   verify row counts → `nsys stats` CSVs → copy `.nsys-rep` + `.sqlite` +
   manifest off-VM immediately. NVTX per-request ranges when the workload
   supports them (`--capture-range=nvtx`), else short `--delay/--duration`.
2. Importer must handle the REAL schema, not just our mirror: RUNTIME vs
   DRIVER table split (probe sqlite_master, UNION), StringIds indirection
   for ALL names, correlationId joins within one process only, safe column
   subset (start/end/deviceId/contextId/streamId/correlationId +
   shortName/demangledName/grid/block/registers; bytes/copyKind/srcKind/
   dstKind; syncType), enum resolution via docs (copyKind/srcKind/memKind),
   overlap from same-device interval comparison, timestamps INT ns with
   duration=end-start. Never SELECT *; never assume mangled names exist.
3. cupti-python (official PyPI, 13.x, Linux-only) covers our L2 needs
   (Activity incl. correlation, PM sampling, profiler-host) but NOT Range
   Profiling / PC Sampling / SASS — no Python path to stall reasons; use
   nsys where it reaches, synthetic stubs where it can't.
4. Keep L3 synthetic with explicit flags until admin hardware: the only
   honest posture on Colab. The escalation gate (expected-value-gated deep
   profiling) is validated by this constraint, not weakened by it.
5. Manifest additions: nsys version, CUDA/driver versions, GPU model,
   `--trace` variant used (cuda vs cuda-sw/HES fallback), perf_event
   status (`nsys status -e`), install method. Version skew is THE failure
   mode: CUPTI/driver mismatch → `CUPTI_ERROR_INVALID_DEVICE` on flush;
   old `.nsys-rep` re-export won't backfill new columns.

## Source index

- nsys CLI/export/stats: UserGuide, InstallationGuide, AnalysisGuide,
  ReleaseNotes (docs.nvidia.com/nsight-systems); sqlite schema: archived
  2022.4 nsys-exporter page + in-install `/documentation/nsys-exporter/`.
- CUPTI Activity/correlation/buffers: CUPTI main guide + Activity API group
  docs (docs.nvidia.com/cupti/); PC Sampling / Profiler / Result API groups.
- Permissions: ERR_NVGPUCTRPERM pages (developer.nvidia.com); forum #358215
  (Activity exempt); UserGuide `--gpu-metrics-devices` elevated note.
- cupti-python: PyPI + docs.nvidia.com/cupti-python (13.3.x, lineage 12.6).
- Colab/Kaggle constraints: Colab FAQ; SO#75972459 (install/provisioning),
  SO#76784746 (.deb), SO#50560395, SO#79972459-type flush errors;
  WBuchwalter colab_gpu_profiling notebook; mccormickml 2024 GPU survey;
  Kaggle efficient-gpu-usage docs + discussions/product-feedback/361104.
