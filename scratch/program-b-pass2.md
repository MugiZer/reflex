# Program B Pass 2 — Mechanism Triage Contract

## Contract

Use this file to triage one Program B paper at a time. It owns the stable
research rules: scope, evidence, classification, output, and stopping.

The launcher owns worker count, model choice, worktree paths, shard assignment,
thread creation, persistence commands, and orchestration.

Program B studies **runtime observability and latency attribution for robot
learning systems**.

Pass 1 maximized paper recall. Pass 2 maximizes mechanism recall. Later passes
will normalize, cluster, deduplicate, deeply review, map to Reflex, and select
projects.

For each paper, answer:

> Does this paper contain a concrete, evidence-backed runtime-observability or
> latency-attribution mechanism worth carrying forward?

Pass 2 is recall-oriented. Preserve a plausible mechanism when targeted
inspection cannot yet settle its value.

## Research posture

Judge the technical primitive rather than paper fame, venue, citation count,
recency, terminology, or immediate implementability. Transfer is in scope when
the primitive applies to Program B, including mechanisms from distributed
systems, tracing, networking, real-time systems, operating systems, performance
engineering, accelerators, middleware, cyber-physical systems, databases,
replay debugging, fault injection, and incident analysis.

Treat Reflex relevance as a transfer signal, never as an automatic
classification. Publicly unknown behavior is `UNKNOWN`, not evidence that a
capability is absent. Adjacent ROS, DDS, CUDA, protocol, or cloud-serving
research supplies mechanisms; it does not establish Reflex's private
architecture.

## Mechanism recognition

For every candidate, use
[`$recognize-program-b-mechanisms`](../../.agents/skills/recognize-program-b-mechanisms/SKILL.md)
for the complete mechanism test, B1-B21 taxonomy, independent-operation split,
minimal naming, lane routing, and collision adjudication. Run it on every
plausible method before applying this contract's evidence and classification
rules. Carry its minimal recognition decision into the mechanism card.

## Reflex relevance map

This map uses public evidence to identify plausible attachment seams. It does
not describe private implementation or prove missing capabilities.

The publicly visible execution path is approximately:

```text
sensor / robot state
-> Observation with timing and identity
-> runtime / transport
-> inference service / accelerator
-> ActionChunk
-> connector / driver / device
-> applied action or safe stop
-> recording / telemetry
```

Public abstractions expose observation capture timing; request, sequence,
session, and control-step identities; pipelined inference; multiple transports;
server and total timing fields in recordings; variable-length action chunks;
connector operations; applied-step, error, timeout, heartbeat, and safe-stop
concepts; and bounded nonblocking recording that may drop steps.

Pay particular attention to these visible seams:

- **Time and identity:** timing and sequence metadata exist at public boundaries,
  while public evidence does not establish one synchronized clock and identity
  model spanning robot, transport, server, accelerator, and device.
- **Pipelined causality:** inference may overlap action application, so temporal
  adjacency alone may misassociate observations, requests, and action chunks.
- **Heterogeneous transport:** WebSocket/JSON, WebRTC DataChannel/SCTP,
  signaling, edge HTTP, and hosted paths create cross-protocol diagnostic seams.
- **Serving and accelerator:** public timing summaries do not themselves
  establish a complete serving-phase or accelerator-correlated critical path.
- **Telemetry trust:** bounded nonblocking recording may omit steps under
  backpressure; absence from a trace is not proof that a runtime event did not
  occur.
- **Physical execution:** camera sources, connectors, action chunks, applied
  steps, drivers, errors, and safe stops create distinct sensor-to-software,
  software-to-device, and intended-to-applied action seams.

Use one `possible_reflex_seam` value:

```text
clock_timestamp
trace_identity
causal_execution
root_cause
critical_path
tail_latency
queue_scheduling
transport
freshness
inference_serving
accelerator
telemetry_reliability
middleware_executor
sensor_boundary
driver_hardware_boundary
action_execution
error_safe_stop
record_replay
fault_injection
low_overhead_tracing
cross_session_patterns
other
unclear
```

The seam and transfer hypothesis are `INFERRED`. A mechanism may be retained
when its seam is `unclear`.

## Thin extraction procedure

### 1. Screen

Inspect the title and abstract. Continue when the paper plausibly contains a
mechanism in Program B territory, including a transferable mechanism from an
adjacent systems domain.

### 2. Recognize candidates

Use `$recognize-program-b-mechanisms` on every plausible method. Record zero or
more minimal recognition decisions; each retained decision must have one
operative intervention and one primary lane or `UNKNOWN`.

### 3. Retrieve decisive passages

Use the paper's terminology to retrieve only enough body evidence to establish:

1. the runtime evidence or signal;
2. the operation or intervention;
3. the diagnostic output or effect; and
4. credible empirical support, when readily available.

Read further only while those questions remain unresolved. Pass 2 does not
require linear full-paper reading or exhaustive experiment extraction.

### 4. Abstract the primitive

State the reusable technical idea beneath the source system. Preserve the
operative diagnostic behavior while abstracting away incidental platforms,
protocols, middleware, hardware, and benchmarks.

### 5. Map a Reflex seam

Record a plausible visible seam and a concise transfer hypothesis. Mark both as
`INFERRED`; use `unclear` when no seam is evident.

### 6. Capture one result

Record the strongest readily verifiable result demonstrating the mechanism.
Prefer a quantitative comparison with metric, baseline, workload, and overhead
when available. Use `UNKNOWN` when targeted inspection does not establish one.

### 7. Save evidence and classify

Attach one to three decisive passages with recoverable source locations. They
must establish the mechanism and, when claimed, the empirical result. Then
assign one terminal outcome under the rules below.

## Evidence rules

Label each substantive field:

- `VERIFIED`: directly supported by retrieved source evidence.
- `INFERRED`: our abstraction, interpretation, lane assignment, or transfer.
- `UNKNOWN`: not established by retrieved evidence.

Keep four layers distinct: the authors' claim, empirical support, the
domain-independent abstraction, and the proposed Reflex transfer. Source
locations must recover each supporting passage. Use exact paper wording in
passages and concise paraphrase elsewhere.

Retrieval failure is `RETRIEVAL_FAILED`, never evidence for `DROP`.

## Classification rules

Classify the mechanism rather than the paper's prestige or first-pass label.

- `GEM`: concrete, meaningfully supported, technically distinctive, and
  unusually strong in transfer or synthesis potential.
- `KEEP`: concrete, credibly supported, and clearly worth later clustering and
  synthesis.
- `RESERVE`: plausible but weakly evidenced, unusual, a supporting variant,
  adjacent evidence, or unresolved enough that dropping it risks losing useful
  information.
- `DROP`: targeted inspection establishes no useful concrete mechanism, only a
  vague finding, genuine scope mismatch, or absence of the supposed mechanism.
- `RETRIEVAL_FAILED`: the source or body evidence required for adequate
  inspection could not be retrieved.
- `NEEDS_DEEP_REVIEW`: a promising mechanism is visible, but resolving it would
  require disproportionate reading during Pass 2. Record the unresolved question.

Choose `RESERVE` when evidence leaves a genuine tie between `RESERVE` and
`DROP`. First-pass `HIGH` does not guarantee retention; first-pass `MEDIUM` does
not prevent `GEM`.

## Output contract

Create one object per distinct retained or deep-review mechanism:

```yaml
paper_id:
paper_title:
year:
source_lane:
first_pass_classification:

mechanism_id:
mechanism_name:
exact_mechanism:
input_signal:
operation_or_intervention:
domain_independent_primitive:

primary_lane: B1-B21 | UNKNOWN
supporting_lanes: []
secondary_lanes: []
recognition_uncertainty:

possible_reflex_seam:
reflex_transfer_hypothesis:

strongest_empirical_result:
strongest_empirical_result_status: VERIFIED | UNKNOWN

supporting_passages:
  - text:
    source_location:

evidence_status:
  exact_mechanism: VERIFIED | UNKNOWN
  input_signal: VERIFIED | UNKNOWN
  operation_or_intervention: VERIFIED | UNKNOWN
  domain_independent_primitive: INFERRED
  lane_assignment: INFERRED | UNKNOWN
  reflex_transfer_hypothesis: INFERRED | UNKNOWN
  strongest_empirical_result: VERIFIED | UNKNOWN

second_pass_classification: GEM | KEEP | RESERVE | NEEDS_DEEP_REVIEW
classification_reason:
unresolved_question:
```

Describe `exact_mechanism` concretely enough to identify the signal, operation,
and diagnostic output. Keep `classification_reason` to one or two sentences. Use
`unresolved_question` for `NEEDS_DEEP_REVIEW`; otherwise use `null`.

When a paper yields no mechanism, emit only:

```yaml
paper_id:
paper_title:
terminal_outcome: DROP | RETRIEVAL_FAILED
reason:
```

## Scope and stopping

Pass 2 owns per-paper mechanism triage. Global comparison, deduplication,
clustering, synthesis, complete experiment characterization, final
Reflex-specific judgment, feasibility judgment, hypothesis generation, and
project selection belong to later passes.

Control or policy design is outside Program B unless the paper contributes a
separable runtime-observability mechanism. For example, measuring stale inputs
is in scope; compensating a controller for stale inputs is not itself Program B.

A paper is complete when it has exactly one terminal outcome:

- one or more mechanism objects classified `GEM`, `KEEP`, `RESERVE`, or
  `NEEDS_DEEP_REVIEW`;
- one zero-mechanism `DROP` record; or
- one `RETRIEVAL_FAILED` record.

The assigned work is complete when every assigned paper has one terminal
outcome; every retained card passes the recognition skill's independent-
operation test; every assigned lane satisfies its operational rubric; every
substantive field has an evidence status; every `VERIFIED` claim has a
recoverable passage and location; and every unavailable fact is `UNKNOWN`
rather than inferred as fact.
