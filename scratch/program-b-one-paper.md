# Program B one-paper Pass-2 analyst

Analyze exactly the paper in `row.json`; it is the only corpus input. Start with
the abstract and retrieve public material only for decisive method/evidence
details. Do not inspect other corpus material, workers, progress, repository
files, clustering, deduplication, synthesis, or project selection.

## Scope and mechanism recognition

Find zero or more concrete runtime-observability mechanisms. A mechanism is a
supported chain: **runtime evidence/signal → operation/intervention → diagnostic
effect**. Runtime domains, telemetry names, motivations, and downstream uses do
not independently earn a mechanism. Split only for independent operations with
their own chain, method evidence, and testability; keep ordinary tracing
pipeline stages together. Name minimally as `[distinctive signal/model/criterion]
+ [operative intervention]` without incidental platform, robot, protocol,
benchmark, or implementation terms.

Give exactly one earned primary lane. B1 clock comparability; B2 logical
execution identity; B3 causal relationship reconstruction; B4 root-cause/first
divergence; B5 critical-path latency; B6 tail latency/jitter/stragglers; B7
queueing/scheduling/contention; B8 transport behavior; B9 information age;
B10 inference serving phases; B11 accelerator contribution; B12 unreliable or
perturbing telemetry; B13 middleware/executor behavior; B14 sensor acquisition;
B15 software-to-device command; B16 intended-to-actual action mapping; B17
error-to-safe-stop propagation; B18 record/replay; B19 controlled fault;
B20 bounded-overhead telemetry; B21 recurring multi-session patterns. Supporting
and secondary lanes need distinct roles; prefer empty lists to speculation.
Control/policy design is outside scope unless it supplies a separable
observability mechanism.

## Evidence and classification

Use 1–3 decisive passages with recoverable locations. VERIFIED means direct
retrieved support; INFERRED means our abstraction, lane mapping, or Reflex
transfer; UNKNOWN means not established. Distinguish author claim, empirical
support, domain-independent primitive, and proposed Reflex transfer. Capture
one strongest readily verifiable result or UNKNOWN. Retrieval failure is
RETRIEVAL_FAILED, never DROP.

GEM is concrete, distinctive, well-supported, and unusually useful; KEEP is
concrete and credibly supported; RESERVE is plausible but weak/adjacent or
unresolved; DROP follows targeted evidence of no useful mechanism; and
NEEDS_DEEP_REVIEW records a promising mechanism needing disproportionate
reading. Use RESERVE on a real RESERVE/DROP tie.

Possible Reflex seams are: clock_timestamp, trace_identity, causal_execution,
root_cause, critical_path, tail_latency, queue_scheduling, transport, freshness,
inference_serving, accelerator, telemetry_reliability, middleware_executor,
sensor_boundary, driver_hardware_boundary, action_execution, error_safe_stop,
record_replay, fault_injection, low_overhead_tracing, cross_session_patterns,
other, unclear.

## Required output

Return JSON only: one non-empty array. Each retained/deep-review mechanism must
include every field: `paper_id`, `paper_title`, `year`, `source_lane`,
`first_pass_classification`, `mechanism_id`, `mechanism_name`,
`exact_mechanism`, `input_signal`, `operation_or_intervention`,
`domain_independent_primitive`, `primary_lane` (B1–B21 or UNKNOWN),
`supporting_lanes`, `secondary_lanes`, `recognition_uncertainty`,
`possible_reflex_seam`, `reflex_transfer_hypothesis`,
`strongest_empirical_result`, `strongest_empirical_result_status`
(VERIFIED/UNKNOWN), `supporting_passages` (1–3 objects exactly `text` and
`source_location`), `evidence_status` (exactly `exact_mechanism`,
`input_signal`, `operation_or_intervention`, `domain_independent_primitive`,
`lane_assignment`, `reflex_transfer_hypothesis`, `strongest_empirical_result`),
`second_pass_classification` (GEM/KEEP/RESERVE/NEEDS_DEEP_REVIEW),
`classification_reason`, and `unresolved_question` (only required for
NEEDS_DEEP_REVIEW; otherwise null).

For no mechanism or retrieval failure, return exactly one object with
`paper_id`, `paper_title`, `terminal_outcome` (DROP or RETRIEVAL_FAILED), and
`reason`.
