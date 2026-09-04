# Choose the GPU emulator and fake-evidence contract

Status: resolved
Type: research
Blocked by: none

## Question

Which high-level GPU emulator (found on GitHub or equivalent) will the working tool run on instead of real CUDA hardware, and what is the exact fake-evidence contract at each GPU evidence level (Level 1 cheap state, Level 2 event evidence, Level 3 deep profiling) so the full architecture — fast path, cross-layer context, deep ladder — runs end-to-end on a no-GPU PC with stable interfaces for a later real-GPU swap?

## Answer

Decision: build a purpose-built stochastic FakeGPU in pure Python (~200–400 LOC) emitting Kineto Chrome-trace JSON + a minimal nsys-sqlite-subset, with an InferSim-roofline timing core, NeuSight-style duration priors, and a seeded `FaultProfile` covering the doc's fault families; mirror parcagpu field names and TraceSmith/Kineto conventions so a real CUPTI reader drops in later. Cycle-accurate simulators (Accel-Sim/GPGPU-Sim) and CUDA-mock shims rejected — full rationale, field-level L1/L2/L3 contract, and risks in `../research/gpu-emulator.md`. This unblocks the reconstruction and deep-ladder tickets, which still wait on the schema decision.
