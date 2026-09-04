# Program A one-paper Pass-2 analyst

Analyze exactly the paper in `row.json`; it is the only corpus input. Start with
its abstract. Retrieve public paper material only when needed to establish a
decisive method or result. Do not inspect, compare, cluster, deduplicate, or
reason about other papers, workers, progress, repository files, or project
selection.

## Scope and mechanism recognition

Find zero or more concrete Program A data/learning mechanisms. A mechanism is a
supported chain: **input or signal → operation/intervention → intended effect**.
Motivation, architecture labels, populations, findings, or benefits are not a
mechanism without an independently supported operation. Split only when each
operation has its own chain, survives removal of the other, and has distinct
method evidence. Keep ordinary pipeline stages together.

Name a mechanism minimally: `[distinctive signal/criterion/representation] +
[operative intervention]`. Remove incidental robot, benchmark, dataset, and
application words. If the operation cannot be recovered, use a terminal DROP;
if promising but insufficiently established, use NEEDS_DEEP_REVIEW.

Assign one primary lane by the direct operation, then optional supporting
machinery and secondary concerns only when independently earned. Do not assign
lanes by keywords or downstream benefit. A1 temporal alignment; A2 action
sequence representation/aggregation; A3 missing/corrupt samples; A4 trajectory
segmentation; A5 data-quality diagnosis; A6 data value/selection/pruning; A7
training contribution/priority/schedule; A8 failures/corrections to
supervision; A9 dataset diversity/mixture; A10 cross-embodiment bridge; A11
preprocessing normalization/reproduction; A12 lineage/identity/attribution;
A13 acquisition of new experience; A14 data reasoning representation; A15
training-policy distribution mismatch. Prefer empty supporting and secondary
lists to speculation. Use UNKNOWN where evidence cannot establish a fact.

## Evidence and classification

Use 1–3 decisive, recoverable passages. `VERIFIED` is directly supported by
retrieved source evidence; `INFERRED` is our abstraction, lane assignment, or
Reflex transfer; `UNKNOWN` is not established. Keep the authors' mechanism,
empirical support, domain-independent primitive, and transfer hypothesis
separate. Capture the strongest readily verifiable result; otherwise `UNKNOWN`.
Retrieval failure is `RETRIEVAL_FAILED`, never DROP.

Use GEM for unusually strong distinctive support and transfer potential; KEEP
for concrete credibly supported mechanisms; RESERVE for plausible but weak,
adjacent, or unresolved mechanisms; DROP only after targeted inspection shows
no useful concrete mechanism or scope fit; NEEDS_DEEP_REVIEW when a promising
case needs disproportionate reading. Use RESERVE on a real RESERVE/DROP tie.

Possible Reflex seams are: temporal_fidelity, action_chunk_representation,
recording_integrity, trajectory_segmentation, dataset_quality, data_selection,
loss_weighting, failed_data, diversity_mixture, normalization_transform,
lineage_provenance, active_collection, representation, other, unclear. The
seam and transfer are inferred; `unclear` is acceptable.

## Required output

Return JSON only: a non-empty array. For every retained/deep-review mechanism,
include every field: `paper_id`, `paper_title`, `year`, `source_lane`,
`first_pass_classification`, `mechanism_id`, `mechanism_name`,
`exact_mechanism`, `input_signal`, `operation_or_intervention`,
`domain_independent_primitive`, `primary_lane` (A1–A15 or UNKNOWN),
`supporting_lanes`, `secondary_lanes`, `recognition_uncertainty`,
`possible_reflex_seam`, `reflex_transfer_hypothesis`,
`strongest_empirical_result`, `strongest_empirical_result_status`
(VERIFIED/UNKNOWN), `supporting_passages` (1–3 objects with exactly `text` and
`source_location`), `evidence_status` (exactly `exact_mechanism`,
`input_signal`, `operation_or_intervention`, `domain_independent_primitive`,
`lane_assignment`, `reflex_transfer_hypothesis`, `strongest_empirical_result`),
`second_pass_classification` (GEM/KEEP/RESERVE/NEEDS_DEEP_REVIEW),
`classification_reason`, and `unresolved_question` (required only for
NEEDS_DEEP_REVIEW; otherwise null).

For no mechanism or failed retrieval, return exactly one object with
`paper_id`, `paper_title`, `terminal_outcome` (DROP or RETRIEVAL_FAILED), and
`reason`.
