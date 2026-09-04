# Reflex Project Notes

_Source: [Reflex Runtime Latency Diagnosis — Current Project Idea](https://docs.google.com/document/d/1DiPVXxgo2rH6kVPB9obIcjupev9sronkbQZE8dHy_VA/edit?usp=drivesdk)_

Reflex Runtime Latency Diagnosis — Current Project Idea


Status
Current working design. The model choice is intentionally benchmark-driven rather than based on paper novelty.


Problem
Reflex already operates very fast robot control loops, around 30 ms. The project is therefore not mainly about “making inference fast.” The more useful question is:


Why did an already-fast observation→action loop become slower, jittery, or regress after a deployment, and what should an engineer optimize next?


The system should focus on tail latency, jitter, and regressions such as:
• median stays near 30 ms but p99 jumps from 36 ms to 50 ms;
• a new model/runtime version adds 3–8 ms only under certain load conditions;
• occasional loops become slow because of queueing, transport, GPU contention, stale observations, or another stage;
• an optimization makes one component faster but barely changes end-to-end robot latency.


Core product loop
OBSERVE → DIAGNOSE → TEST → ACT


1. Observe
Collect low-overhead per-request/per-control-step telemetry across the observation→action path: capture timing, network/transport timing, queue wait, preprocessing, inference, GPU state, return path, action handling, and relevant system-load/context fields.


2. Diagnose
Use an interpretable observational model to rank the components that best explain the slowdown or regression. The output is a short list of suspects, not a claim of causality.


3. Test
Run a controlled Coz-style performance experiment on the strongest suspect. The point is to ask: if this component were effectively faster, would end-to-end latency actually improve?


4. Act
Turn the measured evidence into an engineering recommendation: what to change, expected benefit, evidence, and acceptance criteria.


Current architecture — autonomous performance investigator with GPU specialization


Project objective


The project is no longer centered on generic tracing or a standalone GPU profiler. The target is an autonomous performance investigator for already-fast inference systems:


latency regression → find the right healthy comparison → localize where the extra time appeared → maintain competing explanations → choose the cheapest useful next measurement → selectively profile deeper when justified → choose a controlled experiment → verify the cause → replay/pinpoint if needed → recommend a fix → learn from the solved incident.


The core question is: how much expert performance-debugging work can be automated between “p99 regressed” and “we have a verified explanation and know what to change?”


The architecture keeps a thin whole-system spine and goes much deeper on Stage 2: reasoning. GPU inference is the first deep specialization because low-level GPU performance debugging is expensive, highly correlated, and often requires an expert to decide what to inspect next.


Four connected systems


1. OBSERVABILITY ENGINE — capture useful evidence with very low overhead.
2. AUTONOMOUS DIAGNOSIS ENGINE — localize the regression, maintain competing hypotheses, and decide what to inspect next.
3. VERIFICATION / DEBUG ENGINE — run discriminating experiments, reproduce important incidents, and find first divergence.
4. LEARNING / CONTROL ENGINE — learn from solved incidents, improve future measurement choices, and eventually prevent repeated latency misses.


Central loop


observe → match against healthy baseline → detect regression → localize responsible subsystem → form explicit hypotheses → ask what evidence is missing → acquire the highest-value next measurement → update beliefs → choose an experiment → measure end-to-end effect → replay/pinpoint when useful → verify cause → record fix → improve future diagnosis, retention, measurement selection, and control.


Core architecture


LOCAL INFERENCE / ROBOT-LIKE LOOP
↓
VERY LOW-OVERHEAD ALWAYS-ON SIGNALS
↓
TEMPORARY / HINDSIGHT-STYLE EVIDENCE BUFFER
↓
MATCHED HEALTHY BASELINE + DIFFERENTIAL PERFORMANCE MODEL
↓
END-TO-END REGRESSION LOCALIZATION
transport / preprocessing / queue / CPU / scheduler / GPU inference / postprocess / action
↓
RANKED SUBSYSTEM SUSPECTS
↓
IF GPU INFERENCE IS SUSPECTED
↓
STRIATRACE-LIKE FAST PATH
critical-path + synchronization-point evidence + cheap runtime/GPU signals
↓
DYNAMIC ROOFLINE / BOTTLENECK REASONING
compute / memory / host starvation / launch / sync / transfer / contention / batching
↓
TELLER-STYLE CROSS-LAYER CONTEXT
Python/model op → C++/framework → CUDA API → kernel → synchronization/communication
↓
EXPLICIT HYPOTHESIS SET WITH UNCERTAINTY
↓
ACTIVE DIAGNOSIS / INFORMATION-VALUE ENGINE
“What measurement best separates the remaining explanations for the least cost?”
↓
TARGETED ESCALATION
TenProf-style tensor root cause / LEO-style instruction-stall root cause / host scheduler trace / memory counters / kernel timeline / selected deep profiler data
↓
UPDATED HYPOTHESES
↓
CONTROLLED VALIDATION — Coz + in-distribution intervention ideas
↓
RETRIEVER-STYLE REPLAY + iReplayer principles when useful
↓
FReD-STYLE FIRST-DIVERGENCE SEARCH when useful
↓
VERIFIED INCIDENT + ENGINEERING ACTION
↓
INCIDENT MEMORY + LEARNING FEEDBACK
↓
update diagnosis + retention + measurement-selection + intervention models
↓
CLOCKWORK-STYLE DEADLINE-RISK PREDICTION / PROACTIVE SCHEDULING
↓
/show-me investigation report


Subsystem 1 — Observability engine


Low-overhead instrumentation


Instrumentation must not materially perturb a low-latency loop. Follow the ros2probe principle: prefer passive/selective observation, monotonic timestamps, bounded local buffering, asynchronous persistence, and explicit measurement of observer overhead.


The project should not run heavyweight tracing or deep GPU profiling continuously. Normal executions get cheap evidence. Interesting, failed, regressed, rare, or uncertain executions earn richer evidence.


Hindsight-style temporary evidence


Keep richer recent execution evidence temporarily near the source. When a tail event, failure, regression, new path, or high-uncertainty diagnosis appears, reach backward and preserve the related evidence before it disappears.


Important separation:


temporary observation can be richer than permanent storage.


TraceMesh — commonness / novelty


Build a compact fingerprint from ordered stages, retries/errors, version, workload state, and small timing/context features. Similar executions form families. TraceMesh answers whether an execution is redundant or structurally novel, not whether it is healthy.


Kunlun-style structural abnormality


Compare corresponding stages/events between matched healthy and current executions. The goal is not only “total latency is high,” but “which corresponding stage or event diverged?” This remains useful both at system level and inside GPU execution when corresponding kernels/events can be aligned.


Contrast-style population regression


Compare whole populations across deployments, model builds, GPU types, batch/concurrency regimes, or other contexts. Ask which stage distributions, execution families, kernel behavior, queue statistics, error rates, and tail metrics shifted.


Trace Sampling 2.0 / Autoscope


After an execution is judged interesting, use code/execution structure to decide which spans/events within it are worth preserving under the telemetry budget.


Learned multi-resolution retention


Inputs may include novelty, structural abnormality, regression magnitude, hard failure/SLO state, diagnostic uncertainty, replay usefulness, historical verified usefulness, GPU-profile usefulness, byte cost, and observer overhead.


Retention levels:
Level 0 — tiny fingerprint + counters.
Level 1 — compressed summary.
Level 2 — selected informative spans/events + key metrics.
Level 3 — nearly complete trace + richer GPU/runtime evidence.
Level 4 — full trace + replay-grade material + profiler-trigger context.


Keep a small exploration stream of otherwise ordinary executions at higher fidelity so the system does not permanently blind itself.


Counterfactual telemetry valuation


Train the retention policy offline on full-fidelity incidents. Remove evidence, rerun downstream diagnosis/verification, and measure the damage. Evidence is valuable if removing it changes true-cause recovery, regression detection, profiler choice, intervention choice, replay, first-divergence localization, or deadline prediction.


Subsystem 2 — Autonomous diagnosis engine


The key design change is that diagnosis is not a single classifier. It is an investigation process.


Every incident maintains:
- explicit candidate hypotheses;
- supporting evidence;
- contradicting evidence;
- current uncertainty/probability;
- measurements that would distinguish the hypothesis from competitors;
- interventions that could test it.


A frontier-model investigator can orchestrate tools and summarize evidence, but it is not the source of truth. Timings, statistical models, dependency structure, profiler evidence, and controlled experiments remain the evidence.


Matched healthy baseline


Do not compare a slow request against a global median. Match on relevant context: model/version, GPU type, batch size, concurrency, input shape/workload, and other known conditions. Then compare healthy vs regressed behavior.


Differential Performance Models


Upgrade simple before/after comparison into model-vs-model comparison. Learn healthy and current performance surfaces as functions of context, for example:


latency = f(batch, concurrency, input size, GPU load, model version, hardware state)


Then diagnose where the performance surface changed, not just whether one average moved. This is useful for regressions that appear only under high concurrency, particular batch sizes, or specific workload regimes.


Level 1 — end-to-end subsystem diagnosis


First ask where the extra time went:


transport / preprocessing / queue / CPU / scheduler / GPU inference / postprocessing / action.


Use system/dependency structure plus a diagnostic tournament rather than declaring one model the winner in advance.


Statistical model stack


Median/MAD + matched deltas — robust cheap anomaly baseline.
GLS — covariance-aware historical baseline for correlated telemetry.
Elastic Net — sparse/stable correlated-feature baseline.
Lagged cross-correlation — identify signals that tend to lead or coincide with latency spikes, especially host→GPU effects.
BALANCE-style probabilistic attribution — handle highly correlated candidate metrics.
EBM — interpretable nonlinear thresholds and limited interactions.
XGBoost — stronger accuracy/ranking benchmark; feature attribution is not causal proof.
Dependency evidence — Cloud Atlas/DepGraph-style structural constraints and waiting/blocking relationships.


Primary metrics are Top-1/Top-3 true-cause recovery, calibration, ranking stability, cross-version/hardware generalization, and agreement with measured intervention benefit. A model that predicts latency well but points engineers at the wrong component is a bad debugger.


Level 2 — GPU performance regression root-cause analysis


If GPU inference is the culprit, enter a dedicated GPU performance-intelligence subsystem rather than asking the generic model to understand CUDA details.


GPU hypothesis classes


compute saturation;
memory-bandwidth pressure;
memory-latency/cache/stall problems;
kernel-launch overhead;
synchronization / stream serialization;
host starvation / delayed submission;
H2D/D2H transfer overhead or missing overlap;
queue/contention/shared-resource effects;
batching inefficiency;
specific kernel regression;
memory pressure / allocation behavior;
multi-tenant or competing-workload contention.


StriaTrace-inspired fast path


Use low-overhead tracing around critical-path and synchronization points, plus cheap GPU/runtime signals, instead of collecting full heavyweight profiles continuously. When abnormal behavior appears, selectively deepen the trace. Use dynamic roofline-style reasoning and regression/correlation evidence to quickly classify broad bottleneck families.


This becomes the GPU branch’s fast first diagnosis: “what can I know cheaply?”


GPU evidence levels


GPU Level 1 — cheap continuous state


Inference duration, queue time, batch size, GPU utilization, memory usage, clocks/power where available, CPU utilization, GPU idle time, deployment/model/hardware context, and low-cost counters available from the runtime/GPU stack.


GPU Level 2 — richer event evidence


Kernel durations/counts, CPU→GPU launch gaps, transfers, stream synchronization, per-stage GPU time, allocation behavior, batching/shared-service context, and selected timeline events. This is the GPU version of Hindsight: normal requests keep a summary, suspicious requests preserve richer evidence.


GPU Level 3 — targeted deep profiling


Deep profiling is an escalation, not a default. Acquire kernel-level resource behavior, occupancy, memory stalls, cache/memory behavior, synchronization details, transfer overlap, instruction-level or tensor-level evidence only when it is expected to resolve real diagnostic uncertainty.


TELLER-style cross-layer context


Build a per-request cross-layer execution representation that connects model/Python operations to framework/C++ calls, CUDA APIs, kernels, synchronization, and communication. Preserve parent-child, temporal, and dependency relationships around the suspicious region.


This prevents the investigator from reasoning over isolated numbers. It should see something closer to:


model.forward → attention op → framework op → CUDA launch → kernel K → synchronization → next stage.


TenProf-style tensor root cause


When a memory/stall hypothesis is strong, trace the low-level stall or memory behavior back to the tensor and earlier tensor transformations that created the poor access pattern. Example target explanation:


transpose/permute created a non-contiguous tensor → accesses became poorly coalesced → memory stalls increased → kernel duration regressed.


This is far more actionable than “memory stalls are high.”


LEO-style instruction-stall root cause


When the issue remains below the tensor/framework level, perform backward slicing from stalled instructions through dependencies/synchronization to find the low-level instruction or producer behavior responsible for the stall.


TenProf and LEO are escalation tools, not always-on collectors:
TenProf → semantic/tensor-level root cause.
LEO → deepest instruction/dependency-level root cause.


Host-induced GPU slowdown as a first-class hypothesis


A slow GPU request does not imply the GPU is the true cause. Explicitly model CPU starvation, delayed kernel launches, preprocessing interference, host scheduling, and communication as causes of GPU idle time or delayed execution.


The investigator must be able to conclude:


“GPU utilization dropped because the host stopped feeding the GPU,”


instead of incorrectly recommending GPU optimization.


Systematic GPU-characterization priors


Use empirical GPU inference characterization research to seed reasonable bottleneck hypotheses and expected evidence patterns, but do not hard-code paper-specific numeric thresholds. Reflex-like robotics/VLA workloads may differ from autoregressive LLM serving.


GRAB-style memory diagnosis


Keep GRAB as a historical mechanism for automated memory-bottleneck classification/counterfactual thinking. It is not the primary runtime implementation because simulator-heavy methods are not a fit for the low-overhead fast path, but its idea of comparing observed memory behavior against better/golden behavior is useful for controlled memory diagnosis.


Active diagnosis / measurement selection — central research contribution


The investigator should not simply run the deepest profiler whenever confidence is low. It should explicitly choose the next measurement that best separates the remaining hypotheses.


Example state:


host starvation 0.43
synchronization 0.39
memory 0.12
compute 0.06


Possible actions:
more cheap GPU samples;
CPU scheduler trace;
kernel timeline;
HBM/memory counters;
TenProf-style tensor analysis;
LEO-style instruction analysis;
full deep profiler.


Choose using a value objective such as:


measurement value = expected reduction in diagnostic uncertainty / measurement cost and observer overhead.


This turns profiling into a sequential / active diagnosis problem.


The old retention question was:
“What evidence should I keep?”


The forward-looking question is:
“What evidence should I acquire next?”


These become two sides of one INFORMATION-VALUE ENGINE:


what should I preserve? + what should I measure next?


That is a central architectural bet.


Hypothesis reasoning behavior


A hypothesis should know what supports it, what contradicts it, what would distinguish it from the second-best explanation, and what intervention could falsify it.


Example — kernel-launch overhead


Expected support:
GPU idle gaps rise;
kernel count rises;
average kernel size falls;
CPU→GPU launch gaps rise;
SM utilization falls or fails to rise;
HBM bandwidth need not be saturated.


Useful next measurement:
kernel timeline / host submit-thread scheduling.


Useful intervention:
reduce launch count, graph-like execution, or isolate the submit path where safe.


The system should be comfortable saying:
“I cannot distinguish host starvation from synchronization yet. Do not recommend a fix. The next best test is X because it separates these explanations.”


Subsystem 3 — Verification / debug engine


Coz + in-distribution intervention validation


Observational models produce hypotheses, not causal proof. For the strongest suspect, choose a controlled experiment that cleanly distinguishes it from competitors and measure end-to-end benefit.


Examples:
reduce queue contribution;
isolate CPU submit thread;
change batching;
remove competing workload;
change concurrency;
reduce launch overhead;
change transfer overlap;
compare kernel/runtime version;
revert a specific fusion configuration.


Store every experiment as:


runtime context + hypothesis + intervention + magnitude + predicted benefit + measured end-to-end benefit.


The evidence hierarchy must stay explicit:


OBSERVED — what the telemetry actually showed.
INFERRED — what hypothesis currently best explains it.
TESTED — what intervention was run.
VERIFIED — what explanation survived controlled testing and how much of the regression it explains.


Retriever-style replay


Record enough information to reproduce the logical execution: input/request IDs, consumed states, queue order, seeds, fault state, model/version, scheduler decisions, batching/concurrency context, and important timing/commit information.


For GPU incidents, replay preserves the workload and environment needed to reproduce the relevant inference behavior as closely as the prototype allows.


FReD-style first divergence


After replay, search for the earliest meaningful difference between healthy and bad execution. The desired chain becomes:


slow request → suspicious subsystem → GPU bottleneck class → targeted evidence → controlled effect → reproducible incident → first divergence → verified cause.


Subsystem 4 — Learning / control engine


Verified incident memory


Do not reduce solved incidents to anonymous rows. Keep structured cases containing:


context;
healthy comparator;
symptoms;
execution family;
version/hardware/workload;
initial hypotheses;
evidence acquired;
measurements chosen and their cost;
profiling output;
interventions;
measured effect;
replay/divergence result;
verified cause;
fix;
final performance change.


A future incident can retrieve similar verified cases but must also explain important differences before reusing the old diagnosis.


Learning feedback


Each solved incident should improve four systems:


1. diagnosis learning — which evidence predicted the true engineering cause.
2. retention learning — which evidence was worth preserving.
3. measurement-selection learning — which expensive profiler/action was worth paying for under a given uncertainty state.
4. intervention learning — which controlled change actually improved end-to-end performance in that context.


As verified intervention data grows, benchmark causal forests or another heterogeneous treatment-effect learner for:


“In this runtime state, which intervention is expected to help most, and by how much?”


Clockwork-style prevention


Keep Clockwork separate from root-cause analysis. Use queue state, predicted stage times, GPU performance state, workload, deadlines, and incident knowledge to predict a likely deadline miss early enough to test scheduling, batching, priority, or routing decisions.


Research paper mapping for the GPU branch


StriaTrace — low-overhead inference tracing, critical-path/synchronization evidence, selective escalation, dynamic roofline-style diagnosis. Primary GPU fast path.


TELLER — reconstruct cross-layer request execution from high-level framework/model operations through CUDA APIs, kernels, synchronization, and communication. Primary cross-layer context representation.


TenProf — map GPU memory/stall behavior back to tensor transformations and framework semantics. Primary deep memory/tensor diagnosis tool.


LEO — backward-slice stalled instructions to the low-level source responsible for the stall. Deepest instruction-level escalation.


Differential Performance Models — compare healthy-vs-regressed performance surfaces rather than isolated metrics. Primary version/workload regression model.


Characterizing CPU-Induced Slowdowns in Multi-GPU LLM Inference — host starvation and delayed launch/communication as first-class causes of apparent GPU slowdown.


A Systematic Characterization of LLM Inference on GPUs — empirical bottleneck taxonomy/priors; use mechanisms, not fixed thresholds.


GRAB — historical automated GPU memory-bottleneck diagnosis and counterfactual memory reasoning; supporting reference rather than fast-path implementation.


The Benefit of Hindsight — preserve rich evidence retrospectively when a symptom appears.
TraceMesh — whole-execution commonness/novelty.
Kunlun — corresponding-event structural timing divergence.
Contrast — population/version regression comparison.
Trace Sampling 2.0 / Autoscope — span/event selection under telemetry budget.
ros2probe — passive/selective observability and observer-effect discipline.
Cloud Atlas — system-structure/knowledge constraints for plausible causal directions.
DepGraph — waiting/blocking dependency reconstruction.
Host-Side Telemetry for Performance Diagnosis — lagged cross-correlation and host-side lead/lag clues.
BALANCE — probabilistic attribution under correlated telemetry.
LLMVisor — shared/batched service-time attribution when batching exists.
Coz — controlled performance experiments / causal profiling.
Robust RCA using In-Distribution Interventions — alternative intervention-based validation.
Retriever — deterministic replay of asynchronous inference/robot-like executions.
iReplayer — broader replay principles.
FReD — replay-backed first-divergence search.
How Far Can RCA Go on Real-World Telemetry Data? — recurring incident-pattern memory.
Clockwork — downstream deadline prediction/prevention, not RCA.


What we implement first


The project should be broad enough to make the GPU conclusion meaningful, but deep in the part that saves engineer reasoning time.


Priority 1 — thin general spine
canonical Trace/Incident schema;
local asynchronous runtime;
fault injection;
cheap telemetry;
healthy matching;
end-to-end localization.


Priority 2 — investigator core
explicit hypotheses;
evidence support/contradiction;
uncertainty tracking;
measurement candidates;
intervention candidates;
belief updates;
incident state machine.


Priority 3 — GPU fast path
StriaTrace-like sparse evidence;
dynamic roofline/bottleneck reasoning;
matched/differential performance models;
lagged host/GPU analysis;
BALANCE/EBM/XGBoost diagnostic tournament.


Priority 4 — deep GPU escalation
TELLER-style cross-layer context;
TenProf-style tensor/memory attribution;
LEO-style instruction dependency attribution where feasible;
host scheduler/launch analysis.


Priority 5 — active measurement selection
rank profiler/measurement actions by expected diagnostic information gained relative to overhead/cost.


Priority 6 — active experiment selection
choose a controlled change that most clearly distinguishes the remaining top hypotheses.


Priority 7 — replay, divergence, incident memory, and prevention
Retriever/FReD integration;
structured verified incident memory;
learning feedback;
Clockwork-style deadline control.


Local prototype


Build the full architecture with narrow research-grade implementations. The local runtime should have real timing and asynchronous structure, plus injected known faults whose ground truth is hidden from the investigator.


Useful fault families:
CPU starvation causing delayed GPU submission;
kernel-launch overhead;
memory-bandwidth pressure;
memory-latency/stall behavior;
synchronization/serialization;
transfer-heavy execution;
batching delay;
queue contention;
competing GPU workload;
specific kernel/runtime regression;
preprocessing interference;
allocator/memory pressure where safely reproducible.


If a CUDA-capable GPU is available, collect real GPU evidence and run targeted profiler experiments directly. If not, keep the interfaces stable, develop the investigation logic on controlled synthetic/injected GPU evidence, then validate the collection/profiling path on accessible GPU hardware later. Do not pretend local hardware is Reflex production.


Primary experimental questions


1. Can low-overhead evidence plus matched/differential baselines identify where a latency regression came from without full tracing?
2. When GPU inference is responsible, can the investigator recover the correct bottleneck/root cause across known injected faults?
3. Can it choose a cheaper targeted next measurement that resolves uncertainty instead of always launching a full profiler?
4. Can controlled experiments turn observational hypotheses into verified explanations?
5. Does incident memory improve diagnosis speed/accuracy on recurring but not identical failures?
6. Can the learned information-value engine spend less telemetry/profiling budget while preserving debugging quality?


Evaluation


For each injected incident, hide the true fault from the debugger. Measure:


Top-1 / Top-3 subsystem cause recovery;
Top-1 / Top-3 GPU bottleneck/root-cause recovery;
calibration / uncertainty quality;
regression detection delay;
matched-baseline quality;
profiling actions selected;
expected information gain versus actual diagnosis improvement;
observer/profiler overhead;
bytes retained;
number/cost of measurements required before verification;
predicted-vs-measured intervention benefit;
time or investigation steps to verified cause;
replay success;
first-divergence localization;
cross-version/hardware/fault generalization.


Compare against baselines such as full telemetry, static always-on profiling, random measurement choice, tail-only profiling, anomaly-only profiling, fixed escalation rules, and learned active measurement selection.


The strongest demo metric is not generic prediction accuracy. It is:


“How quickly and cheaply can the system move from a regression to a verified engineering explanation?”


/show-me final investigation page


The final page should read like an autonomous engineer’s investigation, not a dashboard dump:


what changed;
which healthy population was used as the comparator and why;
where the extra latency localized;
current hypotheses and uncertainty;
what evidence supported/contradicted each hypothesis;
what measurement the system chose next and why;
what the targeted profiler found;
what experiment it chose;
before/after end-to-end effect;
replay / first divergence if used;
verified cause;
recommended fix;
expected recovered latency;
similar prior incidents and important differences.


Example target demo


A bad deployment increases p99 by ~8 ms. The investigator localizes most of the regression to GPU inference. Initial evidence cannot distinguish host starvation from synchronization, so it chooses a kernel/host timeline rather than a full profile. It observes increased host→kernel gaps, then requests host scheduler evidence. It finds the inference submit path delayed by competing preprocessing work. It runs a controlled CPU-isolation experiment; p99 recovers most of the lost latency. It records the verified cause, the evidence that mattered, the measurement sequence that was worth paying for, and the fix.


This demo is more compelling than showing a new anomaly model or GPU dashboard because it demonstrates automated expert reasoning.


Central contribution


The individual mechanisms come from prior systems research. The architectural bet is to connect them through a learned information-value + active-debugging loop.


The system learns both backward and forward:


what evidence should I KEEP?
+
what evidence should I ACQUIRE NEXT?
+
what experiment should I RUN?
+
what conclusion is actually VERIFIED?


Debugging outcomes teach the observability system which evidence was worth retaining. They teach the profiler policy which expensive measurements were worth collecting. Controlled effects teach which interventions matter. Incident memory improves future investigations. Better evidence improves diagnosis; better diagnosis improves measurement selection; verified outcomes improve future retention, profiling, intervention choice, and eventually control.


The project is therefore not just an ML debugger, not just trace compression, and not just a GPU profiler. It is an autonomous performance-debugging system for low-latency inference, with GPU performance regression root-cause analysis as its first deep specialization.








PASS 2 RESEARCH MECHANISM REGISTRY — DEDUPLICATED CANDIDATES


Purpose
This section is the durable record of Pass 2. The eight research reports produced 88 raw source-specific mechanisms. Pass 2 grouped mechanisms by architectural job and merged only true/near duplicates, yielding 52 canonical candidates across seven jobs. No Reflex-specific scoring or winner selection has happened yet.


Label convention
GEM / KEEP / DROP below are labels assigned by the source research reports, not our project score. U = the source report did not explicitly assign one of the three labels. Where a report described a mechanism as conceptually a GEM but gave a retention decision such as KEEP or DROP, both are preserved.


JOB 1 — CHOOSE THE NEXT MEASUREMENT / TEST


C01 — SEQUOIA diagnostic-entropy greedy
Mechanism: maintain posterior mass over candidate diagnoses and greedily choose the test with greatest expected reduction in diagnostic entropy.
Merged raw mechanisms: R1-M1, R5-M7, R7-M2.
Source labels: GEM ×1; KEEP ×2.


C02 — Chernoff-like sequential hypothesis testing
Mechanism: maintain beliefs over competing hypotheses and choose actions that maximize information acquisition while accounting for sampling and decision-error cost; stop according to posterior/cost tradeoff.
Merged raw mechanisms: R1-M2.
Source labels: GEM.


C03 — Index-based cost-aware ordering (EIP / cost÷probability)
Mechanism: rank tests with an index combining current probability, cost, test quality, and decision value; execute according to the index with threshold-based stopping.
Merged raw mechanisms: R1-M3, R7-M5.
Source labels: KEEP ×1; U ×1.


C04 — Bayesian expected-information-gain per cost (MI / KL / entropy)
Mechanism: predict possible outcomes of each candidate measurement, compute expected posterior information gain, account for measurement cost/overhead, execute the highest-utility measurement, update beliefs, and repeat.
Merged raw mechanisms: R1-M4, R1-M9, R5-M4, R5-M5, R5-M10, R7-M1, R7-M6.
Source labels: GEM ×3; KEEP ×2; U ×2.


C05 — Noisy Bayesian adaptive/group experimental design
Mechanism: optimize the next experiment using mutual information or another expected diagnostic utility while maintaining a posterior under noisy observations.
Merged raw mechanisms: R1-M6.
Source labels: KEEP.


C06 — MDP test/retest policy for unreliable measurements
Mechanism: represent testing as an MDP whose actions include tests and retests, transitions model false-positive/false-negative behavior, and reward balances information gain against measurement cost.
Merged raw mechanisms: R1-M8.
Source labels: KEEP.


C07 — Bayesian-network entropy selection with BPEA / belief propagation
Mechanism: model causes and measurements in a Bayesian network, approximate candidate-test conditional entropy with belief propagation, then greedily choose the greatest expected entropy reduction.
Merged raw mechanisms: R5-M1, R7-M3.
Source labels: KEEP ×1; GEM ×1.


C08 — EC² / EffECXtive equivalence-class edge cutting
Mechanism: select tests by maximally cutting weighted edges between competing hypothesis classes rather than directly maximizing ordinary entropy; EffECXtive is the computational approximation.
Merged raw mechanisms: R5-M2, R5-M3.
Source labels: GEM ×2.


C09 — Weak adaptive-submodular greedy selection
Mechanism: choose the action with the highest expected marginal uncertainty-reduction benefit, using adaptive-submodular structure for noisy/faulty observations.
Merged raw mechanisms: R5-M6.
Source labels: KEEP.


C10 — ECED for correlated/noisy measurements
Mechanism: choose tests with an auxiliary information objective that accounts for noise and penalizes information redundancy among correlated measurements.
Merged raw mechanisms: R5-M8.
Source labels: KEEP.


C11 — Non-myopic POMDP / limited-lookahead measurement selection
Mechanism: treat cause as hidden state and measurements as actions, explicitly anticipating future test sequences rather than making only one-step greedy choices.
Merged raw mechanisms: R5-M9, R7-M4.
Source labels: U ×2.


C12 — Exact cost-optimal logical query selection
Mechanism: search a logical query space for a measurement/query minimizing expected remaining tests and per-test cost.
Merged raw mechanisms: R7-M8.
Source labels: U.


C13 — Persistent-noise expected-rank diagnosis
Mechanism: under persistent/non-reversible noise, optimize the expected rank of the correct diagnosis rather than forcing an early binary decision.
Merged raw mechanisms: R7-M9.
Source labels: U.


C14 — Truncated greedy under shared/subadditive test costs
Mechanism: adaptively choose measurements when tests share setup costs or have group/subadditive cost structure.
Merged raw mechanisms: R7-M10.
Source labels: U.


JOB 2 — CONFIDENCE, CALIBRATION, ABSTENTION, STOPPING


C15 — Post-hoc probability calibration (Platt / isotonic / temperature scaling)
Mechanism: transform raw diagnostic scores into better-calibrated probabilities using a held-out calibration set.
Merged raw mechanisms: R2-M1, R2-M2, R2-M3.
Source labels: KEEP ×3.


C16 — Conformal cause sets
Mechanism: use non-conformity scores to output an explicit set of plausible causes with target finite-sample coverage under exchangeability assumptions.
Merged raw mechanisms: R2-M4.
Source labels: KEEP.


C17 — Selective classification / abstention using absolute confidence and top1–top2 margin
Mechanism: refuse to commit to a diagnosis when calibrated confidence is too low or the top competing causes remain too close.
Merged raw mechanisms: R2-M5, R2-M11.
Source labels: KEEP ×1; U ×1.


C18 — Bayesian Model Averaging
Mechanism: treat competing diagnostic models as hypotheses and combine their predictions according to posterior model probability, updating the weights as evidence arrives.
Merged raw mechanisms: R2-M6.
Source labels: KEEP.


C19 — Deep-ensemble epistemic uncertainty
Mechanism: train multiple diagnostic models and use prediction disagreement/variance as an estimate of epistemic uncertainty.
Merged raw mechanisms: R2-M7.
Source labels: KEEP.


C20 — Sequential evidence-threshold stopping (SPRT / Bayesian posterior threshold)
Mechanism: accumulate evidence sequentially and stop when a likelihood ratio, posterior probability, or posterior odds crosses a decision threshold.
Merged raw mechanisms: R2-M8, R2-M9.
Source labels: KEEP ×2.


C21 — Bayesian credible intervals
Mechanism: represent uncertainty on a cause probability with posterior intervals rather than only a point estimate.
Merged raw mechanisms: R2-M10.
Source labels: U.


C22 — Fault-injection-based probability and threshold calibration
Mechanism: generate known-ground-truth incidents through controlled fault injection and use them to calibrate diagnostic probabilities, confidence thresholds, and abstention rules.
Merged raw mechanisms: R2-M12.
Source labels: U.


JOB 3 — INVESTIGATION-STATE REASONING / CONTROL


C23 — Role-separated multi-agent diagnostic orchestration
Mechanism: maintain an explicit differential using specialized roles for hypothesis generation, challenge/counterexample search, cost stewardship, and decision planning.
Merged raw mechanisms: R1-M5.
Source labels: KEEP.


C24 — Dynamic vs static hypothesis-space recomputation
Mechanism: dynamically decide whether to fully recompute the diagnostic hypothesis space after a measurement or only filter/update the existing hypothesis set.
Merged raw mechanisms: R1-M7.
Source labels: KEEP.


C25 — d-DNNF hierarchical structural diagnosis
Mechanism: compile structural diagnostic relationships into d-DNNF and use hierarchy/component abstraction to reduce uncertainty efficiently.
Merged raw mechanisms: R7-M7.
Source labels: U.


JOB 4 — INCIDENT MEMORY AND REUSE


C26 — Classical structured Case-Based Reasoning (CBR)
Mechanism: store solved incidents as structured symptom/context/diagnosis/fix cases, retrieve nearest historical cases by similarity, adapt their solution, and retain the new case.
Merged raw mechanisms: R3-M1.
Source labels: KEEP.


C27 — Topology/model-aware CBR
Mechanism: retrieve historical cases but adapt them through a model of the current topology/system structure rather than assuming the previous environment is identical.
Merged raw mechanisms: R3-M2.
Source labels: GEM.


C28 — Learned sequential diagnostic policy from incident experience
Mechanism: encode investigations as state/action/reward episodes and learn which measurement/action to choose next through RL/MDP-style policy learning.
Merged raw mechanisms: R3-M3.
Source labels: GEM.


C29 — Meta-learning / few-shot incident adaptation
Mechanism: meta-train across historical incident families so a diagnostic model can adapt rapidly to a new hardware/version/fault context with few new examples.
Merged raw mechanisms: R3-M4.
Source labels: GEM + KEEP.


C30 — Verification-weighted incident RAG / episodic retrieval
Mechanism: store full or structured incident episodes, index them semantically, retrieve similar incidents, and weight their usefulness by whether the prior diagnosis/fix was verified.
Merged raw mechanisms: R3-M5, R3-M6.
Source labels: KEEP ×2.


C31 — Event/fault-graph similarity retrieval
Mechanism: encode incidents as causal/event graphs, compare the current graph to historical graphs using structural similarity or learned graph representations, then transfer causes/remedies from similar cases.
Merged raw mechanisms: R3-M7.
Source labels: KEEP.


C32 — Rule-first → retrieval → learned reasoning cascade
Mechanism: attempt known deterministic failure signatures first, then retrieve similar incidents, then invoke learned/agentic reasoning for unresolved cases.
Merged raw mechanisms: R3-M8, R3-M10.
Source labels: U ×2.


C33 — Historical intervention-effect priors
Mechanism: store context + action/test + measured effect and use historical success in similar incidents to bias which intervention or measurement should be attempted next.
Merged raw mechanisms: R3-M9.
Source labels: U.


JOB 5 — LOW-OVERHEAD OBSERVABILITY AND PROFILER ESCALATION


C34 — Progressive sparse → deep profiling / escalation
Mechanism: operate with sparse/cheap evidence normally and progressively activate richer tracing, PC sampling, or deep profiling only when anomalies or unresolved uncertainty justify the cost.
Merged raw mechanisms: R4-M3, R4-M5, R4-M8, R6-M5, R6-M11, R6-M13, R8-M10.
Source labels represented across variants: KEEP, KEEP+GEM, DROP+GEM, U.


C35 — Always-on multi-domain host + GPU telemetry
Mechanism: continuously collect cheap CPU scheduling, network/I/O/PCIe and GPU state so infrastructure interference can be detected without deep tracing.
Merged raw mechanisms: R4-M6.
Source labels: KEEP + GEM.


C36 — Always-on cheap GPU hardware counters
Mechanism: continuously collect low-cost utilization, memory, power, SM activity and related GPU state through DCGM/NVML-like facilities.
Merged raw mechanisms: R6-M10.
Source labels: U.


C37 — eBPF GPU API / driver probing
Mechanism: observe CUDA API or driver-level GPU activity using eBPF-style probes without modifying the application.
Merged raw mechanisms: R6-M9, R8-M7.
Source labels: KEEP ×1; U ×1.


C38 — Targeted heavy kernel instrumentation
Mechanism: deeply instrument only selected suspicious kernels/regions, including phase-segmented instrumentation, binary memory instrumentation, adaptive metadata/shadow-memory techniques, and profiler buffering.
Merged raw mechanisms: R6-M1, R6-M6, R6-M7, R6-M8.
Source labels: DROP ×4.


C39 — Observer-effect measurement / sampling-rate calibration
Mechanism: compare instrumented vs uninstrumented execution and/or multiple sampling frequencies to quantify and correct for profiler perturbation.
Merged raw mechanisms: R6-M12.
Source labels: U.


JOB 6 — CPU↔GPU RECONSTRUCTION AND LOCALIZATION


C40 — Request-centric heterogeneous dependency DAG + critical-path blame
Mechanism: reconstruct per-request CPU phases, CUDA calls, GPU kernels, communications and scheduling relationships in one temporal/dependency graph, then identify the critical path and assign waiting/blame to the component delaying progress.
Merged raw mechanisms: R4-M1, R4-M10, R4-M12, R4-M13.
Source labels represented across variants: KEEP, KEEP+GEM, U.


C41 — Causal/suspect subgraph extraction
Mechanism: from a larger cross-layer execution graph, extract only the region surrounding the suspicious stage for downstream reasoning.
Merged raw mechanisms: R4-M2.
Source labels: KEEP + GEM.


C42 — Lagged host↔GPU time-series correlation
Mechanism: determine whether host disturbances precede GPU tail-latency events using sliding-window lead/lag or cross-correlation analysis.
Merged raw mechanisms: R4-M7.
Source labels: KEEP + GEM.


C43 — Dynamic-roofline broad bottleneck classification
Mechanism: combine phase latency with compute, memory, utilization and host-feeding behavior to classify broad bottleneck families before expensive profiling.
Merged raw mechanisms: R4-M4.
Source labels: KEEP + GEM.


C44 — DeepContext framework → C++ → GPU semantic attribution
Mechanism: interpose framework-aware context so Python/model operations, framework/C++ activity and low-level GPU behavior can be connected into a semantic hierarchy with pattern-based optimization clues.
Merged raw mechanisms: R4-M9, R8-M5.
Source labels: GEM ×1; KEEP+GEM ×1.


JOB 7 — GPU DEEP / SOURCE-LEVEL DIAGNOSIS


C45 — LEO PC sampling + backward causal slicing
Mechanism: sample stalled GPU instructions/PCs and trace backward through instruction, dependency and synchronization relationships to the low-level producer responsible for the stall.
Merged raw mechanisms: R6-M2, R8-M9.
Source labels: GEM ×1; U ×1.


C46 — GPA PC/stall sampling + dataflow/source attribution
Mechanism: use CUPTI-style PC/stall samples, map them to source, and apply dataflow analysis to connect inefficiencies to the instructions/code regions producing them.
Merged raw mechanisms: R6-M3, R8-M1.
Source labels: KEEP ×2.


C47 — HPCToolkit PC sampling + source/call mapping
Mechanism: combine GPU PC sampling, hardware counters and calling context, mapping sampled instruction addresses through binary/debug metadata to source lines/functions.
Merged raw mechanisms: R6-M4, R8-M4.
Source labels: KEEP ×2.


C48 — GPUscout static SASS + warp-stall sampling
Mechanism: combine static SASS analysis, warp-stall PC sampling and kernel metrics to identify memory/data-movement bottlenecks and responsible code segments.
Merged raw mechanisms: R8-M2.
Source labels: KEEP.


C49 — DrGPU top-down stall accounting
Mechanism: categorize lost GPU cycles into memory/control/ALU/etc. classes and recursively attribute those costs through a hierarchical source-code tree.
Merged raw mechanisms: R8-M3.
Source labels: KEEP.


C50 — TenProf-style tensor/operator root-cause attribution
Mechanism: connect low-level memory/stall behavior back to tensor transformations/operators by joining framework/tensor context with kernel and PC-level profiling evidence.
Merged raw mechanisms: R8-M8, R8-M11.
Source labels: U ×2.


C51 — GPU Stall Inspector cycle-level stall classification
Mechanism: classify every GPU stall cycle into an architectural cause category using detailed simulated pipeline state.
Merged raw mechanisms: R8-M6.
Source labels: DROP.


C52 — KPerfIR-like compiler/IR intrakernel regional probes
Mechanism: insert instrumentation at compiler IR regions to identify bubbles and performance pathologies inside a slow GPU kernel.
Merged raw mechanisms: R4-M11.
Source labels: DROP + GEM.


PASS 2 STATE
88 raw mechanisms → 52 canonical candidates.
Counts by architectural job: 14 next-test selection; 8 confidence/calibration/stopping; 3 investigation-state reasoning/control; 8 incident memory/reuse; 6 observability/escalation; 5 CPU↔GPU reconstruction/localization; 8 deep GPU/source-level diagnosis.


Next research step after this registry is preserved: Pass 3 scores these 52 canonical candidates against the current Reflex architecture and constraints. Source-report GEM/KEEP/DROP labels remain provenance only and must not be treated as our final selection.
PASS 3 CANDIDATE CITATION CONVENTION
A Cxx label is only shorthand. In every Pass 3 decision section, the first substantive use of a candidate must state what the mechanism does in plain language, state the Reflex disposition and why that disposition was chosen, and hyperlink the paper/system used as the mechanism reference. Later shorthand may point back to that explained record; unexplained Cxx labels are not intended to stand alone.


PASS 3 DECISION LOG — Confidence, Calibration, Abstention & Stopping


Current Reflex approach


Reflex already treats diagnosis as a sequential investigation rather than a single classifier. Each incident maintains explicit competing hypotheses, supporting and contradicting evidence, a current uncertainty/probability state, measurements that could distinguish hypotheses, and interventions that could falsify them. The current architecture ranks subsystem and GPU root-cause suspects, chooses the next measurement by expected diagnostic uncertainty reduction relative to measurement cost and observer overhead, updates beliefs, and escalates selectively. It explicitly permits “cannot distinguish yet” and forbids recommending a fix when competing explanations remain unresolved.


The existing evidence hierarchy is also important: OBSERVED → INFERRED → TESTED → VERIFIED. Observational confidence can prioritize hypotheses and measurements, but it is not causal proof. A final root-cause claim becomes VERIFIED only after a controlled intervention or equivalent discriminating test measures the end-to-end effect.


What is underspecified today is the semantics of the numeric uncertainty state. The example hypothesis vector looks like a probability simplex, but the architecture does not define when those values are calibrated, whether hypotheses are mutually exclusive, how correlated evidence is accumulated, what happens under distribution shift, or what numeric rule causes abstention or stopping. It also does not distinguish “do not commit yet” from “do not spend more investigation budget.” Pass 3 fills that contract.


Candidate decision matrix


Score legend: DV = Diagnostic value; IE = Information efficiency; RF = Runtime fit; PF = Prototype feasibility; R = Robustness; A = Auditability. Scores are 1–5.


Mechanism explanations and representative sources
Rule for this section: every later C15–C22 shorthand reference points back to the explanation here. The linked paper/reference is the representative source chosen to explain the mechanism; the Pass 2 GEM/KEEP/DROP/U label remains provenance only, not the Reflex decision.


C15 — Post-hoc probability calibration (Platt / isotonic / temperature scaling)
What it is: take a model’s raw scores or logits after training and fit a held-out mapping so reported confidence better matches empirical correctness frequency. Temperature scaling rescales logits with one parameter; Platt scaling fits a sigmoid-style map; isotonic regression fits a more flexible monotone map.
Representative paper: On Calibration of Modern Neural Networks — Guo et al. (ICML 2017).
Why COMBINE: Reflex benefits from probabilities for abstention, information-value calculations, and stopping, but calibration should be an offline layer rather than a replacement for ranking. Temperature/Platt are simple and cheap online; isotonic is only appropriate when enough calibration data exist. The decision is COMBINE because calibration is useful only together with ranking, calibration-health checks, and the C22 validation process.


C16 — Conformal cause sets
What it is: instead of forcing one diagnosis, construct a set of labels/cause hypotheses intended to contain the true answer at a target coverage level, using nonconformity scores calibrated on held-out examples. Its strongest appeal is explicit set-valued uncertainty with finite-sample coverage under the required exchangeability conditions.
Representative paper: A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification — Angelopoulos & Bates.
Why DEFER: Reflex should return plausible-cause sets, but formal conformal coverage is not yet trustworthy under hardware/version/workload shift, adaptive evidence acquisition, and multi-cause incidents. We keep the set-valued idea now and defer the formal conformal guarantee until realistic coverage tests succeed.


C17 — Selective classification / abstention
What it is: a predictor is allowed to reject or abstain on cases where its confidence is insufficient, trading coverage for lower error on the cases where it does commit. In Reflex, this becomes the explicit “cannot distinguish yet / do not recommend a fix” gate.
Representative paper: Selective Classification for Deep Neural Networks — Geifman & El-Yaniv (NeurIPS 2017).
Why ADOPT: this directly matches the existing investigation behavior and prevents low-confidence inference from turning into an engineering recommendation. We adopt it as a first-class action gate, with thresholds validated by risk–coverage and false-confident-diagnosis tests rather than one fixed global number.


C18 — Bayesian Model Averaging (BMA)
What it is: treat competing predictive models themselves as uncertain and average their predictions using posterior model probabilities, rather than selecting one model and pretending model choice is certain.
Representative paper: Bayesian Model Averaging: A Tutorial — Hoeting, Madigan, Raftery & Volinsky (Statistical Science, 1999).
Why DEFER: Reflex’s diagnostic tournament mixes heterogeneous objects—statistical models, boosted models, structural constraints, and rules—that do not expose naturally comparable likelihoods. BMA would therefore risk pseudo-Bayesian precision. Revisit only if the model stack becomes a coherent probabilistic family and BMA empirically improves calibration/generalization.


C19 — Deep-ensemble epistemic uncertainty
What it is: train multiple independently initialized or bootstrapped models and use their disagreement/variance as a signal of uncertainty, especially uncertainty associated with unfamiliar inputs or limited knowledge.
Representative paper: Simple and Scalable Predictive Uncertainty Estimation using Deep Ensembles — Lakshminarayanan, Pritzel & Blundell (NeurIPS 2017).
Why BASELINE: disagreement is a useful empirical uncertainty signal and easy to benchmark, but it is not automatically calibrated epistemic uncertainty and adds runtime/model cost. Keep it as a baseline/ablation and promote it only if disagreement predicts Reflex diagnostic failure or distribution shift better than cheaper novelty/calibration-health signals.


C20 — Sequential evidence-threshold stopping (SPRT / posterior thresholds)
What it is: collect evidence sequentially and repeatedly decide among stop-and-accept, stop-and-reject, or continue-sampling based on accumulated evidence such as likelihood ratios, posterior odds, or action thresholds.
Representative paper: Sequential Tests of Statistical Hypotheses — Abraham Wald (1945), the foundational SPRT reference.
Why COMBINE: sequential stopping fits Reflex, but textbook SPRT assumptions are too strong for the full runtime because evidence is adaptive, correlated, multi-hypothesis, and differently priced. We combine posterior/action thresholds with expected value of information and preserve the separate VERIFIED causal-evidence gate. Literal SPRT remains a baseline or special case where its assumptions are defensible.


C21 — Bayesian credible intervals
What it is: summarize a Bayesian posterior with an interval containing a chosen proportion of posterior probability for a parameter, making uncertainty around the estimate visible instead of showing only one point value.
Representative paper: Bayesian Estimation Supersedes the t Test — Kruschke (2013), used here as a clear reference for posterior estimation with credible values/intervals.
Why DEFER: a credible interval is meaningful only when Reflex has a defensible Bayesian posterior model. Attaching one to post-hoc-calibrated classifier probabilities would imply uncertainty the system has not actually modeled. Defer until a coherent likelihood/prior model exists or another interval method is empirically justified.


C22 — Fault-injection-based probability/threshold calibration
What it is: generate controlled incidents with hidden known ground truth, then use those incidents to tune and validate probability calibration, abstention thresholds, and stopping policies. The fault-injection part is established experimental methodology; using it specifically as the calibration scaffold for Reflex confidence/stopping is a project-specific composition.
Representative fault-injection reference: Fault Injection Techniques and Tools — Hsueh, Tsai & Iyer (IEEE Computer, 1997).
Why COMBINE: Reflex already plans hidden injected faults, so they are the best initial source of labeled incidents for calibration experiments. But synthetic faults can differ from real failures, so injected data must be separated into calibration and untouched evaluation families and eventually checked against real VERIFIED incidents. C22 is therefore combined with C15 rather than treated as independent proof that probabilities will transfer to production.


Candidate | Relation | Scores | Disposition | Why | Key assumption/trade-off | Evidence that could change the decision
C15 — Post-hoc probability calibration: Platt / isotonic / temperature [Source provenance: KEEP ×3] | augment | DV 4; IE 4; RF 5; PF 5; R 3; A 5 | COMBINE | Strongest benefit: converts heterogeneous model scores into probabilities that can support abstention, information-value calculations, and threshold decisions at negligible online cost. Decision: use post-hoc calibration offline; temperature scaling is the default for mutually exclusive multiclass branches, Platt scaling for binary/one-vs-rest outputs, and isotonic only when calibration data are sufficiently dense. | Assumes a representative held-out calibration set and sufficiently stable score semantics. Strongest failure mode: apparently precise probabilities become misleading under version/hardware/workload/fault shift or sparse classes; isotonic can overfit small calibration sets. Multi-cause incidents also invalidate a single softmax-style simplex. | Validation: cross-fit calibrators and report reliability, Brier/NLL, ranking preservation, and leave-fault-family/version/hardware-out calibration. Include real VERIFIED incidents when available. Revisit if a nonparametric calibrator is consistently better with adequate data, or if post-hoc calibration fails to transfer across contexts.
C16 — Conformal cause sets [Source provenance: KEEP] | augment | DV 4; IE 4; RF 4; PF 3; R 2; A 5 | DEFER | Strongest benefit: an explicit plausible-cause set with a measurable coverage target is a better diagnostic object than forcing one winner. Decision: keep the set-valued idea, but do not claim formal conformal coverage in the first architecture. Use a practical plausible-cause set from calibrated confidence, margins, and structural consistency. | Formal finite-sample coverage relies on exchangeability or carefully defined conditional/stratified variants. Reflex expects hardware/version/workload shift, adaptive data collection, and potentially multi-cause incidents; those can make nominal coverage misleading. | Validation: prototype split/stratified conformal on hidden injected incidents, then measure empirical coverage and set size under leave-one-fault-family/version/hardware-out tests and real VERIFIED incidents. Revisit if useful exchangeable strata exist and coverage remains stable under realistic shifts.
C17 — Selective classification / abstention [Source provenance: KEEP ×1; U ×1] | augment | DV 5; IE 5; RF 5; PF 5; R 4; A 5 | ADOPT | Strongest benefit: directly implements the architecture’s existing “cannot distinguish yet; do not recommend a fix” behavior as a first-class safety/quality gate. It prevents false certainty while preserving the option to acquire more evidence. | Requires thresholds tied to calibrated confidence or trustworthy surrogate signals. Strongest cost: excessive abstention can make the system safe but unhelpful; a single fixed confidence or margin threshold will not generalize across fault classes and evidence costs. | Validation: risk–coverage curves, false-confident-diagnosis rate, abstention rate, and time/cost to resolution across fault families and shifts. Revisit trigger: abstention does not predict error, is too frequent, or materially delays verified diagnosis without reducing wrong commitments.
C18 — Bayesian Model Averaging [Source provenance: KEEP] | augment | DV 3; IE 3; RF 3; PF 2; R 3; A 3 | DEFER | Strongest benefit: principled model uncertainty if competing diagnostic models expose comparable probabilistic likelihoods. Decision: do not make BMA the first model-combination layer; the current diagnostic tournament is heterogeneous and includes statistical models, boosted models, structural constraints, and rules whose likelihood semantics are not naturally comparable. | Assumes sensible model priors, likelihoods, and a model set containing useful approximations to reality. Strongest cost: pseudo-Bayesian weights over incomparable model outputs can create false rigor and operational complexity. | Validation: compare BMA against calibrated stacking/simple pooling/best-model selection on held-out fault/version/hardware contexts, including calibration and diagnosis cost. Revisit if the model stack converges on a coherent probabilistic family and BMA materially improves calibration/generalization.
C19 — Deep-ensemble epistemic uncertainty [Source provenance: KEEP] | augment | DV 3; IE 3; RF 2; PF 3; R 3; A 2 | BASELINE | Strongest benefit: model disagreement can provide a useful empirical signal for unfamiliar contexts or unstable predictions. Decision: keep as a benchmark/ablation, not the primary uncertainty architecture. | Assumes ensemble diversity tracks epistemic uncertainty rather than shared bias, random initialization, or training noise. Strongest cost: multiple model evaluations increase compute and disagreement is not itself a calibrated probability or guarantee of error detection. | Validation: train bootstrap/seed ensembles and test whether disagreement predicts diagnostic error and OOD/shifted incidents across held-out fault/version/hardware contexts, while measuring runtime overhead. Revisit if disagreement is a strong, cheap predictor of failure beyond calibration-health and novelty signals.
C20 — Sequential evidence-threshold stopping: SPRT / Bayesian posterior thresholds [Source provenance: KEEP ×2] | augment | DV 5; IE 5; RF 5; PF 4; R 3; A 5 | COMBINE | Strongest benefit: turns open-ended debugging into an auditable sequential decision process and aligns with Reflex’s information-value engine. Decision: adopt sequential stopping, but combine posterior/action thresholds with expected value of additional information rather than using literal SPRT as the primary rule. Posterior confidence alone never upgrades INFERRED to VERIFIED. | Literal SPRT is cleanest for simple binary hypotheses with well-specified, approximately independent evidence increments; Reflex has multiple hypotheses, adaptive measurements, shared telemetry, correlated evidence, varying test costs, and possible simultaneous causes. Strongest failure mode is double-counting correlated evidence or using fixed thresholds that do not generalize. | Validation: replay hidden incidents and compare posterior-threshold, SPRT-like, fixed-rule, and EVI-aware stopping on false conclusions, evidence cost, number of measurements, and time to VERIFIED cause; stress correlated/redundant evidence explicitly. Revisit if a subset of decisions satisfies SPRT assumptions well enough to give useful guarantees.
C21 — Bayesian credible intervals [Source provenance: U] | orthogonal | DV 2; IE 2; RF 4; PF 2; R 3; A 5 | DEFER | Strongest benefit: intervals can expose posterior uncertainty more honestly than a point estimate when Reflex has a genuinely Bayesian probabilistic model. Decision: do not attach Bayesian credible intervals to merely post-hoc-calibrated classifier scores. | Requires a defensible posterior model and prior; calibration error and dataset shift are not automatically represented by posterior intervals. Strongest failure mode: narrow intervals can communicate false precision while omitting model misspecification. | Validation: if a Bayesian diagnosis model is introduced, compare interval coverage/decision quality against bootstrap and calibration-uncertainty alternatives on shifted incidents. Revisit when Reflex has a coherent Bayesian likelihood/prior model or enough evidence that interval estimates improve decisions.
C22 — Fault-injection-based probability/threshold calibration [Source provenance: U] | augment | DV 5; IE 5; RF 5; PF 5; R 3; A 5 | COMBINE | Strongest benefit: the prototype already has hidden known-ground-truth injected incidents, making them the most practical source for initial calibration curves, abstention thresholds, and stopping-policy experiments. Decision: use fault injection as an offline calibration/validation scaffold, never as the sole evidence that probabilities are trustworthy in production. | Assumes injected faults reproduce the relevant evidence patterns of real incidents. Strongest failure mode: thresholds overfit the injection mechanism and fail on naturally occurring compound or shifted incidents. | Validation: nested holdouts with entire fault families, severities, versions, hardware/workload regimes withheld from calibration; keep an untouched evaluation set; then test transfer on real VERIFIED incidents as they accumulate. Revisit if synthetic-to-real transfer is weak; in that case restrict outputs to rankings/relative confidence until real calibration data are sufficient.


Decision lineage and change-control record (future-model handoff)
Purpose: make this Pass 3 reasoning reconstructable from the document alone, without relying on the chat that produced it. The lineage is: pre-Pass-3 Reflex architecture → Pass 2 mechanism registry → Pass 3 comparison of C15–C22 → selected composition. The representative papers hyperlinked above establish the mechanism families. They do not, by themselves, prove that the exact Reflex integration or disposition is optimal; those choices are project-level synthesis evaluated against the architecture and the validation criteria below. Pass 2 KEEP/U labels are provenance/source labels, not final architecture decisions.


What existed before Pass 3
• Reflex was already investigation-first rather than a single classifier: each incident carried explicit competing hypotheses, supporting and contradicting evidence, uncertainty, measurements that could distinguish hypotheses, and interventions that could falsify them.
• Reflex already displayed probability-looking uncertainty values, but the document had not defined whether those numbers were calibrated probabilities, whether causes were mutually exclusive, how they should behave under hardware/version/workload shift, how correlated evidence should be accumulated, or how simultaneous causes should be represented.
• Active diagnosis already selected the next measurement using expected diagnostic uncertainty reduction relative to measurement cost and observer overhead. What was missing was a principled rule for when further evidence was no longer worth acquiring.
• Reflex could already say, in effect, “I cannot distinguish these causes yet; do not recommend a fix; acquire the next discriminating test.” That was an informal abstention behavior, but there was no explicit, auditable abstention gate or threshold policy.
• The evidence hierarchy OBSERVED → INFERRED → TESTED → VERIFIED already existed, and controlled intervention/experiment was already required before a positive causal explanation could become VERIFIED.
• Hidden-ground-truth fault injection was already part of the prototype/evaluation plan. Pass 3 therefore uses it as calibration/validation infrastructure; it did not introduce fault injection from scratch.


The Pass 3 gap was therefore narrow but important: define the semantics of confidence, decide how ambiguity should be represented, formalize when Reflex must abstain, define when it should continue or stop evidence acquisition, and specify how those policies are calibrated and validated without weakening the existing causal-verification gate.


Mechanism ancestry, alternatives considered, and why each disposition was chosen
C15 — Post-hoc probability calibration ← Pass 2 R2-M1, R2-M2, R2-M3 (KEEP ×3).
Pre-existing gap: Reflex had numerical scores/probability-looking values but no validated probability semantics. Alternatives compared: raw ranking only; always-normalized probabilities; post-hoc calibration with ranking retained as fallback. Decision: COMBINE. Why: EVI, abstention, and action thresholds benefit from interpretable probability estimates, while post-hoc calibration is cheap online and auditable. Reflex must retain raw/ranked hypotheses whenever calibration is stale or untrusted rather than manufacture false precision. The linked Guo et al. paper is representative evidence for modern post-hoc calibration methods; the Reflex rule that probability output is conditional on calibration health is an architectural choice.


C16 — Conformal cause sets ← Pass 2 R2-M4 (KEEP).
Pre-existing gap: a forced single winner is unsafe when several causes remain plausible. Alternatives compared: single cause; fixed top-k; margin/confidence-based practical sets; formal conformal sets. Decision: DEFER formal conformal guarantees while retaining set-valued diagnosis in practical form. Why: conformal coverage is attractive and auditable, but useful coverage guarantees rely on exchangeability or a defensible variant/stratification. Reflex expects hardware, version, workload, fault-family, adaptive-measurement, and compound-cause shift, so those assumptions are not yet established. Promote C16 only if empirical coverage remains stable with useful set sizes under the relevant holdouts.


C17 — Selective classification / abstention ← Pass 2 R2-M5 and R2-M11 (KEEP ×1, U ×1).
Pre-existing gap: Reflex had an informal “cannot distinguish yet” behavior but no explicit policy controlling what it may claim or recommend. Alternatives compared: always force a diagnosis; use confidence only as a ranking; make low confidence automatically terminate the investigation; separate abstention from stopping. Decision: ADOPT. Why: a first-class abstention gate directly prevents unsupported single-cause/fix commitments while still allowing Reflex to acquire more evidence. The linked selective-classification work motivates refusal under uncertainty; Reflex extends that idea to diagnostic actions and requires the abstention reason and next discriminating measurement to remain auditable.


C18 — Bayesian Model Averaging (BMA) ← Pass 2 R2-M6 (KEEP).
Pre-existing gap: multiple diagnostic models can disagree, suggesting a need to represent model uncertainty. Alternatives compared: BMA; calibrated stacking/simple pooling; best-model selection; explicit tournament disagreement. Decision: DEFER. Why: principled BMA needs defensible model likelihoods, priors, and a coherent model family. Reflex’s current tournament mixes statistical models, boosted models, dependency/structural evidence, and rules with incompatible probabilistic semantics. Applying BMA now would add apparent Bayesian rigor without a sound common likelihood. Revisit if the stack becomes a coherent probabilistic family and BMA beats simpler pooling on calibration and diagnosis cost.


C19 — Deep-ensemble epistemic uncertainty ← Pass 2 R2-M7 (KEEP).
Pre-existing gap: Reflex needs a signal that predictions are unfamiliar or unstable under shift. Alternatives compared: single-model uncertainty; calibration-health/novelty checks; tournament disagreement; deep ensembles. Decision: BASELINE, not core architecture. Why: ensemble disagreement can be a useful empirical OOD/error signal, but it is not automatically a calibrated probability, can share systematic bias across members, is harder to audit, and adds multiple-inference runtime cost. Promote it only if disagreement adds a strong, cheap predictive signal beyond the cheaper calibration-health, novelty, and model-tournament signals.


C20 — Sequential evidence-threshold stopping / SPRT or posterior stopping ← Pass 2 R2-M8 and R2-M9 (KEEP ×2).
Pre-existing gap: the active diagnosis engine could choose the next evidence but did not have a principled termination rule. Alternatives compared: fixed number of measurements; fixed confidence threshold; posterior-only stopping; literal SPRT; posterior/action thresholds combined with expected value of information (EVI). Decision: COMBINE with the existing EVI engine. Why: Reflex is multi-hypothesis, measurements are adaptively selected, observations can be correlated, costs differ, and simultaneous causes can exist. Those properties make textbook SPRT assumptions unreliable as a universal default. Posterior/action confidence is therefore an input to stopping, while the actual stop/continue decision asks whether the best remaining measurement or experiment has positive net expected value. Literal SPRT remains a baseline or restricted special case when its assumptions are defensible. No stopping rule may promote INFERRED evidence to VERIFIED without the existing causal test.


C21 — Bayesian credible intervals ← Pass 2 R2-M10 (U).
Pre-existing gap: an interval around a cause probability could appear to express uncertainty more completely than a point estimate. Alternatives compared: credible intervals from a genuinely Bayesian model; bootstrap/calibration uncertainty; no interval when probability semantics are unsupported. Decision: DEFER. Why: a post-hoc calibrated classifier score is not automatically a Bayesian posterior. Adding credible intervals without a defensible likelihood and prior would imply precision the architecture has not earned. Promote only if a coherent Bayesian diagnostic model exists and its intervals improve empirical coverage/decision quality under shift.


C22 — Fault-injection-based probability and threshold calibration ← Pass 2 R2-M12 (U).
Pre-existing gap: calibration, abstention, and stopping thresholds require incidents with known ground truth, but early real VERIFIED incidents may be sparse. Alternatives compared: real-only calibration; injected-fault-only calibration; use injection as an offline bootstrap/evaluation scaffold with real-incident transfer validation. Decision: COMBINE. Why: hidden injected faults provide controllable labels, severities, and counterfactual regimes early, making them valuable for calibration and threshold experiments. But synthetic-to-real transfer can fail, so injected data may not be treated as sufficient production evidence. Real VERIFIED incidents are the highest-value transfer check and eventually the preferred recalibration evidence. The linked fault-injection paper establishes fault injection as an experimental technique; the specific composition “fault injection → Reflex probability/abstention/stopping calibration” is a Reflex design choice rather than a claim made by that paper.


Why the selected architecture is a composition rather than one winning mechanism
• Calibration answers: “When may Reflex interpret a score as a probability, and how trustworthy is that interpretation?”
• The plausible-cause set answers: “Which hypotheses remain live enough that Reflex should not collapse them into one winner?”
• Abstention answers: “What is Reflex allowed to claim or recommend at the current evidence state?”
• Stopping answers: “Is another observation or experiment worth its expected information relative to cost and observer overhead?”
• Verification answers: “Has the causal explanation actually been demonstrated?”
These are different control questions, so the mechanisms are complementary rather than substitutes. In particular, a high calibrated posterior or a stopping decision never substitutes for the OBSERVED/INFERRED/TESTED/VERIFIED causal-evidence ladder.


Change-control contract — evidence that would justify changing the decisions
• C15: downgrade, replace, or fall back to ranking-only if real VERIFIED incidents show systematic calibration-transfer failure across deployment regimes. Promote a different calibrator only when held-out reliability/Brier/NLL and downstream decision quality improve without harming ranking stability.
• C16: promote formal conformal cause sets if split/stratified/other defensible conformal variants meet target true-cause coverage with useful set size across held-out fault families, severities, hardware, versions, workloads, and compound causes.
• C17: change the abstention gate if risk–coverage analysis shows abstention is not predictive of diagnostic error, or if it creates a high unresolved/delay cost without materially reducing false-confident diagnoses or unsafe recommendations.
• C18: promote BMA if the diagnostic stack becomes a coherent probabilistic family with defensible priors/likelihoods and BMA materially beats calibrated stacking/simple pooling/best-model selection on calibration, cause recovery, and total diagnosis cost.
• C19: promote ensembles beyond baseline only if ensemble disagreement adds a reliable OOD/error signal that is materially stronger than and worth the runtime cost over calibration-health, novelty, and tournament-disagreement signals.
• C20: use literal SPRT more broadly only in regimes where likelihood/evidence-dependence assumptions are empirically defensible and it improves error, evidence cost, and stopping guarantees. Replace the EVI-aware rule if another sequential policy demonstrably reduces wrong stops and total investigation cost while preserving the VERIFIED gate.
• C21: promote credible intervals only after a coherent Bayesian diagnostic likelihood/prior exists and interval coverage plus downstream decision quality remain useful under shift; do not attach Bayesian intervals to merely calibrated discriminative scores.
• C22: restrict fault injection to evaluation-only if calibration/thresholds tuned on injected incidents fail to transfer to real VERIFIED incidents. In that case probability and action thresholds must be calibrated primarily from real verified evidence or be withheld until sufficient evidence exists.
• Global replacement gate: architectural change should be driven by measurable improvement rather than theoretical elegance alone. Compare false-confident diagnosis rate, risk–coverage, Top-1/Top-3 cause recovery, plausible-set coverage/size, evidence cost and observer overhead, number of measurements, steps/time to verification, stopping errors, and generalization to held-out hardware/version/workload/fault/compound-cause regimes.


Scope protection — what Pass 3 did not change
Pass 3 did not replace the investigation-first architecture, the statistical/model tournament, the active evidence-acquisition idea, the OBSERVED/INFERRED/TESTED/VERIFIED hierarchy, or the controlled causal-verification requirement. It formalized only the layer around those foundations: uncertainty/probability semantics, calibration and calibration-health, representation of ambiguous or multi-cause hypotheses, abstention, and the stop/continue policy. Future revisions should preserve that distinction unless evidence specifically supports changing the underlying foundations.


Head-to-head decisions


1. Calibrated probabilities vs raw rankings
Choice: retain rankings as the invariant diagnostic representation and add calibrated probabilities only where calibration has been validated for the relevant context. If calibration is unavailable, stale, or fails a calibration-health/shift check, Reflex must expose ranked scores and mark numeric probability as untrusted/unavailable rather than fabricate precision. Probabilities are valuable because active measurement selection and stopping need a common uncertainty scale, but ranking quality must remain usable when probability semantics degrade.


A single probability simplex is allowed only inside a mutually exclusive hypothesis branch. When causes can co-occur, Reflex should maintain marginal cause-involvement probabilities/scores and explicit composite hypotheses or structural links; it must not force simultaneous causes to compete for probability mass as if exactly one were true.


2. How probabilities should be calibrated
Choice: C15 + C22. Fit calibration offline on a held-out calibration partition. Use temperature scaling as the first multiclass calibrator for mutually exclusive branches because it is simple and rank-preserving; use Platt scaling for binary/one-vs-rest outputs; benchmark isotonic only when there is enough data to justify its flexibility. Select the calibrator by held-out calibration/generalization, not by novelty. Calibration may be stratified by stable context only when sample size supports it; otherwise use a pooled/shrunk fallback and expose calibration health.


3. Conformal sets vs top-k/margin-based uncertainty
Choice: output a set of plausible causes, but implement the first version as a calibrated-confidence/margin/structure set rather than claiming conformal coverage. A single cause is returned only when the leading explanation is decisively separated and calibration is trusted for that context; even then it remains INFERRED until tested. C16 is deferred until exchangeability/coverage can be demonstrated under realistic shifts.


4. BMA vs ensembles
Choice: neither is core. C19 deep ensembles are a BASELINE because disagreement is easy to benchmark as an OOD/error signal. C18 BMA is DEFERRED because Reflex’s current model tournament is heterogeneous and lacks a common likelihood semantics. Prefer calibrated model outputs plus explicit model disagreement/diagnostic-tournament evidence over pseudo-Bayesian averaging.


5. Abstention trigger
Choice: adopt C17 as a separate action gate. Reflex abstains from a single-cause/fix commitment when any material condition applies: calibration is untrusted; top confidence is below the context/action threshold; the top1–top2 gap is too small; the plausible-cause set is still broad; the healthy comparator or current context is OOD/novel; strong contradictory evidence or model disagreement remains; a multi-cause interaction is unresolved; or the proposed engineering action lacks sufficient discriminating/verification evidence. An abstention should normally nominate the highest-value next measurement if one exists.


6. Stopping vs abstention
Abstention answers “what may Reflex claim?” Stopping answers “should Reflex spend more investigation budget now?” They are intentionally separate. Reflex may abstain and continue gathering evidence. It may also stop while abstaining if no safe measurement has positive net expected value, the budget/time constraint is reached, or available tests cannot resolve the ambiguity. Conversely, Reflex may stop diagnostic evidence acquisition and move to a controlled verification experiment while still treating the cause as INFERRED.


7. SPRT vs posterior-threshold stopping
Choice: C20 as a composition of posterior/action thresholds plus expected value of information (EVI), not literal SPRT as the default. The online controller stops acquiring another diagnostic measurement when the plausible cause set is sufficiently actionable and the best remaining diagnostic measurement has non-positive net expected value, or when the best next action is a discriminating controlled experiment. Thresholds must be calibrated by fault class/context/action cost rather than fixed globally. Final investigation completion with a positive root-cause claim still requires the existing VERIFIED evidence gate. Literal SPRT remains a baseline for subsets where likelihood-ratio and evidence-independence assumptions are defensible.


Sequential updates must record evidence provenance/dependencies and avoid naive multiplication of evidence derived from the same trace, counter, or causal path. Correlated observations should be conditioned jointly, grouped, or conservatively discounted rather than treated as independent increments.


8. Fault injection for calibration without synthetic overfit
Choice: use injection to create known-ground-truth training/calibration/validation incidents, but separate generator families and evaluation regimes. Entire fault families, severity bands, versions, hardware/workload contexts, and compound-fault combinations should be held out from calibration in transfer tests. Thresholds should be accepted only when they improve risk/cost on hidden injected incidents and then continue to hold on real VERIFIED incidents. Real incidents become the highest-value calibration evidence as the dataset grows; synthetic calibration never substitutes for production transfer validation.


9. Offline calibration vs runtime uncertainty computation
Online: raw diagnostic scoring/ranking; application of prefit calibration maps; calibration-health/shift gating; hierarchical hypothesis state; practical plausible-cause set; abstention; evidence-provenance-aware belief updates; EVI-based measurement/stopping decision; transition to controlled verification.
Offline: model and calibrator fitting; fault injection; context/fault/hardware/version holdouts; threshold selection; reliability/risk-coverage analysis; stop-policy replay; recalibration; conformal/BMA/ensemble/credible-interval experiments. The online path should not fit calibrators or run expensive uncertainty ensembles by default.


Selected architecture


Probability/confidence representation
Maintain a hierarchical explicit hypothesis state. Every candidate has a raw/ranking score, supporting and contradicting evidence, evidence provenance, and a calibration-status flag. Where validated, attach calibrated probabilities. Normalize to a probability simplex only for mutually exclusive alternatives within the same branch. For co-occurring causes, retain marginal involvement probabilities/scores and explicit composite hypotheses instead of forcing exclusivity.


Calibration mechanism
COMBINE C15 + C22. Train post-hoc calibration offline using strict held-out data. Temperature scaling is the default multiclass option, Platt scaling the default binary/one-vs-rest option, and isotonic a data-rich benchmark. Fault-injected incidents provide initial known-ground-truth calibration data; real VERIFIED incidents are required to validate transfer and progressively anchor recalibration.


Uncertainty-set mechanism
Return a practical plausible-cause set whenever ambiguity remains. Construct it from calibrated confidence when trusted, top-score margins, structural compatibility, contradiction evidence, and multi-cause logic. Do not make a nominal conformal-coverage claim in v1. C16 remains a deferred upgrade contingent on exchangeability/coverage evidence.


Abstention rule
ADOPT C17. Abstain from committing to a single cause or engineering fix when calibration is untrusted, absolute confidence is insufficient, the leading margin is weak, the plausible set remains broad, the context/comparator is shifted or novel, contradiction/model disagreement is substantial, simultaneous causes remain unresolved, or the action is not sufficiently verified. Abstention returns the reason and, when useful, the next discriminating measurement.


Stopping rule
COMBINE C20 with the existing information-value engine. Use calibrated posterior/action thresholds as one input, but stop/continue is decided by expected net value of the next evidence or experiment. Stop diagnostic acquisition and transition to verification when a candidate/set is actionable and the controlled experiment has higher value than another observation. Stop unresolved when Reflex is abstaining and no safe positive-EVI evidence remains or investigation constraints are exhausted. Stop with a positive final root-cause claim only at VERIFIED status; posterior confidence by itself cannot cross that evidence boundary.


Offline calibration/validation process
Generate diverse hidden-ground-truth injected incidents, partition calibration from untouched evaluation, and perform leave-fault-family/severity/version/hardware/workload/compound-cause-out tests. Evaluate probability reliability, ranking stability, risk–coverage, plausible-set coverage/size, false confident diagnoses, measurement cost, steps/time to verification, and stopping errors. Stress correlated evidence by replaying redundant measurements from shared telemetry sources. Add real VERIFIED incidents as an explicit transfer set and later as recalibration data under versioned, auditable calibration artifacts.


Baselines and deferred approaches
Baselines: raw ranking/top-k and margin without calibration; fixed global confidence/escalation thresholds; literal SPRT where implementable; C19 deep-ensemble disagreement.
Deferred: C16 conformal cause sets; C18 Bayesian Model Averaging; C21 Bayesian credible intervals.
Adopted/combined core: C17 abstention; C15 post-hoc calibration + C22 fault-injection calibration/validation; C20 EVI-aware sequential stopping.


Architecture Decision Records


ADR — Ranked hypotheses with conditional calibrated probabilities
Choice
Keep ranking as the always-valid output and attach calibrated probabilities only when context-specific calibration is trustworthy. Use mutually exclusive normalization only inside exclusive hypothesis branches; use marginals/composite hypotheses for co-occurring causes.
Alternatives
Raw scores only; always-normalized multiclass probabilities; one global probability vector over all causes.
Reason
Reflex needs probabilities for information-value and risk decisions, but raw ranking remains more robust under calibration drift and multi-cause incidents.
Assumptions
Scores preserve useful ordering; calibration health can be monitored; the hypothesis hierarchy identifies which alternatives are mutually exclusive.
Trade-offs
More state and semantics than a single softmax vector; avoids false precision and forced exclusivity.
Validation
Measure ranking and calibration separately across held-out contexts, including compound faults.
Revisit when
Probability calibration remains stable enough across all operational contexts to simplify representation, or multi-cause prevalence proves negligible.


ADR — Offline post-hoc calibration anchored by fault injection and real verification
Choice
Use C15+C22: fit simple post-hoc calibrators offline on held-out known-ground-truth incidents, using injected incidents initially and real VERIFIED incidents for transfer validation and later recalibration.
Alternatives
No calibration; online calibration; end-to-end probabilistic retraining; synthetic-only threshold fitting.
Reason
It gives the runtime low overhead and auditable versioned probability semantics while leveraging the prototype’s known ground truth.
Assumptions
Injected incidents cover useful evidence patterns and enough real verified incidents eventually exist to measure transfer.
Trade-offs
Synthetic-to-real shift can invalidate precise probabilities; calibration artifacts require version/context management.
Validation
Nested holdouts and real-incident transfer tests for reliability, risk–coverage, and threshold stability.
Revisit when
Synthetic and real calibration diverge materially, or online drift becomes too rapid for offline refresh.


ADR — Practical plausible-cause sets now; formal conformal coverage later
Choice
Return a set of plausible causes using calibrated confidence, margins, structural compatibility, and contradiction evidence; defer formal conformal coverage.
Alternatives
Always return one cause; fixed top-k; conformal prediction from the start.
Reason
Set-valued diagnosis matches the investigation state and avoids forcing early commitment, while the exchangeability assumptions needed for reliable conformal guarantees are not yet established.
Assumptions
The practical set can be tuned against hidden ground truth and remains interpretable.
Trade-offs
No finite-sample coverage guarantee in v1; set-size thresholds require empirical calibration.
Validation
Measure true-cause inclusion, set size, downstream measurement cost, and behavior under distribution shift.
Revisit when
Exchangeable/stratified calibration populations and stable empirical conformal coverage are demonstrated.


ADR — Abstention is separate from stopping
Choice
Use C17 as an epistemic/action gate independent of the resource-control stopping decision.
Alternatives
Treat low confidence as an automatic stop; always continue until one cause wins; always force a diagnosis under budget exhaustion.
Reason
Low confidence often means “acquire a discriminating measurement,” not “end the investigation.” Separating the two prevents both premature conclusions and pointless continued profiling.
Assumptions
Reflex can estimate the value/cost of available next measurements and report unresolved outcomes.
Trade-offs
Requires two policy layers and explicit user-facing states.
Validation
Risk–coverage plus resolution cost/time, with special analysis of abstain-and-continue versus abstain-and-stop cases.
Revisit when
The separation adds complexity without reducing wrong commitments or measurement cost.


ADR — EVI-aware posterior stopping instead of literal SPRT
Choice
Use posterior/action thresholds together with expected net information value and the VERIFIED evidence gate. Keep literal SPRT as a baseline/special case.
Alternatives
Fixed threshold; posterior threshold alone; literal SPRT; fixed number of measurements.
Reason
Reflex has multi-hypothesis, adaptive, cost-varying, correlated evidence. EVI matches the existing information-value engine and lets costs differ by test and context.
Assumptions
Posterior/confidence is calibrated enough for decision use where enabled; measurement costs and expected discrimination can be estimated; evidence dependence is tracked.
Trade-offs
Less clean theoretical guarantee than textbook SPRT; more policy calibration and audit state.
Validation
Incident replay comparing error, cost, measurements, and time to VERIFIED cause across stopping policies, including correlated-evidence stress tests.
Revisit when
A restricted decision family satisfies SPRT assumptions and demonstrates materially better calibrated stopping guarantees.


ADR — Track evidence dependence and multi-cause structure explicitly
Choice
Attach provenance/dependency metadata to evidence updates and represent plausible simultaneous causes through marginals/composite hypotheses rather than naive independent accumulation into a one-cause posterior.
Alternatives
Assume evidence increments are independent; force one root cause; rely on model output alone to absorb correlation.
Reason
Many Reflex measurements reuse the same traces, counters, and causal paths; double-counting can make confidence rise much faster than actual knowledge. Latency regressions can also have compound causes.
Assumptions
The system can identify major shared evidence sources and define a tractable hypothesis hierarchy.
Trade-offs
Belief updates become more conservative and implementation is more complex.
Validation
Inject redundant correlated measurements and compound faults; measure overconfidence, cause recovery, and stopping errors with and without dependency handling.
Revisit when
Empirical evidence shows correlation handling has negligible effect or a learned joint probabilistic model subsumes it reliably.


Open uncertainties / Pass 5 questions


- How well do calibration curves, abstention thresholds, and stopping thresholds learned from injected faults transfer to real VERIFIED Reflex incidents?
- How many real VERIFIED incidents per hardware/version/workload/fault regime are needed before context-specific probabilities can be trusted rather than only rankings/relative confidence?
- How correlated are sequential evidence increments in practice, and how much overconfidence or premature stopping results from naive independence assumptions?
- How often do real latency regressions have multiple simultaneous causes, and is a marginal-plus-composite hypothesis representation sufficient?
- How stable are abstention and stopping thresholds across fault classes, measurement costs, severity, hardware, versions, and workload regimes?
- Can Reflex define exchangeable or sufficiently stable strata in which conformal cause-set coverage remains useful under deployment shift?
- Does deep-ensemble disagreement predict real diagnostic error or OOD incidents beyond existing novelty, calibration-health, and model-tournament signals?
- Does a coherent probabilistic likelihood/prior model emerge that would justify BMA or Bayesian credible intervals rather than post-hoc probability calibration?


PASS 3 DECISION LOG — Investigation-State Reasoning & Control


Current Reflex approach
Reflex already treats diagnosis as an investigation rather than a single classifier. The current design maintains explicit candidate hypotheses, supporting and contradicting evidence, uncertainty, discriminating measurements, candidate interventions, and an incident state machine. It uses matched healthy baselines, statistical/differential models, dependency structure, active measurement selection, and controlled experiments. A frontier-model investigator may orchestrate tools and summarize evidence, but timings, statistical outputs, dependency structure, profiler evidence, and controlled experiments are the source of truth. The existing OBSERVED / INFERRED / TESTED / VERIFIED hierarchy is therefore the correct foundation for investigation control.


The Pass 3 objective is not to add orchestration for its own sake. It is to make the hypothesis lifecycle, evidence boundary, dynamic expansion policy, and structural constraints precise enough that Reflex can investigate autonomously while keeping canonical state deterministic and auditable.


Reader contract for a future architecture reviewer
This section is intended to be self-contained enough for a future frontier model to challenge the design without reconstructing the research process. Reflex is building an autonomous performance investigator whose canonical investigation state is deterministic: measured evidence is localized and structured first, then a frontier model reasons over a compact hypothesis-linked diagnostic context to propose explanations, missing evidence, and discriminating measurements or experiments. The model is an investigator/orchestrator, not the source of truth; only telemetry, deterministic analyses, profiler/tool outputs, and controlled experiments can create authoritative evidence or verification state.


Mechanism lineage and decision summary
C23 — Role-separated diagnostic reasoning. Source: Sequential Diagnosis with Language Models / MAI Diagnostic Orchestrator (https://arxiv.org/abs/2506.22405). The source separates useful diagnostic functions such as maintaining a differential, challenging the leading explanation, choosing tests, and considering cost. Reflex borrows those reasoning responsibilities but BASELINES independent multi-agent orchestration: one frontier-model orchestrator runs explicit generate → challenge → cost-check → plan passes over one canonical state. We chose this because separate agents add synchronization, duplicated context, inconsistent state/evidence views, and model cost without adding primary empirical evidence. Change this decision if an equal-model/tool-budget hidden-fault benchmark shows specialized agents materially improve true-cause recovery or reduce measurements/time to VERIFIED cause without increasing inconsistent state transitions, hallucinated evidence references, duplicate tool calls, or total cost.


C24 — Incremental versus regenerated diagnostic differential. Source: Sequential Diagnosis with Language Models (https://arxiv.org/abs/2506.22405), adapted here into an open-world runtime hypothesis lifecycle. Reflex COMBINES the alternatives: start from a stable hierarchical ontology, update existing hypotheses incrementally after ordinary measurements, retain an explicit UNKNOWN/UNMODELED state, admit incident-local PROVISIONAL causes when residual/novelty/contradiction signals show model mismatch, and broadly recompute only on explicit invalidation or phase-change triggers. We chose this because a closed ontology can miss new causes while full regeneration after every measurement causes hypothesis churn, duplicate causes, unstable belief semantics, and early loss of plausible explanations. Change this decision if held-out-fault and compound-fault experiments show a fixed ontology has equal unseen-cause recovery and verification cost, or full recomputation consistently wins without unacceptable churn, pruning failures, or model cost.


C25 — d-DNNF knowledge compilation for structural diagnosis. Source: Decomposable Negation Normal Form (Darwiche, 2001, https://www.cs.ucla.edu/~darwiche/papers/dnnf.pdf). d-DNNF compiles Boolean structural knowledge into a representation that can make repeated logical consistency/model-counting queries tractable. Reflex DEFERS it and instead uses a hierarchical typed component graph plus request dependency DAG, critical-path/wait relations, and lightweight structural constraints. We chose this because current Reflex evidence is noisy, continuous, dynamic, incomplete, version-dependent, and potentially multi-causal; compiling an incomplete model risks false logical certainty and substantial modeling/compile cost. Change this decision for a bounded subdomain if a maintainable d-DNNF model materially reduces measurements/time to VERIFIED cause versus graph constraints, handles interacting causes and deliberate model omissions robustly, and has acceptable compile/update cost.


Decision lineage / what preceded this Pass 3 choice
Before Pass 3, the current Reflex architecture already had explicit hypotheses, support/contradiction evidence, uncertainty, active measurement selection, structural/dependency evidence, and the OBSERVED → INFERRED → TESTED → VERIFIED hierarchy. What it did not specify was who owns canonical investigation state, whether model reasoning should be one orchestrator or several agents, whether the hypothesis universe is closed or open, and whether structural diagnosis needs a compiled logical representation. Pass 2 then reduced 88 raw research mechanisms to 52 canonical candidates and placed C23–C25 in the investigation-state-control job. Pass 3 compared all three rather than selecting from source-report KEEP/GEM labels.


The alternatives actually compared were: (A) deterministic-only investigation control; (B) one frontier-model orchestrator over deterministic state; (C) C23-style independent specialized agents; for hypothesis management, (D) a fixed closed ontology, (E) full model-driven regeneration after every measurement, and (F) the selected ontology-seeded incremental/open-world hybrid; for structure, (G) no formal structural model, (H) the selected typed hierarchy + request dependency DAG + constraints, and (I) C25 d-DNNF knowledge compilation. The selected architecture is therefore a composition, not a direct copy of one paper: C23 supplies evidence that explicit diagnostic reasoning roles can be useful; C24 motivates sequential differential revision but is adapted to an open-world runtime; C25 is the stronger formal structural alternative we deliberately defer; and the deterministic evidence/state boundary comes from Reflex’s pre-existing verification architecture and the requirement that model text never become evidence by assertion.


Why the frontier-model/context-compiler layer exists
The frontier-model layer is not assumed necessary merely because modern models can reason. It is retained as a falsifiable architectural hypothesis: after deterministic matching, localization, dependency reconstruction, hypothesis/evidence indexing, and selective deep profiling have compressed the incident, a model may add value on the remaining open-ended tasks—unseen-hypothesis proposal, adversarial challenge, interpretation of partially normalized profiler artifacts, cross-level explanation synthesis, and discriminating experiment design. The context compiler exists to prevent the model from wasting capacity on mechanical reconstruction and to reduce unsupported reasoning by presenting only provenance-linked evidence, explicit uncertainty, and executable actions. Deterministic-only remains the principal baseline. If equal-budget experiments do not show incremental diagnostic value, the model must be narrowed to explanation/UI or removed from investigation control.


How a future reviewer should challenge this section
Do not ask only whether a newer model is more capable. Re-run the architectural comparisons under the same hidden incidents, evidence, tools, and cost budgets. Replace one orchestrator with multiple agents only if independent agents improve verified-cause recovery or investigation cost enough to justify coordination failures. Replace the hybrid hypothesis lifecycle with a fixed ontology only if unseen/compound-cause recovery is not harmed; replace it with full regeneration only if regeneration improves recovery without destabilizing identity, provenance, or cost. Promote d-DNNF only where a bounded, maintainable, complete-enough structural model empirically beats graph constraints. Remove or narrow the frontier model if structured-context reasoning does not outperform deterministic-only control on the incident classes where open-ended reasoning is supposed to matter. These are decision gates, not historical preferences.


Architecture provenance map and future-review contract


Interpretation rules for a future reviewer
- Pass 2 labels such as KEEP or U are source-report provenance only. They are not Reflex architecture decisions. Pass 3 dispositions are the Reflex-specific decisions.
- COMBINE means an adapted mechanism contributes to the selected composition; it does not mean wholesale adoption of a source architecture.
- BASELINE means the alternative is intentionally retained as a controlled comparator because it could still outperform the selected mechanism under evidence.
- DEFER means potentially valuable but not justified for the initial architecture; it is not a rejection.
- Pass 3 scores and dispositions are conditional on the stated prototype assumptions. If those assumptions change, the decision must be re-tested rather than inherited as truth.
- A mechanism absent from C23–C25 was outside this investigation-state/control job, not implicitly rejected. Other Pass 3 jobs may own it.


Lineage by selected architecture element
1. Single frontier-model orchestrator.
Origin/predecessor: the pre-existing Reflex observe → hypothesize → measure → experiment → verify loop, combined with the reasoning-role idea represented by C23 (canonical Pass 2 candidate C23; raw mechanism R1-M5). C23 contributes explicit generation, challenge/counterexample, cost-steward, and planning roles; Reflex does not adopt independent agent-owned state.
Alternatives compared: deterministic-only investigation control; one orchestrator with explicit role passes; independent specialized agents.
Why selected: one orchestrator can preserve deliberate generate → challenge → cost-check → plan decomposition while reading and writing through one canonical typed state. This avoids synchronization, duplicated context, conflicting tool authority, and extra model cost created by independent agents.
Evidence that should change it: move to multiple agents only if equal-budget hidden-incident tests show a material improvement in verified-cause recovery, measurements-to-verification, or time-to-verification without materially higher inconsistent state transitions, hallucinated evidence references, duplicate tool calls, or model/runtime cost. Narrow or remove the model from investigation control if deterministic-only control matches its diagnostic performance and investigation cost.


2. Deterministic incident state machine plus immutable typed evidence ledger.
Origin/predecessor: this primarily comes from Reflex before C23–C25—the explicit hypothesis/evidence state, provenance requirements, controlled experiments, and OBSERVED → INFERRED → TESTED → VERIFIED authority hierarchy. Pass 3 makes the ownership boundary explicit: model reasoning is advisory/propositional; canonical evidence and lifecycle transitions are deterministic.
Alternatives compared: free-form model-owned investigation state; deterministic canonical state with model proposals; fully deterministic reasoning/control.
Why selected: open-ended reasoning may benefit from a frontier model, but evidence identity, provenance, statistical outputs, state transitions, experiment results, and VERIFIED status must be replayable and must not change because a model phrased an inference confidently.
Evidence that should change it: relax this boundary only if a model-owned-state design can reproduce evidence provenance, lifecycle correctness, replayability, and verification accuracy at least as well while materially improving investigation performance. Tighten it or remove model authority further if model proposals cause unsupported state changes or fail to add diagnostic value.


3. Ontology-seeded dynamic hypothesis registry with explicit UNKNOWN / UNMODELED state.
Origin/predecessor: Reflex already maintained explicit candidate hypotheses, support/contradiction evidence, uncertainty, discriminating measurements, and interventions. C24 (canonical Pass 2 candidate C24; raw mechanism R1-M7) introduces the dynamic-versus-static recomputation question. Pass 3 adapts that mechanism into an open-world hybrid rather than choosing either extreme.
Alternatives compared: fixed closed ontology; full regeneration/recomputation after every measurement; persistent ontology-seeded set with incremental updates, explicit residual UNKNOWN mass, provisional unseen hypotheses, and trigger-based expansion/recomputation.
Why selected: it preserves stable hypothesis identity and audit history for known causes while allowing genuinely unseen, version-specific, hardware-specific, or compound causes to enter when residual latency, contradictory evidence, structural novelty, topology/version change, failed discrimination, or UNKNOWN mass shows the current representation is inadequate.
Evidence that should change it: use a fixed ontology if held-out and compound-fault experiments show no meaningful loss in unseen-cause recovery or false certainty. Prefer full regeneration if it materially improves recovery or reduces measurements without unacceptable hypothesis churn, duplicate identities, provenance loss, probability dilution, or model cost.


4. Hierarchical dependency DAG plus lightweight structural constraints.
Origin/predecessor: this is primarily inherited from Reflex’s existing Cloud Atlas/DepGraph-style dependency evidence, waiting/blocking relationships, request dependency DAG, critical-path reasoning, and hierarchical localization. C25 (canonical Pass 2 candidate C25; raw mechanism R7-M7) is the stronger compiled structural alternative: d-DNNF hierarchical structural diagnosis.
Alternatives compared: no explicit structural model; typed hierarchy plus request-centric dependency/waiting DAG and deterministic constraints; d-DNNF knowledge compilation.
Why selected: the graph/hierarchy approach captures topology, temporal/waiting structure, suspect-subgraph extraction, critical path, and multi-cause interaction without requiring the prototype runtime to be represented as a complete, stable Boolean theory. d-DNNF is more formally auditable when its model is correct, but compilation cost, topology churn, continuous evidence, compound causes, and model omission can make it brittle or falsely certain.
Evidence that should change it: promote d-DNNF for a bounded subdomain only if realistic single- and multi-cause benchmarks—including topology changes and deliberate structural-model omissions—show materially fewer tests or lower time-to-verified-cause than graph constraints, with acceptable compile/update cost, state size, and robustness to incompleteness.


5. Guarded tool and experiment execution.
Origin/predecessor: Reflex already had active measurement selection, profiler escalation, controlled interventions, replay, and verification. Pass 3 strengthens the authority boundary by making the frontier model a proposer of measurements/interventions while deterministic components own the tool registry, prerequisites, permissions, observer overhead/cost, execution, recorded results, and verification gates.
Alternatives compared: unvalidated model-issued actions; guarded model-proposed actions; deterministic-only action planning.
Why selected: it preserves autonomous diagnostic planning while ensuring that an action is executable, its cost and safety constraints are known, and only an actually executed measurement or experiment can create evidence.
Evidence that should change it: reduce guards only if a less constrained planner demonstrates equal or better safety, provenance, reproducibility, observer-overhead accounting, and experiment validity while materially improving diagnostic efficiency. Shift more planning to deterministic logic if it matches model-selected action quality at lower cost.


6. Context compiler / structured model workspace.
Origin/predecessor: this is an integration mechanism introduced by the Reflex composition rather than a wholesale C23–C25 mechanism. Its inputs are the pre-existing telemetry/statistical/structural/profiler evidence systems and the Pass 3 deterministic-state boundary.
Alternatives compared: send raw incident context directly to the model; send a compact provenance-linked typed state; use no model reasoning layer.
Why selected: the model should spend capacity on ambiguous diagnosis rather than mechanically reconstructing incident state. The compiler exposes evidence IDs, uncertainty, structural context, active hypotheses, tool choices, and costs while keeping model prose separate from canonical evidence.
Evidence that should change it: remove or simplify the compiler if equal-budget tests show raw-context reasoning is as accurate, auditable, and cost-efficient without higher unsupported-claim or context-reconstruction failure rates. Remove the model path entirely if neither representation beats deterministic-only investigation control on the incident classes intended to require open-ended reasoning.


Chronological decision chain
Pre-Pass-2 Reflex mechanisms and verification architecture → Pass 2 research canonicalization (88 raw mechanisms reduced to 52 canonical candidates; C23–C25 assigned to this investigation-state/control job) → Pass 3 Reflex-specific scoring and head-to-head comparison → adapted composite architecture and ADRs → Pass 5 experiments, calibration, and possible re-scoring/replacement.


The inheritance rule for a future model is therefore: preserve a decision only while its assumptions and supporting comparative evidence still hold. A newer model should not keep an architectural mechanism because it appears in this document; it should use the recorded predecessor, alternatives, rationale, and change gate to decide whether new evidence now favors a different mechanism.




Selected investigation-control dataflow
The selected architecture is: raw runtime evidence → matched healthy differential → request/dependency reconstruction and critical/suspect localization → ontology-seeded live hypotheses with support/contradiction evidence IDs → progressively deeper kernel/source/PC/tensor/instruction evidence only when it can discriminate the live hypotheses → deterministically compiled model context → one frontier-model generate/challenge/cost/plan reasoning cycle → proposed next measurement or controlled experiment → deterministic execution → immutable evidence/state update → repeat until abstention, stopping, or VERIFIED cause.


The frontier model therefore receives unusually relevant context rather than a trace dump. For each live hypothesis it sees the mechanism, current rank/probability when trustworthy, exact supporting and contradicting evidence IDs, relevant dependency nodes/edges, matched healthy deltas, expected-but-missing signatures, mapping/correlation/observer-effect uncertainty, candidate discriminating measurements, falsification conditions, and candidate interventions. When localization reaches the GPU, the same context can descend to a suspicious kernel and, when justified, PC/stall/source/dataflow evidence, tensor/operator lineage, or a low-level dependency slice while preserving ancestry back to the request and high-level operation. This deterministic context compilation is a project-specific architectural composition built on the surrounding Reflex localization/profiling mechanisms; it is not claimed to come from C23 alone.


Why this architecture rather than deterministic-only or LLM-first diagnosis
A deterministic-only investigator is the critical baseline and owns all machine-checkable operations, but it may struggle with open-ended unseen hypotheses, ambiguous profiler interpretation, cross-level explanation synthesis, adversarial challenge, and proposing novel discriminating experiments. An LLM-first design has the opposite problem: it can produce fluent explanations without reliable evidence provenance and can waste context rediscovering timestamp alignment, graph structure, matched deltas, and kernel mappings that deterministic algorithms can compute exactly. The selected boundary therefore uses deterministic computation to compress the incident into a high-relevance diagnostic case and uses the frontier model only where open-ended abductive reasoning may add value. The architecture must be simplified toward deterministic-only if the model does not demonstrate incremental diagnostic value.


Evidence required to keep or change the frontier-model layer
The decisive experiment is an ablation on identical hidden-ground-truth incidents and equal measurement/tool budgets: (1) deterministic state machine/statistical/graph investigator only; (2) frontier model over raw traces; (3) frontier model over generic summaries; (4) frontier model over suspect-subgraph context; (5) frontier model over hypothesis-linked evidence; and (6) frontier model over the full cross-layer diagnostic context. Measure Top-1/Top-3 true-cause recovery, correct next-measurement/experiment choice, unsupported or hallucinated evidence claims, measurements and observer cost to verification, model/token cost, time to VERIFIED cause, performance on held-out/unseen and compound faults, and robustness to missing/correlated evidence. Keep the frontier-model/context-compiler architecture only if the structured-context variants materially outperform the deterministic baseline or reduce investigation cost on the classes of incidents where open-ended reasoning is supposed to matter. If they do not, narrow the model to explanation/UI duties or remove it from control. If raw-trace reasoning matches structured context, simplify the context compiler. If deeper kernel/source/tensor context adds no incremental value, stop escalation earlier.


Candidate decision matrix


Candidate
	Relation
	Scores (DV/IE/RF/PF/RO/AU)
	Disposition
	Why
	Key assumption/trade-off
	Evidence that could change the decision
	C23 — Role-separated multi-agent diagnostic orchestration
	augment
	3/2/2/4/2/3
	BASELINE
	Roles add challenge/planning diversity, but separate agents duplicate reasoning and create coordination/state-consistency failures. One orchestrator can run the same roles as structured passes.
	Assumes role tasks can share one canonical state and do not require independent long-lived agents. Trade-off: less independent diversity for much lower coordination cost.
	Same-budget hidden-fault benchmark shows multi-agent materially improves Top-1/Top-3 cause recovery or reduces measurements to verification without more inconsistent state/evidence errors.
	C24 — Dynamic vs static hypothesis-space recomputation
	augment
	5/4/4/5/4/5
	COMBINE
	Use a stable ontology seed plus incremental belief updates, an always-present unknown bucket, dynamic provisional hypotheses, and full recomputation only on explicit triggers.
	Assumes common causes are covered by ontology while unseen causes can be detected by residual/contradiction/novelty. Trade-off: added lifecycle logic prevents both closed-world misses and hypothesis churn.
	Withheld-fault experiments show either a fixed ontology matches hybrid recovery/cost or full recomputation consistently beats hybrid with acceptable churn and no early-pruning failures.
	C25 — d-DNNF hierarchical structural diagnosis
	duplicate
	3/3/2/2/2/5
	DEFER
	Formal compilation is auditable and can make repeated logical queries efficient, but Reflex already has dependency/critical-path structure and currently lacks the complete stable Boolean system model d-DNNF needs.
	Assumes current incidents involve noisy continuous evidence, dynamic topology, and interacting causes. Trade-off: simple graph constraints give less exact logical inference but far lower modeling/compile burden and false-completeness risk.
	On a realistic multi-cause benchmark, d-DNNF over a maintainable model materially reduces tests/time to verified cause versus graph constraints, tolerates incomplete-model perturbations, and has acceptable compile/update cost.
	



Scores are in the requested order: Diagnostic value / Information efficiency / Runtime fit / Prototype feasibility / Robustness / Auditability.


Candidate analyses


C23 — Role-separated multi-agent diagnostic orchestration
Source provenance: Pass 2 C23; merged raw mechanism R1-M5; source-report label KEEP. The KEEP label is provenance only and is not a Reflex decision.
Mechanism reference: Sequential Diagnosis with Language Models (MAI Diagnostic Orchestrator). The paper motivates maintaining an explicit differential, challenging leading hypotheses, considering test cost, and choosing what evidence to acquire next. Reflex keeps that reasoning decomposition but chooses BASELINE rather than production multi-agent control because separate agents add duplicated context and state-coordination failures without creating new empirical evidence.


Relation to current architecture: augment.
Scores: 3 / 2 / 2 / 4 / 2 / 3.
Disposition: BASELINE.
Assumptions: hypothesis generation, challenge/counterexample search, cost stewardship, and decision planning are useful reasoning roles, but they can operate over one shared canonical incident state. They do not require long-lived independent agents with private memories or separate authority.
Strongest benefit: role separation can force deliberate adversarial checking and cost-aware planning, reducing the chance that one free-form reasoning pass prematurely locks onto an attractive explanation.
Strongest drawback / failure mode: multiple agents introduce synchronization, duplicated context, inconsistent hypothesis/evidence views, conflicting tool plans, extra model cost, and a new class of coordination failures that do not produce new empirical evidence. A consensus of agents can still be jointly wrong.
Decision rationale: the useful part of C23 is decomposition of reasoning responsibilities, not independent agent identity. Reflex can get most of that benefit by having one frontier-model orchestrator execute explicit generate → challenge → cost-check → plan passes against the same typed state. Deterministic validators can enforce evidence references, admissible state transitions, measurement cost, and tool permissions. This is smaller, cheaper, and easier to audit. Keep a role-separated multi-agent implementation only as an evaluation baseline.
Experiment that could overturn the choice: on the same hidden-fault incidents, model, evidence, tool set, token budget, and measurement-cost budget, compare one orchestrator with structured role passes against four specialized agents. Reverse the decision if multi-agent orchestration materially improves Top-1/Top-3 true-cause recovery or reduces measurements/time to verified cause without increasing inconsistent state transitions, hallucinated evidence references, duplicate tool calls, or runtime/model cost beyond the gained diagnostic value.


C24 — Dynamic vs static hypothesis-space recomputation
Source provenance: Pass 2 C24; merged raw mechanism R1-M7; source-report label KEEP. The KEEP label is provenance only and is not a Reflex decision.
Mechanism reference: Sequential Diagnosis with Language Models. The relevant idea is that a diagnostic system repeatedly updates a differential as new test results arrive rather than treating diagnosis as one-shot classification. Reflex chooses COMBINE: keep a stable ontology-seeded hypothesis set for continuity, update it incrementally after normal measurements, and dynamically expand/recompute only when residual error, contradictions, novelty, topology/version changes, or UNKNOWN mass show that the current hypothesis space is inadequate.


Relation to current architecture: augment.
Scores: 5 / 4 / 4 / 5 / 4 / 5.
Disposition: COMBINE.
Assumptions: Reflex can define a useful ontology for common subsystem and GPU failure mechanisms, but the ontology will never be complete across new model versions, hardware, runtimes, contention patterns, and compound failures. Most measurements should update a stable working set rather than recreate the diagnostic universe from scratch.
Strongest benefit: a hybrid policy preserves stable beliefs and audit history for known causes while still allowing unseen causes to enter when the observed residual, contradictions, or structural novelty show that the current set is inadequate.
Strongest drawback / failure mode: over-aggressive filtering can prune the true cause before decisive evidence arrives, while unconstrained regeneration can create hypothesis churn, duplicate causes, probability dilution, and model-authored speculation that expands faster than evidence can test it.
Decision rationale: seed each incident from a hierarchical ontology and update the active set incrementally after ordinary measurements. Keep an explicit unknown / unmodeled residual hypothesis at all times. New causes enter as provisional typed hypotheses when novelty, unexplained residual latency, contradictory evidence, topology/version changes, or failed discrimination among existing causes triggers expansion. Do not silently delete weak hypotheses; suppress them with the evidence that weakened them so they can be reopened. Full recomputation is reserved for explicit phase changes or invalidation triggers, not every measurement.
Experiment that could overturn the choice: benchmark fixed ontology, full-recompute-after-each-measurement, and the hybrid policy on both known injected faults and held-out fault families, including compound faults. Change the decision if a fixed ontology matches unseen-cause recovery and verification cost without false certainty, or if full recomputation consistently improves recovery/measurement count with acceptable hypothesis churn, model cost, and no increase in early-pruning failures.


C25 — d-DNNF hierarchical structural diagnosis
Source provenance: Pass 2 C25; merged raw mechanism R7-M7; source-report label U. The source label is provenance only and is not a Reflex decision.
Mechanism reference: Decomposable Negation Normal Form (d-DNNF). d-DNNF compiles logical relationships into a tractable representation that supports repeated consistency/model-counting-style queries. Reflex chooses DEFER because the runtime evidence is noisy, continuous, dynamic, incomplete, and often multi-causal; a request/dependency DAG with typed constraints provides most of the structural pruning benefit without pretending the system is a complete Boolean theory.


Relation to current architecture: duplicate, because Reflex already proposes Cloud Atlas/DepGraph-style structural constraints, a request-level dependency DAG, critical-path reasoning, and hierarchical subsystem localization; d-DNNF is a stronger formal encoding of the same structural-control job rather than a missing job.
Scores: 3 / 3 / 2 / 2 / 2 / 5.
Disposition: DEFER.
Assumptions: current Reflex incidents expose noisy continuous measurements, dynamic runtime topology, uncertain causal relationships, version-dependent behavior, and sometimes multiple interacting causes. A complete, stable Boolean system model is not available at prototype time.
Strongest benefit: if a correct structural model can be compiled, d-DNNF provides explicit, auditable logical relationships and can make repeated consistency/model-counting style queries efficient while exploiting hierarchy to narrow diagnosis.
Strongest drawback / failure mode: knowledge compilation can become expensive or blow up as the model grows; more importantly, an incomplete logical model can create false certainty by declaring an unseen or mis-modeled cause impossible. Encoding continuous probabilistic performance evidence and compound interactions into a Boolean structural representation also creates substantial modeling burden.
Decision rationale: use a typed hierarchical dependency graph with temporal/waiting edges, critical-path relationships, subsystem containment, and explicit structural constraints. This supports deterministic impossibility checks and suspect-subgraph extraction without pretending the whole runtime has been captured in a closed logical theory. Represent interacting causes explicitly as composite/linked hypotheses when evidence requires them. Revisit d-DNNF only if a stable discrete structural subproblem emerges and simple graph constraints become the bottleneck.
Experiment that could overturn the choice: build a realistic bounded structural model for a prototype runtime and compare graph constraints against d-DNNF on single- and multi-cause injected incidents, including topology changes and deliberate model omissions. Adopt d-DNNF for that scope only if it materially reduces measurements/time to verified cause, represents interacting causes without unacceptable state explosion, remains robust under incomplete-model perturbations, and compile/update cost is acceptable relative to investigation latency.


Head-to-head decisions


1. Should the investigator use one orchestrator or multiple specialized agents?
Use one frontier-model orchestrator. It can run explicit internal reasoning roles or tool-backed passes for hypothesis generation, adversarial challenge, cost review, and planning, but those roles do not own separate canonical state and are not independent authorities. Multi-agent orchestration remains a benchmark, not the selected control architecture.


2. Which parts should be deterministic state-machine/tool logic versus model reasoning?
Deterministic components own the canonical incident state, evidence ingestion, provenance, statistical/model outputs, structural graph, admissible hypothesis lifecycle transitions, calibrated belief updates where a quantitative model exists, measurement/tool registry, cost/overhead accounting, tool execution, experiment records, verification gates, and append-only audit log. The frontier model owns open-ended hypothesis proposal, interpretation of ambiguous profiler artifacts, explanation synthesis, generation of candidate discriminating measurements/interventions, and challenger/planner reasoning. Model outputs are proposals until schema validation and evidence/tool logic accept them.


3. Should the hypothesis space be fixed from an ontology or dynamically recomputed during investigation?
Neither extreme. Use a persistent ontology-seeded working set plus incremental updates. Dynamically expand or partially recompute only when explicit triggers indicate model mismatch: large unexplained residual latency, mutually contradictory evidence, a new topology/version/path, structural novelty, repeated failed discrimination, or excessive probability/score mass in unknown. Recompute broadly at investigation phase boundaries when the representation itself has changed. Do not regenerate the whole set after every measurement.


4. How should new/unseen causes enter the hypothesis state?
Keep an always-present UNKNOWN / UNMODELED hypothesis or residual mass. A rule, novelty detector, statistical residual, or frontier-model proposal may create a PROVISIONAL hypothesis with: parent subsystem, mechanism statement, scope/context, predicted observable signatures, evidence already supporting/contradicting it, structural dependencies, discriminating measurements, falsifying conditions, candidate intervention, provenance, and creator. Deterministic validation rejects duplicates and structurally impossible proposals. Promotion to normal ontology membership occurs only after the cause is verified across an incident and judged reusable; until then it remains incident-local. No new cause becomes VERIFIED because the model described it persuasively.


5. Is formal hierarchical diagnosis such as d-DNNF justified by Reflex’s problem structure?
Not for the initial architecture. The useful structural core is hierarchical, but the evidence is noisy, continuous, dynamic, and only partially modeled. A hierarchical dependency DAG plus typed constraints gives most of the practical benefit with much lower modeling and compilation cost. d-DNNF is justified only for a bounded subdomain where the structure is discrete, sufficiently complete, reused often enough to amortize compilation, and empirically reduces investigation cost.


6. How should the system prevent reasoning text from being confused with evidence?
Make the boundary architectural, not stylistic. Evidence is an immutable typed object created only by telemetry collectors, deterministic analyses, profiler/tool outputs, or recorded experiments. Each object carries an evidence ID, source/tool, timestamp/run, scope, raw artifact reference, measured value/result, uncertainty/quality metadata, and provenance. Hypotheses reference evidence IDs in support/contradiction fields. Frontier-model text is stored separately as reasoning/proposal metadata and cannot create OBSERVED, TESTED, or VERIFIED records. Any generated conclusion shown to a user must cite the canonical evidence IDs and current hypothesis state from which it was derived.


Selected architecture


Smallest reliable investigation-control architecture: SINGLE FRONTIER-MODEL ORCHESTRATOR + DETERMINISTIC INCIDENT STATE MACHINE + ONTOLOGY-SEEDED DYNAMIC HYPOTHESIS REGISTRY + HIERARCHICAL DEPENDENCY DAG/STRUCTURAL CONSTRAINTS + IMMUTABLE TYPED EVIDENCE LEDGER + GUARDED TOOL/EXPERIMENT EXECUTION.


Investigator state representation
- Incident context: deployment/model/runtime/hardware/workload identity, symptom, matched healthy comparator, regression window, and current investigation phase.
- Evidence ledger: immutable evidence objects keyed by ID with OBSERVED / TESTED / VERIFIED semantics, provenance, quality/uncertainty, and raw artifact references.
- Hypothesis registry: typed hypotheses with parent ontology node, status, prior/current calibrated score or probability where available, support IDs, contradiction IDs, predicted signatures, discriminating measurements, candidate interventions, structural dependencies, interaction links, provenance, and creation reason.
- Unknown state: explicit UNKNOWN / UNMODELED residual probability/score or active hypothesis so the system never assumes the ontology is complete.
- Structural snapshot: hierarchical components plus request-level dependency/waiting/temporal DAG, critical path, suspect subgraph, and deterministic structural constraints.
- Action state: candidate measurements/profilers/interventions with expected information value, cost, observer overhead, permissions/safety constraints, and execution status.
- Experiment ledger: hypothesis tested, intervention, context, predicted effect, measured end-to-end effect, replication/replay result, and verification status.
- Decision log: append-only state transitions, tool decisions, rejected proposals, and reasons.
- Model workspace: reasoning text and summaries stored outside the evidence ledger; disposable/recomputable and never authoritative.


Hypothesis lifecycle
ONTOLOGY-SEED or INCIDENT-PROVISIONAL → ACTIVE → SUPPORTED / WEAKENED through deterministic evidence links and calibrated updates → SUPPRESSED when currently low-value but still reopenable → FALSIFIED only when a sufficiently strong test or structural impossibility warrants it → VERIFIED only after controlled evidence/experiment supports the causal explanation. A hypothesis may be reopened if context, topology, or evidence changes. Multiple hypotheses may be VERIFIED when measured evidence indicates interacting causes; verification should estimate how much of the regression each cause or interaction explains when possible. Hard deletion is avoided during an active investigation.


Role of the LLM / frontier model
- One orchestrator, not a peer committee.
- Reads canonical typed state and may request deterministic tools.
- Proposes new incident-local hypotheses when the ontology is insufficient.
- Produces a challenger pass that searches for contradictions and alternative explanations.
- Produces candidate measurements/interventions and explains their expected discrimination value.
- Interprets unstructured or semi-structured profiler artifacts that deterministic parsers cannot fully normalize.
- Generates the human-readable investigation narrative from canonical state.
- Cannot directly write evidence, set VERIFIED status, invent tool outputs, silently delete hypotheses, or make its self-reported confidence the canonical probability.


Frontier-model diagnostic context — deterministic context compilation
The frontier model should not reason over a raw trace dump or the entire incident history. Reflex should deterministically compile the current investigation into the smallest high-fidelity context that preserves the mechanisms still capable of explaining the regression. The model therefore consumes an evidence-centered diagnostic case, not general telemetry.


The context compiler should combine the current incident state with the newer CPU↔GPU reconstruction and deep-GPU layers. Its input is the canonical evidence ledger, matched healthy comparator, request-scoped heterogeneous dependency DAG, critical/near-critical-path differential, suspect subgraph, hypothesis registry, current uncertainty/plausible-cause set, retrieved verified incidents and their difference cards, and the registry of measurements/interventions that are actually executable. Its output is a bounded model context in which every important claim points back to canonical evidence IDs or explicitly labeled uncertainty/missingness.


Context should be progressively localized. At system level, expose the matched healthy-vs-regressed stage deltas and the subsystem(s) that explain the excess latency. At CPU↔GPU level, expose only the relevant dependency neighborhood: host runnable/blocked intervals, queue/handoff edges, CUDA enqueue/launch gaps, transfers, stream/synchronization relationships, shared batch nodes, kernels, and the critical-path excess. If a kernel is implicated, attach the matched healthy-vs-regressed kernel differential and only the profiler evidence needed to separate the remaining hypotheses. When deeper escalation is justified, extend the same context with PC/stall/source/dataflow evidence, tensor/operator lineage, or instruction/dependency slices while preserving ancestry back to the request and high-level operation.


The core model-facing object should be hypothesis-indexed. For each live hypothesis, provide: mechanism statement and scope; current rank/calibrated probability when trusted; evidence IDs that support it; evidence IDs that contradict it; the relevant structural nodes/edges or source/tensor/PC region; expected signatures already observed; expected signatures still missing; evidence quality/correlation/mapping-confidence warnings; the best known discriminating measurements; candidate interventions; and falsification conditions. Suppressed alternatives and UNKNOWN/UNMODELED should remain visible when they are relevant to avoiding premature closure.


This representation lets the frontier model spend its capacity on abductive reasoning rather than mechanical reconstruction. The model should answer questions such as: which explanation best reconciles the currently observed evidence; what important alternative or interaction is being overlooked; whether a low-level profiler symptom is likely causal, consequential, or merely correlated; what additional evidence would most cleanly separate the leading explanations; and what controlled experiment would most efficiently falsify or verify the proposed mechanism. It should not redo timestamp alignment, graph traversal, matched-delta calculation, kernel matching, evidence provenance, or profiler-cost accounting when deterministic components can already provide those results.


The context compiler should preserve cross-level ancestry so low-level evidence remains engineering-actionable. A PC or stall sample should be presented, where mappings permit, as request → stage → framework/model operation → CUDA/runtime event → kernel → source/PC/dataflow region, and optionally → tensor transformation or producer/dependency chain. This prevents the model from seeing an isolated low-level number without knowing which request behavior and engineer-controlled operation it belongs to.


The context should also include uncertainty as data rather than hide it: missing graph edges, clock-alignment bounds, shared-node attribution uncertainty, source/debug mapping confidence, tensor-lineage ambiguity, profiler perturbation, stale calibration, and evidence dependence must be visible to the model. The frontier model may reason about these limitations, but it may not silently convert low-confidence associations into observed dependencies or verified causal claims.


This creates an explicit diagnostic-context funnel:
raw execution evidence → matched differential → request dependency structure → critical/suspect subgraph → live hypotheses → hypothesis-linked support/contradiction → targeted kernel/source/tensor/instruction evidence when justified → frontier-model reasoning → proposed next measurement or experiment → deterministic execution and state update.


A central evaluation should ablate this context construction itself: frontier model over raw traces versus generic summaries versus suspect-subgraph context versus hypothesis-linked evidence versus the full cross-layer diagnostic context. Measure true-cause recovery, unsupported/hallucinated evidence claims, correct next-measurement choice, token/model cost, measurements to verification, and time/cost to VERIFIED cause. This directly tests whether deterministic context compilation is the mechanism that makes frontier-model reasoning useful rather than merely adding a model on top of tracing.


Role of deterministic components
- Own schemas, state transitions, provenance, evidence IDs, and audit log.
- Normalize telemetry and profiler results.
- Run matched/differential statistical models and calibrated scoring where available.
- Apply structural constraints, critical-path/dependency checks, duplicate-hypothesis detection, and hypothesis admissibility rules.
- Maintain UNKNOWN mass/state and expansion/recompute triggers.
- Enumerate known measurement tools, costs, overhead, safety/permissions, and prerequisites.
- Execute measurements and experiments; only actual tool results create evidence records.
- Enforce verification gates and the OBSERVED / INFERRED / TESTED / VERIFIED distinction.


Structural reasoning mechanism
Use a hierarchical typed component graph plus request-centric dependency DAG, critical-path/waiting relationships, and lightweight deterministic rules. Use suspect-subgraph extraction to restrict expensive reasoning. Allow explicit composite/interaction hypotheses rather than enforcing a single-fault assumption. Do not compile the full runtime into d-DNNF initially.


Baselines / deferred approaches
- C23 role-separated multi-agent orchestration: BASELINE against the selected single-orchestrator design.
- C24 fixed ontology only: BASELINE.
- C24 full hypothesis-space recomputation after every measurement: BASELINE.
- C25 d-DNNF hierarchical diagnosis: DEFER until a bounded stable structural model and empirical need justify knowledge compilation.


Architecture Decision Records


ADR — Use one frontier-model orchestrator, not multiple specialized agents
- Choice: one orchestrator with explicit generate/challenge/cost/plan reasoning passes over a shared typed state.
- Alternatives: independent role-separated agents; deterministic-only planner.
- Reason: specialized roles are useful, but independent agents add coordination cost and consistency failure modes without adding primary evidence. A shared orchestrator preserves decomposition while keeping one coherent state view.
- Assumptions: most role benefit comes from cognitive decomposition, not persistent independent memory or authority.
- Trade-offs: less agent diversity and independent exploration; substantially lower synchronization, model, and audit complexity.
- Validation: hidden-fault head-to-head against the multi-agent baseline at equal model/tool budget.
- Revisit when: multi-agent repeatedly improves true-cause recovery or time-to-verification without greater state inconsistency or cost.


ADR — Canonical investigation state is deterministic; model reasoning is advisory/propositional
- Choice: deterministic state machine and tool layer own evidence, scores, transitions, execution, and verification; the model proposes and explains.
- Alternatives: LLM-authored free-form state; fully deterministic rule engine.
- Reason: autonomous investigation needs open-ended reasoning, but performance evidence and verification must remain reproducible and machine-checkable.
- Assumptions: enough telemetry/tool outputs can be normalized into typed records even when some interpretation remains model-assisted.
- Trade-offs: additional schema/tool integration work; prevents fluent but unsupported conclusions from becoming system state.
- Validation: replay an incident from the audit log and reproduce the same evidence/state transitions without relying on saved chain-of-thought.
- Revisit when: a specific reasoning class cannot be represented without losing material diagnostic information, or deterministic boundaries block useful tool autonomy.


ADR — Use an ontology-seeded but dynamically extensible hypothesis space
- Choice: stable ontology seed + incremental updates + UNKNOWN + provisional new hypotheses + trigger-based recomputation.
- Alternatives: fixed closed-world ontology; full regeneration after each measurement.
- Reason: fixed spaces miss unseen causes, while constant recomputation creates churn and early inconsistency. The hybrid preserves continuity and open-world recovery.
- Assumptions: common causes are reusable enough for an ontology, and model mismatch can be detected from residual/novelty/contradiction signals.
- Trade-offs: requires lifecycle rules, duplicate detection, unknown calibration, and expansion thresholds.
- Validation: known, held-out, and compound fault benchmarks measuring recovery, churn, calibration, and measurements to verification.
- Revisit when: unseen-cause frequency is negligible, or dynamic recomputation proves consistently superior at acceptable cost.


ADR — Never silently prune an unverified hypothesis; support compound causes
- Choice: hypotheses move to SUPPRESSED/FALSIFIED with explicit evidence and can be reopened; multiple verified causes/interactions are allowed.
- Alternatives: keep only top-k hypotheses; single-fault assumption; destructive deletion.
- Reason: early evidence is correlated/noisy, and latency regressions can have interacting causes. Destructive pruning creates irrecoverable false negatives.
- Assumptions: storing a wider dormant set is cheap relative to profiler/engineering cost.
- Trade-offs: larger state and more complex measurement-selection calculations.
- Validation: inject weak-signal and compound faults where the true cause initially ranks low; measure recovery after misleading early evidence.
- Revisit when: state size materially harms selection/runtime and a calibrated pruning rule demonstrates equal recovery.


ADR — Use graph/hierarchy structural reasoning now; defer d-DNNF
- Choice: hierarchical component graph + request dependency DAG + critical path + typed constraints; d-DNNF only for future bounded subdomains.
- Alternatives: d-DNNF knowledge compilation for the full diagnosis model; no structural model.
- Reason: current structural evidence is valuable, but the runtime is dynamic and incompletely modeled. Simple graphs preserve structure without requiring a brittle closed Boolean theory.
- Assumptions: most useful structural pruning is reachable with dependency, containment, waiting, temporal, and impossibility constraints.
- Trade-offs: loses exact compiled logical inference and potentially efficient model counting; avoids compile/update cost and false completeness.
- Validation: graph-vs-d-DNNF comparison on a realistic bounded prototype with missing-model and multi-cause tests.
- Revisit when: structural query cost becomes a bottleneck and a stable complete-enough model exists.


ADR — Separate evidence records from reasoning text by type and authority
- Choice: immutable typed evidence ledger; model reasoning is non-evidence metadata; conclusions must reference evidence IDs.
- Alternatives: free-form investigation transcript as state; manually reviewed narrative evidence.
- Reason: Reflex must be able to distinguish what was measured from what was inferred and what was causally verified.
- Assumptions: every authoritative measurement/test can be assigned provenance and an artifact/result reference.
- Trade-offs: more engineering for normalization and provenance; dramatically better auditability, replay, and safety against hallucinated evidence.
- Validation: automatically reject or flag any INFERRED/VERIFIED claim lacking valid evidence/test references; replay reports from canonical state.
- Revisit when: a tool produces evidence that cannot be faithfully represented in the current typed schema.


Open uncertainties / Pass 5 questions
- What canonical belief representation should combine heterogeneous statistical scores, structural constraints, profiler evidence, and experiments without using LLM self-confidence as probability?
- What thresholds should trigger hypothesis expansion, broad recomputation, suppression, reopening, and UNKNOWN-mass escalation while minimizing hypothesis churn?
- How should Reflex represent and calibrate interacting multi-cause incidents: explicit composite hypotheses, factorized contributions, causal graphs, or another form?
- How much evidence is required before an incident-local provisional cause becomes a reusable ontology cause, and how should version/hardware scope be attached to that promotion?
- How should structural-model uncertainty be represented so missing or stale dependency information weakens a constraint rather than incorrectly making a cause impossible?
- What is the minimum deterministic parsing/normalization needed for deep profiler artifacts before model interpretation becomes reliable and auditable?
- How much incremental diagnostic value does the frontier model add over a deterministic state-machine + statistical/graph baseline, and which reasoning steps justify its cost?
- How should measurement-selection information gain account for UNKNOWN/unseen hypotheses whose likelihood models are initially weak or absent?


PASS 3 DECISION LOG — Incident Memory & Reuse


Current Reflex approach
Reflex already has the right memory boundary but not yet a sufficiently safe retrieval policy. The current Learning / Control engine stores structured solved cases with context, healthy comparator, symptoms, execution family, version/hardware/workload, hypotheses, evidence, measurement choices and cost, profiling output, interventions and measured effects, replay/divergence results, verified cause, fix, and final performance change. It explicitly says future incidents may retrieve similar verified cases only if important differences are explained before reusing the old diagnosis.


The surrounding architecture also provides the structures this pass should reuse rather than duplicate: matched healthy baselines; system/dependency and cross-layer execution structure; explicit hypotheses with support, contradiction, and uncertainty; an OBSERVED / INFERRED / TESTED / VERIFIED evidence hierarchy; controlled validation; replay and first-divergence evidence; and learning feedback into diagnosis, retention, measurement selection, and intervention choice. Therefore incident memory should act as an auditable prior and experience-reuse layer, not as a shortcut that converts similarity into causality.


Pass 2 provenance labels (GEM / KEEP / DROP / U) are treated only as research-source provenance here, not as Reflex selection evidence.


Candidate decision matrix


Candidate
	Relation
	Scores DV/IE/RF/PF/RB/AU
	Disposition
	Why
	Key assumption/trade-off
	Evidence that could change the decision
	C26 — Classical structured CBR
	duplicate
	4/4/5/5/3/5
	BASELINE
	Simple, auditable, strong with a small memory; useful baseline, but insufficient as the production matcher.
	Hand-designed similarity features must remain meaningful across hardware/version/workload shifts; flat similarity can catastrophically transfer.
	Promote only if topology-aware/hybrid retrieval does not materially reduce harmful transfer on cross-context tests.
	C27 — Topology/model-aware CBR
	augment
	5/4/4/4/5/5
	ADOPT
	Best production retrieval core: reuse prior cases while explicitly accounting for structural/context differences.
	Topology/model metadata and a meaningful cross-version alignment must be available.
	Reconsider if topology/model alignment is usually unavailable, too expensive, or adds no robustness over structured retrieval.
	C28 — Learned sequential diagnostic policy from incidents
	augment
	5/5/4/2/2/2
	DEFER
	Could optimize whole diagnostic sequences directly, but current verified history is far too sparse for safe policy learning.
	Requires broad logged action coverage, stable rewards, and enough repeated states to avoid extrapolating outside support.
	Revisit once offline policy evaluation on broad verified trajectories beats rule/retrieval + information-value baselines.
	C29 — Meta-learning / few-shot incident adaptation
	augment
	4/4/3/1/2/2
	DEFER
	Attractive for fast adaptation, but Reflex does not yet have a credible meta-training distribution.
	Needs repeated related tasks with a stable task definition; heterogeneous faults may not share a useful adaptation prior.
	Revisit when multiple hardware/version/workload domains per fault family show repeated few-shot adaptation structure.
	C30 — Verification-weighted incident RAG / episodic retrieval
	augment
	4/5/4/5/3/4
	COMBINE
	High-recall access to full episodes and notes; verification weighting reduces contamination, but RAG should not be the causal matcher.
	Embedding similarity must survive terminology/version drift; semantic resemblance alone cannot justify cause transfer.
	Adopt more strongly if hybrid RAG improves recall without increasing harmful transfer on causal-look-alike tests.
	C31 — Event/fault-graph similarity retrieval
	augment
	5/4/3/3/4/4
	COMBINE
	Structural matching protects against same-symptom/different-path errors; strongest as a topology reranker, not the sole index.
	Comparable event/dependency graphs must exist and be aligned cheaply enough across versions.
	Make primary only if graph similarity dominates feature/embedding retrieval on topology shifts at acceptable runtime cost.
	C32 — Rule-first → retrieval → learned-reasoning cascade
	augment
	5/5/5/5/4/5
	ADOPT
	Best cold-start control: exact rules first, memory second, general reasoning for novelty.
	Rules must be high-precision and must not short-circuit ambiguous incidents merely because a signature is similar.
	Demote if narrow rules create stale false positives or maintenance cost outweighs the cold-start benefit.
	C33 — Historical intervention-effect priors
	augment
	4/4/4/4/3/4
	COMBINE
	Useful for prioritizing tests/interventions under strong context overlap, but historical success is never causal proof for the new case.
	Intervention outcomes must be comparable and controlled enough; overlap failures require shrinkage/abstention.
	Strengthen if held-out ranking calibration is good; weaken if negative transfer under context shift is high.
	



Candidate assessments
Score order below is Diagnostic value / Information efficiency / Runtime fit / Prototype feasibility / Robustness / Auditability.


C26 — Classical structured Case-Based Reasoning (CBR)
Source provenance: Pass 2 R3-M1; source label KEEP (provenance only).
Relation to current Reflex: duplicate. Scores: 4/4/5/5/3/5. Disposition: BASELINE.
Assumptions: a small but correctly diagnosed case base exists; normalized structured context and symptom fields remain meaningful across versions, hardware, and workloads; suspected or retracted diagnoses are not treated as ground truth.
Strongest benefit: transparent nearest-case reuse works from a very small memory and gives an interpretable cold-start baseline.
Strongest failure mode/cost: a superficially similar incident can have a different causal path; flat feature similarity can therefore create catastrophic negative transfer as the runtime evolves.
Decision rationale: retain classical CBR as the simplest comparison and as one input to the hybrid retriever, but not as the production retrieval policy.
Validation experiment: leave-one-incident-out retrieval plus explicit shift challenges containing same-symptom/different-cause and same-cause/different-context pairs. Measure top-k verified-cause recall, harmful-transfer rate, and measurements/time to verified cause with and without memory.
Revisit trigger: promote only if topology-aware, semantic, and graph-aware layers fail to materially reduce harmful transfer or improve investigation cost.


C27 — Topology/model-aware CBR
Source provenance: Pass 2 R3-M2; source label GEM (provenance only).
Relation to current Reflex: augment. Scores: 5/4/4/4/5/5. Disposition: ADOPT.
Assumptions: system topology/model metadata is available for most incidents; nodes and relations can be normalized across runtime versions; missing topology can be represented explicitly rather than guessed.
Strongest benefit: it reuses experience while forcing the system to account for the structural path that produced the symptom, directly addressing the similar-looking-but-causally-different failure mode.
Strongest failure mode/cost: topology may be incomplete or difficult to align across releases, and graph/model normalization adds ingestion and retrieval complexity.
Decision rationale: make this the production CBR core. It fits Reflex because dependency and cross-layer structure already exist elsewhere in the architecture and can be reused rather than invented solely for memory.
Validation experiment: compare C26 and C27 on controlled topology perturbations, hardware changes, and version shifts, with causal look-alikes deliberately included. Measure retrieval recall, calibration, harmful transfer, and investigation cost.
Revisit trigger: demote if topology/model alignment is unavailable for a large fraction of incidents, too expensive at retrieval time, or provides no robustness benefit over structured retrieval.


C28 — Learned sequential diagnostic policy from incidents
Source provenance: Pass 2 R3-M3; source label GEM (provenance only).
Relation to current Reflex: augment. Scores: 5/5/4/2/2/2. Disposition: DEFER.
Assumptions: Reflex eventually has many verified or ground-truth investigation trajectories, repeated comparable decision states, broad support over measurement/actions actually attempted, a stable action/cost/reward definition, and credible offline policy evaluation or a safe simulator/replay environment.
Strongest benefit: a learned policy could optimize the whole sequence of measurements rather than greedily ranking the next step.
Strongest failure mode/cost: limited incident data makes the learned policy inherit historical investigator bias, extrapolate outside action support, and fail under version/hardware/fault shifts while being harder to audit than the information-value engine.
Decision rationale: the mechanism is strategically relevant but premature. Retrieval can improve a new investigation immediately without pretending the historical action log is a sufficiently explored MDP.
Validation experiment: after a data-readiness gate is met, train imitation/offline-RL policies on frozen verified or fault-injected trajectories and compare against rule + retrieval + information-value selection on held-out fault families and domain shifts. Evaluate time/cost to verified cause, action regret, harmful-action rate, calibration, and off-support behavior.
Revisit trigger: stable state/action/reward definitions; broad action coverage; diverse verified trajectories across multiple fault families, versions, hardware, and workloads; reliable off-policy evaluation; and a policy that beats the selected non-parametric baseline on held-out shifts. A planning heuristic is several hundred to low-thousands of verified/ground-truth trajectories with repeated decision points, but this is not an evidence-backed universal threshold and must be resolved in Pass 5.


C29 — Meta-learning / few-shot incident adaptation
Source provenance: Pass 2 R3-M4; source labels GEM + KEEP (provenance only).
Relation to current Reflex: augment. Scores: 4/4/3/1/2/2. Disposition: DEFER.
Assumptions: there is a genuine distribution of related diagnostic tasks, with multiple independent hardware/version/workload contexts per recurring fault family and a stable adaptation target.
Strongest benefit: rapid adaptation to a new environment could be valuable when only a few verified incidents exist in that environment.
Strongest failure mode/cost: heterogeneous faults may not share a useful meta-prior; random episode splits can make meta-learning look effective even when it fails on genuinely new domains.
Decision rationale: do not build a meta-learner until Reflex can define repeated task families and evaluate leave-one-domain-out adaptation. Hybrid retrieval is a safer few-shot mechanism now.
Validation experiment: meta-train across fault-injected or verified task families and hold out complete hardware/version/workload domains. Compare against topology-aware retrieval, ordinary fine-tuning, and no-adaptation baselines for few-shot cause recovery and investigation cost.
Revisit trigger: multiple independent domains per fault family, stable few-shot gains on held-out domains, and evidence that retrieval or ordinary adaptation has plateaued. The required task/sample diversity is a Pass 5 evidence question.


C30 — Verification-weighted incident RAG / episodic retrieval
Source provenance: Pass 2 R3-M5 and R3-M6; source labels KEEP ×2 (provenance only).
Relation to current Reflex: augment. Scores: 4/5/4/5/3/4. Disposition: COMBINE.
Assumptions: incident narratives and evidence summaries are semantically indexable; embeddings are versioned and drift can be monitored; verification metadata is trustworthy; semantic retrieval is treated as candidate generation rather than causal proof.
Strongest benefit: semantic retrieval recovers useful prior episodes, investigation sequences, and evidence descriptions that a fixed structured feature set may miss.
Strongest failure mode/cost: embeddings readily retrieve causal look-alikes, and an incorrectly diagnosed incident can contaminate future reasoning if verification status is ignored.
Decision rationale: use semantic RAG for high-recall candidate generation and full-episode context, then subject candidates to structured/topology reranking and verification gating. Do not let RAG directly transfer a cause or fix.
Validation experiment: benchmark weighted versus unweighted RAG under terminology drift, version changes, causal-look-alike incidents, and deliberate memory contamination. Measure recall, ranking quality, harmful transfer, and downstream measurements to verification.
Revisit trigger: strengthen if semantic retrieval improves recall without increasing harmful transfer after verification/topology reranking; weaken if embedding drift or causal look-alikes remain dominant errors.


C31 — Event/fault-graph similarity retrieval
Source provenance: Pass 2 R3-M7; source label KEEP (provenance only).
Relation to current Reflex: augment. Scores: 5/4/3/3/4/4. Disposition: COMBINE.
Assumptions: comparable event/dependency graphs or suspicious subgraphs can be produced from existing execution evidence; graph edges preserve provenance, distinguishing observed temporal/wait/dependency relations from inferred causal claims; cross-version alignment is computationally tractable.
Strongest benefit: structural similarity can distinguish incidents that share symptoms but differ in the execution/dependency path that generated them.
Strongest failure mode/cost: graph construction/alignment can be expensive and sparse, and treating inferred graph edges as facts would create false causal confidence.
Decision rationale: use graph or suspect-subgraph similarity as a topology-sensitive reranker when structure is available, not as the sole retrieval index and not as an unqualified causal graph.
Validation experiment: compare feature-only, embedding-only, graph-only, and hybrid retrieval on topology mutations, node renaming/version drift, missing edges, and same-symptom/different-path cases. Measure robustness and runtime cost.
Revisit trigger: make graph retrieval primary only if it materially outperforms structured/embedding candidate generation on topology shifts at acceptable latency and coverage.


C32 — Rule-first → retrieval → learned-reasoning cascade
Source provenance: Pass 2 R3-M8 and R3-M10; source labels U ×2 (provenance only).
Relation to current Reflex: augment. Scores: 5/5/5/5/4/5. Disposition: ADOPT.
Assumptions: Reflex can maintain a small set of high-precision deterministic signatures, invariants, and impossibility constraints; rules are version-scoped and fall through when ambiguous rather than forcing a diagnosis.
Strongest benefit: excellent cold-start behavior and auditability: known exact failures can be handled cheaply even with no incident history, while novel incidents still reach retrieval and full investigation.
Strongest failure mode/cost: stale or overly broad rules can create premature closure and prevent investigation of a new causal mechanism that merely resembles a known signature.
Decision rationale: run narrow deterministic rules before memory retrieval, then hybrid retrieval, then general learned/agentic reasoning. Rules may narrow hypotheses or recognize an exact known issue, but must not turn a current case into VERIFIED without appropriate current evidence.
Validation experiment: seed exact known signatures, near-miss look-alikes, and novel faults. Measure false short-circuit rate, rule maintenance burden, time to verified cause, and fall-through behavior.
Revisit trigger: demote the rule layer if stale false positives, version churn, or maintenance cost erase the cold-start and runtime benefit.


C33 — Historical intervention-effect priors
Source provenance: Pass 2 R3-M9; source label U (provenance only).
Relation to current Reflex: augment. Scores: 4/4/4/4/3/4. Disposition: COMBINE.
Assumptions: intervention records include target, magnitude, context, predicted benefit at decision time, measured end-to-end effect, repeats/uncertainty, and verification quality; enough contextual overlap exists to compare outcomes; negative and neutral interventions are retained rather than only successes.
Strongest benefit: prior measured effects can improve which controlled experiment or measurement Reflex tries first and can improve expected-cost/benefit estimates.
Strongest failure mode/cost: intervention effects are not automatically transportable across workload, hardware, topology, and version; historical success can be confounded and easily overstated as a causal guarantee for the current incident.
Decision rationale: use historical effects only as context-conditioned, verification-weighted, uncertainty-aware priors. Shrink toward neutral as context overlap falls, and require a new controlled test before claiming causality or recommending a fix as verified.
Validation experiment: hide intervention outcomes in held-out contexts, rank candidate interventions from history, and compare predicted versus measured effect, calibration, regret, overlap violations, and negative transfer. Include controlled versus merely observational prior cases.
Revisit trigger: strengthen only when held-out intervention ranking/effect calibration is stable across context shifts; restrict further if negative transfer remains high. Heterogeneous-treatment-effect models should remain an offline benchmark until this evidence exists.


Paper-backed mechanism explanations


C26 — Classical structured CBR — BASELINE
Source paper: Case-Based Reasoning: Foundational Issues, Methodological Variations, and System Approaches (Aamodt & Plaza, 1994).
What it is: Classical case-based reasoning stores solved incidents as explicit cases, retrieves the nearest prior cases by hand-designed similarity, adapts the old solution to the new problem, validates it, and retains the new solved case.
Why BASELINE: This is the clearest small-data and auditability baseline, and it matches Reflex’s existing structured-incident idea. It is not the production matcher because flat symptom/context similarity is brittle across model versions, hardware, workload, and topology; a superficially similar incident can have a different causal path.


C27 — Topology/model-aware CBR — ADOPT
Source paper: A concept for fault diagnosis combining Case-Based Reasoning with topological system models (2020).
What it is: It augments case retrieval with a model of the system topology so a retrieved case is adapted through component/dependency correspondence rather than assuming the old environment is identical.
Why ADOPT: This directly addresses Reflex’s largest memory risk: same symptom, different structure/cause. It fits the existing request/dependency graph and makes cross-version/hardware reuse safer while remaining interpretable. The cost is maintaining topology metadata and alignment logic.


C28 — Learned sequential diagnostic policy from incidents — DEFER
Source paper: Integrating Learning from Examples into the Search for Diagnostic Policies (Bayer-Zubek & Dietterich, JAIR).
What it is: A diagnostic investigation is represented as a sequential decision process: the state is evidence collected so far, actions are tests/measurements, and the policy chooses what to measure next and when to stop while trading measurement cost against diagnostic error.
Why DEFER: The mechanism is attractive because it can optimize an entire investigation sequence, but Reflex does not yet have enough verified trajectories, broad action coverage, or repeated comparable states for safe policy learning. It should be revisited only after offline policy evaluation can beat rule/retrieval plus information-value baselines without extrapolating outside logged support.


C29 — Meta-learning / few-shot incident adaptation — DEFER
Source paper: Model-Agnostic Meta-Learning for Fast Adaptation of Deep Networks (Finn, Abbeel & Levine, 2017).
What it is: Meta-learning trains across many related tasks so a model can adapt to a new task with only a few new examples; for Reflex, tasks would correspond to related fault families across hardware, runtime, model, or workload contexts.
Why DEFER: Reflex does not yet have a credible meta-training distribution with repeated related tasks. Heterogeneous latency faults may not share a stable adaptation prior, so few-shot adaptation could encode the wrong common structure. Revisit when multiple domains per fault family show repeatable transfer behavior.


C30 — Verification-weighted incident RAG / episodic retrieval — COMBINE
Source paper: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020).
What it is: RAG retrieves semantically similar external records and supplies them to a reasoning model. In Reflex, the records are incident episodes; verification-weighting is an added Reflex safeguard that ranks VERIFIED cases above merely INFERRED or suspected cases.
Why COMBINE: Semantic retrieval is excellent for recall, terminology drift, notes, profiler outputs, and full investigation narratives, but embedding similarity is not causal similarity. Use it as a complementary index and context provider behind structured/context filters and topology-aware reranking, never as the sole cause-transfer mechanism.


C31 — Event/fault-graph similarity retrieval — COMBINE
Source paper: Graph Matching Networks for Learning the Similarity of Graph Structured Objects (Li et al., 2019).
What it is: Incidents are represented as event/dependency graphs and compared using structural graph similarity or learned graph representations, allowing retrieval to care about how components and events relate rather than only about feature values or text.
Why COMBINE: Graph matching is valuable for rejecting same-symptom/different-path look-alikes and is especially compatible with Reflex’s cross-layer dependency representation. It should be a reranker/secondary index rather than the only index because graph construction and cross-version alignment can be expensive or incomplete.


C32 — Rule-first → retrieval → learned-reasoning cascade — ADOPT
Source paper: A Hybrid Approach Using Case-Based Reasoning and Rule-Based Reasoning to Support Cancer Diagnosis: A Pilot Study (Saraiva et al., 2015).
What it is: Hybrid rule-based and case-based reasoning uses deterministic expert rules for high-precision known patterns and case retrieval for situations that require analogical reuse. Reflex extends this into a cascade: exact/high-precision rules first, then incident retrieval, then general learned/agentic reasoning for unresolved or novel cases.
Why ADOPT: This gives the best cold-start and auditability behavior. Known deterministic signatures do not need an ML policy, memory is used when relevant, and novel cases still reach general reasoning. The rule layer must be narrow and high precision; a loose rule match must not terminate the investigation or declare a cause verified.


C33 — Historical intervention-effect priors — COMBINE
Source paper: Estimation and Inference of Heterogeneous Treatment Effects using Random Forests (Wager & Athey, 2018).
What it is: Store context, intervention/test, and measured end-to-end effect, then estimate how intervention benefit varies with context. Causal forests are one candidate heterogeneous-treatment-effect model once there is enough controlled intervention data.
Why COMBINE: Historical effects can prioritize which controlled experiment or intervention is worth trying, but they must remain context-conditioned priors rather than causal claims about the new incident. Use overlap checks, uncertainty, shrinkage toward neutral priors, and abstention when the new context is out of support; current-incident controlled evidence is still required for VERIFIED status.


Head-to-head decisions
Classical CBR vs topology-aware CBR: C27 wins for the production path because the dominant risk is not failure to find a similar symptom; it is transferring the wrong explanation across a changed causal/execution structure. C26 remains the transparent baseline and fallback when topology is missing.


CBR vs RAG: this is not an either/or choice. Structured/topology-aware CBR provides the auditable compatibility test and causal-safety backbone. Semantic RAG provides high-recall access to full episodes and language that the schema may not capture. The production system should take the union of structured and semantic candidates, then rerank/gate them; semantic similarity alone cannot authorize cause or fix transfer.


Graph retrieval vs embedding/feature retrieval: use a hybrid. Structured features plus semantic embeddings give cheap candidate generation. When topology is available, graph or suspect-subgraph similarity reranks candidates and applies mismatch penalties. If graph evidence is missing, Reflex should say so and lower transfer confidence rather than fabricate alignment.


Retrieval-based reuse vs learned diagnostic policies: retrieval wins now. It works with a small memory, preserves individual incident provenance, and can abstain when no comparable case exists. Learned sequential policies are deferred until the action log has sufficient coverage and held-out/off-policy evaluation shows a real advantage over the existing information-value engine plus retrieval priors.


Cold-start mechanisms vs data-hungry learned mechanisms: high-precision rules, explicit system knowledge, and structured retrieval are the cold-start stack. Learned policy/meta-learning mechanisms enter only offline after enough verified data exists. They must earn deployment by beating the cold-start stack on held-out hardware/version/workload/fault shifts rather than by fitting historical incidents.


Selected architecture
Incident schema: the canonical memory object is a versioned structured incident record, not an embedding and not a free-form postmortem. It stores: case identity/schema version and status; environment/context (model, runtime/compiler/driver, hardware, deployment, topology, workload/input, batch/concurrency/load); matched healthy comparator and comparator rationale; symptom/regression and localized stages; execution family; normalized stage/event/dependency representation and suspicious subgraph with edge provenance; the investigation trajectory (hypothesis states, support/contradiction, uncertainty, measurements chosen, cost/overhead, results and profiler evidence); the verification ledger (OBSERVED / INFERRED / TESTED / VERIFIED, experiment design, replay/divergence/reproducibility, fraction of regression explained); intervention episodes (action, target, magnitude, preconditions, predicted benefit, measured end-to-end effect, repeats/uncertainty, neutral/adverse results); verified cause(s), fix, final performance change, acceptance criteria; and references to retained artifacts. Retractions/supersession must be explicit.


Derived retrieval indexes are rebuildable views of that canonical record: a normalized structured feature representation, topology/event-graph signatures, and one or more versioned semantic embeddings. Index/version changes must not mutate historical incident truth.


Retrieval representation: use a three-stage hybrid. Stage A takes the union of candidates from structured CBR and semantic episodic retrieval. Stage B reranks using topology/model compatibility, event/suspect-subgraph similarity when available, and explicit penalties for version/hardware/workload/topology mismatches. Stage C applies verification-quality gating and diversity/counterexample selection so the investigator can see not only similar cases with the same cause but also close cases that ended in a different cause.


Ranking and verification weighting: verification is an eligibility rule before it is a ranking bonus. VERIFIED cases backed by controlled testing may contribute diagnosis, measurement, and intervention priors. TESTED-but-not-verified cases may contribute information about measurement usefulness or negative results but must not transfer a verified cause. INFERRED/suspected cases may be retrieved as hypothesis ideas, cautions, or counterexamples, with zero direct cause/fix prior. Retracted or known-incorrect cases are excluded. Within the eligible tier, use an auditable score composed of structured context compatibility, symptom/execution-family similarity, topology/graph similarity, semantic evidence similarity, verification quality, and explicit mismatch penalties. Tune weights on held-out incident/fault-injection data rather than hard-coding them from source-paper labels.


Rule layer: yes. Run a small, version-scoped, high-precision rule/invariant layer before retrieval. It is for deterministic signatures, impossible dependency directions, known configuration mistakes, and exact regression fingerprints—not for broad heuristic diagnosis. An ambiguous rule match must fall through to retrieval and the normal investigator.


How retrieved cases influence diagnosis: retrieved cases may (1) seed or adjust priors over explicit hypotheses, (2) suggest discriminating measurements and estimate their likely information/cost, (3) suggest controlled interventions worth testing, and (4) surface previously useful evidence that might otherwise be omitted. They may never overwrite current observations, suppress a live contradictory hypothesis merely because a prior case was similar, or mark a cause VERIFIED. If the current case has material incompatibilities with the retrieved case, the transfer weight should shrink or Reflex should abstain from reuse.


Difference explanation: every retrieved case shown to the investigator/report should include a retrieval-difference card: why it was retrieved; matching context/symptom/structural fields; different or unknown version/hardware/workload/topology fields; verification status and experiment quality; whether intervention outcomes are comparable; the main reason transfer could fail; and the current evidence that would need to match before reusing the old diagnosis or action. This is the operational answer to “similar prior incidents and important differences.”


Historical intervention use: treat prior intervention outcomes as weak, context-conditioned priors for experiment ranking, not causal proof for the new incident. Weight controlled VERIFIED effects more than observational or merely TESTED effects; require contextual overlap; preserve negative/neutral outcomes; shrink estimated benefit toward neutral as similarity/support falls; report support count, effect spread/uncertainty, and mismatch warnings. The current incident still needs its own controlled validation before Reflex claims a causal fix. As data grows, benchmark heterogeneous-treatment-effect models offline, consistent with the existing architecture, but do not let them bypass verification.


Online versus offline learning: online, append the new incident/version to the canonical store, update rebuildable retrieval indexes, update lightweight non-parametric statistics such as observed measurement cost/usefulness, and record rule exceptions. Do not perform online gradient updates to a diagnostic policy from a single incident. Offline, audit contamination/retractions, tune similarity/reranking/verification weights, rebuild embeddings, evaluate policy/HTE candidates on frozen verified data, and deploy only models that pass held-out shift tests.


Baselines: no-memory investigator; rule-only; C26 classical CBR; unweighted semantic RAG; structured-feature-only retrieval; graph-only retrieval; the selected topology-aware hybrid; hybrid with and without verification gating; historical intervention prior versus no intervention prior. C28 learned sequential policy becomes a later benchmark only after the data-readiness gate; C29 meta-learning becomes a later benchmark only after a task-distribution gate.


Deferred learned mechanisms: C28 and C29 are explicitly deferred. The existing causal-forest/heterogeneous-treatment-effect idea for intervention choice remains an offline future benchmark until verified intervention data provides adequate overlap and held-out calibration.


When is there enough history to train a diagnostic policy? Do not use a single incident-count threshold. Require: stable state/action/reward definitions; broad support over candidate actions in comparable states; verified or known-ground-truth trajectories across multiple fault families and domain shifts; enough repeated decision points for held-out fault-family and hardware/version/workload tests; credible off-policy evaluation or replay/simulation; and a plateauing strong rule/retrieval/information-value baseline. For planning, several hundred to low-thousands of verified/ground-truth trajectories is a reasonable experiment-start heuristic, not a scientific threshold. Pass 5 should find stronger evidence for sample complexity and offline-RL support requirements.


When does meta-learning become worthwhile? Only when Reflex can define genuine related task families and demonstrate leave-one-domain-out few-shot adaptation. It should not be justified by random train/test splits over incidents from the same environments. A useful trigger is multiple independent hardware/version/workload contexts per recurring fault family plus evidence that topology-aware retrieval and ordinary adaptation cannot achieve the needed few-shot behavior. Exact task/sample requirements are a Pass 5 question.


Architecture Decision Records


ADR — Canonical memory is structured; embeddings and graphs are derived indexes
Choice: store a versioned structured incident record containing context, comparator, evidence/hypothesis trajectory, verification ledger, structural representation, interventions/effects, cause/fix/outcome, and artifact references. Build structured features, graph signatures, and semantic embeddings as rebuildable indexes.
Alternatives: narrative-only RAG; graph-only case store; anonymous tabular rows.
Reason: the canonical truth must remain inspectable and versionable while retrieval representations evolve. A structured record also enables explicit difference explanations and contamination repair.
Assumptions: the runtime can populate core context, verification, and structure fields with acceptable completeness.
Trade-offs: more ingestion/schema maintenance than storing a postmortem plus embedding.
Validation: replay the same fixed incident set through multiple index versions and verify that retrieval can change without changing canonical incident truth; measure schema completeness and retrieval quality.
Revisit when: schema maintenance dominates value or important discriminators consistently live outside the structured record and cannot be represented as versioned extensions.


ADR — Use topology-aware hybrid retrieval
Choice: C27 is the retrieval core, C30 and C31 are combined as semantic candidate generation and structural reranking, and C26 remains the baseline/fallback.
Alternatives: classical CBR only; semantic RAG only; graph-only retrieval.
Reason: no single representation solves both small-memory auditability and cross-context causal-look-alike risk. The hybrid uses cheap/high-recall retrieval first and structural compatibility before reuse.
Assumptions: enough topology/context metadata exists to rerank a useful fraction of incidents.
Trade-offs: more indexing and normalization complexity and somewhat higher retrieval latency than plain nearest-neighbor RAG/CBR.
Validation: ablate each retrieval channel on same-cause/different-context and same-symptom/different-cause benchmarks, including missing-topology cases.
Revisit when: one representation consistently matches or beats the hybrid on recall, harmful transfer, runtime, and auditability.


ADR — Verification gates what history is allowed to transfer
Choice: VERIFIED, TESTED, INFERRED/suspected, and retracted cases have different reuse permissions, not merely different similarity weights.
Alternatives: uniform retrieval; a single continuous verification bonus added after similarity ranking.
Reason: an incorrectly diagnosed incident is a high-leverage contamination source. Eligibility prevents a plausible but unverified prior from silently becoming evidence for a future cause/fix.
Assumptions: verification status and experiment provenance are reliably recorded.
Trade-offs: fewer reusable cases in a small memory and potentially lower recall early in the project.
Validation: deliberately contaminate the memory with plausible wrong diagnoses and measure downstream cause transfer with and without eligibility gating.
Revisit when: a calibrated continuous-quality model demonstrably achieves equal or lower harmful transfer without hard tiers.


ADR — Run narrow rules before retrieval
Choice: adopt C32 as high-precision deterministic rules/invariants → hybrid retrieval → full investigator/learned reasoning.
Alternatives: retrieval first; broad rule engine; learned reasoning for every incident.
Reason: exact known signatures are cheap, auditable, and valuable at cold start, while fall-through preserves novelty handling.
Assumptions: rules can be version-scoped and kept narrow.
Trade-offs: rule maintenance and risk of stale premature closure.
Validation: known signatures, near-miss look-alikes, and novel faults; measure false short-circuit and time/cost to verification.
Revisit when: stale-rule errors or maintenance cost exceed the saved investigation work.


ADR — Incident history changes priors, not verification state
Choice: retrieved history may influence hypothesis, measurement, and intervention priors, but only current-incident evidence can establish TESTED/VERIFIED status.
Alternatives: automatically reuse the prior cause/fix when similarity exceeds a threshold; let retrieved text serve as evidence.
Reason: similarity is not causality, and Reflex already has a controlled-verification architecture designed to separate inference from proof.
Assumptions: the investigator keeps historical provenance separate from live evidence.
Trade-offs: recurring incidents may require a small amount of repeated confirmation rather than instant auto-resolution.
Validation: causal-look-alike incidents where the top retrieved case has a different hidden cause; measure false auto-resolution and verification cost.
Revisit when: a narrowly scoped exact recurring signature has independently earned a deterministic rule with explicit validation requirements.


ADR — Historical intervention effects are shrunk, context-conditioned priors
Choice: use C33 to rank controlled experiments only when contexts overlap; weight by verification quality; shrink toward neutral under mismatch/low support; never claim transported causal effect without a new test.
Alternatives: ignore intervention history; directly choose the historical best intervention; deploy an HTE learner immediately.
Reason: intervention history is valuable but transportability is the central risk.
Assumptions: intervention context and measured end-to-end effects are stored consistently, including failures and null effects.
Trade-offs: conservative priors underuse sparse positive history but avoid strong causal overclaim.
Validation: held-out intervention-effect prediction/ranking across context shifts, including overlap diagnostics and negative-transfer measurement.
Revisit when: enough verified intervention data supports calibrated HTE models across held-out domains, or historical priors fail to outperform no-prior selection.


ADR — Defer learned sequential and meta-learned policies
Choice: C28 and C29 remain offline research mechanisms until explicit data-readiness gates are met; no online policy-gradient learning from incident memory in the prototype.
Alternatives: learn an RL/MDP diagnostic policy now; meta-learn across the initial synthetic/incident set.
Reason: current architecture has a strong auditable information-value baseline, while sparse, policy-biased history makes learned control fragile and hard to evaluate.
Assumptions: verified incident volume and domain diversity will grow over time.
Trade-offs: Reflex may leave some long-horizon sequencing efficiency on the table in the early prototype.
Validation: offline policy evaluation plus held-out domain/fault tests against rule + retrieval + information-value selection; meta-learning uses leave-one-domain-out evaluation.
Revisit when: the data-readiness and held-out-performance gates above are satisfied.


ADR — Retrieved incidents must explain differences, not only similarity
Choice: require an explicit difference card for every influential retrieved case, including matches, mismatches/unknowns, topology differences, verification quality, transfer risk, and evidence needed before reuse.
Alternatives: show only top-k cases and a similarity score; summarize prior incidents without structured comparison.
Reason: the user-facing and model-facing explanation is a safety mechanism against catastrophic generalization and makes retrieval auditable.
Assumptions: the canonical schema exposes the comparison fields.
Trade-offs: slightly more runtime/report complexity and the possibility of exposing incomplete metadata that must be labeled unknown.
Validation: evaluate whether difference cards reduce wrong-cause transfer on causal-look-alike incidents and whether engineers can identify why a prior case was or was not reused.
Revisit when: a more compact representation yields equivalent transfer safety and auditability.


Open uncertainties / Pass 5 questions
1. What published evidence supports a practical data-readiness threshold for offline RL/MDP diagnostic policies? The several-hundred-to-low-thousands trajectory range above is only a planning heuristic, not an evidence-backed requirement.
2. Under what task diversity and number of independent domains does meta-learning outperform topology-aware retrieval or ordinary adaptation for heterogeneous faults?
3. Which topology normalization and graph-alignment metrics remain stable across model/runtime/compiler/driver changes and different GPU/hardware generations?
4. How should verification strength be calibrated inside a tier, especially for partially verified multi-cause incidents, repeated experiments, replay-only evidence, or later retractions?
5. How robust are semantic embeddings to vocabulary, runtime, and evidence-format drift, and how should embedding/index versions be monitored and rebuilt?
6. With a very small verified memory, when do semantic embeddings add value over exact/structured matching, and how should top-k diversity be set to avoid overfitting to one prior case?
7. What benchmark best measures catastrophic generalization from causal look-alikes, and what harmful-transfer rate is acceptable for a debugging assistant that still requires controlled verification?
8. What overlap, repeat count, uncertainty model, and context representation are necessary before historical intervention effects are meaningfully comparable? When is an HTE/causal-forest benchmark statistically credible?
9. Can graph/suspect-subgraph reranking fit the investigator latency budget while handling missing and evolving topology?
10. How should high-precision rules be versioned, expired, and automatically challenged so stale signatures do not become permanent blind spots?
11. How should the schema represent multi-cause incidents, partial verification, and explanations that account for only part of the measured regression?


No external Deep Research was used in this pass. Missing empirical/sample-complexity evidence above is intentionally recorded for Pass 5.


Future-model architecture handoff — provenance, lineage, and change contract


Purpose of this handoff
This subsection is the compact reconstruction path for a future reviewer or model that did not participate in Pass 3. Candidate labels C26–C33 below refer to the paper-backed mechanism explanations immediately above; those entries define each mechanism, hyperlink its source paper, state the Reflex-specific disposition, and distinguish literature provenance from Reflex-specific extensions. The papers establish where the mechanisms came from; they do not by themselves prove that the integrated Reflex architecture is optimal. The final choices below are engineering hypotheses selected against Reflex constraints and must remain falsifiable by held-out incident evidence.


What existed before Pass 3
Before this pass, Reflex already had a structured verified-incident memory concept, matched healthy comparators, explicit hypotheses, an OBSERVED → INFERRED → TESTED → VERIFIED evidence hierarchy, information-value-driven measurement selection, controlled validation, and replay/divergence reasoning. What was not yet pinned down was how prior incidents should be retrieved and adapted; whether semantic retrieval, topology/graph structure, or classical structured matching should dominate; how verification strength should constrain reuse; whether rules should run before memory retrieval; when learned sequential or meta-learned policies become justified; and how historical intervention outcomes may influence a new incident without being mistaken for causal proof.


Decision lineage: what preceded what
1. C26, classical structured case-based reasoning, is the simplest historical-case reuse mechanism and therefore remains the BASELINE and fallback. It established the minimum viable idea: represent incidents as structured cases, retrieve similar cases, adapt, and retain. It was not selected as the production matcher because flat feature similarity can transfer the wrong diagnosis across hardware, version, workload, or causal-path differences. Change this decision only if classical CBR matches or beats the selected hybrid on held-out causal-look-alike and cross-context tests while being materially simpler.
2. C27, topology/model-aware CBR, is the ADOPTED structured retrieval core. It was chosen over C26 alone because Reflex diagnoses systems in which two incidents can share symptoms but differ in dependency path or execution structure. C27 therefore adds current topology/model compatibility to case reuse. Demote it if topology normalization is unavailable, too expensive, or fails to reduce harmful transfer relative to simpler structured retrieval.
3. C30, verification-weighted episodic/RAG retrieval, is COMBINED as the high-recall semantic access path, not as the causal authority. It complements C27 by finding useful prior episodes, notes, and investigation sequences that a fixed schema can miss. Reflex adds the verification-gating policy; the source RAG mechanism does not imply that semantic similarity proves diagnosis. Remove or weaken this component if semantic retrieval does not improve useful-case recall after version/terminology drift, or if it increases harmful transfer despite gating.
4. C31, event/fault-graph similarity, is COMBINED as a structural reranker where graph evidence exists. It follows candidate generation rather than replacing it because graph construction/alignment can be incomplete or expensive. Promote graph similarity to a primary matcher only if held-out topology-shift tests show clear accuracy/robustness gains at acceptable coverage and runtime cost; remove it if missing/noisy graphs add complexity without reducing causal-look-alike errors.
5. C32, the rule-first → retrieval → learned/general reasoning cascade, is ADOPTED as the runtime ordering principle. Narrow, version-scoped, high-precision deterministic signatures run first; ambiguous cases fall through to hybrid retrieval; novel cases continue to the full investigator. This ordering was chosen for cold-start speed and auditability, not to permit broad heuristic short-circuiting. Reverse or demote rule-first ordering if rule staleness, false short-circuits, version churn, or maintenance cost erase its measured benefit.
6. Verification gating is a Reflex synthesis built from the pre-existing evidence hierarchy and applied to C30/C26–C31-style reuse. VERIFIED controlled cases may influence diagnosis/action priors; TESTED-but-unverified cases may contribute measurement usefulness or negative evidence; INFERRED/suspected cases may suggest hypotheses or cautions but receive no direct cause/fix authority; retracted cases are excluded. Replace hard eligibility boundaries with softer calibration only if held-out tests show equal or lower harmful transfer while materially improving useful recall and preserving auditability.
7. The retrieved-case difference card is a Reflex safety/auditability requirement motivated by C27/C31 structural adaptation and by the pre-Pass-3 requirement that a reused case explain important differences. A retrieved prior must state why it matched, what differs or is unknown, how strong its verification is, and what live evidence is still required. Remove or replace this artifact only if another mechanism gives at least the same transfer-safety and human/model auditability with lower overhead.
8. C33, historical intervention-effect priors, is COMBINED only as a weak context-conditioned prior for choosing measurements/interventions. It was not promoted to causal decision authority because effects may fail to transport across hardware, workload, topology, and version. Strengthen it toward heterogeneous-treatment-effect modeling only after held-out calibration across shifts is reliable; weaken or remove it if negative transfer or poor overlap dominates. A historical effect never makes the current incident VERIFIED.
9. C28, a learned sequential diagnostic policy, is DEFERRED and is not in the current online decision path. It could eventually optimize whole investigation sequences, but deploying it now would require stable state/action/reward definitions, broad action support, diverse verified trajectories, and credible offline policy evaluation. Revisit only when it beats the rule + hybrid-retrieval + information-value baseline on held-out fault-family and hardware/version/workload shifts without unsafe off-support behavior.
10. C29, meta-learning/few-shot incident adaptation, is DEFERRED and is not in the current online path. It becomes worthwhile only if Reflex accumulates genuine related task families across independent environments and leave-one-domain-out tests show repeatable few-shot gains beyond topology-aware retrieval and ordinary adaptation. Random splits within the same environment are not sufficient evidence.


Current execution lineage
High-precision version-scoped rules [C32] → hybrid candidate generation [C27 structured/topology-aware retrieval + C30 semantic episodic retrieval] → topology/event-graph reranking where available [C27 + C31] → verification eligibility/gating → retrieved-case difference explanation → update explicit current-incident hypotheses and measurement priorities → controlled current-incident validation → optionally use C33 as a weak, shrunk prior for experiment/intervention ranking → retain the newly verified incident as a new canonical structured case. C26 remains the comparison baseline/fallback. C28 and C29 remain offline/deferred research candidates rather than hidden components of the online path.


Evidence status: what is literature-backed versus Reflex-specific
The linked papers justify that the underlying mechanism families are real, studied approaches. They do not validate Reflex's exact composition, ordering, gating rules, score weights, or GPU/runtime-domain transfer. The candidate scores and dispositions in this pass are comparative engineering judgments based on current Reflex constraints, not measured benchmark results. Reflex-specific claims that still need empirical confirmation include the value of topology-aware reranking, the incremental recall from semantic retrieval, the calibration of verification gating, the benefit/cost of rules-first execution, graph-alignment value under missing topology, and transportability of historical intervention effects.


Change contract for the selected architecture
A future reviewer should not change a component because another paper is newer or more fashionable. Change it when a competing mechanism produces materially better end-to-end diagnostic outcomes on a frozen, held-out evaluation set while respecting runtime and auditability constraints. The minimum challenge set should include same-symptom/different-cause incidents, same-cause/different-context incidents, hardware/runtime/version/workload shifts, topology mutations, missing/noisy graph information, terminology/embedding drift, near-miss deterministic rules, contaminated or retracted memory, and negative/neutral intervention outcomes. Compare at least verified-cause retrieval/recall, harmful-transfer rate, time and measurement cost to verification, calibration/abstention quality, runtime overhead, and maintenance burden. Pass 5 should define quantitative acceptance thresholds where this pass intentionally left them open.


How Astra or another future model should interpret the record
Treat the paper links as mechanism provenance, the C26–C33 matrix as the alternative set considered in this pass, the head-to-head section as the comparative reasoning, the selected-architecture section as the current implementation contract, the ADRs as the durable decision record, and the revisit triggers/change contract as permission to overturn the architecture when new evidence warrants it. Preserve the distinction between “this mechanism exists in the literature,” “Reflex chose to incorporate it,” and “Reflex has empirically proven it works best”; only the first two are established by this pass.




PASS 3 DECISION LOG — Low-Overhead Observability & Profiler Escalation


Current Reflex approach
Reflex already has the right high-level observability principle: instrumentation must not materially perturb the low-latency loop; normal executions receive cheap evidence; richer evidence is kept temporarily near the source; and deep GPU profiling is an escalation selected only when it is expected to reduce real diagnostic uncertainty. The current design also explicitly calls for monotonic timestamps, bounded local buffering, asynchronous persistence, a GPU Level 1/2/3 evidence ladder, and active measurement selection that accounts for measurement cost and observer overhead.


This pass therefore does not add a second observability subsystem. It narrows what is allowed on every ~30 ms execution, makes the hindsight path explicitly bounded and nonblocking, separates triggered tracing from deep profiling, and formalizes observer-effect calibration as a first-class cost model. Research GEM / KEEP / DROP / U labels below are source provenance only and are not Reflex selection evidence.


Candidate decision matrix


Candidate
	Relation
	Scores DV/IE/RF/PF/RB/AU
	Disposition
	Why
	Key assumption/trade-off
	Evidence that could change the decision
	C34 — Progressive sparse → deep profiling / escalation
	duplicate
	5/5/5/5/4/5
	COVERED
	Already the current Reflex spine; this pass formalizes tiers, triggers, and hard runtime guards rather than adding a second mechanism.
	Sparse collection cannot recover detail that was never sampled; the design relies on hindsight buffering, exploration, and replay to limit that loss.
	Reconsider only if hidden-fault tests show sparse→active escalation misses non-replayable causes that broad telemetry reliably catches.
	C35 — Always-on multi-domain host + GPU telemetry
	augment
	5/3/3/4/4/5
	COMBINE
	Keep cross-domain visibility, but narrow “always-on” to minimal asynchronous host/GPU state; scheduler/API/event-rich tracing becomes triggered.
	Assumes coarse host/GPU state plus stage timing catches enough interference without continuously tracing scheduling, I/O, PCIe, and runtime events.
	Expand only if ablation shows broader always-on telemetry materially improves true-cause recovery with negligible latency/jitter perturbation.
	C36 — Always-on cheap GPU hardware counters
	duplicate
	4/4/4/5/3/5
	COVERED
	GPU Level 1 already includes low-cost counters; retain only an empirically calibrated, capability-backed asynchronous subset.
	Counter availability and semantics vary by GPU generation, driver, and vendor; collection must not force request-path or device synchronization.
	Change if low-rate samples are too stale, counter queries perturb the loop, or a more portable standardized counter set becomes available.
	C37 — eBPF GPU API / driver probing
	orthogonal
	4/4/3/2/2/4
	DEFER
	Useful application-transparent observation backend, but not needed for the default prototype and carries permissions, ABI, deployment, and correlation burden.
	Requires stable probe points, deployable privileges, reliable request↔CUDA correlation, and version maintenance; the mechanism is CUDA/NVIDIA-specific.
	Promote if target environments expose stable probe points and permissions and prototype tests show a clear fidelity/overhead advantage over runtime-native tracing.
	C38 — Targeted heavy kernel instrumentation
	augment
	5/2/1/2/2/4
	DEFER
	Keep an architecture slot only for the deepest selected-kernel escalation, preferably on replay, canary, or sacrificial reproductions.
	Instrumentation can change timing, cache/memory behavior, synchronization, and kernel execution itself; implementation is toolchain- and architecture-specific.
	Implement when cheaper profiling repeatedly leaves kernel-local causes unresolved and reproducible replay/canary runs make perturbation measurable.
	C39 — Observer-effect measurement / sampling-rate calibration
	augment
	4/5/5/5/5/5
	ADOPT
	Formal calibration makes telemetry trustworthy and gives active measurement selection a measured cost model instead of an assumed one.
	Observer cost is contextual and non-additive across collectors, so calibration must be repeated by hardware/runtime/workload and stored with uncertainty.
	Revise if costs are too nonstationary for offline/contextual calibration, requiring online calibration or stronger hard-budget rules.
	

Candidate records


C34 — Progressive sparse → deep profiling / escalation
Source provenance: Pass 2 merged R4-M3, R4-M5, R4-M8, R6-M5, R6-M11, R6-M13, and R8-M10. Provenance labels across source variants include KEEP, KEEP+GEM, DROP+GEM, and U; these labels are provenance only.
Relation to current Reflex: duplicate. The sparse → hindsight → targeted escalation → deep profiling progression is already the current architecture.
Scores: Diagnostic value 5; Information efficiency 5; Runtime fit 5; Prototype feasibility 5; Robustness 4; Auditability 5.
Disposition: COVERED.
Assumptions: Cheap stage timing and asynchronous state samples are sufficient to detect most interesting executions; a bounded pre-trigger buffer, a small exploration stream, and replay can recover enough context for escalation; trigger evaluation itself stays outside the critical path.
Strongest diagnostic benefit: It concentrates expensive evidence on the few executions and hypotheses where richer data can actually change the diagnosis.
Strongest overhead or implementation risk: Sparse collection can irreversibly miss a transient, non-replayable root-cause signal that was never sampled before the trigger.
Rationale: At ~30 ms, a progressive architecture is the correct control principle. The ladder should define safe evidence tiers, but Reflex should not blindly climb it. Active measurement selection chooses the cheapest action expected to separate the live hypotheses. Hindsight retention reduces pre-trigger loss, while exploration samples protect against selection bias.
Validation experiment: On the fault-injection benchmark, compare sparse→active escalation against broad full telemetry and a fixed escalation ladder. Measure verified-cause recovery, measurements to verification, retrospective evidence availability, event/buffer loss, and the latency/jitter impact of each evidence tier.
Revisit trigger: Sparse→active escalation repeatedly misses non-replayable causes that broad always-on telemetry recovers, even after improving hindsight buffering and exploration.


C35 — Always-on multi-domain host + GPU telemetry
Source provenance: Pass 2 merged R4-M6; source provenance label KEEP+GEM.
Relation to current Reflex: augment. It strengthens cross-domain context, but the broad “always-on” interpretation conflicts with the low-perturbation intent if every domain is traced at event level.
Scores: Diagnostic value 5; Information efficiency 3; Runtime fit 3; Prototype feasibility 4; Robustness 4; Auditability 5.
Disposition: COMBINE.
Assumptions: Coarse host and GPU state sampled asynchronously, plus request/stage timing, captures enough infrastructure interference to decide when richer scheduler, I/O, PCIe, or runtime tracing is worth its cost.
Strongest diagnostic benefit: It prevents GPU-slowdown misdiagnoses when the real cause is host starvation, queueing, transport, power/clock state, or shared-system interference.
Strongest overhead or implementation risk: Broad continuous event tracing can consume CPU, create scheduling pressure, expand buffers, introduce instrumentation synchronization, and add jitter to the very loop being diagnosed.
Rationale: Keep multi-domain observability as a schema and escalation capability, not as permission to trace all domains continuously. The always-on set should be scalar/coarse state and existing stage timestamps. Scheduler event streams, detailed I/O/PCIe traces, and API timelines should be triggered.
Validation experiment: Run an ablation of minimal always-on versus broad host+GPU always-on instrumentation across host-contention, queueing, transfer, and GPU faults, with paired instrumentation-off controls. Compare cause recovery, diagnostic latency, CPU/GPU overhead signals, buffer volume, event loss, and end-to-end latency/jitter distributions.
Revisit trigger: Broader always-on collection materially increases verified-cause recovery on non-replayable incidents while observer calibration shows negligible perturbation.


C36 — Always-on cheap GPU hardware counters
Source provenance: Pass 2 merged R6-M10; source provenance label U.
Relation to current Reflex: duplicate. Current GPU Level 1 already names low-cost counters and GPU utilization, memory, clocks/power, idle state, and context.
Scores: Diagnostic value 4; Information efficiency 4; Runtime fit 4; Prototype feasibility 5; Robustness 3; Auditability 5.
Disposition: COVERED.
Assumptions: Counter reads can be performed by an asynchronous sampler without forcing device synchronization or request-thread blocking; the system records which counters are actually supported; timestamps can be correlated to requests without pretending the sample is per-request exact.
Strongest diagnostic benefit: Low-cost state trends can quickly distinguish idle/underfed GPU behavior, saturation, memory pressure, throttling/clock changes, and environment shifts before heavier profiling.
Strongest overhead or implementation risk: Counter availability, semantics, multiplexing behavior, and collection cost vary across GPU generations, drivers, and vendors; some queries may serialize, lock, or be too stale at safe rates.
Rationale: Continuously sample only the empirically calibrated subset whose observer cost is acceptable. Do not synchronously read hardware counters on every execution. Attach the nearest time sample with age/quality metadata. Missing counters are “unavailable,” never zero.
Validation experiment: Perform C39 sampling-rate sweeps on each supported GPU/driver class, paired with instrumentation-off runs. Measure latency/jitter changes, sampler CPU cost, any GPU synchronization/blocking evidence, sample freshness, counter availability, and diagnostic value under known faults.
Revisit trigger: Safe-rate samples are consistently too stale for diagnosis, counter collection itself perturbs the loop, or a more portable standardized counter family becomes available.


C37 — eBPF GPU API / driver probing
Source provenance: Pass 2 merged R6-M9 and R8-M7; provenance labels KEEP×1 and U×1.
Relation to current Reflex: orthogonal. It is an alternative application-transparent collection backend rather than a required diagnostic layer.
Scores: Diagnostic value 4; Information efficiency 4; Runtime fit 3; Prototype feasibility 2; Robustness 2; Auditability 4.
Disposition: DEFER.
Assumptions: Target deployments permit the required kernel capabilities/privileges; stable user/kernel probe points exist; probe maintenance across driver/runtime versions is manageable; and request/control-step IDs can be correlated to CUDA/API activity without adding synchronization.
Strongest diagnostic benefit: Application-transparent API/driver visibility can reveal launch gaps, synchronization calls, allocation/transfer behavior, and host-side runtime activity when application instrumentation is incomplete.
Strongest overhead or implementation risk: Permissions and deployment policy, kernel/runtime/driver ABI churn, lost events, per-process/container attachment, and fragile request↔CUDA correlation make it operationally complex. CUDA-specific hooks also reduce portability beyond NVIDIA.
Rationale: Reflex does not need eBPF CUDA/driver hooks in the default implementation. Prefer runtime-native or existing application tracepoints first. Keep eBPF as an optional triggered backend for environments where it is allowed and demonstrably useful.
Validation experiment: On a supported test node, compare eBPF traces with an application/runtime-native trace for event fidelity, lost events, correlation reconstruction, CPU overhead, latency/jitter perturbation, and behavior across driver/runtime upgrades.
Revisit trigger: Stable probe points and required permissions exist across target deployments and the prototype provides materially better information per observer cost than simpler triggered tracing.


C38 — Targeted heavy kernel instrumentation
Source provenance: Pass 2 merged R6-M1, R6-M6, R6-M7, and R6-M8; source provenance labels DROP×4.
Relation to current Reflex: augment. It adds a deepest escalation action, not a default collector.
Scores: Diagnostic value 5; Information efficiency 2; Runtime fit 1; Prototype feasibility 2; Robustness 2; Auditability 4.
Disposition: DEFER.
Assumptions: A suspicious kernel/region can be selected first; replay, canary, or sacrificial reproduction is available for most uses; the instrumentation result can be interpreted despite perturbing the kernel.
Strongest diagnostic benefit: It can expose precise memory behavior, phase-localized execution, instruction-level or metadata-dependent effects that coarse counters and sampling cannot resolve.
Strongest overhead or implementation risk: Heavy instrumentation can alter kernel timing, cache/memory behavior, occupancy, synchronization, launch ordering, and buffering, producing profiler perturbation rather than a faithful measurement of the original 30 ms execution.
Rationale: Heavy kernel instrumentation should exist only as an escalation capability after lighter evidence has localized the problem. Prefer selected kernels/regions and replay/canary execution. It should not be required for the first prototype until recurring unresolved kernel-local cases justify the implementation cost.
Validation experiment: For reproducible injected kernel-local faults, compare uninstrumented execution, lightweight sampling/profiling, and targeted heavy instrumentation. Evaluate whether the heavy method changes the causal conclusion, how strongly it changes execution behavior, and whether it resolves cases the cheaper tools cannot.
Revisit trigger: Lightweight methods repeatedly leave high-value kernel-local incidents unresolved and reliable reproduction makes the perturbation measurable and acceptable for offline/deep diagnosis.


C39 — Observer-effect measurement / sampling-rate calibration
Source provenance: Pass 2 merged R6-M12; source provenance label U.
Relation to current Reflex: augment. The current architecture says to measure observer overhead; this candidate turns that statement into a required calibration protocol and policy input.
Scores: Diagnostic value 4; Information efficiency 5; Runtime fit 5; Prototype feasibility 5; Robustness 5; Auditability 5.
Disposition: ADOPT.
Assumptions: Comparable instrumented/uninstrumented runs can be produced for calibration; overhead can be modeled conditionally by hardware/runtime/workload and measurement action; uncertainty can be retained instead of treating one calibration as universal.
Strongest diagnostic benefit: It separates real latency regressions from profiler-induced regressions and gives Reflex an empirical basis for deciding whether another measurement is worth taking.
Strongest overhead or implementation risk: Observer effects can be nonstationary and non-additive: two individually cheap collectors may interfere when combined, and calibration runs can fail to represent rare live-only contention.
Rationale: C39 is essential at ~30 ms. Every collector/profile action gets a measured observer-cost record and uncertainty. Profiler-perturbed evidence remains diagnostically useful but is labeled as perturbed and is not treated as uninstrumented latency ground truth.
Validation experiment: Run randomized paired or interleaved instrumentation-off/on trials for each always-on collector, triggered action, and important collector combination, plus sampling-frequency sweeps. Track end-to-end distributions including tails/jitter, throughput, CPU/GPU state, evidence of synchronization/blocking, collector self-time where observable, buffer occupancy/drop/flush work, bytes/events retained, and event loss. Confirm that adding measured observer cost to action selection changes choices away from overly perturbing actions when cheaper discriminating evidence exists.
Revisit trigger: Observer costs vary too rapidly for stored contextual calibration, forcing online calibration, stricter hard budgets, or a different active-measurement cost model.


Head-to-head decisions
Broad always-on telemetry vs minimal always-on signals: Choose minimal always-on signals. Broad telemetry remains an evaluation baseline and a triggered expansion. The minimum set is end-to-end/coarse stage timing, queue evidence already available in process, failure/SLO state, stable execution/context IDs, and a small asynchronous host/GPU state sampler. This avoids continuous scheduler/API/event collection, hot-path allocation, and instrumentation-induced synchronization. The trade-off is unavoidable: evidence never sampled cannot be retrospectively created.


Counters vs API/driver tracing: Keep a small capability-aware subset of cheap GPU state/counters asynchronously sampled at a C39-calibrated rate. API/driver tracing is triggered because it creates much higher event volume and correlation burden. eBPF is not the default implementation; where CUDA-native or application tracepoints are available, prefer them first.


Fixed escalation ladders vs active/on-demand escalation: Keep fixed evidence tiers as safety boundaries and implementation contracts, but use active measurement selection to decide whether to escalate and which action to take. A fixed ladder is a baseline, not the production policy. Low confidence alone does not justify the deepest profiler.


Lightweight sampling vs heavy kernel instrumentation: Lightweight sampling wins by default. Heavy kernel instrumentation is a deep action for selected kernels/regions, preferably on replay/canary/sacrificial reproduction, after cheaper evidence has localized the hypothesis.


Selected architecture


Always-on:
• Stable request/control-step correlation ID propagated through host/framework stages, plus an execution-family/context fingerprint and model/runtime/deployment/hardware/workload identifiers.
• Monotonic end-to-end and coarse stage timestamps for transport/observation, queue wait, preprocess, inference, return/postprocess/action; queue depth/wait and failure/SLO flags when already available without blocking.
• A small asynchronous host/GPU sampler. Host: coarse CPU utilization/load and other low-cost state already obtainable without event tracing. GPU: utilization, memory state, clocks/power/thermal state where available, idle/SM activity or other low-cost counters only when the capability registry and C39 calibration say they are safe.
• Samples are joined by timestamp; Reflex never forces a device synchronization merely to obtain a request-level counter snapshot.
• A collector capability registry records GPU/vendor/generation/driver support. The evidence schema is vendor-neutral; NVIDIA-backed collectors may use the available NVIDIA stack, while future AMD/ROCm or Intel/Level Zero-style adapters can populate equivalent fields. Missing capabilities stay explicitly missing.


Temporary/hindsight:
• Preallocated, bounded, nonblocking ring buffers close to the source. They hold recent detailed stage transitions, queue events, sampled host/GPU state at the configured safe rate, and selected low-cost runtime summaries.
• Persistence/flush is asynchronous. Buffer pressure drops evidence rather than blocking the control loop, and drop/overflow counts are themselves recorded.
• On a trigger, preserve a correlated pre-trigger window and a short post-trigger window. Retention uses the existing Reflex diagnostic-value/byte-cost/observer-cost logic.
• Hindsight can preserve only evidence that existed. To reduce sparse-evidence data loss, retain a small exploration stream of ordinary executions at higher fidelity and use replay where possible.


Triggered:
• Trigger on a matched-baseline tail regression/SLO violation or failure; a structurally abnormal/new execution family; evidence localizing the slowdown toward GPU or host scheduling; high diagnostic uncertainty with close competing hypotheses; an anomalous buffer/runtime summary; or an active-measurement action whose expected decision value remains positive after calibrated observer cost.
• Triggered actions include temporarily higher asynchronous sampling, CPU scheduler tracing, runtime/CUDA API timelines, host-submit/launch-gap tracing, transfer/allocation/stream-synchronization evidence, kernel timelines, and selected HBM/memory or GPU counter groups.
• Capture only the relevant request family, short incident window, selected worker/canary, or replay whenever possible.


Deep escalation:
• PC/stall sampling and source mapping; occupancy/cache/memory-stall profiling; selected detailed kernel metric passes; TenProf-like tensor attribution; LEO-like instruction slicing; and C38 selected-kernel/region heavy instrumentation.
• Deep tools should preferentially run on replay, a canary, or a sacrificial reproduction. If the incident is live-only, impose a strict request/time scope and label the evidence with its measured perturbation.
• Any profiler that changes synchronization or execution timing is diagnostic evidence, not uninstrumented latency ground truth.


Offline:
• Observer calibration and sampling-rate sweeps; per-device/driver profiler capability testing; counterfactual telemetry-value analysis; full-fidelity fault-injection corpora; replay; static/SASS/dataflow work; and development of heavy kernel instrumentation.
• Use offline analysis to decide which fields deserve promotion into cheaper tiers, not to expand always-on collection by default.


Baselines:
• Instrumentation-off.
• Minimal always-on only.
• Minimal always-on + hindsight preservation.
• Broad/full telemetry.
• Static always-on profiling.
• Random, tail-only, and anomaly-only escalation.
• Fixed escalation ladder.
• Active/on-demand measurement selection with calibrated observer cost.


Deferred:
• eBPF CUDA/driver hooks as a default collector.
• Pervasive heavy kernel instrumentation.
• Broad synchronous per-execution hardware-counter querying.
• Continuous scheduler/API/driver/kernel event tracing on every execution.
• Vendor-specific deep collectors may be added behind the capability interface as required; portability is preserved in the schema even if the first implementation is NVIDIA-focused.


Observer-overhead measurement:
Use randomized paired or interleaved runs under matched model/hardware/workload conditions: instrumentation-off versus each collector/tier, and versus important collector combinations because costs need not add linearly. Measure full end-to-end latency distributions including tails/jitter, throughput, CPU/GPU state, any synchronization/blocking signal, collector self-time when observable, buffer occupancy/flush work/drop counts, data volume, and event loss. Sweep sampling rates to identify the least-perturbing useful rate for each environment and recalibrate after material hardware, driver, runtime, model, or workload changes. Store a contextual observer-cost estimate plus uncertainty with every measurement action.


Observer cost enters active measurement selection directly. The policy should maximize expected diagnostic/decision value net of calibrated observer cost, while also enforcing a hard safety budget. Cost includes latency/jitter risk, synchronization risk, CPU/GPU resource use, buffer/data cost, and deployment/permission burden where relevant. When expected perturbation or its uncertainty is high, the policy should prefer replay/canary or a cheaper discriminating measurement.


Correlation requirements:
Every execution needs a stable request/control-step ID and stage/span sequence on the host. GPU evidence needs context/stream/launch associations plus a clock/time mapping sufficient to join it back to the host without introducing a synchronization solely for timestamp alignment. Joins must carry correlation confidence and explicit missingness; Reflex should not fabricate precision when only a coarse time-window association is possible.


Architecture Decision Records


ADR — Minimal always-on telemetry with active escalation
Choice: Keep a minimal cross-domain backbone on every execution and let active measurement selection choose richer evidence after a trigger.
Alternatives: Broad always-on host+GPU telemetry; continuous detailed tracing; fixed profiler ladder.
Reason: The ~30 ms runtime makes self-perturbation a first-order risk, while most executions do not justify detailed evidence.
Assumptions: Cheap timing/state plus hindsight is sufficient to identify when escalation is needed.
Trade-offs: Lower normal overhead and jitter at the cost of losing details that were never sampled.
Validation: Fault-injection and live replay comparison against full telemetry and fixed-ladder baselines, including observer-effect measurements.
Revisit when: Sparse evidence materially reduces verified-cause recovery for non-replayable incidents.


ADR — Capability-aware asynchronous GPU counters
Choice: Continuously sample only a small calibrated subset asynchronously; never require synchronous per-request counter reads or device synchronization.
Alternatives: No GPU state; all available counters continuously; synchronous request-scoped snapshots.
Reason: Cheap state is diagnostically useful, but counter availability and collection behavior vary by GPU generation/driver/vendor.
Assumptions: Time-aligned samples are sufficient for Level 1 localization.
Trade-offs: Samples may be stale or coarse; capability coverage differs across machines.
Validation: Sampling-rate and availability matrix across supported hardware/runtime configurations.
Revisit when: Safe-rate samples are too stale or a different counter backend provides a better information/overhead/portability trade.


ADR — Bounded nonblocking hindsight preservation
Choice: Use preallocated bounded local buffers, asynchronous flush, pre/post-trigger preservation, and recorded drop counts.
Alternatives: Persist everything synchronously; no hindsight buffer; unbounded buffering.
Reason: Retrospective context is valuable only if preserving it does not backpressure the 30 ms loop.
Assumptions: A bounded window captures useful precursors and post-trigger context.
Trade-offs: Overflow can discard evidence and buffer memory must be explicitly budgeted.
Validation: Burst/tail-event stress tests measuring buffer occupancy, drop behavior, flush work, and recovered pre-trigger evidence.
Revisit when: Important precursor evidence falls outside the viable bounded window or memory pressure becomes material.


ADR — eBPF CUDA/driver probing is not a default dependency
Choice: DEFER eBPF as an optional triggered backend.
Alternatives: Make eBPF a default always-on or default triggered collector; rely only on eBPF for host↔GPU visibility.
Reason: Permissions, deployment policy, ABI/version maintenance, lost-event handling, and CUDA-specific correlation add substantial prototype risk.
Assumptions: Runtime-native/application tracing covers the first prototype’s required visibility.
Trade-offs: Some application-transparent visibility is postponed.
Validation: Side-by-side eBPF prototype on a supported node against runtime-native trace evidence.
Revisit when: Target environments standardize permissions/probe points and eBPF shows a clear information-per-cost advantage.


ADR — Heavy kernel instrumentation is deep escalation only
Choice: Keep C38 for selected-kernel/region deep profiling, preferably replay/canary/sacrificial.
Alternatives: Instrument kernels continuously; make heavy instrumentation an early incident step; omit it entirely.
Reason: Its diagnostic resolution can be excellent but its perturbation and implementation burden are inconsistent with always-on operation.
Assumptions: Cheaper evidence can localize a kernel/region before instrumentation.
Trade-offs: Some kernel-internal causes require an extra reproduction/escalation step.
Validation: Compare causal conclusions and perturbation across uninstrumented, lightweight, and heavily instrumented reproductions.
Revisit when: A recurring unresolved fault class can only be verified with this evidence and reproduction is reliable.


ADR — Observer cost is a first-class measurement-selection term
Choice: ADOPT C39 and place contextual calibrated observer cost directly in the active-measurement objective, with hard guardrails.
Alternatives: Treat profiler overhead as a post-hoc note; use a fixed assumed cost; choose solely by expected information gain.
Reason: A measurement that distorts a ~30 ms loop can create or hide the phenomenon being diagnosed.
Assumptions: Costs and uncertainty can be estimated per measurement/context well enough to rank actions.
Trade-offs: Requires ongoing calibration and complicates the action-value model; combinations of collectors must be tested because costs may be non-additive.
Validation: Paired/interleaved calibration plus action-policy ablation with and without the observer-cost term.
Revisit when: Cost estimates fail to predict perturbation or over-constrain useful diagnosis, requiring online calibration or a different constrained objective.


Open uncertainties / Pass 5 questions
• What observer cost and sampling-rate envelope is actually acceptable on the real Reflex hardware/runtime? The source provides the ~30 ms operating context but no defensible collector-specific overhead numbers.
• Which GPU counters are simultaneously available, stable, and low-perturbation across the actual GPU generations/drivers in scope, and which non-NVIDIA backends will matter?
• How much important non-replayable evidence is lost before a trigger under the minimal always-on design, and what exploration/high-fidelity sampling rate is enough to control that risk?
• Can host request/control-step IDs be reliably joined to runtime/API/kernel evidence without introducing GPU synchronization, and how should coarse correlation confidence affect diagnosis?
• Which triggered profiler actions can reproduce live-only contention or interference on replay/canary, and which require tightly scoped live capture?
• Are eBPF permissions, container/kernel policies, and stable probe points available in any intended deployment environment?
• How should diagnostic value, observer cost, uncertainty, data volume, and deployment burden be normalized inside active measurement selection, especially when collector costs interact nonlinearly?
• What bounded hindsight memory/window configuration preserves useful pre-trigger evidence under bursty tail events without becoming a meaningful memory or flush-work source?


PASS 3 DECISION LOG — Next Measurement / Test Selection


Current Reflex approach


Reflex already proposes sequential active diagnosis: maintain explicit competing hypotheses with uncertainty, identify measurements that discriminate them, acquire the highest-value next measurement, update beliefs, and escalate selectively. Its stated objective is expected reduction in diagnostic uncertainty divided by measurement cost and observer overhead. It also plans to learn from solved incidents which expensive profiler/action was worth paying for. The missing design details are the measurement-outcome likelihood model, cold-start behavior before verified incident history exists, explicit handling of noisy/correlated evidence and shared setup costs, and whether non-myopic planning is justified.


Reading rule for this decision log


Every C-code below is immediately paired with the mechanism name, a plain-language explanation of what it does, why Reflex chose its disposition, and a linked source paper. Pass 2 merged multiple research reports for some candidates, so when no single paper uniquely defines the canonical candidate the link is labeled “representative source paper.” The Pass 2 registry itself is left unchanged.


Decision genealogy and provenance — successor-model handoff
This section should be read as a decision history, not as a list of papers. The papers establish where candidate mechanisms came from; the Reflex disposition is a project-level architectural judgment made after comparing those mechanisms against the same runtime and debugging constraints. A paper being newer, more formal, or theoretically stronger is not by itself evidence that its mechanism should replace the selected architecture.


What existed before this Pass 3 decision
Before these candidates were scored, Reflex already had an informal active-diagnosis idea: maintain competing hypotheses, ask which missing measurement would reduce diagnostic uncertainty most, divide that value by measurement cost and observer overhead, acquire the best measurement, update beliefs, and repeat. That was a design intent, not yet a fully specified selector. It did not define trustworthy action-outcome likelihoods, cold-start behavior when those likelihoods do not exist, how noisy or correlated measurements should be handled, how shared profiler setup costs should be priced, or whether one-step greedy choice was sufficient.


What mechanisms were compared
Pass 2 reduced the research search space for this architectural job to fourteen canonical candidates. They cover: C01 SEQUOIA-style diagnostic-entropy greedy selection; C02 Chernoff-like sequential experimental design; C03 index-based cost-aware ordering/EIP; C04 Bayesian expected-information-gain per cost; C05 noisy Bayesian adaptive/group experimental design; C06 MDP test/retest control for unreliable measurements; C07 Bayesian-network entropy selection with belief propagation; C08 EC²/EffECXtive equivalence-class edge cutting; C09 weak adaptive-submodular greedy selection; C10 ECED-style selection for correlated/noisy measurements; C11 non-myopic POMDP/limited-lookahead planning; C12 exact cost-optimal logical query selection; C13 persistent-noise expected-rank diagnosis; and C14 truncated greedy selection under shared/subadditive test costs. The candidate records below explain each mechanism, link the source or representative source paper, state its assumptions, and record the evidence that could reverse its disposition.


How the selected architecture was derived
Reflex did not adopt one paper wholesale. Pass 3 produced a composition:
• CORE — C04 Bayesian one-step expected information gain per effective incremental cost. This is the formal version of the pre-existing Reflex information-value idea and is the online default when action-outcome models are trustworthy enough to use.
• COLD-START / DEGRADED-MODE FALLBACK — C03 transparent cost-aware ordering. It is used when Reflex has plausible mechanistic relevance and measured cost but cannot honestly claim calibrated P(outcome | hypothesis, context, action). This prevents false probabilistic precision.
• RELIABILITY / CORRELATION CORRECTIONS — C05 and C10 are folded into the C04 selector rather than deployed as separate planners. Measurement reliability changes predicted information value; correlated or redundant evidence is conditioned jointly where possible or conservatively penalized so repeated views of the same trace do not look like independent discoveries.
• SHARED-COST CORRECTION — C14 contributes the cost model. Profiler setup, replay, trace activation, or one acquisition may expose several signals, so Reflex uses effective incremental/bundle cost rather than pretending every measurement has an independent standalone cost.
• STRONG CHALLENGERS / BASELINES — C01 is the equal-cost entropy ablation; C08 EC²/EffECXtive is the strongest decision-equivalence challenger when many hypotheses lead to the same engineering action; C12 is an exact tiny-state oracle for measuring greedy regret. They are deliberately retained so the selected mechanism must earn its complexity empirically.
• DEFERRED PENDING EVIDENCE — C02, C06, C07, C11, and C13 are not declared bad mechanisms. They are deferred because Reflex does not yet have the likelihood/error-cost model, retest frequency, stable Bayesian-network semantics, demonstrated greedy regret, or persistent-noise regime needed to justify their extra machinery.
• REJECTED AS AN INDEPENDENT REFLEX POLICY — C09 is rejected for now because its practical action is still greedy marginal-gain selection while its useful theoretical guarantees require adaptive-submodular structure Reflex has not established. Its underlying greedy intuition is already represented by the selected family.


Therefore the current next-measurement architecture is a Reflex synthesis: C04 core + C03 fallback + C05/C10 evidence-quality corrections + C14 effective shared-cost modeling, evaluated against C01/C08/C12 and the broader deferred set. The hyperlinks below are mechanism provenance; they should not be read as claims that any one paper proves this exact composition.


Why this composition won under Reflex constraints
The selector must work inside an already-fast approximately 30 ms-class loop where measurement itself can perturb latency; telemetry is correlated; hardware, runtime version, workload, and concurrency can shift; multiple causes may coexist; deep profiler actions have very different setup and observer costs; and the debugging endpoint is a VERIFIED engineering explanation after discriminating evidence or controlled intervention, not merely a lower entropy score. C04 is the smallest online mechanism that directly optimizes the existing information-value objective while remaining auditable. C03 protects the cold start. C05/C10/C14 repair three assumptions that would otherwise be especially unsafe for Reflex: perfectly reliable evidence, independent evidence, and independent test costs. More elaborate sequential planning is postponed until data shows one-step greediness is actually the bottleneck.


Architecture reversal contract — what evidence should cause a successor model to change this design
A future reviewer should change an architectural component only when matched experiments show that the alternative improves the actual debugging objective—true-cause recovery, calibration, measurement/observer cost, steps or time to VERIFIED cause, and robustness across held-out fault families/hardware/versions/workloads—not merely because it has a stronger theorem on its own assumptions.


• Replace C04 as the online core if predicted EIG is poorly correlated with realized diagnostic progress or total cost-to-VERIFIED cause, and a simpler or alternative selector consistently wins at matched measurement/observer budget across held-out domains. C03 and C08 are the first direct challengers; new mechanisms can be added under the same test.
• Remove the C03 fallback if trustworthy action-conditional outcome models are available from incident zero and calibrated EIG is stable under cold-start and shift tests. Promote C03 toward the primary policy if it repeatedly matches EIG on verified-cause quality at materially lower modeling/maintenance cost.
• Remove or simplify C05 reliability handling if repeated measurements are effectively deterministic and reliability-aware EIG never changes useful choices. Promote C06-style retest control if retesting becomes common and a one-step “retest as another action” treatment wastes material investigation cost.
• Replace the lightweight C10 redundancy/correlation correction with a fuller ECED- or Bayesian-network-style method if correlated CPU↔GPU evidence continues to cause duplicate measurements, overconfidence, or premature stopping after conditional/joint modeling and empirical penalties are applied. C07 becomes credible only if Reflex can maintain a stable calibrated network/CPT model across the relevant contexts.
• Remove C14 shared/incremental cost modeling if profiler actions prove operationally independent. Strengthen it into explicit bundle/subadditive optimization if shared setup costs repeatedly change the cheapest path to verification and the bundle-cost model is stable enough to exploit.
• Promote C11 limited-lookahead/POMDP planning to the runtime path only if replay of solved incidents shows systematic and material greedy regret—for example, a modest first measurement repeatedly unlocks a much cheaper second step—and that recovered cost exceeds the added model/planning error and runtime complexity.
• Promote C08 EC²/EffECXtive if decision-equivalent hypothesis classes are stable and it reaches the same verified engineering action at materially lower acquisition cost than C04, especially when many hypotheses collapse to the same intervention or verification plan.
• Promote C12 exact optimization beyond an oracle only if an important real decision branch remains small, structured, and stable enough that exact search is tractable without a brittle abstraction.
• Promote C02 only when hypothesis likelihoods and decision-error/sampling costs are credible enough that its joint test-selection/stopping treatment measurably improves total investigation cost.
• Promote C13 only if persistent, non-reversible ambiguity is a common limiting regime and optimizing expected true-cause rank improves eventual verified-cause recovery without increasing verification cost.
• Reopen C09 only if adaptive-submodular-like behavior is empirically defensible in the actual measurement process and using that structure changes the policy or produces measurable robustness/efficiency that the current greedy EIG family does not.


How a successor model should read the evidence hierarchy
1. Pass 2 source labels such as GEM / KEEP / DROP are research-report provenance only; they are not Reflex architecture votes.
2. Pass 3 dispositions—ADOPT, COMBINE, COVERED, BASELINE, DEFER, REJECT—are the current architecture decisions and should be interpreted together with the assumptions, failure modes, and reversal evidence below.
3. Paper links explain intellectual/mechanism provenance. The selected composition and its trade-offs are Reflex-specific synthesis.
4. Pass 5/open-uncertainty questions are unresolved evidence gaps, not settled assumptions. A future model should prefer new measured evidence that resolves those questions over re-litigating the architecture from paper prestige alone.
5. VERIFIED incident outcomes are the strongest project evidence. If observed intervention results repeatedly disagree with the selector’s predicted information value, cost model, or chosen sequence, the architecture should be revisited even if its source literature remains theoretically sound.


Candidate decision matrix


Scores are Diagnostic value / Information efficiency / Runtime fit / Prototype feasibility / Robustness / Auditability.


Candidate | Relation | Scores | Disposition | What it is + linked paper | Why Reflex chose this option | Key assumption/trade-off | Evidence that could change the decision
C01 — SEQUOIA diagnostic-entropy greedy | duplicate | 4/4/5/5/2/5 | COVERED | Source provenance: GEM×1; KEEP×2. What it is: Greedily choose the next available test expected to reduce posterior diagnostic entropy the most. SEQUOIA approximates the posterior diagnosis distribution so this can be done cheaply even with multiple/intermittent faults. Primary source paper: Spectrum-Based Sequential Diagnosis. | Why: Reflex already has the same greedy uncertainty-reduction idea, but its intended objective also prices measurement/profiler overhead. Therefore SEQUOIA is materially represented and is not a second selector. | Key assumption/trade-off: Needs useful posterior masses and predicted test outcomes; entropy-only ranking is fragile to probability misspecification and does not natively price heterogeneous test costs. | Evidence that could change the decision: Make it a separate primary mechanism only if equal-cost entropy selection consistently reaches verified causes with lower total investigation cost than cost-normalized EIG.
C02 — Chernoff-like sequential hypothesis testing | augment | 4/4/4/3/2/4 | DEFER | Source provenance: GEM. What it is: Sequentially choose experiments that distinguish the currently plausible hypotheses while trading sampling cost against the penalty for a wrong terminal decision; the classic Chernoff formulation is an ancestor of active hypothesis testing. Primary source paper: Sequential Design of Experiments. | Why: It has attractive decision-theoretic stopping semantics, but Reflex does not yet have reliable action-conditional likelihoods or defensible numerical costs for wrong engineering declarations. Those missing quantities would make the apparent optimality mostly formal. | Key assumption/trade-off: Assumes a stable hypothesis set, well-specified observation distributions, and meaningful error/sampling costs; many guarantees are asymptotic or depend on those models. | Evidence that could change the decision: Promote if calibrated likelihoods and decision-error costs become available and replay shows materially lower total cost-to-verification than the simpler EIG policy.
C03 — Index-based cost-aware ordering / EIP | augment | 3/4/5/5/4/5 | COMBINE | Source provenance: KEEP×1; U×1. What it is: Rank candidate measurements with a transparent index built from current plausibility, test quality/discrimination, and test cost rather than requiring a full predictive distribution over every possible outcome. Representative source paper: Inexpensive Cost-Optimized Measurement Proposal for Sequential Model-Based Diagnosis. | Why: It is the best cold-start/degraded-model fallback. Reflex can know that a scheduler trace is relevant and expensive before it can accurately estimate every possible scheduler-trace outcome under every hypothesis. | Key assumption/trade-off: Gives up some outcome-aware optimality for robustness and simplicity; coarse relevance scores can miss a test whose value comes from an unusual outcome split. | Evidence that could change the decision: Remove the fallback if calibrated EIG is reliable from incident zero; strengthen it toward the default if it matches EIG’s diagnosis quality with materially less modeling/maintenance burden.
C04 — Bayesian expected-information-gain per cost | replace | 5/5/5/4/3/5 | ADOPT | Source provenance: GEM×3; KEEP×2; U×2. What it is: For each candidate measurement, predict possible outcomes, update the hypothesis distribution under each outcome, compute the expected information gained, divide/normalize by effective measurement cost, execute the best action, update, and repeat. Lindley’s paper is the foundational expected-information-gain formulation; Reflex adds explicit profiler/observer cost. Representative source paper: On a Measure of the Information Provided by an Experiment. | Why: This is the cleanest formalization of Reflex’s existing sentence: “expected reduction in diagnostic uncertainty / measurement cost and observer overhead.” It is one-step, cheap enough for the investigator path, easy to log, and directly optimizes the project’s goal of reaching verification with fewer expensive measurements. | Key assumption/trade-off: Needs usable P(outcome | hypothesis, context, action), sufficiently meaningful hypothesis probabilities, and measured/estimated costs. It accepts one-step myopia and can confidently mis-rank actions when those models are wrong. | Evidence that could change the decision: Overturn if predicted EIG is weakly related to realized diagnosis progress/cost on hidden incidents, or if a simpler cost-aware index or EC²-style policy achieves equal or better verified-cause cost with greater robustness.
C05 — Noisy Bayesian adaptive/group experimental design | augment | 4/4/4/3/3/4 | COMBINE | Source provenance: KEEP. What it is: Extend Bayesian active test selection so measurement outcomes are probabilistic/noisy rather than assumed perfectly reliable; update the posterior using a test reliability/noise model and value measurements under that uncertainty. Representative source paper: Near-Optimal Bayesian Active Learning with Noisy Observations. | Why: Reflex measurements can be noisy or perturbative, so reliability belongs inside the selected EIG policy. We combine the noise-modeling principle rather than install a second selection engine. | Key assumption/trade-off: Needs per-measurement and often context-specific reliability models; group/batch actions make the outcome model larger and can be data-hungry. | Evidence that could change the decision: Drop the extra noise machinery if repeated profiler/telemetry measurements are effectively deterministic; strengthen it if noise frequently changes rankings, causes false confidence, or wast
## Decision lineage / provenance for future reviewers


This Pass 3 decision is a refinement of an existing Reflex GPU branch, not a clean-sheet design. Before Pass 3, Reflex already had a StriaTrace-inspired sparse fast path (critical-path and synchronization-point tracing, selective escalation, dynamic-roofline reasoning), TELLER-style cross-layer context, lagged host↔GPU cross-correlation in the statistical stack, explicit host-induced GPU-slowdown hypotheses, and targeted deep profiling. Pass 2 then deduplicated the research mechanisms for this architectural job into C40–C44. Pass 3 asked which mechanism should define the canonical representation, which should be an analysis layer, which should remain a statistical fallback/baseline, which was already covered by the current architecture, and which should be a framework-specific semantic enrichment. GEM / KEEP / DROP / U remain source-report provenance only, not Reflex selection evidence.


Lineage summary: C40 = canonical structural representation; C41 = suspect-view extraction; C42 = statistical fallback/baseline; C43 = broad bottleneck classifier already covered; C44 = framework-semantic enrichment.


C40 — Request-centric heterogeneous dependency DAG + critical-path blame. What it is: a shared heterogeneous execution graph containing CPU phases/threads, CUDA API calls, transfers, synchronization, GPU kernels/streams, communications, scheduling/waiting relationships, and request/batch membership, with a per-request view projected from that shared graph. Critical-path analysis ranks which dependency or wait actually delayed request progress. Where it came from: Pass 2 merged R4-M1, R4-M10, R4-M12, and R4-M13; architecturally it operationalizes the dependency/cross-layer ideas already present in Reflex and is strongly aligned with TELLER: Non-intrusive Cross-Layer Root-Cause Analysis for LLM Inference and StriaTrace: Efficient Tracing and Diagnosis for Online LLM Inference. What we compared it against: using C42 lagged correlation as the primary localization mechanism; continuously reconstructing a complete graph for every execution; or making C44's framework-semantic hierarchy the canonical representation. Decision — ADOPT. Why: explicit dependency and waiting evidence can distinguish “the GPU itself executed slowly” from “the GPU was idle because the host, a synchronization edge, transfer, queue, or shared batch prevented progress.” It is also more auditable than correlation. We do not duplicate shared kernels/batches per request; multiple request views reference the same shared nodes. What would change the decision: downgrade or redesign C40 if graph incompleteness, clock-alignment error, correlation-ID loss, or shared-work attribution makes rankings unstable under realistic concurrency/batching; if reconstruction overhead breaks the low-latency budget; or if a cheaper method matches true-cause recovery and agreement with controlled interventions. Critical-path blame is localization evidence, not causal verification.


C41 — Causal/suspect subgraph extraction. What it is: after a suspicious request/stage is identified, extract the dependency neighborhood most relevant to that symptom—its producers, blockers, waits, synchronization, shared work, and immediate semantic parents—rather than sending the entire execution graph into downstream reasoning. Where it came from: Pass 2 R4-M2 and the same dependency-aware causal-context slicing idea used by TELLER: Non-intrusive Cross-Layer Root-Cause Analysis for LLM Inference; it also matches Reflex's pre-existing selective-escalation/Hindsight principle. What we compared it against: reasoning over the full graph every time, or having no distinct extraction layer. Decision — COMBINE. Why: it improves information efficiency and auditability while keeping the full graph as the evidence source of truth; extraction is a view/analysis layer, not a replacement representation. What would change the decision: remove or weaken the extraction layer if controlled incidents show it frequently cuts away the real causal predecessor, or if full-graph reasoning becomes cheap enough and materially improves true-cause recovery without overwhelming the investigator.


C42 — Lagged host↔GPU time-series correlation. What it is: sliding-window lead/lag analysis that asks whether host disturbances—scheduler delay, CPU pressure, PCIe/network/I/O activity, submit-thread starvation—systematically precede GPU idle or tail-latency events. Where it came from: Pass 2 R4-M7 and Host-Side Telemetry for Performance Diagnosis in Cloud and HPC GPU Infrastructure; lagged cross-correlation was already present in Reflex's statistical model stack before Pass 3. What we compared it against: C40 dependency reconstruction as the main host↔GPU localization mechanism. Decision — BASELINE. Why: it is cheap, portable, and useful when edges/correlation IDs are missing, but temporal association is vulnerable to confounding from overlapping requests, batching, shared load, periodic behavior, and clock errors; it cannot by itself prove a dependency or causal direction. What would change the decision: promote it to a stronger combined role if injected-fault experiments show robust incremental Top-1/Top-3 true-cause recovery specifically when graph evidence is incomplete; demote or reject it if false host→GPU directionality is common under overlap/concurrency.


C43 — Dynamic-roofline broad bottleneck classification. What it is: combine phase latency with compute, memory, utilization, and host-feeding signals to classify the broad bottleneck family—for example compute, memory, host starvation, launch overhead, synchronization, transfer, contention, or batching—before paying for deep profiling. Where it came from: Pass 2 R4-M4 and the dynamic regression-based roofline/diagnosis mechanism in StriaTrace: Efficient Tracing and Diagnosis for Online LLM Inference. Reflex already had this in the GPU fast path before Pass 3. What we compared it against: using structural dependency reasoning to identify the responsible source/component. Decision — COVERED. Why: dynamic roofline is valuable classification, but it does not replace request-level source attribution. “Host-starved” is a bottleneck class; C40/C44 are what identify which host path/framework operation caused it. What would change the decision: elevate its localization role only if experiments show it reliably identifies the responsible source/component across hardware and workload changes, not merely the class; otherwise keep it as broad classification.


C44 — DeepContext framework → C++ → GPU semantic attribution. What it is: propagate or interpose framework-aware context so high-level model/Python operations can be connected through framework/C++ libraries to CUDA/runtime activity and GPU kernels, giving low-level behavior an actionable semantic parent. Where it came from: Pass 2 R4-M9 and R8-M5, DeepContext: A Context-aware, Cross-platform, and Cross-framework Tool for Performance Profiling and Analysis of Deep Learning Workloads, and the TELLER-style semantic context already present in Reflex. What we compared it against: a generic request DAG with no framework semantics, or making a framework-specific semantic hierarchy the canonical execution representation. Decision — COMBINE. Why: Reflex needs high-level actionability, but the portable source of truth should remain the generic heterogeneous graph; framework adapters enrich that graph when available rather than defining it. This limits lock-in when frameworks, compilers, fusion, and runtimes change. What would change the decision: promote semantic attribution toward an always-available core layer if adapters achieve high mapping completeness, low overhead, and stable attribution across at least two materially different frameworks/runtimes; defer or narrow it if async execution, fusion, batching, or framework hooks make mapping brittle or expensive.


How a future reviewer should challenge this architecture: treat every disposition above as conditional on measured prototype evidence, not as a permanent truth. Revisit the synthesis using Top-1/Top-3 true-cause recovery, calibration, ranking stability, graph/edge completeness, request-attribution precision, clock-alignment quality, observer overhead, bytes retained, cross-version/hardware/framework generalization, behavior under concurrency/batching/missing events, and agreement with measured intervention benefit. Missing events or uncertain clock/correlation mappings must lower confidence; Reflex should not silently invent dependency edges. The architecture remains justified only if its structural evidence moves the system faster and more cheaply from a regression to a verified engineering explanation than the simpler alternatives compared above.


es escalation budget.
C06 — MDP test/retest for unreliable measurements | augment | 4/3/3/2/3/4 | DEFER | Source provenance: KEEP. What it is: Model test selection as a Markov decision process with false-alarm/detection probabilities; the policy can deliberately repeat an unreliable test when the expected reliability gain is worth its cost instead of always moving to a different test. Primary source paper: A novel method for optimal test sequencing under unreliable test based on Markov Decision Process. | Why: Retesting is useful in principle, but a full MDP is premature before Reflex has validated simple one-step outcome/reliability models. In v1, a retest is just another candidate action and must win on conditional EIG per incremental cost. | Key assumption/trade-off: Needs calibrated false-positive/false-negative or transition probabilities and enough recurring retest situations to justify state/action complexity. | Evidence that could change the decision: Promote if retesting is common and a one-step conditional-EIG treatment repeatedly chooses bad sequences or spends materially more than an MDP/retest policy.
C07 — Bayesian-network entropy + BPEA/belief propagation | augment | 4/4/4/3/2/4 | DEFER | Source provenance: KEEP×1; GEM×1. What it is: Represent causes and measurements in a Bayesian network, use belief propagation to approximate marginal/conditional entropies, and greedily choose the test with the largest expected entropy reduction without exact inference. Primary source paper: Efficient Test Selection in Active Diagnosis via Entropy Approximation. | Why: Reflex should reuse its dependency graph to constrain plausibility and outcome models, but it should not pretend that a runtime dependency DAG is already a calibrated Bayesian network with trustworthy conditional-probability tables. The modeling burden is larger than the likely v1 gain. | Key assumption/trade-off: Requires a stable causal/probabilistic graph and maintained CPTs; loopy belief propagation is approximate, and hardware/version/workload changes can invalidate learned dependencies. | Evidence that could change the decision: Promote for a bounded subsystem if a stable learned BN materially improves test choice/generalization over corrected EIG and can be maintained across versions at acceptable cost.
C08 — EC² / EffECXtive equivalence-class edge cutting | replace | 5/4/4/3/3/4 | BASELINE | Source provenance: GEM×2. What it is: Instead of maximizing ordinary entropy, EC² places weighted edges between hypotheses that imply different decision classes and chooses the test that cuts the most cross-class edge weight; EffECXtive is a faster approximation. The cited paper develops EC² for noisy Bayesian active learning. Primary source paper: Near-Optimal Bayesian Active Learning with Noisy Observations. | Why: It is the strongest challenger to ordinary EIG because Reflex often only needs to distinguish hypotheses that lead to different engineering actions or verification plans. We keep it as a baseline until those equivalence classes and test likelihoods are stable enough to justify the extra mechanism. | Key assumption/trade-off: Requires meaningful equivalence/decision classes and probabilistic test behavior; benefits shrink when the active hypothesis set is already small or classes change as the investigation evolves. | Evidence that could change the decision: Promote if it reaches the same verified engineering explanation at materially lower acquisition cost than EIG, especially in incidents with many hypotheses mapping to the same action.
C09 — Weak adaptive-submodular greedy selection | duplicate | 3/4/5/4/3/4 | REJECT | Source provenance: KEEP. What it is: Use a greedy expected-marginal-gain policy and rely on adaptive-submodularity/diminishing-returns structure to obtain approximation guarantees relative to an optimal adaptive policy, including some noisy settings. Primary source paper: Adaptive Submodularity: Theory and Applications in Active Learning and Stochastic Optimization. | Why: The practical action rule substantially duplicates greedy information-value selection, while the theorem is only meaningful if Reflex’s objective and observation process satisfy adaptive-submodularity-like assumptions. We currently cannot justify those assumptions, so adopting the label would add theoretical decoration rather than a different useful implementation. | Key assumption/trade-off: Guarantees depend on structural diminishing-returns conditions that correlations, context shifts, shared costs, and multi-cause hypotheses can violate. | Evidence that could change the decision: Reopen only if Reflex can empirically or formally establish the needed structure and it changes the implemented policy or yields measurable robustness/guarantees unavailable from the chosen selector.
C10 — ECED for correlated/noisy measurements | augment | 4/4/4/3/4/3 | COMBINE | Source provenance: KEEP. What it is: ECED selects tests with a surrogate edge-discounting objective designed for noisy tests whose outcomes can be conditionally dependent; it explicitly discounts redundant information rather than assuming evidence sources are independent. Primary source paper: Near-optimal Bayesian Active Learning with Correlated and Noisy Tests. | Why: This problem is real for Reflex: CPU/GPU timelines, counters, scheduler traces, and profiler outputs often share the same underlying events. We therefore combine the correlation/redundancy principle into C04-style EIG, preferably via conditional/joint models and otherwise via an empirical redundancy penalty, rather than deploy full ECED initially. | Key assumption/trade-off: Needs estimates of noise and dependence/redundancy that may drift with workload/hardware. Full ECED is harder to explain and maintain than a localized correction. | Evidence that could change the decision: Promote a fuller ECED selector if corrected EIG still repeatedly buys redundant measurements or loses significant cost/accuracy under controlled correlation stress tests.
C11 — Non-myopic POMDP / limited lookahead | replace | 5/4/2/2/2/3 | DEFER | Source provenance: U×2. What it is: Treat the unknown cause as hidden state and measurement choices as actions, then plan several steps ahead so a modest first measurement can be selected because it unlocks a cheap and highly discriminating second measurement. Primary source paper: Active Diagnosis Through Information-Lookahead Planning. | Why: This can beat greedy EIG on real sequencing traps, but it multiplies the importance of an accurate generative model and causes state/action branching. Reflex should first measure whether greedy regret is material. Limited lookahead belongs offline/experimental before it belongs on the runtime investigation path. | Key assumption/trade-off: Needs trustworthy transition/observation models, bounded state/action spaces, and enough compute; model error compounds across imagined future branches. | Evidence that could change the decision: Promote limited lookahead online only if replay consistently shows large, systematic greedy regret that exceeds added planning/model complexity.
C12 — Exact cost-optimal logical query selection | replace | 5/5/1/2/2/5 | BASELINE | Source provenance: U. What it is: Search a bounded logical query/test space for the query or policy minimizing expected remaining diagnostic effort and/or test cost, rather than accepting a greedy approximation. The linked sequential-diagnosis paper is a representative source for optimized query computation under diagnostic and query-cost objectives. Representative source paper: Inexpensive Cost-Optimized Measurement Proposal for Sequential Model-Based Diagnosis. | Why: It is valuable as an oracle on tiny synthetic/logical cases because it tells us how much regret the online selector leaves on the table. It is not a good default for noisy, probabilistic, context-dependent profiler actions or a changing multi-cause hypothesis space. | Key assumption/trade-off: Requires a small, sufficiently complete structured query space with known costs and outcome semantics; exactness can become brittle if the abstraction omits real causes or noise. | Evidence that could change the decision: Promote only for a real bounded branch where exact optimization remains tractable and robust to model omissions and demonstrably reduces verification cost.
C13 — Persistent-noise expected-rank diagnosis | augment | 3/3/4/3/4/4 | DEFER | Source provenance: U. What it is: When measurement noise is persistent—repeating the same query does not give an independent fresh draw—and the noise distribution may be unknown, optimize the expected rank of the true diagnosis instead of forcing exact identification too early. Primary source paper: Active Diagnosis under Persistent Noise with Unknown Noise Distribution: A Rank-Based Approach. | Why: This is a credible fallback for irreducible ambiguity, but Reflex’s end goal is a verified engineering explanation, not merely a better rank. We should not optimize primarily for rank unless persistent noise is shown to be a dominant failure mode. | Key assumption/trade-off: Assumes persistent/non-reversible noise is common enough to shape the objective; rank can remain good while the evidence needed for verification is still missing. | Evidence that could change the decision: Promote if persistent noise is frequent in real/injected incidents and rank-aware selection improves true-cause recovery or reduces wasted tests without delaying verification.
C14 — Truncated greedy under shared/subadditive test costs | augment | 4/5/4/3/4/4 | COMBINE | Source provenance: U. What it is: Select tests when costs are not independent: several measurements may share setup/activation/routing/profiler costs, so the incremental cost of a bundle can be far below the sum of standalone costs. The paper shows why naive greedy behavior can fail under subadditive costs and proposes a truncated-greedy approximation. Primary source paper: Sequential Testing with Subadditive Costs. | Why: Shared cost is directly relevant to Reflex: starting a profiler, replay run, or trace session can expose several signals. We combine the cost-model insight now so C04 scores effective incremental/bundle cost rather than pretending every signal is independently purchased. We do not claim the paper’s approximation guarantee unless Reflex’s real cost structure matches its assumptions. | Key assumption/trade-off: Needs measured/learned setup, incremental, and bundle costs; those costs can vary with context and observer perturbation. | Evidence that could change the decision: Drop the shared-cost machinery if actions prove operationally independent; strengthen it if bundle-aware scoring materially lowers total investigation cost or changes the cheapest verification path.


Head-to-head decisions


1. Bayesian expected-information-gain per cost (C04 — predicts each measurement’s outcome distribution, expected posterior information gain, and effective cost) vs SEQUOIA diagnostic-entropy greedy (C01 — greedily reduces diagnosis entropy without the same explicit heterogeneous-cost objective): choose Bayesian EIG/cost. SEQUOIA is retained only as an equal-cost entropy ablation because profiler/observer cost is first-order in an already-fast system.


2. Bayesian expected-information-gain per cost (C04) vs index-based cost-aware ordering / EIP (C03 — a coarse plausibility/test-quality/cost index): use Bayesian EIG/cost when action-conditional outcome likelihoods are credible. Use the index as an explicit cold-start or degraded-model fallback rather than manufacturing probabilistic precision.


3. Bayesian expected-information-gain per cost (C04) vs EC² / EffECXtive equivalence-class edge cutting (C08 — cuts probability-weighted edges between hypotheses that imply different decision classes): EIG/cost is the online default because it is simpler and directly matches the current Reflex objective. EC²/EffECXtive is the strongest active-selection challenger, especially when many hypotheses lead to the same engineering action, but decision-equivalence classes and likelihoods are not yet stable.


4. Bayesian expected-information-gain per cost (C04) vs Bayesian-network entropy with belief-propagation approximation (C07 — uses a probabilistic cause/test network to approximate conditional entropies): reuse Reflex’s dependency structure to constrain hypotheses and outcome models, but do not equate a structural runtime DAG with calibrated Bayesian-network/CPT semantics. Defer the full Bayesian-network selector.


5. Noisy/correlated-test handling: combine noisy Bayesian adaptive design (C05 — explicit test reliability) and ECED-style correlated/noisy handling (C10 — discounts redundant conditionally dependent tests) inside the Bayesian EIG/cost selector. Retests are ordinary actions whose conditional information value must exceed incremental cost. Do not deploy a separate retest MDP or full ECED planner initially.


6. Greedy EIG/cost vs non-myopic planning: accept one-step myopia online. Use non-myopic POMDP/limited lookahead (C11 — values future test sequences) offline after logged incidents exist to quantify greedy regret. Use the MDP test/retest mechanism (C06 — explicitly plans repeats under unreliable tests) only if retesting becomes a demonstrated recurring need.


7. Exact cost-optimal logical query selection (C12 — searches a small query space for a cost-optimal diagnostic policy) is an oracle baseline on tiny cases, not the runtime selector. Its role is to measure regret of the practical selector where exact comparison is possible.


8. Shared/subadditive test costs (C14 — models common setup and bundle costs): adopt the cost-model insight immediately. Effective measurement cost must include setup/activation, acquisition time, observer perturbation, lost capacity where relevant, and context-specific incremental/bundle effects.


Selected architecture


Online/default selector: ADOPT Bayesian expected-information-gain per effective incremental cost (C04). For every bounded candidate action, store its outcome space; P(outcome | hypothesis, context, action) when supported; reliability; prerequisites; source/provenance; and a decomposed cost model. Score expected posterior information gain against effective incremental cost, execute the best safe action, update the belief/ranking state, and repeat. This mechanism was chosen because it is the closest precise implementation of the current Reflex architecture, fits an already-fast system by explicitly pricing profiler/observer overhead, and produces an auditable “why this measurement?” record.


Cold-start/degraded-model component: COMBINE index-based cost-aware ordering / EIP (C03). This mechanism uses coarse hypothesis plausibility, mechanistic discrimination/relevance, test quality, and measured cost when Reflex lacks a credible generative outcome model. It was chosen so the system can still act rationally at incident zero without inventing P(outcome | hypothesis, action).


Special handling for noisy/correlated evidence: COMBINE noisy Bayesian adaptive design (C05), ECED-style correlated/noisy evidence handling (C10), and shared/subadditive-cost modeling (C14) around the default selector. Model test reliability; prefer conditional/joint likelihoods where evidence supports them; otherwise use an explicit empirical redundancy penalty; and price incremental/bundle cost rather than independent-test cost. These components were chosen because noise, shared provenance, and profiler setup costs are concrete Reflex failure modes, while deploying three separate planners would create unnecessary complexity.


Non-myopic/offline component: DEFER online POMDP/limited-lookahead planning (C11) and MDP retest planning (C06). After enough injected and solved incidents exist, replay them with two-step/limited-lookahead planning to estimate greedy regret and learn compact “unlock value” or expected path-cost corrections. Exact cost-optimal logical query selection (C12) remains a tiny-state oracle only. These were not selected for the online path because a more sophisticated planner amplifies generative-model error before Reflex has shown that one-step myopia is actually expensive.


Experimental baselines: EC² / EffECXtive equivalence-class edge cutting (C08) as the strongest algorithmic challenger; exact cost-optimal logical query selection (C12) as a tiny-state oracle; SEQUOIA diagnostic-entropy greedy (C01) as the equal-cost entropy ablation; plus random choice, fixed escalation, tail/anomaly-only profiling, and always-run-full-profiler. These baselines distinguish whether gains come from cost normalization, decision-class objectives, or simply any adaptive policy.


Deferred mechanisms: Chernoff-like sequential hypothesis testing (C02) until likelihoods and error costs are credible; MDP test/retest (C06) until retesting is common enough; Bayesian-network entropy + belief propagation (C07) until a stable calibrated diagnostic network exists; non-myopic POMDP/limited lookahead (C11) until systematic greedy regret is demonstrated; persistent-noise expected-rank diagnosis (C13) until persistent noise is a measured limiting case. Weak adaptive-submodular greedy selection (C09) is REJECTED as a standalone architecture because its practical greedy rule is already represented while its theoretical guarantee depends on assumptions Reflex cannot yet justify.


Architecture Decision Records


ADR — Greedy Bayesian expected-information-gain per cost is the online default
* Choice: ADOPT Bayesian expected-information-gain per cost (C04): predict possible measurement outcomes, compute expected posterior information gain, and normalize by effective incremental measurement cost.
* Alternatives: SEQUOIA entropy greedy (C01), cost-aware index/EIP (C03), EC²/EffECXtive edge cutting (C08), non-myopic POMDP planning (C11), and exact logical query optimization (C12).
* Reason: it exactly operationalizes the current Reflex information-value objective, prices observer/profiler cost, is computationally feasible for a bounded candidate set, and can log the complete rationale for each selection.
* Assumptions: bounded hypotheses; useful though imperfect probabilities; coarse action-conditional outcome models; measurable costs.
* Trade-offs: accepts one-step myopia and sensitivity to probability/outcome-model misspecification.
* Validation: on hidden injected faults, compare predicted EIG with realized entropy/rank reduction, total measurement cost, number of measurements, and time to VERIFIED cause across hardware/version/workload contexts.
* Revisit when: EIG fails to predict debugging progress, or a simpler cost-aware index or EC²-style policy matches diagnosis quality at lower modeling cost.


ADR — Use a transparent cold-start fallback instead of false probabilistic precision
* Choice: COMBINE index-based cost-aware ordering / EIP (C03): rank using coarse plausibility, discrimination/test quality, and measured cost when generative outcome likelihoods are absent or flagged unreliable.
* Alternatives: run uncalibrated Bayesian EIG anyway; fixed escalation; random exploration.
* Reason: coarse relevance and measured cost exist earlier than trustworthy outcome likelihoods.
* Assumptions: these coarse inputs are available, monotonic enough to rank actions, and auditable.
* Trade-offs: the index can miss measurements valuable because of complex or rare outcome partitions.
* Validation: compare fallback choices with post-hoc EIG and exact-oracle rankings as calibration data grows; measure action regret and cost-to-verification.
* Revisit when: Bayesian EIG becomes reliable at cold start, or the fallback remains competitive enough to become the simpler default.


ADR — Model noise, correlation, and shared cost inside the selector
* Choice: COMBINE noisy Bayesian adaptive design (C05), ECED-style correlated/noisy-test handling (C10), and shared/subadditive-cost modeling (C14) with the Bayesian EIG/cost selector.
* Alternatives: assume tests are reliable and independent; deploy full ECED as the main selector; deploy a separate MDP retest planner; treat all test costs as independent/additive.
* Reason: CPU↔GPU evidence is correlated, measurements may be noisy or perturbative, and profiler/replay setup costs can be shared.
* Assumptions: major reliability, redundancy, and cost effects can be measured, learned, or conservatively bounded.
* Trade-offs: practical corrections give up clean paper-level guarantees but avoid stronger unjustified assumptions and large planner complexity.
* Validation: repeatability experiments, correlated-evidence stress tests, observer-effect calibration, and bundle-cost experiments; compare naive EIG against corrected EIG on total cost/steps to VERIFIED cause.
* Revisit when: a full correlated/noisy method materially wins or empirical evidence shows the corrections are unnecessary.


ADR — Keep non-myopic and exact planning off the runtime path
* Choice: DEFER non-myopic POMDP/limited lookahead (C11) online; use limited lookahead offline to quantify greedy regret, and use exact cost-optimal logical query selection (C12) only as a tiny-state oracle. MDP test/retest (C06) remains deferred unless repeated unreliable measurements become common.
* Alternatives: online POMDP/MDP planning; exact optimization for each incident.
* Reason: trustworthy generative modeling is currently the bottleneck; complex planning amplifies model error before greedy regret is established.
* Assumptions: most useful Reflex measurement decisions are locally discriminating enough that a strong one-step policy is a good first implementation.
* Trade-offs: the online policy may miss a cheaper sequence enabled by a lower-immediate-value first measurement.
* Validation: replay logged incidents with two-step/limited-lookahead planning and exact tiny-state oracles; quantify greedy regret in total cost, steps, and time to VERIFIED cause.
* Revisit when: systematic greedy regret outweighs the extra modeling, planning, and audit complexity.


Open uncertainties / Pass 5 questions


1. How accurately can Reflex learn P(measurement outcome | hypothesis, context, action), and how quickly does that calibration drift across hardware, runtime version, workload, and concurrency?
2. Which cost definition best predicts real investigation burden: wall-clock acquisition time, observer perturbation, setup/activation time, lost capacity, or a weighted combination, and how context-dependent is it?
3. How much conditional dependence remains among measurements, and is a simple redundancy penalty enough versus a fuller correlated-test objective such as ECED?
4. How common are genuine multi-cause incidents, and what bounded compound-hypothesis representation preserves measurement-selection quality?
5. How large is empirical greedy regret versus two-step lookahead or exact small-state optimization?
6. Are important measurement errors transient/retest-reducible or persistent/contextual, determining whether MDP retest planning or persistent-noise expected-rank diagnosis deserves promotion?
7. Does EC² / EffECXtive equivalence-class edge cutting beat ordinary EIG/cost when many hypotheses map to the same engineering action or verification plan?
# PASS 3 DECISION LOG — CPU ↔ GPU Reconstruction & Localization
### Candidate mechanism and paper guide


C40 — Request-centric heterogeneous dependency DAG + critical-path blame
What it is: reconstruct one heterogeneous execution graph that connects request/control-step CPU phases, framework/runtime calls, CUDA API submissions, GPU kernels, synchronization, communication, and scheduling/wait relationships. Reflex then takes a request-scoped view of that shared graph and asks which dependency chain actually gated completion. This is important under overlapping requests and batching because a shared kernel or batch should be referenced by multiple request views rather than falsely assigned to one request.
Why ADOPT: dependency evidence directly distinguishes “the GPU executed slowly” from “the GPU waited because the host, synchronization, transfer, or another dependency delayed progress.” Critical-path blame is useful when defined as gating-delay attribution, but it should be differential against a matched healthy execution and should not pretend shared work has a single owner. Source papers: TELLER: Non-intrusive Cross-Layer Root-Cause Analysis for LLM Inference and StriaTrace: Efficient Tracing and Diagnosis for Online LLM Inference.


C41 — Causal/suspect subgraph extraction
What it is: after a larger cross-layer graph exists, slice out the suspicious neighborhood around the regressed stage while preserving the dependency, parent/child, temporal, and communication edges needed to reason about it. TELLER calls the analogous object a dependency-aware causal-context slice.
Why COMBINE: this is valuable for information efficiency and investigator focus, but it is not a competing canonical representation. It should be an analysis/view layer over C40. Its main risk is pruning away the real upstream cause, so slice boundaries must expand when unresolved dependencies or missing evidence remain. Source paper: TELLER: Non-intrusive Cross-Layer Root-Cause Analysis for LLM Inference.


C42 — Lagged host↔GPU time-series correlation
What it is: compare host signals and GPU symptoms across lead/lag windows to detect patterns such as CPU scheduling pressure or PCIe/NIC activity tending to precede GPU idle time or tail-latency spikes.
Why BASELINE: it is cheap, portable, and useful when explicit request/dependency edges are missing, but correlation is weaker than structural waiting/submission evidence and becomes ambiguous under concurrency, batching, shared causes, clock misalignment, and overlapping requests. It should nominate hypotheses and missing measurements, not assign final blame. Source paper: Host-Side Telemetry for Performance Diagnosis in Cloud and HPC GPU Infrastructure.


C43 — Dynamic-roofline broad bottleneck classification
What it is: combine phase latency with compute, memory, utilization, host-feeding, launch, synchronization, transfer, and related signals to classify a suspicious GPU interval into broad bottleneck families before paying for deeper profiling. StriaTrace uses a dynamic regression-based roofline plus correlation-based diagnosis for this fast triage role.
Why COVERED: the current Reflex GPU fast path already contains dynamic-roofline/bottleneck reasoning. Keep it as classification, not source attribution: “host-fed/launch-limited” or “memory-like” narrows the hypothesis space, while the dependency graph and semantic mapping identify what actually caused that state. Source paper: StriaTrace: Efficient Tracing and Diagnosis for Online LLM Inference.


C44 — DeepContext framework → C++ → GPU semantic attribution
What it is: propagate program context across Python/model operations, framework internals, C/C++ libraries, and GPU device execution so a low-level kernel, stall, synchronization point, or launch pattern can be explained in terms of the high-level operation that produced it.
Why COMBINE: semantic attribution makes findings actionable, but it is framework/runtime specific and can break under fusion, asynchronous execution, dynamic batching, or missing hooks. Reflex should therefore keep the generic request/dependency graph as the portable substrate and attach framework-semantic adapters as enrichment rather than make framework instrumentation the canonical representation. Source paper: DeepContext: A Context-aware, Cross-platform, and Cross-framework Tool for Performance Profiling and Analysis of Deep Learning Workloads.






## Current Reflex approach


Reflex already has most of the ingredients required for cross-layer localization, but they are not yet specified as one canonical execution model. The current design keeps very-low-overhead always-on telemetry, a Hindsight-style temporary evidence buffer, matched healthy baselines and differential performance models, end-to-end subsystem localization, a StriaTrace-inspired GPU fast path, dynamic-roofline/bottleneck reasoning, TELLER-style cross-layer context, lagged host↔GPU analysis, targeted scheduler/kernel evidence, and controlled validation. It explicitly treats CPU starvation, delayed submission, launch gaps, synchronization/serialization, transfer/overlap failures, batching, and contention as first-class alternatives to “the GPU itself is slow.”


Pass 3 therefore does not need a second independent GPU-localization stack. It needs to formalize how per-request execution is reconstructed, which relationships count as dependency evidence, what remains only correlational, how concurrency and batching are represented, and when richer graph construction is worth its overhead. GEM / KEEP / DROP / U labels below are research provenance only and are not used as Reflex selection evidence.


The design principle for this pass is: dependency evidence localizes; correlation supports or triages when dependency evidence is incomplete; dynamic roofline classifies broad bottleneck families; framework semantics make the structural explanation actionable.


## Candidate decision matrix


Scores are Diagnostic value / Information efficiency / Runtime fit / Prototype feasibility / Robustness / Auditability, each 1–5.


Candidate | Relation | Scores | Disposition | Why | Key assumption/trade-off | Evidence that could change the decision
C40 — Request-centric heterogeneous dependency DAG + critical-path blame | augment | 5/4/4/4/4/5 | ADOPT | This is the strongest canonical localization mechanism because it can represent host waits, launch gaps, stream/sync ordering, transfers, kernels, batching, and shared work in one request-scoped dependency model. | Requires reliable correlation IDs, clock alignment, and explicit handling of shared/batched work; a continuously materialized full graph would be too expensive. | Revisit if graph completeness or observer overhead is poor enough that critical-path rankings become unstable under realistic concurrency.
C41 — Causal/suspect subgraph extraction | augment | 4/5/5/5/3/5 | COMBINE | Use as a downstream focus layer over C40 so the investigator sees the dependency neighborhood that can explain the symptom rather than the whole graph. | The seed localization must be good enough that extraction does not prune the true upstream cause; “causal” must not imply verified causality. | Upgrade or narrow the extraction rule if full-graph experiments show true causes regularly fall outside the retained neighborhood.
C42 — Lagged host↔GPU time-series correlation | augment | 3/5/5/5/2/4 | BASELINE | Cheap and useful when structural linkage is missing, especially for host disturbances that lead GPU idle/tail events, but it cannot distinguish common-cause correlation from real blocking. | Needs aligned clocks, stable sampling, matched workload context, and protection against overlap/batching confounds. | Promote only if controlled faults show consistently high precision across concurrency regimes when direct dependency evidence is absent.
C43 — Dynamic-roofline broad bottleneck classification | duplicate | 3/5/4/4/3/4 | COVERED | Current Reflex already includes dynamic-roofline/bottleneck reasoning in the GPU fast path. Keep it as broad classification that guides the next measurement, not as source attribution. | Aggregate compute/memory/utilization signals can misclassify host starvation, serialization, or overlap failures if treated as causal localization. | Revisit if fault-injection results show a calibrated classifier can reliably separate host/launch/sync/transfer classes across hardware and workload changes.
C44 — DeepContext framework → C++ → GPU semantic attribution | augment | 5/3/3/3/3/5 | COMBINE | Fold framework-aware semantic context into the generic execution graph so low-level GPU behavior can be traced back to model/framework operations. | Framework hooks, compiler fusion, asynchronous execution, and dynamic batching make context propagation and portability difficult. | Promote toward a broader always-available layer if adapters show high mapping completeness with low overhead across at least two materially different runtimes/frameworks.


### 
Candidate records


C40 — Request-centric heterogeneous dependency DAG + critical-path blame
Source provenance: merged raw mechanisms R4-M1, R4-M10, R4-M12, R4-M13; source labels represented KEEP, KEEP+GEM, and U.
Relation to current design: augments and formalizes the existing TELLER-style cross-layer representation plus StriaTrace-like critical-path/synchronization evidence.
Assumptions: host and GPU clocks can be aligned with bounded uncertainty; request/context IDs can be propagated through asynchronous host execution; CUDA/runtime correlation IDs can join launches to GPU activities; stream/event/synchronization semantics are observable; batch membership is known; missing events can be surfaced explicitly rather than silently guessed.
Strongest benefit: directly distinguishes “kernel execution regressed” from “GPU progress was delayed by host scheduling, launch, queue, synchronization, transfer, or shared-work dependencies.”
Strongest failure mode/cost: under multi-threading, overlapping requests, CUDA graphs, fusion, batching, or event loss, an apparently clean graph can be structurally wrong; if a full graph is continuously materialized, collection and reconstruction overhead can also violate the latency budget.
Rationale: Reflex needs a structural execution object that can support differential localization, critical-path reasoning, suspect extraction, and semantic attribution. Timestamp sequences alone are insufficient because asynchronous launches and multiple streams break naive temporal parentage. The graph should use only observed ordering/wait edges for critical-path computation and should attach evidence provenance/confidence to every inferred edge.
Validation experiment: inject CPU starvation, launch-gap, synchronization, transfer-overlap, kernel-regression, batching-delay, and competing-workload faults; run at concurrency 1 and overlapping/concurrent request regimes; measure graph completeness, Top-1/Top-3 cause recovery, critical-path stability, shared-node attribution correctness, missing-event degradation, and observer/reconstruction overhead against a full-trace oracle.
Revisit trigger: graph completeness falls below the level needed for stable cause ranking, clock-alignment uncertainty dominates the relevant gaps, or full/triggered reconstruction cost is too high for the intended runtime.


C41 — Causal/suspect subgraph extraction
Source provenance: merged raw mechanism R4-M2; source labels KEEP + GEM.
Relation to current design: augments active diagnosis and the TELLER-style graph; it is an analysis/view layer, not a new telemetry collector.
Assumptions: Reflex has a plausible seed region from matched-delta localization, critical-path excess, or another detector; the dependency neighborhood around that seed retains the important upstream blockers and downstream consequence chain.
Strongest benefit: improves information efficiency and auditability by giving the investigator a compact graph slice containing the relevant dependency chain, competing explanations, and missing-evidence boundaries.
Strongest failure mode/cost: an incorrect seed or too-aggressive k-hop/time-window extraction can remove the true cause, especially when an upstream host disturbance manifests later as GPU idle time.
Rationale: keep extraction separate from graph construction. Build one canonical structural model, then derive suspect subgraphs for reasoning, visualization, and targeted measurement selection. Call the result a suspect/dependency subgraph unless an intervention has verified causality.
Validation experiment: compare diagnosis using the full reconstructed graph versus extracted subgraphs across injected faults; measure cause-retention rate, graph-size reduction, diagnosis accuracy, reasoning cost, and frequency with which the true cause lies just outside the extraction boundary.
Revisit trigger: more than a small fraction of verified causes are pruned by the default extraction policy or extraction provides little information/latency savings over using the full triggered graph.


C42 — Lagged host↔GPU time-series correlation
Source provenance: merged raw mechanism R4-M7; source labels KEEP + GEM.
Relation to current design: augments the existing statistical model stack and lagged host/GPU analysis; it does not replace dependency reconstruction.
Assumptions: host and GPU samples share a sufficiently aligned timebase; the signal is sampled densely enough to resolve the relevant lag; matched context removes major workload confounders; overlapping requests and batching are represented as context variables or stratified away.
Strongest benefit: very cheap fallback evidence for host-induced slowdown when direct runtime linkage or scheduler edges are missing.
Strongest failure mode/cost: strong but spurious lead/lag can arise from a third factor such as load, batching, queue depth, or synchronized workload changes; coarse samples can also reverse or blur apparent direction.
Rationale: retain as BASELINE/triage evidence. A host signal leading a GPU-tail signal should increase suspicion and motivate a targeted scheduler/launch measurement, but it should remain INFERRED evidence and never override a contradictory observed dependency edge.
Validation experiment: under matched load, inject controlled host starvation and unrelated host load while varying concurrency and batch size; measure lag-recovery precision/recall, false-positive rate, sensitivity to clock skew and sampling interval, and incremental diagnostic value after structural features are removed.
Revisit trigger: dependency coverage becomes so complete that lagged correlation adds negligible value, or correlation remains too unstable under concurrency to justify even a baseline role.


C43 — Dynamic-roofline broad bottleneck classification
Source provenance: merged raw mechanism R4-M4; source labels KEEP + GEM.
Relation to current design: duplicate of an already-selected current GPU-fast-path concept; COVERED rather than a new architectural component.
Assumptions: low-cost compute, memory, utilization, phase-latency, host-feeding, and transfer/launch signals are available and can be calibrated by hardware/workload regime.
Strongest benefit: quickly narrows the next-measurement search from a large hypothesis set to a broad bottleneck family without paying for deep profiling.
Strongest failure mode/cost: classification is not source attribution. Aggregate resource behavior can label a symptom such as low utilization without identifying whether the source is CPU starvation, serialization, launch overhead, communication, transfer overlap, or truly slow kernels.
Rationale: use dynamic roofline after or alongside structural localization to answer “what broad performance regime does this suspicious region resemble?” It may contribute a host-starvation/launch/sync class, but the exact responsible source should come from dependency evidence and later validation.
Validation experiment: build a fault confusion matrix across compute, memory bandwidth, memory latency/stall, host starvation, launch overhead, synchronization, transfer/overlap, batching, and contention; evaluate class accuracy, calibration, hardware/version transfer, and reduction in unnecessary deep-profiler actions.
Revisit trigger: the classifier either collapses too many structural causes into the same class to guide measurements, or becomes accurate/general enough to replace some more expensive first-stage measurements.


C44 — DeepContext framework → C++ → GPU semantic attribution
Source provenance: merged raw mechanisms R4-M9 and R8-M5; source labels GEM ×1 and KEEP+GEM ×1.
Relation to current design: augments the current TELLER-style cross-layer context by making semantic attribution an explicit adapter layer over the generic graph.
Assumptions: high-level operation/context IDs can be propagated through Python/framework/C++ boundaries; runtime external-correlation or equivalent IDs can bridge C++/CUDA API activity to GPU activity; compiler fusion, CUDA graphs, and batching can be represented as many-to-many mappings rather than forced one-to-one parentage.
Strongest benefit: converts a low-level explanation such as “launch gap before kernel K” into an actionable one such as “attention projection op was delayed on the host before its fused GPU work was submitted.”
Strongest failure mode/cost: framework-specific hooks increase instrumentation burden and reduce portability; fusion or asynchronous task handoff can produce incomplete or misleading semantic ancestry.
Rationale: keep the canonical execution graph framework-neutral and attach semantic nodes/links through adapters. Start with one framework/runtime for the prototype, but do not bake its call-stack model into the schema. Rich tensor/operator context should be triggered around suspicious regions, while cheap stage/request semantics can remain always available.
Validation experiment: for the first framework adapter, measure semantic-link completeness and correctness from framework op → C++/runtime → CUDA API → kernel under eager execution, fused execution, multiple streams, multi-threaded submission, overlapping requests, and dynamic batching; then repeat a smaller portability test on a second runtime/framework.
Revisit trigger: adapter overhead or maintenance dominates diagnostic benefit, mapping completeness falls sharply under compiled/fused paths, or a more portable correlation primitive becomes available.


## Head-to-head decisions


Graph/dependency reconstruction vs time-series correlation: choose structural dependency reconstruction as the primary localization mechanism. A timestamp or lag can say that two signals move together; a dependency edge can say that one event had to wait for or was submitted by another. Lagged correlation remains a cheap baseline and fallback when edges are missing, and its proper action is usually to request the next structural measurement rather than to declare a cause.


Full graph reconstruction vs sparse/triggered graph construction: do not continuously materialize the full cross-layer graph. Always collect the minimum request/stage/correlation skeleton plus cheap host/GPU state and bounded temporary event evidence. When an execution is slow, novel, regressed, or diagnostically uncertain, preserve the relevant buffered events and construct the richer request graph. If the preserved evidence is insufficient, escalate collection for the next comparable execution. This matches the existing Hindsight and progressive-profiling design and protects the latency budget.


Generic request DAG vs framework-semantic attribution: the generic dependency graph is canonical; semantic attribution is an adapter layer. The canonical model must survive framework changes and still represent host tasks, runtime calls, streams, synchronization, transfers, kernels, batches, and shared work. Framework/model operations attach through typed semantic links. Fusion and batching are many-to-many, not forced parent-child trees.


Structural dependency reasoning vs dynamic-roofline classification: structural reasoning answers where progress was blocked and which event/component lay on the request’s effective dependency path. Dynamic roofline answers what broad bottleneck regime the suspicious region resembles. Classification may prioritize the next measurement, but it must not replace dependency/source attribution.


Critical-path blame under concurrency: retain critical-path reasoning, but redefine blame as request-relative differential criticality, not global ownership of elapsed time. Compute the request completion path only from observed order/wait dependencies. Compare node/edge duration and waiting against a matched healthy request. Shared batch, kernel, communication, or contention nodes remain shared and carry attribution uncertainty rather than being assigned entirely to one request. Nodes with zero or large slack are more relevant, but a long shared kernel is not automatically “the cause” unless its excess duration or blocking relationship explains the request regression.


## Selected architecture


Canonical execution representation: use a request-scoped view over a shared heterogeneous execution graph. The dependency subgraph itself is a DAG of observed happens-before, enqueue, stream-order, event/synchronization, queue/handoff, transfer/data-readiness, and batch-readiness relationships. Contextual/semantic relations that do not imply ordering are stored separately. Node types include request/control step, stage, framework/model op, host task/thread interval, queue/wait interval, CUDA/runtime API event, transfer, kernel, synchronization/event, communication, batch/shared-service node, and selected resource-state samples. Every node/edge records timestamp/clock domain, source, request membership, process/thread, device/stream, correlation identifiers, and evidence confidence. Missing evidence creates an explicit unknown gap or low-confidence edge; Reflex must not invent causal order from timestamp proximity.


Correlation mechanism: propagate trace/request/control-step IDs through asynchronous host context; record process/thread/task identifiers; attach batch ID plus request membership; use CUDA/runtime external-correlation or activity correlation IDs to join API launches and transfers to GPU activities; record device/stream/event identifiers; preserve framework semantic context IDs; and keep fusion/batching mappings many-to-many. Use a host monotonic clock as the host reference and transform GPU timestamps into a common comparison domain with periodic alignment anchors and an uncertainty bound. If two cross-domain events cannot be reliably ordered within that uncertainty, dependency semantics rather than timestamp order decide the edge, or the edge remains unknown.


Dependency construction: host program order is per thread, never a global host timestamp chain. Cross-thread edges require explicit queue, handoff, future/event, lock/wait, or scheduler evidence. Asynchronous CUDA launch creates an enqueue/correlation edge from the host API event to the GPU activity, not a simple temporal child edge. Stream ordering and CUDA event/synchronization semantics create GPU dependencies. Batch formation creates shared nodes with multiple request memberships. Scheduler traces, when triggered, add run/blocked/wakeup edges around the submit path. Only relationships supported by runtime semantics or observed wait/handoff evidence participate in the critical-path DAG; temporal associations and learned correlations remain annotations.


Critical-path/localization logic: for a suspicious request, find the dependency paths that can reach request completion and identify the critical/near-critical nodes and wait edges. Compare them with a matched healthy execution or matched expected performance surface. Rank excess time where the bad request gained delay: host runnable-but-not-running delay, queue wait, launch gap, synchronization wait, transfer/overlap loss, stream serialization, shared batch delay, kernel execution regression, or communication. Critical-path “blame” is a localization score and evidence summary, not causal proof. Shared/concurrent work receives shared or uncertain attribution, and final engineering causality still requires discriminating measurement or controlled validation.


Semantic mapping: implement framework-specific adapters that emit stable semantic operation/context IDs and propagate them through framework/C++ boundaries to runtime correlation points. Join those IDs to CUDA API and GPU activity nodes in the generic graph. Store semantic containment separately from execution dependency. Support many framework ops → one fused kernel and one op → many kernels/transfers. Keep lightweight request/stage semantics cheap; enable richer operator/tensor/source mapping only around suspicious regions. The schema remains framework-neutral so a second adapter does not require rewriting the localization engine.


Always-on versus triggered collection: always-on keeps request/control-step IDs, stage timings, queue/batch/concurrency context, cheap CPU/GPU state, low-cost counters, clock-alignment anchors, and the minimum correlation metadata needed to preserve a sparse execution skeleton. A bounded local ring buffer may keep richer recent runtime/GPU event metadata temporarily when its measured overhead is acceptable. Suspicious executions preserve that buffer and materialize the richer request graph; unresolved cases trigger scheduler trace, detailed API/kernel timeline, framework-semantic enrichment, or deeper profiler evidence for a subsequent comparable execution. Continuous full-graph construction and continuous deep semantic tracing are rejected for the fast path.


Baselines: retain lagged host↔GPU cross-correlation as a cheap non-causal baseline/fallback; retain timestamp-only timeline inspection as a lower-bound structural baseline; compare triggered sparse-graph localization with full-trace/full-profile oracle runs in experiments. Dynamic-roofline classification remains part of the selected GPU fast path but is not the source-localization baseline.


Deferred mechanisms: continuously materialized full heterogeneous graphs; always-on deep framework/tensor attribution; broad multi-framework adapters beyond the first portability validation; exact decomposition of shared-kernel service time across overlapping requests when no observable dependency supports it; and learned causal-graph claims from observational timing alone. These can be revisited after Pass 5 establishes overhead, completeness, and attribution error bounds.


## Architecture Decision Records


ADR — Canonicalize cross-layer execution as a request-scoped dependency DAG view over shared execution
Choice: use a shared heterogeneous execution graph with a request-specific dependency DAG and explicit shared nodes for batching/concurrent work.
Alternatives: flat per-request timeline; independent CPU and GPU traces; one duplicated graph per request; framework-specific call tree as the canonical model.
Reason: it preserves asynchronous launch, stream, synchronization, transfer, batching, and cross-thread semantics while allowing Reflex to distinguish host-induced GPU idle from true GPU execution regressions.
Assumptions: request/context propagation, runtime/GPU correlation IDs, batch membership, and enough event evidence are available.
Trade-offs: reconstruction complexity, partial graphs when events are missing, and nontrivial handling of shared work.
Validation: fault-injection benchmark across concurrency/batching regimes with a full-trace oracle; measure cause recovery, graph completeness, attribution stability, and observer overhead.
Revisit when: graph completeness or overhead prevents stable localization in the target runtime.


ADR — Materialize rich graphs only for suspicious executions
Choice: keep a sparse always-on skeleton and bounded temporary evidence; preserve/materialize a richer graph after a trigger.
Alternatives: continuous full graph; tail-only deep profiling without retrospective evidence; no graph until the next reproduction.
Reason: the target loop is already low latency, so continuous detailed reconstruction risks perturbing the system; Hindsight-style buffering preserves pre-symptom evidence without permanent full cost.
Assumptions: trigger latency is short enough to retain the relevant buffer and suspicious executions are reproducible often enough to escalate when evidence is missing.
Trade-offs: the first rare incident may lack some edges; ring-buffer collection still has measurable overhead and memory cost.
Validation: sweep buffer depth/event fidelity and measure recovered cause accuracy versus overhead and bytes retained.
Revisit when: important one-shot incidents routinely lose necessary evidence or a much cheaper tracing primitive makes continuous graphing safe.


ADR — Prefer dependency evidence over lagged correlation
Choice: observed enqueue/wait/order/handoff dependencies dominate cause localization; lagged correlation is supporting INFERRED evidence.
Alternatives: host↔GPU cross-correlation as primary RCA; purely statistical feature attribution; timestamp ordering.
Reason: correlation cannot reliably separate common causes, concurrency, and batching from true blocking relationships.
Assumptions: at least partial structural evidence can be collected for suspicious regions.
Trade-offs: structural evidence costs more and may be incomplete; correlation remains useful when those edges are absent.
Validation: remove dependency features and compare false positives/Top-k recovery under controlled host and GPU faults.
Revisit when: direct dependency capture proves too incomplete or expensive, or correlation achieves unexpectedly strong controlled-fault precision across regimes.


ADR — Use critical path for differential localization, not causal proof
Choice: compute request-relative critical/near-critical paths from observed dependencies and rank excess delay versus matched healthy behavior.
Alternatives: longest-duration-node blame; global critical path across all requests; no critical-path reasoning.
Reason: request completion depends on a subset of waits/execution, and excess delay on that path is more diagnostic than raw duration, but shared-resource and concurrency effects prevent interpreting path membership as proof of causality.
Assumptions: the dependency graph contains the important waits and shared nodes are represented explicitly.
Trade-offs: missing edges can move the apparent critical path; resource contention may be causal without a direct request-local edge.
Validation: compare computed blame with known injected cause and measured intervention benefit under rising concurrency.
Revisit when: path stability collapses under shared-resource contention or intervention results systematically disagree with critical-path rankings.


ADR — Keep dynamic roofline as broad bottleneck classification
Choice: use dynamic-roofline-style features to classify broad compute/memory/host-feed/launch/sync/transfer regimes and choose the next measurement.
Alternatives: treat roofline class as source attribution; omit broad classification and jump directly to deep profiling.
Reason: it is information-efficient for triage but cannot identify the exact source of host-induced or dependency-induced GPU inefficiency.
Assumptions: cheap counters and phase signals are sufficiently calibrated for the workload/hardware context.
Trade-offs: hardware/workload drift and correlated symptoms can reduce class accuracy.
Validation: multi-fault confusion matrix, calibration, cross-version/hardware transfer, and profiler-action savings.
Revisit when: classification adds little measurement-selection value or becomes accurate enough to replace specific higher-cost first-stage tests.


ADR — Attach framework semantics through adapters, not through the canonical graph schema
Choice: keep a framework-neutral execution graph and join high-level operations through adapter-generated semantic/context IDs.
Alternatives: make a PyTorch/TensorFlow/JAX-specific call tree canonical; rely only on kernel names; defer semantic mapping entirely to deep profiling.
Reason: actionability requires high-level attribution, but the structural localization engine should remain portable and correct when framework internals change.
Assumptions: adapters can preserve context through C++/runtime boundaries with acceptable completeness and overhead.
Trade-offs: adapter engineering cost, fusion/compiled-path ambiguity, and many-to-many mappings.
Validation: semantic-link precision/completeness and overhead across eager/fused, multi-stream, multi-thread, overlapping-request, and batched cases; then second-runtime portability check.
Revisit when: framework-specific maintenance outweighs diagnostic benefit or a standardized cross-layer semantic correlation facility emerges.


## Open uncertainties / Pass 5 questions


1. What is the minimum event set that preserves correct host→CUDA→GPU dependencies at acceptable overhead on the actual prototype stack, especially for CUDA graphs, compiled/fused execution, and multiple streams?
2. How accurately can GPU and host clocks be aligned over the latency windows Reflex cares about, and what timestamp-uncertainty threshold should force an edge to remain unknown?
3. How should request membership and delay contribution be represented when one batch, fused kernel, collective, or shared service node serves several overlapping requests with different ready times and deadlines?
4. How much event loss can the graph tolerate before critical-path rankings become unreliable, and how should graph-confidence degrade as correlation/API/scheduler events go missing?
5. Under real concurrency, does request-relative critical-path excess correlate with measured intervention benefit, or do hidden shared-resource effects require an additional contention model outside the DAG?
6. What always-on ring-buffer fidelity is safe for an approximately 30 ms-class control loop after observer-effect calibration?
7. Which framework/runtime should be the first semantic adapter, and what mapping completeness is achievable under eager, compiled, fused, and dynamically batched paths?
8. Can a second framework/runtime reuse the same node/edge schema with only adapter changes, or does semantic portability require a smaller common denominator?
9. When structural evidence is missing, how much incremental value does lagged host↔GPU correlation provide after matched-baseline and context controls, and what false-positive rate is acceptable for triggering more measurement?
10. Should suspect-subgraph extraction use a fixed dependency radius, a time/slack envelope, or an adaptive boundary chosen by the information-value engine?


PASS 3 DECISION LOG — GPU Deep / Source-Level Diagnosis
Current Reflex approach
Reflex enters this pass only after the existing fast path has already produced strong evidence that GPU inference is responsible for the regression. The upstream architecture already supplies matched healthy comparison, dynamic-roofline broad classification, request-centric CPU↔GPU dependency context, TELLER/DeepContext-style framework→CUDA→kernel mapping, explicit competing hypotheses, and active measurement selection. Deep GPU profiling therefore has one job: convert a justified GPU suspicion into the most actionable useful explanation without paying instruction-level cost by default.


The escalation boundary is strict. Normal executions pay no deep-profiler cost. Triggered executions may pay targeted sampling/profiling cost when expected information gain is high. Static analysis, dataflow reconstruction, symbolization, causal slicing, and cross-run comparison may continue offline after collection. Profiler results remain OBSERVED evidence; attribution chains are INFERRED until a controlled intervention verifies the engineering cause.


Pass 2 GEM / KEEP / DROP / U labels are provenance only and do not drive these dispositions.


Candidate decision matrix


Candidate
	Relation
	Scores DV/IE/RF/PF/RB/AU
	Disposition
	Why
	Key assumption/trade-off
	Evidence that could change the decision
	C45 — LEO PC sampling + backward causal slicing
	augment
	5/4/3/2/2/4
	ADOPT
	Deepest dependency/producer localization; use only after source attribution leaves low-level ambiguity.
	Requires stable PC/SASS identities, reproducible runs, and sufficiently complete dependencies; high triggered/offline slicing cost.
	Demote if slices are unstable or rarely change the fix beyond C46/C50; strengthen if they resolve otherwise ambiguous incidents.
	C46 — GPA PC/stall sampling + dataflow/source attribution
	augment
	5/5/4/4/3/4
	ADOPT
	Best first deep profiler: targeted samples bridge broad GPU localization to actionable kernel/source/dataflow evidence.
	Needs hardware PC sampling plus usable source/binary mapping; JIT/fusion can degrade attribution.
	Replace if sampling/mapping coverage is poor, or a simpler baseline reaches equal verified-cause/actionability quality for lower cost.
	C47 — HPCToolkit PC sampling + source/call mapping
	duplicate
	4/4/4/4/4/5
	BASELINE
	Strong auditable source/call-context baseline and fallback, but less causal/dataflow depth than C46.
	Depends on debug/binary metadata and supported toolchain; avoids custom analysis but may stop at localization.
	Promote if it matches C46 actionability/robustness with lower implementation cost.
	C48 — GPUscout static SASS + warp-stall sampling
	augment
	4/4/3/3/3/4
	BASELINE
	Useful fallback for generated/fused or poorly symbolized kernels, especially memory/data movement.
	SASS must be available/stable; architecture-specific static reasoning risks portability and semantic disconnect.
	Promote if source mapping fails often and SASS analysis reliably recovers actionable causes across target GPUs.
	C49 — DrGPU top-down stall accounting
	duplicate
	3/5/4/4/3/5
	BASELINE
	Compact “where cycles went” sanity baseline; stall categories are not causal root-cause explanations.
	Assumes stable stall categories/source hierarchy; excellent auditability but limited actionability.
	Promote only if it matches deeper tools on verified-cause recovery and correct fix choice at materially lower cost.
	C50 — TenProf-style tensor/operator root-cause attribution
	augment
	5/4/3/3/3/4
	ADOPT
	Semantic branch maps low-level memory/stall evidence to operator/tensor/layout transformations that ML engineers can change.
	Requires operator/tensor lineage and reliable kernel↔framework mapping through fusion/JIT; not suited to genuinely low-level custom-kernel causes.
	Narrow if mapping coverage is poor; strengthen if semantic attribution consistently reduces steps to verified fixes.
	C51 — GPU Stall Inspector cycle-level stall classification
	conflict
	2/1/1/1/2/4
	REJECT
	Simulator-heavy cycle classification conflicts with runtime fit and still does not localize an actionable causal producer/tensor/operator.
	Detailed simulated pipeline must match deployed hardware; very high offline cost and portability risk.
	Revisit only if a practical hardware-backed version gives comparable detail at acceptable triggered cost and improves verified-cause recovery.
	C52 — KPerfIR-like compiler/IR intrakernel regional probes
	augment
	4/2/2/2/3/5
	DEFER
	Precise rescue for sampling blind spots, but too intrusive/compile-dependent for the default ladder.
	Requires controllable reproducible compile/JIT path and measured observer effect; very high triggered/offline cost.
	Promote if Pass 5 shows persistent sampling/mapping blind spots and stable bounded-perturbation IR instrumentation.
	Candidate records
Candidate paper/mechanism guide


C45 — LEO. Paper: LEO: Tracing GPU Stall Root Causes via Cross-Vendor Backward Slicing.
What it is: LEO starts from GPU instructions that are observed to stall and walks backward through register/data dependencies and synchronization relationships to identify the producer instruction or dependency chain that caused the stall. Its key contribution is moving from “where the stall appeared” to “what upstream low-level behavior produced it.”
What Reflex borrows: the backward-slicing idea as the deepest conditional escalation after a kernel/source region is already localized. Reflex does not need to reproduce every implementation detail of LEO to use this architecture.
Why ADOPT: stall labels alone are not causal localization. LEO-style slicing can resolve cases where C46 has found the affected region but the responsible producer/dependency remains ambiguous. It is not first-line because it needs stable instruction identities, reproducible runs, and more expensive dependency reconstruction.


C46 — GPA. Paper: GPA: A GPU Performance Advisor Based on Instruction Sampling.
What it is: GPA uses GPU PC/instruction sampling to observe where stalls occur, maps samples back to program structure, and applies dataflow analysis to approximately attribute those stalls to the instructions and source regions that produce the inefficiency. It then connects the findings to optimization opportunities.
What Reflex borrows: targeted PC/stall sampling plus source mapping and dataflow attribution, used differentially between healthy and regressed runs.
Why ADOPT: this gives the best first deep-profiler trade-off. It is substantially more actionable than counters or stall classes, but cheaper and easier to operationalize than full backward slicing or compiler instrumentation. That makes it the bridge from “GPU/kernel is suspicious” to “this source/dataflow region is likely responsible.”


C47 — HPCToolkit. Paper: Measurement and Analysis of GPU-accelerated Applications with HPCToolkit.
What it is: HPCToolkit collects GPU performance measurements, including PC samples where supported, and attributes them to heterogeneous CPU/GPU calling contexts and program structure such as source lines, loops, functions, and inlined code.
What Reflex borrows: a mature PC-to-source/call-context mapping path and a reference implementation for auditable attribution.
Why BASELINE: it is a strong simpler comparator and practical fallback, but its core value is localization and context attribution rather than the deeper producer/dataflow explanation Reflex wants from C46. If it proves equally actionable in the target stack, Reflex should prefer the simpler tool.


C48 — GPUscout. Paper: GPUscout: Locating Data Movement-related Bottlenecks on GPUs.
What it is: GPUscout combines static NVIDIA SASS analysis, warp-stall PC sampling, and kernel performance metrics to identify data-movement and memory bottlenecks and point to the responsible instruction/code segment.
What Reflex borrows: the combination of sampled runtime stall evidence with static SASS reasoning, especially when source/debug mapping is weak.
Why BASELINE: it is useful for generated, fused, or poorly symbolized kernels and memory/data-movement faults, but it is architecture-specific and less semantically portable than the primary runtime attribution path. It is therefore a fallback/benchmark rather than the default deep profiler.


C49 — DrGPU. Paper: DrGPU: A Top-Down Profiler for GPU Applications.
What it is: DrGPU decomposes GPU execution inefficiency into a hierarchy of stall categories using hardware performance counters, then maps those costs down a performance-analysis tree toward source code and optimization suggestions.
What Reflex borrows: top-down stall accounting as a compact “where did cycles go?” sanity check.
Why BASELINE: DrGPU is information-efficient and auditable, but a stall category is not the same thing as a causal engineering explanation. Reflex needs to know which instruction/dataflow, tensor transformation, operator, or dependency should change. C49 therefore benchmarks whether the deeper machinery earns its cost.


C50 — TenProf. Paper: TenProf: A Tensor-Centric Profiler for Deep Learning Workload Analysis and Optimization.
What it is: TenProf connects deep-learning tensor/operator semantics to low-level GPU behavior. It records tensor transformation history and joins it with kernel/hardware evidence so a symptom such as memory stalls can be traced back to an earlier transformation—for example, a transpose that produced a non-contiguous layout and poor coalescing.
What Reflex borrows: semantic lifting from kernel/PC-level evidence to operator, tensor, shape/stride/layout, and transformation lineage.
Why ADOPT: for ML engineers this can be more actionable than instruction-level diagnosis because the controllable cause often lives in the framework graph or tensor layout. TenProf is therefore a complementary branch to LEO, not a competitor: use TenProf when the fix is likely semantic/tensor-level; use LEO when the cause remains inside low-level kernel dependencies.


C51 — GSI / GPU Stall Inspector. Paper: GSI: A GPU Stall Inspector to Characterize the Sources of Memory Stalls for Tightly Coupled GPUs.
What it is: GSI uses detailed simulated CPU-GPU pipeline and memory-system state to classify GPU memory-stall cycles by architectural source with much finer visibility than ordinary hardware profiling.
What Reflex borrows: only the conceptual lesson that “stall type” and “root cause” are different levels of explanation.
Why REJECT: the mechanism depends on detailed simulation, which is incompatible with Reflex’s runtime-escalation goal and deployed-hardware portability. Even with excellent cycle classification, it still may not identify the actionable source/tensor/dependency that should change. It can remain a research reference, not a runtime component.


C52 — KPerfIR. Paper: KPerfIR: Towards an Open and Compiler-centric Ecosystem for GPU Kernel Performance Tooling on Modern AI Workloads.
What it is: KPerfIR integrates profiling markers and measurement operations into a multi-level compiler IR, demonstrated in Triton/MLIR, so tools can measure performance inside selected kernel regions while retaining compiler semantics and lowering to GPU-specific mechanisms.
What Reflex borrows: the idea of compiler-aware, region-specific intrakernel probes as a rescue path for kernels where non-intrusive sampling and source mapping cannot resolve the remaining question.
Why DEFER: the evidence can be precise, but Reflex would need control of the compile/JIT path, recompilation, reproducible reruns, and careful perturbation calibration. It is too intrusive and toolchain-specific for the default ladder, but valuable enough to reserve for compiler-owned generated kernels when sampling fails.


C45 — LEO PC sampling + backward causal slicing
Source provenance: R6-M2 + R8-M9; source labels GEM ×1, U ×1.
Relation to current Reflex: augment.
Scores (DV/IE/RF/PF/RB/AU): 5/4/3/2/2/4. Disposition: ADOPT as deepest conditional escalation.
Assumptions: NVIDIA/CUDA-like hardware PC sampling is accessible; stalled PCs can be associated with stable SASS/instruction identities; the profiled execution is reproducible enough that samples and dependency relationships are representative; synchronization/dependency reconstruction is sufficiently complete; optimized/JIT code has enough binary metadata to preserve instruction identity even when source mapping is weak.
Cost profile: normal execution — none; triggered — high relative to Level A sampling because multiple samples/runs and dependency reconstruction may be required; offline — high for backward slicing and explanation construction.
Strongest benefit: it can move beyond “this instruction stalls” to “this upstream producer/dependency/synchronization relation is the low-level reason the consumer stalls,” which is the deepest mechanism in the registry for instruction/dependency localization.
Strongest cost/failure mode: backward slices can be incomplete, unstable, or misleading under aggressive optimization, fusion, dynamic code generation, unobserved dependencies, or non-reproducible timing. A detailed slice can still be non-actionable if the real fix lives at tensor/operator level.
Rationale: Reflex should keep LEO-style analysis because stall classification alone is not causal localization. But it should run only after cheaper PC/source attribution has identified a specific kernel/source region and uncertainty remains about the responsible producer/dependency.
Validation experiment: inject or construct paired healthy/regressed kernels with known dependency-chain, memory-latency, and synchronization causes; compare C45 against C46 on correct responsible-instruction/producer recovery, stability across repeated runs, observer overhead, analysis cost, and improvement in chosen fix.
Revisit trigger: demote if slices are unstable across repeats/hardware, rarely change the engineering action beyond C46/C50, or require unavailable hardware metadata; strengthen if it consistently resolves otherwise ambiguous kernel/source diagnoses.


C46 — GPA PC/stall sampling + dataflow/source attribution
Source provenance: R6-M3 + R8-M1; source labels KEEP ×2.
Relation to current Reflex: augment.
Scores (DV/IE/RF/PF/RB/AU): 5/5/4/4/3/4. Disposition: ADOPT as the primary first deep profiler.
Assumptions: hardware PC/stall sampling is exposed and safe enough to use on targeted runs; kernel PCs can be mapped to source or at least stable binary regions; debug/line information is available often enough for source attribution; dataflow recovery is accurate enough to connect expensive instructions/regions to code; sampling perturbation is measurable.
Cost profile: normal execution — none; triggered — moderate, because sampling can be targeted to suspicious kernels/runs; offline — moderate for symbolization, dataflow, differential healthy-vs-regressed attribution, and report generation.
Strongest benefit: best balance of diagnostic depth and information efficiency. It directly answers which kernel, PCs/stall reasons, source region, and producing dataflow are associated with the regression without immediately paying causal-slicing or compiler-instrumentation cost.
Strongest cost/failure mode: source mapping can collapse for fused/JIT/generated kernels, stripped binaries, or weak line tables; PC/stall correlation can be mistaken for root cause if Reflex reports a stall class instead of the dataflow/source evidence and later validation.
Rationale: this is the right bridge from broad GPU localization to actionable kernel/source diagnosis, and should be the default deep action selected by the information-value engine when a specific slow kernel or kernel set remains unexplained.
Validation experiment: on matched healthy/regressed executions with injected kernel-level faults, measure Top-1/Top-3 source-region recovery, actionability, sample count to stable ranking, repeatability, perturbation, and incremental diagnosis value over Level-2 timeline/counters.
Revisit trigger: replace as primary only if hardware access, mapping coverage, or stability is too poor in the actual Reflex stack, or if a simpler baseline reaches equal source/root-cause recovery at materially lower cost.


C47 — HPCToolkit PC sampling + source/call mapping
Source provenance: R6-M4 + R8-M4; source labels KEEP ×2.
Relation to current Reflex: duplicate.
Scores (DV/IE/RF/PF/RB/AU): 4/4/4/4/4/5. Disposition: BASELINE.
Assumptions: sampled addresses can be symbolized through binary/debug metadata; calling context remains meaningful for the kernel launch path; tool support exists for the deployed CUDA/driver/GPU generation.
Cost profile: normal execution — none; triggered — moderate; offline — moderate for symbolization/calling-context reconstruction.
Strongest benefit: a mature, auditable PC-sampling/source/call-context reference point that can show whether Reflex really needs custom dataflow attribution.
Strongest cost/failure mode: it overlaps heavily with C46 but generally stops closer to “where samples landed” than “which producer/dataflow caused the inefficiency.” It can therefore localize well without producing the best engineering explanation.
Rationale: use as an experimental baseline and practical fallback when C46 dataflow analysis is unavailable. Do not make Reflex depend on two primary PC-sampling stacks.
Validation experiment: same-budget A/B against C46 on source-line/function recovery, stability, call-context usefulness, analysis latency, and whether the final recommended fix changes.
Revisit trigger: promote if it matches C46 diagnostic/actionability quality with better robustness/tooling coverage; demote if source/call mapping adds little beyond simple profiler output.


C48 — GPUscout static SASS + warp-stall sampling
Source provenance: R8-M2; source label KEEP.
Relation to current Reflex: augment.
Scores (DV/IE/RF/PF/RB/AU): 4/4/3/3/3/4. Disposition: BASELINE.
Assumptions: the target kernel binary/SASS can be captured; warp-stall samples can be aligned with static instructions; relevant performance pathology is visible in memory/data-movement or instruction patterns; binary identities remain stable enough across builds/runs.
Cost profile: normal execution — none; triggered — moderate; offline — moderate/high for static SASS analysis and sample alignment.
Strongest benefit: useful when source mapping is weak or the kernel is generated/fused but SASS is available, especially for memory/data-movement explanations.
Strongest cost/failure mode: static SASS reasoning is architecture-specific, narrower than general runtime attribution, and can identify suspicious instruction regions without proving which upstream semantic transformation created them.
Rationale: keep as a benchmark/fallback for generated or poorly symbolized kernels rather than a first-line deep profiler.
Validation experiment: evaluate on kernels with intentionally removed source/debug metadata and on fused/JIT cases; compare recovery/actionability against C46/C47 and measure cross-GPU-generation brittleness.
Revisit trigger: promote to fallback production path if source mapping fails frequently and SASS analysis recovers useful causes reliably; demote if architecture churn makes static analysis too fragile.


C49 — DrGPU top-down stall accounting
Source provenance: R8-M3; source label KEEP.
Relation to current Reflex: duplicate.
Scores (DV/IE/RF/PF/RB/AU): 3/5/4/4/3/5. Disposition: BASELINE.
Assumptions: lost cycles can be partitioned into stable architectural categories and recursively mapped to source hierarchy; category semantics remain comparable enough across GPU generations.
Cost profile: normal execution — none; triggered — low/moderate relative to deeper causal tools; offline — low/moderate.
Strongest benefit: compact, highly auditable “where did cycles go?” accounting that is useful as a sanity check and explanation baseline.
Strongest cost/failure mode: stall accounting is not causal root-cause localization. “Memory stalls dominate here” can still leave the engineer with no explanation of which dependency, tensor transformation, access pattern, or upstream operator should change.
Rationale: use to benchmark whether more complex attribution actually produces extra engineering value, not as the primary deep diagnosis.
Validation experiment: compare DrGPU-style top-down reports with C46/C50/C45 on hidden-cause incidents and score not just bottleneck classification but correct engineering-fix selection.
Revisit trigger: promote only if top-down attribution reaches comparable verified-cause recovery and actionability at much lower cost.


C50 — TenProf-style tensor/operator root-cause attribution
Source provenance: R8-M8 + R8-M11; source labels U ×2.
Relation to current Reflex: augment.
Scores (DV/IE/RF/PF/RB/AU): 5/4/3/3/3/4. Disposition: ADOPT as the semantic deep branch.
Assumptions: framework/operator/tensor lineage is captured; kernel launches can be mapped back through fusion/generated-code boundaries with useful confidence; tensor metadata such as shape/stride/layout/contiguity and transformations is available; the low-level stall/memory behavior is meaningfully caused by upstream tensor/operator choices.
Cost profile: normal execution — no deep profiling cost beyond metadata already justified by cross-layer context; triggered — moderate/high to join framework/tensor lineage with kernel/PC evidence; offline — moderate for lineage reconstruction and counterfactual explanation.
Strongest benefit: often produces the most actionable explanation for ML engineers: not merely a slow instruction, but the earlier tensor/operator/layout transformation that created the bad access pattern or expensive kernel behavior.
Strongest cost/failure mode: fusion, opaque vendor kernels, graph compilers, JIT code, custom kernels, and missing tensor lineage can make semantic attribution ambiguous or wrong. It is not the right tool when the root cause truly lives inside handwritten low-level kernel logic.
Rationale: TenProf and LEO are complementary branches. Prefer C50 when an upstream semantic cause is plausible and actionable; prefer C45 only when the problem remains below that layer.
Validation experiment: inject known transpose/permute/non-contiguous-layout, fusion-choice, and operator-selection regressions; require recovery of the responsible earlier transformation, not merely the final kernel or stall class, and compare resulting fix quality with instruction-only diagnosis.
Revisit trigger: narrow or demote if operator/tensor mapping coverage is poor in the chosen framework/compiler stack; strengthen if semantic diagnoses consistently reduce steps to verified fixes.


C51 — GPU Stall Inspector cycle-level stall classification
Source provenance: R8-M6; source label DROP.
Relation to current Reflex: conflict.
Scores (DV/IE/RF/PF/RB/AU): 2/1/1/1/2/4. Disposition: REJECT for the Reflex runtime architecture.
Assumptions: detailed simulated pipeline state faithfully represents deployed hardware and workload behavior; simulation overhead is acceptable as an offline diagnostic oracle.
Cost profile: normal execution — incompatible; triggered — effectively prohibitive for runtime escalation if simulation is required; offline — very high.
Strongest benefit: detailed architectural accounting can be useful as research ground truth for understanding stall categories.
Strongest cost/failure mode: simulator dependence breaks runtime fit and portability, while cycle-level stall labels still do not necessarily identify an actionable source/tensor/dependency cause.
Rationale: the current architecture explicitly avoids simulator-heavy primary diagnosis. Keep the conceptual distinction between stall categories and causes, but do not build GSI into the runtime escalation ladder.
Validation experiment: none required for adoption; if used in research, compare its offline classifications with real-hardware sampled evidence on a small benchmark to assess oracle value.
Revisit trigger: only if a practical hardware-backed implementation provides comparable detail with acceptable triggered cost and demonstrably improves verified-cause recovery.


C52 — KPerfIR-like compiler/IR intrakernel regional probes
Source provenance: R4-M11; source labels DROP + GEM.
Relation to current Reflex: augment.
Scores (DV/IE/RF/PF/RB/AU): 4/2/2/2/3/5. Disposition: DEFER; reserve as an exceptional rescue path.
Assumptions: Reflex controls or can reproduce the compile/JIT pipeline; kernels can be recompiled/instrumented without changing the relevant behavior; IR regions retain useful correspondence to generated machine code; observer effect can be quantified; the issue is stable enough for controlled reruns.
Cost profile: normal execution — none; triggered — very high because recompilation/instrumentation and rerun are required; offline — high for probe planning and interpretation.
Strongest benefit: precise intrakernel regional evidence when sampling/source mapping is unavailable or insufficient, especially for generated kernels with a controllable compiler pipeline.
Strongest cost/failure mode: instrumentation can perturb the very bubbles/timing being diagnosed, requires compiler/JIT integration, and is poorly suited to opaque vendor kernels or production-only binaries.
Rationale: do not reject the idea outright, because it can solve cases that sampling cannot. But it should not be in the default prototype ladder. Reserve it for controlled, reproducible, compiler-owned kernels after non-intrusive approaches fail.
Validation experiment: on a controllable generated-kernel benchmark, compare instrumented-region localization with C46/C45 under identical hidden faults; quantify perturbation and whether the result changes the fix.
Revisit trigger: promote only if Pass 5 shows sampling coverage/source mapping is a persistent blocker and controlled IR instrumentation can be made stable with bounded perturbation.


Head-to-head decisions
LEO vs GPA-style attribution: GPA-style C46 wins the first-deep-profiler role because it reaches kernel/source/dataflow attribution at lower conceptual and implementation cost. LEO-style C45 is not a competitor for first use; it is the next escalation when a source region is known but the responsible producer/dependency remains ambiguous. C46 answers “where and what kind of inefficient instruction/dataflow?”; C45 answers “what low-level dependency chain actually produces the stall?”


GPA vs HPCToolkit: C46 is primary because dataflow/source attribution is closer to the engineering question than PC-to-source/call mapping alone. C47 is the strongest baseline/fallback because its simpler attribution is more auditable and may prove sufficient. The prototype should explicitly test whether custom GPA-like dataflow logic earns its extra complexity over HPCToolkit-style mapping.


GPUscout vs dynamic/runtime profilers: dynamic PC/stall evidence should be primary because Reflex diagnoses a runtime regression under a specific workload. GPUscout-style static SASS analysis is valuable when source symbols are poor, kernels are generated/fused, or the remaining hypothesis is specifically memory/data movement. Static analysis should explain sampled runtime hot regions, not replace runtime evidence.


DrGPU stall accounting vs deeper causal attribution: C49 is a compact baseline, not a causal diagnosis. It can say which source subtree accumulated memory/control/ALU stall cost; C46/C50/C45 must be judged by whether they correctly identify the instruction/dataflow, semantic transformation, or dependency that an engineer can change. Reflex must never upgrade a stall category directly into a verified root cause.


TenProf semantic/tensor diagnosis vs instruction-level diagnosis: C50 should win whenever the suspected mechanism is created by tensor layout, shape/stride, fusion, operator choice, or another framework-visible transformation. An explanation such as “permute produced a non-contiguous tensor that degraded coalescing” is more actionable than a SASS dependency chain. C45 wins when the semantic layer is absent/unreliable or when the fault lives inside custom low-level kernel logic. They are complementary branches, not competitors.


Sampling vs compiler/instrumentation: sampling is the default because it preserves the current architecture’s observer-effect discipline and can be targeted after GPU localization. C52-like IR probes are reserved for reproducible compiler-owned kernels when sampling/source mapping cannot discriminate the remaining hypotheses. Intrusive instrumentation is a last-resort evidence acquisition action, not a standing profiler mode.


Selected architecture
Deep-GPU entry gate — no deep profiler yet.
Trigger: broad GPU localization is already strong: matched healthy comparison shows GPU execution explains a material share of the regression; CPU starvation/launch/synchronization alternatives have been reduced enough that deeper GPU evidence has positive expected value; a suspicious kernel/operator set exists; and the behavior is reproducible enough for targeted profiling. Selected mechanisms: existing C34/C40/C43/C44-style escalation, dependency context, and semantic mapping. Output: explicit residual hypotheses plus the exact missing evidence. Fallback: stay at broad GPU/system diagnosis and run host/timeline/counter measurements instead of forcing a deep GPU explanation.


Level A — targeted PC/stall-to-source evidence.
Trigger: one or a small number of kernels plausibly explain the GPU regression, but broad counters/timelines cannot distinguish memory latency/cache, instruction mix/dataflow, or an intra-kernel regression. Primary mechanism: C46 GPA-style PC/stall sampling + dataflow/source attribution. Expected output: slow-vs-healthy differential over kernel PCs/stall reasons; ranked source regions/instructions; associated dataflow/producer evidence; mapping confidence and sample stability. Fallback: C47 HPCToolkit-style source/call mapping when custom dataflow analysis is unavailable; C48 GPUscout-style SASS analysis when source/debug mapping is weak and binary/SASS is available. Experimental baseline: C49 DrGPU top-down stall accounting.


PC/stall sampling is sufficient when the regression signal is concentrated in a stable kernel/source region, repeat runs preserve the ranking, the stall/dataflow evidence discriminates the active hypotheses, the resulting source-level change is actionable, and neither tensor-lineage evidence nor unresolved dependency ambiguity is likely to change the fix. Reflex should then stop profiling and move to controlled validation. “High memory stalls” alone is not sufficient.


Level B — semantic lift to operator/tensor cause when high-level actionability is plausible.
Trigger: Level A points to memory/access/layout behavior or a generated/fused kernel, and cross-layer metadata can connect the kernel to framework operators/tensors. Selected mechanism: C50 TenProf-style tensor/operator attribution. Expected output: operator/tensor lineage from the low-level symptom back to the earlier transformation that created it, with mapping confidence and an engineering action at the framework/model level. Fallback: if fusion/JIT/vendor opacity breaks the mapping, retain the Level-A source/SASS explanation and either validate it directly or escalate to Level C if a low-level dependency question remains.


Level C — instruction/dependency causal localization.
Trigger: Level A has localized a kernel/source region but cannot distinguish competing low-level producer/dependency/synchronization explanations; Level B is unavailable, low-confidence, or not the layer where a fix can be made; the execution is reproducible; and the expected information gain justifies substantially higher analysis cost. Selected mechanism: C45 LEO-style backward causal slicing. Expected output: stalled consumer PC → relevant dependency/synchronization edges → responsible producer/instruction chain → source/SASS location, with explicit uncertainty for missing edges. Fallback: report the deepest supported source/SASS localization and abstain from stronger causal claims rather than treating a stall class as root cause.


Exceptional rescue — compiler/IR instrumentation, not part of the default ladder.
Trigger: sampling or mapping is unavailable/insufficient, Reflex controls the compile/JIT path, the kernel can be reproducibly recompiled, and the remaining uncertainty is intrakernel. Deferred mechanism: C52 KPerfIR-like probes. Expected output: instrumented IR region(s) associated with bubbles/pathology and quantified observer effect. Fallback: controlled source/kernel experiments or vendor profiler evidence. This path remains deferred until Pass 5 establishes feasibility and perturbation bounds.


Experimental baselines and rejected methods: C47 HPCToolkit, C48 GPUscout, and C49 DrGPU are baselines/fallbacks rather than independent primary branches. C51 GPU Stall Inspector is rejected from the runtime architecture because simulator-heavy cycle classification conflicts with runtime fit and does not solve causal/actionable attribution by itself.


Active-measurement selector evidence gates
C46: require strong GPU culpability, a bounded suspicious kernel set, unresolved intra-kernel hypotheses, available hardware PC/stall sampling, repeatable enough execution, and an observer-overhead budget. Prefer matched healthy and regressed runs so attribution is differential rather than absolute.
C47: invoke when C46 dataflow machinery is unavailable/low-confidence or when source/call-context mapping itself would discriminate the hypotheses; require usable binary/debug metadata.
C48: invoke when source mapping is weak but SASS is available, especially for memory/data-movement hypotheses in generated/fused kernels; require binary identity stability.
C49: use primarily in experiments or as a low-cost sanity check; never select it merely because a stall category is easy to collect.
C50: require a memory/access/layout or framework-semantic hypothesis, available tensor/operator lineage, and enough kernel↔operator mapping confidence that the output can identify an upstream action.
C45: require source/kernel localization already achieved, residual low-level dependency ambiguity, reproducible profiled execution, stable PC/instruction identities, and expected diagnostic gain greater than the higher slicing cost.
C51: do not invoke in the runtime ladder.
C52: require failure/insufficiency of non-intrusive methods plus controllable compilation, reproducible reruns, and an explicit perturbation-measurement plan.


Architecture Decision Records
ADR — GPA-style PC/stall attribution is the first deep GPU profiler
Choice: ADOPT C46 as Level A primary.
Alternatives: C47 HPCToolkit; C49 DrGPU; immediate C45 LEO; full intrusive instrumentation.
Reason: C46 offers the best expected ratio of actionable kernel/source information to triggered cost and naturally extends the existing active-measurement architecture.
Assumptions: hardware sampling and acceptable PC/source mapping are available often enough.
Trade-offs: custom dataflow/source attribution adds implementation complexity and hardware/toolchain dependence.
Validation: hidden-fault matched healthy/regressed benchmark measuring correct source-region recovery, steps to verified cause, sample stability, and profiler overhead against C47/C49.
Revisit when: sampling access/mapping coverage is poor or a simpler baseline matches actionability at lower cost.


ADR — TenProf and LEO are complementary branches
Choice: ADOPT C50 for semantic/tensor causes and C45 for deepest low-level dependency causes.
Alternatives: choose one universal deep profiler; always run C45 after C46; always stop at source attribution.
Reason: the most useful engineering explanation depends on where the controllable cause lives. Tensor/layout transformations can be more actionable than SASS, while custom-kernel dependency failures may have no meaningful tensor-level explanation.
Assumptions: Reflex can estimate framework/tensor mapping confidence and recognize when the semantic layer is relevant.
Trade-offs: branch selection adds orchestration logic and requires preserving both cross-layer semantic context and low-level profiling evidence.
Validation: mixed benchmark containing semantic layout/operator regressions and true intrakernel dependency regressions; score correct branch selection and verified fix quality.
Revisit when: one branch dominates real incidents or mapping/slicing feasibility makes the other rarely usable.


ADR — Stall classification is evidence, not causal root cause
Choice: keep C49 as baseline and reject C51 from the runtime ladder.
Alternatives: top-down stall accounting as the primary diagnosis; cycle-level simulated classification.
Reason: both can describe where cycles are lost, but neither by itself reliably localizes the actionable producer, dependency, tensor transformation, or operator that should change.
Assumptions: Reflex’s success metric is verified engineering explanation, not profiler metric fidelity alone.
Trade-offs: deeper attribution costs more than a stall summary, so it must show incremental actionability experimentally.
Validation: compare whether each method selects the correct engineering fix on hidden-cause incidents with similar stall signatures.
Revisit when: a stall-accounting method empirically matches deeper tools on verified-cause recovery and fix selection.


ADR — Prefer non-intrusive sampling before compiler/IR instrumentation
Choice: DEFER C52 to an exceptional rescue path.
Alternatives: integrate IR probes as a normal deep-profiling level; reject all instrumentation.
Reason: instrumentation may expose otherwise invisible intrakernel regions, but it risks perturbation, compiler lock-in, recompilation cost, and poor fit for opaque production kernels.
Assumptions: PC sampling/source attribution covers most diagnosable incidents; controlled recompilation is not universally available.
Trade-offs: some generated-kernel pathologies may remain unresolved until a compiler-aware path exists.
Validation: controlled generated-kernel experiments comparing localization gain versus perturbation and engineering effort.
Revisit when: Pass 5 shows persistent sampling/mapping blind spots and a stable compiler integration with bounded observer effect.


ADR — Baselines remain deliberately simpler than the selected architecture
Choice: BASELINE C47, C48, and C49 rather than combining all of them into the production dependency graph.
Alternatives: make every profiler a production branch; select only C46 and keep no experimental comparators.
Reason: Reflex needs evidence that custom source/dataflow, semantic, and slicing layers actually reduce investigation cost compared with mature/simpler methods. Multiple production profilers would create unnecessary integration and portability burden.
Assumptions: common benchmark incidents can be replayed under comparable conditions across tools.
Trade-offs: a baseline may occasionally outperform the primary on a specific hardware/compiler case and require a fallback adapter.
Validation: same incidents, same measurement budget, compare Top-1/Top-3 cause recovery, actionability, steps/cost to verification, observer effect, and cross-version/hardware robustness.
Revisit when: a baseline consistently wins a defined incident class, in which case it becomes an explicit fallback or replacement.


Astra reviewer contract — GPU deep/source-level architecture
What preceded this design: Reflex did not begin with C45–C52. The predecessor architecture already had matched healthy-vs-regressed comparison, broad GPU culpability/localization, request-centric CPU↔GPU dependency context, dynamic-roofline triage, framework→CUDA→kernel semantic mapping, explicit competing hypotheses, active measurement selection, observer-cost accounting, and a VERIFIED-only causal conclusion boundary. The unresolved question entering this pass was narrower: once GPU culpability is strong, what is the cheapest escalation sequence that turns a suspicious kernel into an actionable engineering explanation?


Mechanism lineage: the first-deep-profiler choice comes from comparing C46 GPA-style PC/stall sampling plus source/dataflow attribution against C47 HPCToolkit source/call mapping, C48 GPUscout SASS+sampling, C49 DrGPU stall accounting, immediate C45 LEO slicing, and intrusive C52 compiler/IR probing. C46 was selected because it is the smallest mechanism expected to cross the gap from broad GPU suspicion to actionable source/dataflow evidence. C47/C48/C49 remain deliberately simpler challengers so Astra can test whether C46 earns its extra complexity. C50 TenProf and C45 LEO were not selected as universal replacements for C46: they are conditional branches for different unresolved questions. C50 is selected when the controllable cause is likely an operator/tensor/layout transformation; C45 is selected when source localization exists but the responsible low-level producer/dependency remains ambiguous. C51 GSI was rejected because simulator-heavy cycle classification conflicts with runtime fit and does not by itself identify an actionable cause. C52 KPerfIR was deferred because compiler-aware probes can resolve sampling blind spots but require controllable recompilation and carry a larger perturbation/toolchain burden.


Why this composition exists: the architecture optimizes for verified engineering explanation per unit of measurement/observer/implementation cost, not maximum profiler detail. The intended ladder is therefore broad localization → C46 first deep evidence → stop and verify when source/dataflow evidence is sufficient; otherwise branch upward to C50 when semantic lifting can reveal the engineer-controlled transformation, or to C45 when low-level dependency slicing is the remaining discriminating evidence. C47/C48/C49 are fallback/baseline paths, not dead ends. C52 is an exceptional rescue path. This ordering preserves the project-wide rule that deeper evidence is purchased only when it can change the live hypothesis set, selected intervention, or confidence in the engineering action.


Evidence that should change this architecture: Astra should rerun same-incident, same-budget comparisons rather than preserve these choices by default. Replace C46 as the first deep profiler if PC/stall sampling or mapping is unavailable/unstable on the actual stack, or if C47/C48/C49 reaches equal or better verified-cause recovery, correct-fix selection, and time/cost to verification with lower perturbation or integration burden. Narrow or remove C50 if tensor/operator lineage is too incomplete under fusion/JIT/vendor kernels or does not reduce steps to verified fixes. Demote C45 if backward slices are unstable, unauditable because of missing dependencies, or rarely change the action beyond C46/C50; strengthen it if it repeatedly resolves otherwise ambiguous incidents. Promote C52 only if non-intrusive sampling has a recurring blind spot and controlled IR instrumentation resolves it reproducibly with bounded observer effect. Reconsider C51 only if a hardware-backed, non-simulator-heavy implementation achieves comparable detail at practical cost and improves actionable verified-cause recovery.


Required evidence for any future replacement: identify the current ADR/mechanism being replaced; name the predecessor alternatives already compared; cite the new mechanism/paper; state which Reflex constraint improves; run an equal-budget hidden-cause benchmark; measure Top-1/Top-3 cause recovery, correct engineering-fix selection, steps/time/cost to VERIFIED cause, observer perturbation, mapping/slice stability, cross-version/hardware robustness, and auditability; and specify the falsification/revisit condition for the new choice. A newer model or paper is not sufficient evidence by itself.


Open uncertainties / Pass 5 questions
1. On the actual Reflex NVIDIA/CUDA stack, which GPU generations and driver/toolkit versions expose PC/stall sampling with the needed granularity, permissions, and stability?
2. What is the measured observer effect of PC/stall sampling at useful sample rates on ~30 ms-class loops, and how many repeated profiled runs are required for stable healthy-vs-regressed attribution?
3. What fraction of production kernels have usable source/debug line information, and how does mapping quality change for fused, JIT-generated, graph-compiled, vendor-library, and stripped kernels?
4. Can C46-style dataflow reconstruction be prototyped from available binary/source metadata without reproducing a research-scale compiler analysis stack? What minimum version would still add value over HPCToolkit-style mapping?
5. How reproducible are instruction PCs, kernel identities, and stall distributions across repeated executions, driver versions, GPU generations, and compilation changes?
6. What concrete metadata is needed to implement backward slicing for C45, and which dependency/synchronization edges are observable versus inferred? How often would missing edges make the slice non-auditable?
7. How should C45 quantify slice confidence so an incomplete backward slice is not presented as causal proof?
8. Which frameworks/compiler paths expose enough operator/tensor lineage, shape/stride/layout history, and fusion maps for C50? What mapping coverage is realistic for the first prototype?
9. How should Reflex represent one fused kernel that corresponds to multiple operators/tensors, and when should it abstain from selecting a single upstream transformation?
10. Can TenProf-style semantic attribution survive JIT/generated kernels when source mapping is poor, provided framework/tensor lineage remains available?
11. Does HPCToolkit-style source/call mapping already provide enough actionability that C46 custom dataflow attribution is unnecessary for the first prototype?
12. For GPUscout-style static SASS analysis, how portable are rules/features across GPU generations, and what binary artifacts are actually accessible in the target runtime?
13. What profiler APIs/tool licenses/redistribution constraints affect embedding GPA-like, HPCToolkit-like, or SASS-analysis functionality into a Reflex prototype?
14. How should active measurement cost combine run-time perturbation, number of reruns, offline analysis latency, engineering/tooling complexity, and risk of non-reproducibility?
15. What minimum evidence threshold should count as “PC/stall sampling sufficient” before stopping deep escalation, and how should that threshold be calibrated against verified interventions?
16. When two profilers disagree on the dominant source region or stall explanation, what repeat/retest rule should the selector use before escalating further?
17. Can C52-like IR instrumentation be limited to compiler-owned generated kernels with measured perturbation bounds, and does it resolve a meaningful class of incidents that C46/C45 cannot?
18. What cross-hardware validation set is sufficient to distinguish a real causal mechanism from an architecture-specific profiler signature?




PASS 3 — ASTRA ARCHITECTURE HANDOFF / DECISION LINEAGE CONTRACT


Purpose
This section is the handoff contract for a future architecture reviewer. It answers three questions for the Pass 3 architecture: where each mechanism came from, why the selected composition was chosen over the mechanisms compared against it, and what evidence would justify changing the choice. The C01–C52 registry is the candidate universe; the Pass 3 decision logs are the detailed record. A future model should treat source-report GEM/KEEP/DROP/U labels as provenance only, never as selection evidence.


How to reconstruct the architecture
For every architectural job, read the candidates as a comparison set rather than as independent recommendations. The selected architecture is usually a composition: one mechanism supplies the default, others supply noise/cost handling, fallbacks, baselines, or deep escalation. The decision is not “paper X was newest”; it is “this mechanism best satisfies the Reflex constraints, and these alternatives remain explicit challengers.” The controlling constraints are verified-cause recovery, information/measurement efficiency, runtime perturbation, prototype feasibility, robustness across hardware/version/workload shifts, and auditability.


Decision lineage by architectural job
1. Next measurement / test selection (C01–C14). Preceded by Reflex’s informal objective of expected diagnostic uncertainty reduction divided by measurement cost/observer overhead. Compared entropy-greedy SEQUOIA, Chernoff-style sequential testing, cost-aware indices, Bayesian EIG, noisy adaptive design, retest MDPs, Bayesian-network selection, EC²/EffECXtive, adaptive-submodular greedy, ECED, non-myopic POMDP planning, exact logical query optimization, persistent-noise rank objectives, and shared/subadditive-cost selection. Selected: C04 Bayesian EIG per effective incremental cost as the online default; C03 as the cold-start/degraded-model fallback; C05+C10+C14 as reliability, correlation/redundancy, and shared-cost corrections. C01/C08/C12 remain important baselines/oracles; C02/C06/C07/C11/C13 are deferred; C09 is rejected as a standalone mechanism. Change this architecture if realized EIG does not predict debugging progress/cost, if EC² or a simpler cost index reaches VERIFIED causes more cheaply and robustly, or if replay demonstrates material systematic greedy regret that justifies non-myopic planning.


2. Confidence, calibration, abstention, and stopping (C15–C22). Preceded by an explicit hypothesis set and OBSERVED→INFERRED→TESTED→VERIFIED hierarchy, but numeric uncertainty semantics and stop/abstain rules were underspecified. Compared post-hoc calibration, conformal sets, selective classification, BMA, deep ensembles, SPRT/posterior stopping, Bayesian intervals, and fault-injection calibration. Selected: keep ranking as the invariant representation; COMBINE C15+C22 for offline calibrated probabilities where transfer is validated; ADOPT C17 abstention as a separate action gate; COMBINE C20 posterior/action thresholds with expected value of information while preserving VERIFIED as a causal evidence boundary. C16/C18/C21 are deferred and C19 is a baseline. Change this architecture if calibration fails to transfer to real VERIFIED incidents, conformal coverage remains stable under realistic shift, ensemble disagreement strongly predicts failure at acceptable cost, a coherent Bayesian likelihood family emerges, or a restricted SPRT formulation produces materially better stopping guarantees.


3. Investigation-state reasoning and control (C23–C25). Preceded by explicit hypotheses, evidence, uncertainty, active measurement selection, dependency structure, and the verification hierarchy, but ownership of canonical state and the open/closed hypothesis policy were unclear. Compared deterministic-only control, one frontier-model orchestrator, independent role-separated agents, fixed ontology, full hypothesis regeneration, an ontology-seeded open-world hybrid, no formal structure, graph/hierarchy constraints, and d-DNNF compilation. Selected: deterministic canonical state and evidence ledger; one frontier-model orchestrator for propositional/open-ended reasoning; ontology-seeded incremental hypotheses with UNKNOWN and provisional causes; typed hierarchy + request dependency DAG/constraints; d-DNNF deferred. Change this architecture if equal-budget multi-agent tests materially improve VERIFIED-cause recovery/cost without state inconsistency, if deterministic-only matches the frontier model on the incident classes where open-ended reasoning is supposed to help, if fixed/full-regeneration hypothesis policies beat the hybrid, or if a bounded d-DNNF model materially reduces investigation cost while remaining maintainable under missing/multi-cause structure.


4. Incident memory and reuse (C26–C33). Preceded by the existing structured verified-incident memory and the rule that prior cases may inform but not verify a new incident. Compared classical CBR, topology-aware CBR, learned sequential policies, meta-learning, semantic episodic RAG, graph similarity, rule→retrieval→reasoning cascades, and historical intervention-effect priors. Selected: C27 topology/model-aware CBR as the production retrieval core; COMBINE C30 semantic retrieval and C31 structural reranking; ADOPT C32 narrow rule-first cascade; COMBINE C33 as context-conditioned intervention priors; keep C26 as baseline/fallback; defer C28/C29 until explicit data-readiness gates. Change this architecture if topology alignment adds no protection against harmful transfer, semantic/graph channels do not improve recall/robustness, stale rules create more errors than savings, intervention priors show negative transfer, or verified trajectory/task diversity becomes sufficient for learned policy/meta-learning methods to beat the non-parametric stack on held-out domains.


5. Low-overhead observability and profiler escalation (C34–C39). Preceded by Reflex’s sparse→hindsight→targeted→deep evidence ladder and the requirement not to perturb an approximately 30 ms-class loop. Compared progressive escalation, broad multi-domain always-on telemetry, cheap GPU counters, eBPF GPU probing, heavy kernel instrumentation, and explicit observer-effect calibration. Selected: C34 is COVERED as the spine; C35 is COMBINED as minimal asynchronous cross-domain state rather than broad event tracing; C36 is COVERED as a capability-aware asynchronous subset; C37 eBPF is deferred as an optional backend; C38 heavy instrumentation is deferred to selected replay/canary kernels; C39 observer-effect calibration is ADOPTED and enters measurement cost directly. Change this architecture if sparse/triggered collection repeatedly misses non-replayable causes recovered by broad telemetry at negligible perturbation, safe counter samples are too stale, eBPF proves substantially better information-per-cost in deployable environments, heavy instrumentation uniquely resolves important reproducible incidents, or observer costs are too nonstationary for contextual calibration.


6. CPU↔GPU reconstruction and localization (C40–C44). Preceded by separate TELLER/StriaTrace-like ideas, host↔GPU correlation, dynamic roofline, and semantic mapping, but no single canonical execution model. Compared request-centric dependency DAGs, suspect-subgraph extraction, lagged correlation, dynamic-roofline classification, and DeepContext-style semantic attribution. Selected: ADOPT C40 request-scoped dependency DAG views over shared execution; COMBINE C41 as a focus/slice layer; keep C42 as a non-causal baseline/fallback; C43 is COVERED as broad bottleneck classification; COMBINE C44 through framework-specific semantic adapters over a framework-neutral graph. Change this architecture if graph completeness/clock correlation is insufficient for stable localization, correlation performs unexpectedly well under controlled concurrency when structural edges are absent, suspect extraction prunes true causes, dynamic classification becomes accurate enough to replace costlier first-stage measurements, or semantic adapters cannot achieve useful mapping completeness/portability.


7. GPU deep/source-level diagnosis (C45–C52). Preceded by the GPU fast path, matched healthy comparison, dependency context, and active escalation; deep profiling is entered only after GPU culpability is strong. Compared LEO backward slicing, GPA PC/stall+dataflow attribution, HPCToolkit mapping, GPUscout SASS analysis, DrGPU stall accounting, TenProf tensor/operator attribution, simulator-heavy GPU Stall Inspector, and KPerfIR compiler probes. Selected: ADOPT C46 as the first deep profiler; ADOPT C50 for semantic/tensor causes; ADOPT C45 as the deepest low-level dependency branch; keep C47/C48/C49 as deliberately simpler baselines/fallbacks; reject C51 from the runtime ladder; defer C52 to an exceptional compiler-owned rescue path. Change this architecture if PC sampling/mapping is unavailable or unstable, a simpler baseline matches actionability at lower cost, tensor mapping fails on the target compiler/framework stack, backward slices rarely alter the engineering action, or compiler/IR probes demonstrably solve a recurring blind spot with bounded perturbation.


Evidence hierarchy for changing architecture
A future model should not change a decision because a newer paper/model exists or because a mechanism is theoretically elegant. Prefer same-incident, same-budget head-to-head evidence. Strong change evidence includes: higher Top-1/Top-3 true-cause recovery; fewer measurements or lower observer/data/model cost to VERIFIED cause; lower false-confident or harmful-transfer rate; better calibration under held-out fault/version/hardware/workload shift; better actionability/correct fix selection; lower perturbation; stronger replay/reproducibility; and simpler implementation with equivalent diagnostic quality. Any promoted mechanism must preserve evidence provenance and the OBSERVED/INFERRED/TESTED/VERIFIED boundary.


Astra review protocol
When reviewing this document, first reconstruct each job’s candidate set and selected composition from Pass 2 + Pass 3. Then challenge the explicit assumptions and revisit triggers rather than silently redesigning from first principles. For any proposed replacement, state: (a) which current mechanism/ADR it replaces; (b) the predecessor mechanisms it was compared against; (c) the new paper/system evidence; (d) which Reflex constraint improves; (e) the experiment that would falsify the proposed change; and (f) whether the evidence changes a runtime component, a fallback, a baseline, or only a future research option. Preserve rejected/deferred mechanisms in the record so architectural history is not lost.


Known handoff gaps that remain empirical, not documentary
The document now records the reasoning contract, but several decisions intentionally remain contingent on Pass 5/real-system evidence: actual observer-cost envelopes on Reflex hardware; real counter/profiler availability and mapping quality; synthetic-to-real calibration transfer; multi-cause prevalence; graph completeness under concurrency/batching; frontier-model incremental value; greedy-vs-lookahead regret; incident-history sample sufficiency; and deep-profiler actionability. These are not missing rationale. They are the explicit experiments that determine whether the architecture should change.
