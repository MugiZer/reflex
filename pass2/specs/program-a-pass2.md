# Program A Pass 2 — Mechanism Triage Contract

## Contract

Use this file to triage one Program A paper at a time. It owns the stable
research rules: scope, evidence, classification, output, and stopping.

The launcher owns runtime concerns such as worker count, model choice, worktree
paths, shard assignment, thread creation, persistence commands, and
orchestration. Follow the launcher for those concerns without changing this
research contract.

Program A studies **trajectory, data, and training intelligence for robot
learning systems**.

Pass 1 maximized paper recall. Pass 2 maximizes mechanism recall. Later passes
will normalize, cluster, deduplicate, deeply review, map to Reflex, and select
projects.

For each paper, answer:

> Does this paper contain a concrete, evidence-backed mechanism worth carrying
> forward?

Pass 2 is recall-oriented. Preserve a plausible mechanism when targeted
inspection cannot yet settle its value.

## Research posture

Judge the technical primitive, not the paper's fame, venue, citation count,
recency, terminology, or immediate implementability. Transfer from adjacent
domains is in scope when the primitive applies to Program A.

Useful adjacent domains include imitation and offline learning, active learning,
dataset curation, weak and robust supervision, curricula, continual and
representation learning, multimodal learning, information theory, experimental
design, and data-centric machine learning.

Treat Reflex relevance as a transfer signal, never as an automatic
classification. Publicly unknown behavior is `UNKNOWN`, not evidence that a
capability is absent.

## Mechanism recognition

Use
[`$recognize-program-a-mechanisms`](../../.agents/skills/recognize-program-a-mechanisms/SKILL.md)
for the complete mechanism test, A1-A15 taxonomy, independent-operation split,
minimal naming, lane routing, and collision adjudication. Run it on every
plausible method before applying this contract's evidence and classification
rules. Carry its minimal recognition decision into the mechanism card.

## Reflex relevance map

This map is derived from public evidence and identifies plausible attachment
seams. It does not describe private implementation or establish missing
capabilities.

The publicly visible conceptual loop is approximately:

```text
robot execution
→ Observation / ActionChunk
→ recording
→ LeRobot / JSONL / MCAP / Rerun
→ dataset
→ training
→ artifact/model
→ deployment/session
→ robot execution
```

Public abstractions expose robot state and camera observations; request,
sequence, and timestamp concepts; variable-length action chunks; pipelined
inference; session recording in several formats; dataset registration and
validation; high- and low-level training; behavior-cloning loss; `Datum`
objects with observations, actions, optional loss weights, and metadata; and
identifiers across sessions, recordings, datasets, training runs, artifacts,
deployments, robots, and schemas.

Pay particular attention to these transfer seams:

- **Recording integrity:** a bounded nonblocking recording queue may drop steps
  under backpressure. Missing-event detection, reconstruction, fidelity,
  sampling-bias, and missing-data mechanisms may attach here.
- **Action-chunk representation:** inference produces multi-target action
  chunks. A frame-level LeRobot action can represent less temporal structure
  than formats retaining the full variable-length chunk. Sequence conversion,
  resampling, horizon semantics, and information-preservation mechanisms may
  attach here.
- **Training weighting:** low-level training accepts optional `loss_weights`.
  Mechanisms producing example, timestep, confidence, trajectory, or priority
  weights have a visible attachment point.
- **Lineage:** public APIs expose lifecycle identifiers, while public evidence
  does not establish a complete session-to-deployment provenance graph.
  Snapshot, attribution, transformation-lineage, and reproducibility mechanisms
  may attach here.

Use one `possible_reflex_seam` value:

```text
temporal_fidelity
action_chunk_representation
recording_integrity
trajectory_segmentation
dataset_quality
data_selection
loss_weighting
failed_data
diversity_mixture
normalization_transform
lineage_provenance
active_collection
representation
other
unclear
```

The seam and transfer hypothesis are `INFERRED`. A mechanism may be retained
when its seam is `unclear`.

## Thin extraction procedure

### 1. Screen

Inspect the title and abstract. Continue when the paper plausibly contains a
mechanism in Program A territory, including a transferable mechanism from an
unusual domain.

### 2. Recognize candidates

Use `$recognize-program-a-mechanisms` on every plausible method. Record zero or
more recognition decisions.

### 3. Retrieve decisive passages

Use the paper's terminology to retrieve only enough body evidence to establish:

1. the mechanism;
2. its input or signal;
3. its operation or intervention; and
4. credible empirical support, when readily available.

Read further only when those questions remain unresolved. Pass 2 does not
require a linear full-paper reading or exhaustive experiment extraction.

### 4. Abstract the primitive

State the reusable technical idea beneath the source application. Keep it broad
enough to transfer and specific enough to preserve the operation.

### 5. Map a Reflex seam

Record a plausible visible seam and a concise transfer hypothesis. Mark both as
`INFERRED`; use `unclear` when no seam is evident.

### 6. Capture one result

Record the strongest readily verifiable empirical result demonstrating the
mechanism. Prefer a quantitative comparison with metric and baseline. Use
`UNKNOWN` when targeted inspection does not establish one.

### 7. Save evidence and classify

Attach one to three decisive passages with source locations. They must establish
the mechanism and, when claimed, the empirical result. Then assign one terminal
outcome under the rules below.

## Evidence rules

Label each substantive field:

- `VERIFIED`: directly supported by retrieved source evidence.
- `INFERRED`: our abstraction, interpretation, or proposed transfer.
- `UNKNOWN`: not established by retrieved evidence.

Keep four layers distinct: the authors' claim, empirical support, the
domain-independent abstraction, and the proposed Reflex transfer. Source
locations must let a later reviewer recover each supporting passage. Use exact
paper wording in passages and concise paraphrase elsewhere.

Retrieval failure is `RETRIEVAL_FAILED`, never evidence for `DROP`.

## Classification rules

Classify the mechanism rather than the paper's prestige or first-pass label.

- `GEM`: concrete, meaningfully supported, technically distinctive, and unusually
  strong in transfer or synthesis potential.
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

Choose `RESERVE` when the evidence leaves a genuine tie between `RESERVE` and
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

primary_lane: A1-A15 | UNKNOWN
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

Describe `exact_mechanism` concretely enough for a technical reader to identify
the signal and operation. Keep `classification_reason` to one or two sentences.
Use `unresolved_question` for `NEEDS_DEEP_REVIEW`; otherwise use `null`.

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

A paper is complete when it has exactly one terminal outcome:

- one or more mechanism objects classified `GEM`, `KEEP`, `RESERVE`, or
  `NEEDS_DEEP_REVIEW`;
- one zero-mechanism `DROP` record; or
- one `RETRIEVAL_FAILED` record.

The assigned work is complete when every assigned paper has one terminal
outcome; every retained card passes the recognition skill's completion
criterion; every substantive field has an evidence status; every `VERIFIED`
claim has a recoverable passage and location; and every unavailable fact is
`UNKNOWN` rather than inferred as fact.
