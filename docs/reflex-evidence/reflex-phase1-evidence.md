# Reflex Phase 1 evidence map: current SDK, historical rfx, and disambiguation

Checked 2026-08-29. This is the canonical synthesis of three research reports: the current reflex-sdk 0.9.2 wheel investigation, the public SDK evidence map, and the historical quantbagel/rfx/current-reflex comparison. It covers the public SDK/package surface, historical robotics architecture, and the separate reflex-dev/reflex framework disambiguation. It is not a literature review or project recommendation.

The original reports are preserved in [sources/](sources/):

- [Current SDK evidence](sources/reflex-sdk-0.9.2-phase1-evidence.md)
- [Public SDK evidence map](sources/public-sdk-evidence-map.md)
- [Historical/current comparison](sources/historical-current-reflex-research.md)

The current SDK sections below are authoritative for the current robotics package. Historical rfx and reflex-dev/reflex sections are explicitly labeled and must not be silently merged into current SDK behavior.

## Evidence labels

- **VERIFIED FACT** — visible in the published reflex-sdk wheel, current official Reflex documentation, or a primary package-metadata page.
- **REASONABLE INFERENCE** — supported by the evidence but not explicitly stated by the source.
- **UNKNOWN** — not established by the public evidence gathered.

The published wheel is the strongest current implementation source. Current tryreflex.ai pages are the strongest current documentation source. Older rfx material is kept separate and is not treated as current implementation evidence.

## 1. Provenance and source register

### Current package and documentation

| ID | Source | Provenance/use |
|---|---|---|
| P1 | [PyPI: reflex-sdk](https://pypi.org/project/reflex-sdk/) | Current public distribution name and release page. |
| P2 | [Published reflex_sdk-0.9.2 wheel](https://files.pythonhosted.org/packages/2c/e5/4df5f288bf41a50d6c3d34d97f5f8cc0ced7c73202f3bb8f3c6fc7a1c840/reflex_sdk-0.9.2-py3-none-any.whl) | Module tree, runtime signatures, exported names, implementation behavior, recording formats, transport behavior, and CLI entry point. |
| P3 | [Official documentation index](https://tryreflex.ai/docs) | Current product positioning, CLI surface, robot-side responsibilities, and links to SDK docs. |
| P4 | [reflex.Client](https://tryreflex.ai/docs/sdk/client) | Client/sub-client model and high-level dataset/training examples. |
| P5 | [reflex.ActionStream](https://tryreflex.ai/docs/sdk/action-stream) | Streaming constructor, methods, session behavior, and examples. |
| P6 | [@reflex.connect](https://tryreflex.ai/docs/sdk/connect-decorator) | Decorator programming model and documented callbacks. |
| P7 | [Datasets SDK](https://tryreflex.ai/docs/sdk/datasets) | Dataset registration, upload, validation, completion, listing, and retrieval. |
| P8 | [Training SDK](https://tryreflex.ai/docs/sdk/training) | High-level/low-level training APIs and dataclasses. |
| P9 | [Deployments SDK](https://tryreflex.ai/docs/sdk/deployments) | Deployments, sessions, robot schemas, registration, pairing, and heartbeats. |
| P10 | [SDK types](https://tryreflex.ai/docs/sdk/types) | Observation, action, execution, and training-result schemas. |
| P11 | [Observation/action schema guide](https://tryreflex.ai/docs/guides/observation-action-schema) | JSON-level observation and action-chunk fields. |
| P12 | [Connect configuration guide](https://tryreflex.ai/docs/guides/connect-config) | Configuration fields, defaults, targets, hardware connectors, and safety settings. |

### Repository and historical comparison

| ID | Source | Provenance/use |
|---|---|---|
| R1 | [Metadata-linked repository](https://github.com/reflex-inc/reflex) | Repository URL recorded in the current wheel metadata. |
| R2 | [GitHub API lookup](https://api.github.com/repos/reflex-inc/reflex) | Returned public API 404 Not Found during the check; source-level comparison was therefore unavailable. |
| H1 | [Older/parallel architecture docs](https://docs.tryreflex.ai/concepts/architecture) | rfx-named simulate/collect/train/deploy concepts, artifacts, and lineage language. |
| H2 | [Older/parallel policy docs](https://docs.tryreflex.ai/sdk/policies) | @rfx.policy, rfx.MotorCommands, rfx.SO101_CONFIG, and LoadedPolicy. |
| H3 | [Older/parallel model-management docs](https://docs.tryreflex.ai/sdk/model-management) | rfx.nn.MLP, ActorCritic, ObservationNormalizer, policy save/load/inspect/push. |
| H4 | [Older/parallel hardware docs](https://docs.tryreflex.ai/sdk/hardware-configs) | SO101_CONFIG, GO2_CONFIG, G1_CONFIG, RobotConfig.from_yaml, and RealRobot. |
| H5 | [Historical quantbagel/rfx](https://github.com/quantbagel/rfx) | Older rfx-sdk, recording, collection, LeRobot, policy, and deployment workflow. |
| H6 | [Unrelated PyPI rfx](https://pypi.org/project/rfx/) | 2018 container configuration/secrets package; not robotics evidence. |

### Firecrawl Developer Index provenance

The Firecrawl Developer Index was used first with the focused query:

~~~text
reflex-sdk reflex.Client ActionStream connect dataset training deployment
~~~

It found official current pages including [Client](https://tryreflex.ai/docs/sdk/client) and [Training](https://tryreflex.ai/docs/sdk/training). Broad earlier queries were polluted by NVIDIA Reflex and unrelated uses of “Reflex”; a CLI/proxy failure prevented treating the index as complete. The detailed contracts below therefore come from the official pages and the wheel, not from unsupported index extrapolation.

## 2. Current package identity and metadata

### VERIFIED FACT

The current public robotics distribution is:

~~~text
pip install reflex-sdk
~~~

It imports as:

~~~python
import reflex
~~~

and installs the reflex command-line program. The inspected wheel is version 0.9.2; its metadata reports Python >=3.9, Alpha development status, and the summary “Python SDK for Reflex hosted robot inference and training.”

Metadata project URLs are:

~~~text
Homepage:   https://tryreflex.ai
Repository: https://github.com/reflex-inc/reflex
~~~

The wheel README says the SDK is separate from inference/, which owns model serving and the Prime worker runtime. The SDK README examples include reflex login and reflex connect --config robot.yaml.

The wheel declares dependencies on PyYAML, Typer, urllib3, Rich, aiortc, av, msgpack, NumPy, and Pillow. This dependency list is consistent with configuration, HTTP/WebSocket/WebRTC transport, media, serialization, numerical arrays, and image handling; that interpretation is a **REASONABLE INFERENCE** from the metadata and implementation.

The wheel defines the console entry point:

~~~text
reflex = reflex.cli:main_reflex
~~~

## 3. Module tree and public exports

### VERIFIED FACT — modules observed in the wheel

Relevant root modules:

~~~text
reflex/__init__.py
reflex/actions.py
reflex/agent.py
reflex/auth_runner.py
reflex/cli.py
reflex/connect_runner.py
reflex/datasets.py
reflex/deployments.py
reflex/instances.py
reflex/model_cli.py
reflex/models.py
reflex/policy.py
reflex/product.py
reflex/receipts.py
reflex/recordings.py
reflex/robot_runtime.py
reflex/robots.py
reflex/sessions.py
reflex/training.py
~~~

Supporting packages:

~~~text
reflex/cameras/{base,realsense,shm,v4l2}.py
reflex/connectors/{base,shell,yam_bimanual}.py
reflex/policies/hf_generic.py
reflex/recording/{cloud,jsonl,lerobot,mcap,rerun,s3_upload}.py
reflex/streaming/{camera_track,relay_publisher}.py
reflex/transports/{base,edge_http,hosted,webrtc}.py
reflex/transports/{_webrtc_client,_webrtc_streaming_client}.py
reflex/transports/{_drtc_sidecar,_serverless_direct,_sidecar}.py
~~~

The current wheel contains no rfx/ package.

### reflex.__all__

The root package exports:

~~~python
[
    "ActionChunk", "ActionStream", "Observation", "Policy", "RTCMode",
    "Schema", "build_infer_fn", "load_policy", "register_policy",
    "registered_policies", "AdamParams", "AdapterHandle", "Client",
    "claim_pairing_token", "Datum", "ForwardBackwardResult",
    "LoraTrainingClient", "OptimStepResult", "RobotExecutionConfig",
    "RobotExecutionResult", "ServiceClient", "__version__", "action",
    "authorize_session", "cancel_training_job", "close_session",
    "complete_dataset", "connect", "create_dataset", "create_deployment",
    "create_deployment_from_spec", "create_pairing_token",
    "create_training_job", "full_finetune", "full_train", "get_dataset",
    "get_deployment", "get_training_job", "heartbeat_robot",
    "infer_actions", "instance_status", "list_sessions",
    "list_training_jobs", "list_datasets", "list_deployments",
    "list_receipts", "list_robot_schemas", "list_robots", "lora_finetune",
    "observation", "provision_instance", "promote_session",
    "register_huggingface_dataset", "register_robot", "register_robot_schema",
    "run_deployment_doctor", "run_robot_execution_loop", "teardown_instance",
    "upload_dataset", "validate_dataset",
]
~~~

This is implementation provenance from reflex/__init__.py in the wheel.

## 4. Client and streaming APIs

### reflex.Client

**Provenance:** reflex/__init__.py, client implementation in the wheel, and [official Client documentation](https://tryreflex.ai/docs/sdk/client).

~~~python
Client(
    *,
    api_key: str | None = None,
    url: str | None = None,
    convex_url: str | None = None,
) -> None
~~~

Sub-clients:

~~~text
client.actions
client.datasets
client.training
client.deployments
client.sessions
client.robots
client.instances
client.receipts
~~~

The official page calls it the “top-level Python SDK entry point with namespaced sub-clients” and a “one-stop wrapper around every product API exposed by the Reflex platform.” Examples include:

~~~python
client.datasets.register_huggingface(dataset_string)
client.datasets.validate(dataset_id)
client.training.create(dataset_id, fine_tuning_type, epochs)
client.training.get(run_id)
~~~

### reflex.ActionStream

**Provenance:** reflex/actions.py and [ActionStream documentation](https://tryreflex.ai/docs/sdk/action-stream).

~~~python
ActionStream(
    *,
    url: str | None = None,
    api_key: str | None = None,
    prompt: str,
    model: str | None = None,
    lora: str | None = None,
    robot: str | None = None,
    action_adapter: str | None = None,
    cameras: list[str] | None = None,
    hz: float | None = None,
    chunk_size: int | None = None,
    max_gpu_seconds: float | None = None,
    session_id: str = "",
    timeout: float = 30.0,
    connect_retry_seconds: float | None = None,
) -> None
~~~

Methods and properties:

~~~python
open()
close()
send_observation(
    state,
    images=None,
    prompt=None,
    seq=None,
    request_id=None,
    capture_time_ns=None,
    max_gpu_seconds=None,
)
send_observation_frame(frame: dict)
recv_action()
send_raw(frame)
receive()

ready
session_id
open_timing
~~~

open_timing includes TCP, TLS, WebSocket-upgrade, session-ready, and total-open timing fields. The context manager opens and closes the stream.

## 5. The @reflex.connect programming model

### Documented contract

**Provenance:** [connect decorator documentation](https://tryreflex.ai/docs/sdk/connect-decorator).

The documented shape is:

~~~python
@reflex.connect(prompt="pick up the red block", model="pi0.5")
class Robot:
    @reflex.observation
    def observe(self):
        return {
            "state": [...],
            "images": {...},
            "prompt": "pick up the red block",
        }

    @reflex.action
    def apply(self, frame):
        for target in frame["actions"]:
            ...

robot = Robot()
robot.run(max_steps=100)
~~~

The decorator forwards connection kwargs to ActionStream, injects .run(max_steps=None), stops at the maximum step count, and stops when the observation callback returns None. The observation callback returns a dictionary; the action callback receives an action-chunk result according to the documentation.

### Implementation observed in reflex/actions.py

The generated runner:

1. Calls the observation method.
2. Stops when it returns None.
3. Requires a dictionary otherwise.
4. Sends it with send_observation_frame.
5. Receives a frame with recv_action().
6. Calls the action method with frame.get("actions", frame).

### UNKNOWN / discrepancy

The documentation example treats the callback argument as the complete frame dictionary, while the wheel implementation appears to pass the nested actions value when an actions key is present. This needs live validation before relying on either contract.

## 6. Observation, action, and execution schemas

### Observation

**Provenance:** reflex/connectors/base.py, reflex/policy.py, and [SDK types](https://tryreflex.ai/docs/sdk/types).

~~~python
Observation(
    state: list[float],
    cameras: dict[str, Any],
    task: str = "",
    extra: dict[str, Any] = {},
)
~~~

The wire-level guide uses state, images, and prompt; internal connector/policy types use state, cameras, and task. The policy parser accepts flat or nested observations and maps them into Observation.

### ActionChunk

**Provenance:** reflex/connectors/base.py, reflex/policy.py, and [types](https://tryreflex.ai/docs/sdk/types).

~~~python
ActionChunk(
    actions: list[list[float]],
    metadata: dict,
)
~~~

The action shape is [time_steps, action_dim]. Metadata is open-ended; examples include model and inference timing.

### Other public types

~~~python
InferenceRequest(
    observation: Observation,
    control_step: int = 0,
    extra: dict = {},
)
~~~

RobotExecutionResult fields:

~~~text
steps
applied_steps
safe_stops
last_action_chunk
errors
~~~

RobotExecutionConfig fields:

~~~text
session_id
deployment_id
robot_id
mode
task
config_hash
max_steps
control_period_s
observe_command
action_command
safe_stop_command
command_timeout_s
safe_stop_timeout_s
heartbeat
heartbeat_interval_s
stop_on_error
~~~

## 7. Observation/action serialization and session frames

### Documented JSON schema

**Provenance:** [observation/action schema guide](https://tryreflex.ai/docs/guides/observation-action-schema).

Observation example:

~~~json
{
  "state": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
  "images": {
    "wrist": "<base64-encoded JPEG>",
    "overhead": "<base64-encoded JPEG>"
  },
  "prompt": "pick up the red block",
  "seq": 17,
  "capture_time_ns": 1737830400000000000
}
~~~

Fields are state: list[float], images, prompt: string, seq: int, capture_time_ns: int, optional request_id: string, and optional max_gpu_seconds: float. Images may be base64 JPEGs or raw bytes.

Action example:

~~~json
{
  "type": "action_chunk",
  "seq": 17,
  "actions": [[...], [...], [...]],
  "metadata": {
    "model": "pi0.5",
    "inference_ms": 0
  }
}
~~~

Each inner action list is one control step. Metadata keys are not promised to be fixed.

### ActionStream wire behavior

**Provenance:** reflex/actions.py.

The action URL is derived from REFLEX_ACTIONS_URL or the configured URL. HTTP(S) URLs are converted to WebSocket URLs and receive /v1/actions when needed. The handshake uses:

~~~text
Authorization: Bearer <api_key>
User-Agent: reflex-actions-sdk/<version>
~~~

open() sends:

~~~json
{
  "type": "session.open",
  "session_id": "...",
  "prompt": "...",
  "model": "...",
  "lora": "...",
  "robot": "...",
  "action_adapter": "...",
  "cameras": ["..."],
  "hz": 30,
  "chunk_size": 10,
  "max_gpu_seconds": 2
}
~~~

It waits for {"type":"session.ready"} and stores the server session ID. send_observation() emits an observation frame with sequence, state, images, prompt, request ID, capture timestamp, and GPU budget. Byte images are normalized to:

~~~json
{
  "encoding": "jpeg_base64",
  "data": "..."
}
~~~

recv_action() loops until action_chunk and raises on error. Closing sends:

~~~json
{
  "type": "session.close",
  "session_id": "..."
}
~~~

Retryable handshake statuses observed in the implementation are 403, 404, 408, 425, 429, 500, 502, 503, and 504; connection retry handling covers timeouts and socket errors.

## 8. Robot runtime and transport implementation

### Robot loop

**Provenance:** reflex/connect_runner.py and reflex/robot_runtime.py in the wheel; high-level behavior is also described at [tryreflex.ai/docs](https://tryreflex.ai/docs).

The runner’s implemented loop is:

1. Read robot state.
2. Capture camera frames.
3. Merge state and cameras into an observation.
4. Send the observation to a transport.
5. Receive an action chunk.
6. Apply the chunk only when the mode permits action application.
7. Record the observation/action/timing data.
8. Safe-stop and either stop or continue according to error policy.

Transport startup occurs before hardware and camera startup. The runner can pipeline the next inference while the current chunk is being applied. The implementation rebinds the next observation so recordings associate the correct observation with the action being executed.

### Edge HTTP transport

**Provenance:** reflex/transports/edge_http.py.

~~~python
EdgeHttpTransport(
    url,
    state_field="state",
    instruction_field="instruction",
    camera_field_map=None,
    actions_path="actions",
    encoding="json_numpy",
    auto_timestamp_field="timestamp",
    extra_payload=None,
    headers=None,
    timeout_s=30.0,
)
~~~

It POSTs JSON to the configured edge URL, places state and instruction/task under configurable field names, maps camera values, optionally adds a timestamp and extra payload, extracts actions using actions_path, and normalizes one-dimensional or two-dimensional responses to list[list[float]].

### WebRTC transport

**Provenance:** reflex/transports/webrtc.py.

~~~python
WebRTCTransport(
    url,
    timeout_s=60,
    connect_timeout_s=60,
    img_size=256,
    camera_field_map=None,
    state_field="state",
    instruction_field="prompt",
    extra_payload=None,
    streaming=False,
    auth_token=None,
    session_id=None,
    deployment_id=None,
    robot_id=None,
    robot_name=None,
)
~~~

The implementation uses a one-shot SDP HTTPS request to <url>/webrtc-offer and sends inference data over a msgpack SCTP data channel. Returned action keys may be actions_aloha, actions_pi, or actions.

Images may be bytes, NumPy arrays, or PIL images. The implementation converts/resizes images to JPEG and uses an adaptive size budget of approximately 12,000 bytes.

### Hosted transport

**Provenance:** reflex/transports/hosted.py.

HostedTransport uses a session grant, a Convex rendezvous flow, and a QUIC/sidecar data plane. The client does not receive provider credentials. The hosted path uses rendezvous start/poll operations, a session heartbeat, and a session-start marker. The hosted inference payload contains session ID, control step, task, state, and images.

## 9. Connect configuration

**Provenance:** [connect configuration guide](https://tryreflex.ai/docs/guides/connect-config) and reflex/connect_runner.py.

Top-level fields:

~~~yaml
mode: dry_run
max_steps: 0
control_period_s: 0
stop_on_error: true
pipeline_inference: true
heartbeat_interval_s: 10
~~~

Supported target kinds:

~~~text
webrtc
edge
platform
~~~

### WebRTC target fields

~~~text
url
base_model                  # example: molmoact2-bimanualyam
timeout_s: 60
connect_timeout_s: 60
img_size: 256
camera_field_map: {top,left,right}
state_field: state
instruction_field: prompt
extra_payload: {}
streaming: false
~~~

### Edge target fields

~~~text
url                         # required; example http://localhost:8080/infer
timeout_s: 30
~~~

### Hardware connector fields

For yam_bimanual:

~~~text
left.channel                # required
right.channel               # required
gripper
hz: 30
zero_gravity_mode: false
instruction: ""
home_duration_s: 4
home_pose                    # default zeros plus gripper 1.0 rad
chunk_boundary_max_delta: 0.02
chunk_apply_horizon: 0
action_step_delay_s: 1 / hz
~~~

For subprocess:

~~~text
observe_command              # required
action_command               # required
safe_stop_command             # optional
command_timeout_s: 2
safe_stop_timeout_s: 5
~~~

The mode boundary is explicit: dry_run prevents action application, while apply_actions enables it.

## 10. Dataset APIs

### Public functions

**Provenance:** reflex/datasets.py and [dataset documentation](https://tryreflex.ai/docs/sdk/datasets).

~~~python
register_huggingface_dataset(hf_source_uri)
validate_dataset(dataset_id)
create_dataset(*, name, size_bytes=None, request_id="")
complete_dataset(dataset_id, *, size_bytes=None)
upload_dataset(path, *, name=None, request_id="")
list_datasets(*, status=None)
get_dataset(dataset_id)
~~~

Documented source formats include Hugging Face URIs such as hf://... and local .tar upload paths.

### Local upload behavior

**Provenance:** reflex/datasets.py.

upload_dataset():

1. Reads the local file.
2. Creates a dataset record.
3. Receives an upload URL, method, and upload headers.
4. Uploads the file, normally with PUT.
5. Completes the dataset record.
6. Returns the merged result, including dataset_id.

HTTP dataset routes observed in the implementation:

~~~text
POST /v1/datasets
GET  /v1/datasets?status=...
GET  /v1/datasets/{dataset_id}
POST /v1/datasets/{dataset_id}/complete
~~~

Hugging Face registration and validation use Convex product operations named:

~~~text
publicApi:registerDataset
publicApi:validateDataset
~~~

## 11. Training APIs

### High-level training

**Provenance:** reflex/training.py and [training documentation](https://tryreflex.ai/docs/sdk/training).

The high-level API accepts exactly one data source:

~~~text
dataset_id
hf_source_uri
~~~

The implementation requires one or the other and rejects unsupported combinations.

~~~python
create_training_job(
    *,
    dataset_id=None,
    hf_source_uri=None,
    base_model="pi0.5",
    base_model_id=None,
    fine_tuning_type="lora",
    adapter_name="",
    model_name="",
    version="v1",
    model_version="",
    max_minutes=None,
    request_id="",
    epochs=None,
    parameters=None,
    max_steps=None,
    batch_size=None,
    learning_rate=None,
    lora_rank=None,
    lora_alpha=None,
    lora_dropout=None,
    target_modules=None,
    warmup_steps=None,
    gradient_checkpointing=None,
    freeze_vision_encoder=None,
    dtype=None,
    save_freq=None,
)
~~~

Observed defaults and supported values:

~~~text
base_model: pi0.5
fine_tuning_type: lora or full
dtype: bfloat16 or float32, according to the public documentation
~~~

Convenience functions include lora_finetune(...), full_finetune(...), and the alias full_train(...). Observed convenience defaults:

~~~text
lora_finetune: model_name="pi05-lora", model_version="v1", epochs=1
full_finetune: model_name="pi05-full", model_version="v1", epochs=1
~~~

The implementation normalizes equivalent Pi-0.5 names such as pi0.5, pi05, lerobot, and pi05_base to the supported base model. The current implementation accepts only the Pi-0.5 base-model family.

### Training backend operations

**Provenance:** reflex/training.py.

High-level job creation calls Convex operations named:

~~~text
publicApi:createAndProvisionTrainingRunFromHuggingFace
publicApi:createAndProvisionTrainingRun
~~~

Arguments are converted to camelCase fields such as baseModel, baseModelId, fineTuningType, modelName, modelVersion, datasetId, and hfSourceUri. Optional training parameters include:

~~~text
maxSteps
batchSize
learningRate
lora.rank
lora.alpha
lora.dropout
lora.target_modules
warmupSteps
gradient_checkpointing
freeze_vision_encoder
dtype
saveFreq
~~~

Job management calls use:

~~~text
publicApi:getTrainingRun
publicApi:listTrainingRuns
publicApi:stopTrainingRun
~~~

### Low-level LoRA training

LoraTrainingClient is constructed with:

~~~python
LoraTrainingClient(
    *,
    url,
    api_key,
    run_id,
    base_model,
    name="",
    rank=None,
    raw=None,
)
~~~

Methods:

~~~python
forward_backward(data, loss_fn="behavior_cloning", microbatch_size=None, request_id="")
optim_step(params, request_id="")
save_adapter(name="", version="")
save_state(name)
status()
~~~

Corresponding HTTP routes:

~~~text
POST /v1/training-runs/{run_id}/forward-backward
POST /v1/training-runs/{run_id}/optim-step
POST /v1/training-runs/{run_id}/save-adapter
POST /v1/training-runs/{run_id}/save-state
GET  /v1/training-runs/{run_id}
~~~

ServiceClient.create_lora_training_client() creates a low-level run through /v1/training-runs/lora and accepts a returned identifier from training_run_id, run_id, or id.

### Training dataclasses

**Provenance:** reflex/training.py and [training types](https://tryreflex.ai/docs/sdk/types).

~~~python
Datum(
    observation: dict[str, Any],
    actions: list[list[float]],
    loss_weights: list[float] | None = None,
    metadata: dict[str, Any] | None = None,
)
~~~

Datum.to_dict() serializes the compact datum representation.

~~~python
AdamParams(
    learning_rate: float,
    beta1=0.9,
    beta2=0.95,
    eps=1e-8,
    weight_decay=0,
    max_grad_norm=None,
)
~~~

Results:

~~~python
ForwardBackwardResult(loss, metrics, raw)
OptimStepResult(step, metrics, raw)
AdapterHandle(lora, name, version, adapter_id, raw)
~~~

## 12. Policy and model-serving surface

### Policy registration

**Provenance:** reflex/policy.py in the wheel.

~~~python
@reflex.register_policy("mylab/grasp-v1")
class GraspPolicy(reflex.Policy):
    schema = reflex.Schema(
        cameras=["top", "wrist"],
        state_dim=14,
        action_dim=14,
        chunk_size=50,
        control_hz=20,
    )
    rtc = reflex.RTCMode.BLEND

    def predict(self, obs: reflex.Observation) -> reflex.ActionChunk:
        ...
~~~

Schema fields:

~~~text
cameras
state_dim
action_dim
chunk_size
control_hz
~~~

Policy.load() is a default no-op; predict() is the inference method. RTCMode values are BLEND, BACKEND, and SAMPLER. build_infer_fn() converts returned chunks to NumPy float32 actions and exposes action dimension, chunk length, and metadata.

### Model deployment helpers

**Provenance:** reflex/models.py.

~~~python
deploy_model(
    hf_repo,
    hf_token=None,
    region=None,
    state_dim=None,
    action_dim=None,
    chunk_size=None,
    control_hz=None,
    cameras=None,
    architecture=None,
    unnorm_key=None,
    prompt_template=None,
    convex_url=None,
    api_key=None,
)
~~~

The implementation calls customerDeploy:deployModel, provisions a RunPod serverless node, and returns model ID/status information. I/O dimensions, cameras, unnorm_key, and prompt_template can be forwarded to a generic Hugging Face runtime.

Model management also includes status/list/get/delete functions. Older direct LoRA adapter paths import_from_hf and upload_direct are marked deprecated in the package implementation.

## 13. Deployment, robot schemas, and session APIs

### Deployment functions

**Provenance:** reflex/deployments.py and [deployment documentation](https://tryreflex.ai/docs/sdk/deployments).

~~~python
create_deployment(
    *,
    name,
    model_id,
    robot_schema_id=None,
    runtime=None,
    mode="dry_run",
    spec=None,
)

create_deployment_from_spec(path)
list_deployments()
get_deployment(deployment_id)
run_deployment_doctor(deployment_id)
~~~

The deployment payload uses fields including:

~~~text
name
modelId
robotSchemaId
runtime
mode
specJson
~~~

The implementation calls createDeployment, listDeployments, getDeployment, and runReadinessCheck. A deployment spec requires a name and either modelId, model_id, or an artifact reference; robot schema, runtime, and mode are optional.

### Session functions

~~~python
authorize_session(
    *,
    artifact_id=None,
    deployment_id=None,
    robot_id=None,
    base_model="pi0.5",
    runtime=None,
    mode="dry_run",
    client_session_id=None,
)

promote_session(session_id, *, mode="apply_actions")
close_session(session_id, *, reason="sdk_closed")
list_sessions(*, status=None)
~~~

The implementation calls:

~~~text
publicApi:authorizeSession
publicApi:promoteSession
publicApi:closeSession
publicApi:listInferenceSessions
~~~

authorize_session() only accepts the Pi-0.5 base-model family in the current implementation. A successful authorization returns a session ID and scoped credential information. The mode boundary is dry_run versus apply_actions.

### Robot schemas and robot registration

~~~python
register_robot_schema(
    *,
    name,
    schema,
    robot_kind=None,
)

register_robot(
    *,
    name,
    robot_schema_id,
    robot_kind=None,
    calibration_id=None,
)

create_pairing_token(robot_id, *, ttl_seconds=None)
claim_pairing_token(token)
heartbeat_robot(robot_id, *, session_id=None, deployment_id=None, ...)
~~~

**Provenance:** reflex/robots.py and the deployment documentation.

Schema loading accepts a JSON/YAML path or a dictionary. The implementation extracts fields such as actions.action.safe_stop and shape, then sends:

~~~text
schemaVersion
schemaJson
hasExplicitSafeStop
robotKind
actionDim
safeStopMode
~~~

## 14. Recording and trajectory materialization

### Recording API

**Provenance:** reflex/recording/__init__.py, jsonl.py, lerobot.py, mcap.py, cloud.py, recordings.py, and connect_runner.py.

Public recording symbols include:

~~~python
SessionRecorder
RecorderBackend
available_formats
default_record_dir
load_recording
load_frame
load_embedding
~~~

Available formats:

~~~text
lerobot
jsonl
mcap
rerun
~~~

SessionRecorder fields include:

~~~text
output_dir
formats                  # defaults to lerobot
session_id
user_slug
jpeg_quality             # defaults to 90
save_embeddings          # defaults to false
queue_size               # defaults to 256
~~~

record_step() is non-blocking and uses a bounded queue. Steps can be dropped under backpressure. By default recordings are written under a path equivalent to:

~~~text
~/.reflex/recordings/<user>/<session_id>/
~~~

Recording can be disabled using --no-record or REFLEX_NO_RECORD=1. The CLI supports:

~~~text
reflex connect --config robot.yaml
reflex connect --record ...
reflex connect --format lerobot|jsonl|mcap|rerun
reflex connect --no-record
~~~

### JSONL format

**Provenance:** reflex/recording/jsonl.py.

Directory layout:

~~~text
meta.json
steps.jsonl
frames/<step>_<camera>.jpg
embeddings/<step>_<name>.npy       # optional
~~~

Each step row contains:

~~~text
step
timestamp
elapsed_s
state
cameras
actions                         # optional
metadata                        # optional
embeddings                      # optional
~~~

Camera values in the step row refer to frame paths.

### LeRobot-compatible format

**Provenance:** reflex/recording/lerobot.py.

The writer produces:

~~~text
meta/info.json
meta/episodes.jsonl
meta/tasks.jsonl
data/chunk-000/episode_000000.parquet
videos/chunk-000/observation.images.<camera>/episode_000000.mp4
~~~

Per-row fields include:

~~~text
episode_index
frame_index
timestamp
task_index
observation.state       # float32, shape [state_dim]
action                  # float32, shape [action_dim]
next.done               # bool
~~~

Timing metadata may include:

~~~text
meta.server_infer_ms
meta.server_total_ms
meta.infer_ms
meta.total_ms
~~~

info.json includes:

~~~text
codebase_version: v2.0
robot_type
total episodes/frames/tasks/videos/chunks
chunks_size: 1000
fps
splits: {"train": "0:1"}
data_path
video_path
features
~~~

Feature declarations include state and action float32 vectors, camera video features with HWC dimensions and mp4v codec, plus timestamp/frame/episode/task indices.

Important implementation detail: variable-length action chunks are not stored in the LeRobot parquet action field as a chunk. The full chunk is retained in MCAP, JSONL, or Rerun formats. LeRobot export is therefore a frame-level action representation, not necessarily a lossless representation of the original chunk stream.

### MCAP format

**Provenance:** reflex/recording/mcap.py.

Observed channels:

~~~text
/observation/cameras/<name>
/observation/state
/action
/metadata
~~~

Payload concepts:

~~~text
camera: timestamp, frame_index, jpeg_b64, h, w
state: timestamp, frame_index, state[]
action: timestamp, frame_index, first[], chunk[][]
metadata: timestamp, frame_index, server_infer_ms, server_total_ms
~~~

Registered schemas:

~~~text
reflex.State
reflex.Action
reflex.Meta
reflex.CameraImage
~~~

### Cloud recording and listing

**Provenance:** reflex/recording/cloud.py and reflex/recordings.py.

Cloud upload uses a local session-directory tarball and:

~~~text
publicApi:beginRecordingUpload
upload tarball to returned upload URL
publicApi:commitRecordingUpload
~~~

The upload request includes API key, session ID, user slug, formats, size, and SHA-256. Failed uploads retain the local copy. The default tar is uncompressed.

The recording listing API exposes:

~~~text
id
sessionId
formats
sizeBytes
sha256
status
hasBlob
createdAt
~~~

The official documentation says connect sessions are automatically recorded in LeRobot format and scoped to the organization.

## 15. End-to-end lifecycle and provenance joins

### Current public lifecycle

~~~text
1. Register or upload a dataset
      create_dataset / upload_dataset / register_huggingface_dataset

2. Create a training job
      create_training_job(dataset_id=... or hf_source_uri=...)

3. Produce a model/artifact
      training result or deploy_model(...)

4. Create a deployment
      create_deployment(model_id=..., robot_schema_id=...)

5. Authorize a session
      authorize_session(deployment_id=..., robot_id=...)

6. Run the robot loop
      observe → infer → action chunk → apply/safe-stop → record

7. Close or promote the session
      promote_session(...) / close_session(...)
~~~

### Explicitly exposed identifiers

The public APIs expose separate identifiers for:

~~~text
session_id
recording_id
dataset_id
training_job_id / run_id
model_id / artifact_id
deployment_id
robot_id
robot_schema_id
~~~

The package passes these identifiers through the corresponding API calls. Hosted sessions reuse the authorized session ID for recording identity in the runner. Local/edge sessions can use a locally generated session identifier.

### UNKNOWN — complete lineage graph

The public material does not prove the exact server-side lineage relation:

~~~text
robot execution session
→ recording
→ dataset registration
→ training run
→ model/artifact
→ deployment
~~~

The current SDK accepts the relevant identifiers, but backend provenance guarantees, automatic dataset creation from recordings, and authoritative join fields require authenticated API responses or backend source access.

## 16. Runtime defaults and service endpoints observed in code

### VERIFIED FACT — configured service defaults

The wheel’s product/transport modules reference:

~~~text
Convex API:       https://api.tryreflex.ai
Platform app:     https://app.tryreflex.ai
HTTP gateway:     https://kindly-bullfrog-494.convex.site
~~~

The HTTP gateway is used for routes such as /v1/actions, /v1/datasets, and /v1/training-runs/.... Product APIs use paths shaped like:

~~~text
https://api.tryreflex.ai/api/query
https://api.tryreflex.ai/api/mutation
https://api.tryreflex.ai/api/action
~~~

The implementation reads API credentials from REFLEX_API_KEY or RFX_API_KEY. Login credentials are saved under a user configuration path equivalent to ~/.config/reflex/credentials.json.

These are implementation defaults observed in the wheel, not guarantees that the public service topology will remain unchanged.

## 17. Current versus historical rfx

### VERIFIED FACT

The current wheel is named reflex-sdk, imports as reflex, and has no rfx package. Older material uses rfx-sdk, rfx imports, @rfx.policy, rfx.collection, and rfx.deploy.

The historical quantbagel/rfx README described:

~~~text
uv pip install rfx-sdk
rfx record --robot so101 --repo-id ...
rfx deploy ...
rfx.collection.collect("so101", "my-org/demos", episodes=10, duration_s=30)
~~~

It described robot methods such as observe, act, and reset; collection into a LeRobot dataset; policy saving with robot config, normalizer, and training info; rfx.load_policy; rfx.push_policy; and deployment. It referenced SO-101, Go2, and G1 hardware.

The older docs also used this conceptual pipeline:

~~~text
simulate → collect → train → deploy → iterate
~~~

### REASONABLE INFERENCE

The current reflex-sdk is likely a renamed, reorganized, or successor package to the older rfx system. Shared company/site context and overlapping robot/data/deployment concepts support that inference.

### UNKNOWN

The exact boundary—rename, fork, rewrite, or parallel product—cannot be established from the public evidence because the current wheel’s metadata-linked repository was not publicly resolvable during the check. The old rfx docs must not be used as evidence for current reflex-sdk behavior without confirmation.

## 18. Important inconsistencies and open questions

1. **Connect callback argument:** docs show a frame dictionary; reflex/actions.py appears to pass frame["actions"] when present.
2. **Naming:** docs use client.datasets.register_huggingface; the wheel exports register_huggingface_dataset.
3. **Observation vocabulary:** wire docs use images/prompt; internal types use cameras/task.
4. **Trajectory class:** no public Trajectory class was found. Current public representations are Datum, ActionChunk, recorder rows, and format-specific files.
5. **Chunk preservation:** LeRobot output stores frame-level action; MCAP/JSONL/Rerun retain full variable-length chunks.
6. **Training response schema:** the client reveals request fields and operation names, but not the full authoritative server response schema.
7. **Deployment response schema:** deployment/session identifiers and operations are visible, but readiness, credential, artifact, and runtime response fields need live API validation.
8. **Lineage:** the SDK exposes identifiers but does not publicly prove the complete session-to-dataset-to-training-to-deployment provenance graph.
9. **Source repository:** metadata points to reflex-inc/reflex, but public source comparison was unavailable at the time of checking.
10. **Model support:** current training/session paths are constrained to Pi-0.5-family names; whether other models are supported by the hosted service but not this SDK is unknown.

## 19. Best next reverse-engineering checks

1. Run a minimal authenticated ActionStream session and capture exact session.ready, observation, action, error, and close frames.
2. Run the @reflex.connect example exactly as documented to resolve the callback argument discrepancy.
3. Create a small dataset and training job, recording complete JSON responses and every returned ID.
4. Run a deployment in dry_run, authorize a session, promote it, and compare session/deployment/artifact identifiers.
5. Inspect one generated recording in each format and verify whether the training backend consumes the LeRobot output without transformation.
6. Determine whether session_id, recording_id, and dataset_id are automatically linked or require explicit client-side bookkeeping.
7. Re-check the metadata-linked repository or obtain the corresponding source release to establish the rfx → reflex boundary.

## Summary judgment

The current public SDK is materially more complete than a documentation-only scan suggests. It exposes a robot execution loop, WebSocket/WebRTC/edge transports, explicit observation/action types, recording writers, dataset APIs, high-level and low-level training APIs, policy registration, deployment/session authorization, robot schemas, pairing, and heartbeats.

The strongest current public data path is:

~~~text
robot connector
→ Observation
→ transport
→ ActionChunk
→ recorder
→ LeRobot/JSONL/MCAP/Rerun
→ dataset API
→ training job
→ model/artifact
→ deployment/session
~~~

The main unresolved areas are the exact server response contracts, callback compatibility, lossless trajectory semantics, and authoritative lineage joins.
+

# Supplemental merged evidence

The sections below preserve details that were present in the source reports but were too implementation-specific to repeat in the shorter main map.

## A. Current SDK implementation details

### A.1 Runner result and execution defaults

**Provenance:** reflex/connect_runner.py in the 0.9.2 wheel; [quickstart](https://tryreflex.ai/docs/quickstart); [connect configuration](https://tryreflex.ai/docs/guides/connect-config).

Runner sequence:

~~~text
load YAML
build connector, cameras, and transport
start transport before hardware is live
read robot state and camera frames
infer an action chunk
apply the chunk in apply_actions mode
on error, safe_stop and stop or continue
~~~

Session-level defaults:

| Field | Default | Meaning |
|---|---:|---|
| mode | dry_run | dry_run or apply_actions. |
| max_steps | 0 | Zero means run until interrupted. |
| control_period_s | 0.0 | Minimum seconds per iteration. |
| stop_on_error | true | Stop after a safe-stop-worthy error. |
| pipeline_inference | true | Prefetch the next inference while the current chunk is applied. |
| heartbeat_interval_s | 10.0 | Heartbeat callback interval. |

Runner result fields:

~~~text
steps
applied_steps
safe_stops
errors
last_action_chunk
~~~

pipeline_inference overlaps inference with hardware application; it does not blend or merge action vectors from different chunks. The source rebinds the prefetched request before recording so the observation/action association remains correct.

### A.2 YAM bimanual connector

**Provenance:** reflex/connectors/yam_bimanual.py and [connect configuration](https://tryreflex.ai/docs/guides/connect-config).

Example:

~~~yaml
hardware:
  kind: yam_bimanual
  config:
    left:
      channel: can1
      gripper: linear_4310
    right:
      channel: can0
      gripper: linear_4310
    hz: 25
    instruction: "pack the container and close the box"
    home_duration_s: 4.0
~~~

Observed implementation behavior:

- lazily imports i2rt;
- requires left.channel and right.channel;
- reads left/right joint positions;
- concatenates normal bimanual state as [left_7..., right_7...];
- defaults hz to 30;
- defaults zero_gravity_mode to false;
- defaults instruction to an empty string;
- defaults home_duration_s to 4.0;
- defaults home_pose to seven values ending in 1.0, with the source comment identifying the gripper value as 1.0 rad;
- defaults chunk_boundary_max_delta to 0.02;
- defaults chunk_apply_horizon to 0, meaning all rows;
- defaults action_step_delay_s to 1/hz;
- validates action dimension;
- rejects non-finite values;
- commands both arms through command_joint_pos;
- stop and safe_stop home the arms, then release or retain torque according to keep_motors_on_after_stop.

The implementation treats each raw action row as a desired joint-position target and computes a bounded move equivalent to:

~~~python
l_safe = l_current + np.clip(
    l_desired - l_current,
    -per_step_max,
    per_step_max,
)
self._left.command_joint_pos(l_safe)
~~~

The same logic applies to the right arm.

**REASONABLE INFERENCE:** at the connector boundary, YAM actions are absolute joint-position targets with a safety delta clamp, not additive delta actions.

The connector:

1. checks total action dimension;
2. rejects non-finite values;
3. interpolates to the first target if the boundary jump exceeds chunk_boundary_max_delta;
4. applies at most chunk_apply_horizon rows, or all rows when zero;
5. waits action_step_delay_s between motor commands.

Nominal horizon:

~~~text
rows_applied = chunk_apply_horizon if nonzero else chunk_length
effective_seconds ≈ rows_applied / hz
~~~

A 30-by-14 chunk at 25 Hz is approximately 1.2 seconds when fully applied. At the default 30 Hz, 30 rows is approximately 1 second.

**UNKNOWN:** whether hosted MolmoAct2/Pi-0.5 transforms or unnormalizes values before the YAM connector receives them. The YAM connector itself contains no model-specific unnormalization. No public field specifies action-vector blending or chunk overlap.

### A.3 Camera sources

**Provenance:** reflex/cameras/base.py, reflex/cameras/v4l2.py, reflex/cameras/realsense.py, reflex/cameras/shm.py, and [connect configuration](https://tryreflex.ai/docs/guides/connect-config).

Documented/implemented camera options:

- v4l2/webcam: device default 0, optional width, height, and FPS;
- RealSense: first device by default, width 640, height 480, FPS 30, color or depth stream;
- shared memory: required name, wait default 5 seconds, path /dev/shm/reflex_cam_<name>.

The SHM broadcaster is not part of the SDK.

### A.4 Shared-memory camera layout

**Provenance:** reflex/cameras/shm.py.

For camera name name, the reader opens:

~~~text
/dev/shm/reflex_cam_name
~~~

It uses read-only os.open plus mmap, avoiding Python multiprocessing shared-memory resource tracking. It maps a read-only NumPy view and returns a copy.

The source defines:

~~~text
HEADER_SIZE = 64
MAGIC = 0xCAFEFACE
~~~

| Byte offset | Type | Meaning |
|---:|---|---|
| 0 | little-endian uint32 | Magic 0xCAFEFACE. |
| 4 | little-endian uint32 | Width. |
| 8 | little-endian uint32 | Height. |
| 12 | little-endian uint32 | Channels. |
| 16 | little-endian uint64 | Sequence counter. |
| 24–63 | 40 bytes | Not interpreted by the public reader. |
| 64 onward | raw uint8 | HWC payload, height × width × channels. |

Equivalent view:

~~~python
np.ndarray(
    (h, w, c),
    dtype=np.uint8,
    buffer=mmap,
    offset=64,
)
~~~

Read behavior:

- reads the sequence before and after copying;
- treats an even initial sequence as writer-in-progress;
- accepts a stable odd sequence with matching reread;
- after ten failed attempts, returns a best-effort copy.

**UNKNOWN:** publisher allocation/lifecycle, exact segment size, writer sequence order, dimension changes, stride/padding, timestamps, frame IDs, and bytes 24–63.

### A.5 Generic action semantics

**Provenance:** reflex/connectors/base.py, reflex/connectors/yam_bimanual.py, reflex/transports/*, and the public schema docs.

**VERIFIED:** public docs call action rows consecutive targets.

**UNKNOWN for generic models:** ActionChunk does not encode:

- absolute versus delta semantics;
- physical units;
- joint order;
- coordinate frame;
- normalization;
- physical limits;
- chunk stride;
- chunk overlap;
- effective horizon.

The YAM connector supplies one concrete connector-level interpretation, but that does not establish the semantics for other hardware or hosted models.

### A.6 More precise LeRobot writer behavior

**Provenance:** reflex/recording/lerobot.py.

Constants/defaults observed:

~~~text
CODEBASE_VERSION = v2.0
CHUNK_DIR = chunk-000
fps = 5.0, adjusted from control_period_s when supplied
task_label = reflex-connect-session unless instruction/prompt supplies one
repo_id = session ID or reflex-<unix timestamp>
jpeg_quality = 90
episode_index = 0
~~~

Task row example:

~~~json
{"task_index": 0, "task": "reflex-connect-session"}
~~~

Data row example:

~~~json
{
  "episode_index": 0,
  "frame_index": 0,
  "timestamp": 0.123456,
  "task_index": 0,
  "observation.state": [0.0, 0.0],
  "action": [0.1, 0.2],
  "next.done": false
}
~~~

Feature declarations include:

~~~json
{
  "observation.state": {
    "dtype": "float32",
    "shape": ["D"],
    "names": ["state_0", "...", "state_D-1"]
  },
  "action": {
    "dtype": "float32",
    "shape": ["A"],
    "names": ["action_0", "...", "action_A-1"]
  },
  "observation.images.<camera>": {
    "dtype": "video",
    "shape": ["H", "W", 3],
    "names": ["height", "width", "channel"],
    "info": {"video.codec": "mp4v", "video.fps": "<fps>"}
  },
  "timestamp": {"dtype": "float32", "shape": [1]},
  "frame_index": {"dtype": "int64", "shape": [1]},
  "episode_index": {"dtype": "int64", "shape": [1]},
  "task_index": {"dtype": "int64", "shape": [1]}
}
~~~

Behavior:

- one episode, index 0;
- elapsed session timestamp rounded to six decimals;
- state/action dimensions inferred from first data;
- missing state/action values are zero-padded after dimensions are known;
- final row sets next.done true;
- OpenCV video fourcc is mp4v;
- missing pyarrow causes an episode JSONL fallback;
- missing OpenCV causes a JPEG frame fallback;
- Parquet state/action columns are explicitly cast to float32.

Critical limitation:

~~~text
Only the first action vector in an incoming chunk is written to action.
The variable-shaped full action chunk is omitted from Parquet.
The full chunk remains available in JSONL, MCAP, and Rerun.
~~~

This is an SDK-side writer format, not proof of the private validator’s exact acceptance schema.

### A.7 JSONL, MCAP, and Rerun details

**Provenance:** reflex/recording/jsonl.py, reflex/recording/mcap.py, and reflex/recording/rerun.py.

JSONL step example:

~~~json
{
  "step": 0,
  "timestamp": 1737830400.0,
  "elapsed_s": 0.123,
  "state": [ ... ],
  "cameras": {"top": "frames/000000_top.jpg"},
  "actions": [[ ... ], [ ... ]],
  "metadata": { ... },
  "embeddings": {"name": "embeddings/000000_name.npy"}
}
~~~

JSONL preserves the full variable-length action chunk.

MCAP output is session.mcap. Messages are JSON-encoded. Camera messages include timestamp/frame index, JPEG base64, and dimensions. State messages include timestamp/frame index and state. Action messages include timestamp/frame index, first action row, and full chunk. Metadata messages include server timing fields. The source says Foxglove protobuf schemas are not yet used.

Rerun output is session.rrd:

~~~text
world/cam/<name>   → rr.Image
robot/state        → rr.Tensor
robot/action       → first action row
robot/action.chunk → full chunk as rr.Tensor
metadata           → text/document logging
~~~

### A.8 Dataset registration and validation

**Provenance:** reflex/datasets.py; [CLI datasets](https://tryreflex.ai/docs/cli/datasets).

Functions:

~~~text
create_dataset
list_datasets
get_dataset
complete_dataset
upload_dataset
register_huggingface_dataset
validate_dataset
~~~

Hugging Face example:

~~~python
register_huggingface_dataset("hf://datasets/owner/repo")
~~~

Validation calls the product operation:

~~~text
publicApi:validateDataset
~~~

The current documentation states that a dataset must be registered and validated before it can be used in a training run.

Documented validation concerns include:

~~~text
episode layout
feature names
action shape
~~~

**VERIFIED:** validation is delegated to the Reflex service/API. The wheel does not contain a complete local validator.

**UNKNOWN:** exact backend schema, required feature names, camera dimensions, FPS/video rules, timestamp semantics, normalization metadata, action units, action semantics, and episode boundaries.

### A.9 Training details not repeated above

**Provenance:** reflex/training.py; [SDK training](https://tryreflex.ai/docs/sdk/training); [CLI training](https://tryreflex.ai/docs/cli/training).

Accepted base-model spellings:

~~~text
pi0.5
pi05
lerobot/pi05_base
~~~

All map to pi0.5. Other values raise a client-side error stating that hosted Convex training supports base_model pi0.5.

Fine-tuning types:

~~~text
lora
full
~~~

Request fields:

~~~text
baseModel
baseModelId
fineTuningType
epochs
modelName
modelVersion
parametersJson
requestId
datasetId
hfSourceUri
~~~

Epochs are clamped to at least 1. Documented terminal statuses are succeeded, failed, and stopped. The CLI documentation says already checkpointed artifacts survive a stopped run.

Python-to-serialized parameter mapping:

| Python argument | Serialized key |
|---|---|
| max_steps | maxSteps |
| batch_size | batchSize |
| learning_rate | learningRate |
| lora_rank | lora.rank |
| lora_alpha | lora.alpha |
| lora_dropout | lora.dropout |
| target_modules | lora.target_modules |
| warmup_steps | warmupSteps |
| gradient_checkpointing | gradient_checkpointing |
| freeze_vision_encoder | freeze_vision_encoder |
| dtype | dtype |
| save_freq | saveFreq |

Parameters are compact sorted JSON with empty/null values removed.

Current Pi-0.5 LoRA target modules observed in the implementation:

~~~text
action_in_proj
action_out_proj
q_proj
k_proj
v_proj
o_proj
gate_proj
up_proj
down_proj
~~~

**UNKNOWN:** whether artifacts immutably retain dataset identity, base-model revision, training-code revision, environment, random seeds, normalization statistics, and exact checkpoint files.

### A.10 Artifacts and model deployment details

**Provenance:** reflex/models.py; [CLI artifacts](https://tryreflex.ai/docs/cli/artifacts); [custom-model deployment guide](https://tryreflex.ai/docs/guides/deploy-custom-model).

The documentation defines an artifact as the output of a successful training run. Artifact retrieval exposes:

~~~text
artifact name
artifact version
base model
training run that produced it
~~~

Full Hugging Face deployment example:

~~~python
client.models.deploy(
    "your-org/your-finetune",
    hf_token="hf_...",
    architecture="pi05",
)
~~~

Return fields:

~~~text
ok
modelId
status
~~~

Observed status progression:

~~~text
provisioning → verifying → ready
                          → failed
~~~

verifying includes model download and a one-shot self-test.

Known Pi-0.5 repositories/configurations use an optimized openpi engine; other repositories use a generic Hugging Face Transformers path.

Optional model I/O fields:

~~~python
state_dim=7
action_dim=7
chunk_size=1
control_hz=5
cameras=["base_0_rgb"]
unnorm_key="bridge_orig"
prompt_template="In: What action...\\n Out:"
~~~

unnorm_key selects checkpoint dataset normalization statistics. The public SDK does not expose those statistics.

Deprecated LoRA paths in reflex/models.py:

~~~text
import_from_hf(hf_repo, name, hf_revision=None, hf_token=None, ...)
upload_direct(adapter_file, adapter_config_json, name, ...)
~~~

import_from_hf accepts an optional hf_revision and pulls the adapter into Reflex-owned storage.

upload_direct:

- is deprecated for full-model deployment;
- requires a .safetensors adapter file;
- requires adapter_config.json as a path or dictionary;
- parses adapter_config.json locally, with server revalidation;
- enforces a 500 MB direct-upload cap;
- requests a presigned Convex storage URL;
- POSTs adapter bytes as application/octet-stream;
- calls publicApi:uploadModelDirect with storage ID, name, and adapter config JSON.

**UNKNOWN:** actual artifact file manifest, tensor naming, base-model digest, dataset identity, normalization arrays, persisted hyperparameters, training-code revision, and reproducibility environment.

### A.11 Session and observability fields

**Provenance:** reflex/sessions.py, reflex/deployments.py, reflex/robots.py, reflex/instances.py, reflex/receipts.py; [observability guide](https://tryreflex.ai/docs/guides/observability).

Documented session fields:

~~~text
always: _id, baseModel, status, createdAt
optional: runtime, robotType, mode, endedAt, closeReason
~~~

The public session/deployment surface includes create_deployment, authorize_session, promote_session, close_session, list_sessions, robot/schema registration, pairing tokens, and heartbeat.

**UNKNOWN:** exact server-side robot-schema contents and whether the schema is authoritative for action dimensions, units, ordering, and coordinate frame.

## B. Historical quantbagel/rfx evidence

Everything in this section is **HISTORICAL** and must not be treated as current reflex-sdk behavior.

### B.1 Repository status and package shape

**Provenance:** [repository API](https://api.github.com/repos/quantbagel/rfx), [pyproject.toml](https://github.com/quantbagel/rfx/blob/main/pyproject.toml), [releases](https://github.com/quantbagel/rfx/releases), [repository tree](https://github.com/quantbagel/rfx/tree/main).

The historical repository metadata reported:

- creation on 2026-02-01;
- latest displayed push on 2026-03-25;
- public, non-archived, non-disabled status;
- MIT license;
- default branch main;
- 83 commits;
- one branch;
- no tags;
- no releases;
- two open issues at the time checked.

The historical package was rfx-sdk version 0.2.0, marked Alpha, requiring Python >=3.13.

The repository combined a Rust workspace and Python SDK:

~~~text
rfx-core
rfx-python / PyO3
rfx/python/rfx/
~~~

The described Rust roles were:

- rfx-core: math, control, hardware drivers, communication, and neural-space definitions;
- rfx-python: PyO3 bindings exposing the compiled rfx._rfx extension.

The Python package included robot protocols/configuration, simulation, real hardware, teleoperation, model hub, agents, skills, decorators, and observation/JIT support. The build configuration used Maturin:

~~~toml
manifest-path = "rfx/crates/rfx-python/Cargo.toml"
python-source = "rfx/python"
module-name = "rfx._rfx"
~~~

### B.2 Historical robot/configuration model

**Provenance:** [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md), [robot/config.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/robot/config.py), [observation.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/observation.py).

The central documented control shape was:

~~~python
observation = robot.observe()
robot.act(action)
robot.reset()
~~~

The design aimed to expose one API across simulation, collection, and real hardware.

robot/config.py defined CameraConfig, JointConfig, and RobotConfig. RobotConfig fields included:

~~~text
name
urdf_path
state_dim
action_dim
max_state_dim
max_action_dim
cameras
joints
control_freq_hz
hardware
~~~

Configuration could be loaded from dictionaries or YAML. Nested camera/joint records were populated by from_dict; to_dict serialized the result. Search paths included the working directory, package configuration directories, and RFX_CONFIG_DIR.

Built-in configurations:

| Config | State/action dimensions | Control rate |
|---|---:|---:|
| SO101_CONFIG | state 12, action 6; max state/action 64 | 50 Hz |
| GO2_CONFIG | state 36, action 12; max state/action 64 | 200 Hz |
| G1_CONFIG | state 69, action 29; max state 128, max action 64 | 50 Hz |
| INNATE_CONFIG | state 12, action 6 | not established in inspected excerpt |

observation.py defined ObservationSpec with state_dim, max_state_dim=64, optional image_shape, num_cameras, and language_dim.

make_observation returned a dictionary with state, optional images, and optional language. State vectors were padded/truncated to the configured maximum; unpad_action reversed action padding; ObservationBuffer provided frame stacking.

### B.3 Historical collection and dataset recording

**Provenance:** [collection/__init__.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/__init__.py), [collection/_recorder.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_recorder.py), [collection/_dataset.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_dataset.py).

The dataset wrapper described itself as a LeRobot dataset backed by parquet and videos, with optional Hugging Face Hub push/pull.

It imported LeRobotDataset from either:

~~~python
lerobot.common.datasets.lerobot_dataset
lerobot.datasets.lerobot_dataset
~~~

Its features included:

- observation.state: float32, shape state_dim;
- action: float32, shape state_dim in the inspected historical code;
- observation.images.<name>: uint8 camera features.

The wrapper exposed creation/opening, from_hub, push, summary, and validation. validate delegated to workflow.quality.validate_dataset when available; if that path failed, it returned basic statistics with a passed=True fallback.

Recorder state included _episode_active, _current_task, and _frame_count. It was thread-safe and could write an MCAP sidecar.

start_episode(task="default") rejected a second active episode, set the active flag and task, reset the frame count, and used an MCAP identifier like episode_<dataset.num_episodes>.

add_frame(state, action=None, images=None) rejected inactive recording. It wrote observation.state, action, and observation.images.<camera_name>. When action was omitted, the historical implementation copied state into action. It tried multiple underlying LeRobot add_frame signatures for version compatibility, incremented the frame count, and optionally wrote MCAP.

save_episode() rejected inactive recording, invoked the underlying finalizer when present, reset active/frame state, saved MCAP data, and returned the frame count. No abort_episode, discard, or rollback method was found.

The collect API exposed output, episode count, duration, task, FPS, state dimension, camera names, Hub push, MCAP, YAML config, port, rate, mock mode, camera IDs, and injectable robot_factory parameters.

### B.4 Historical policy bundle and deployment

**Provenance:** [nn.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/nn.py), [hub.py](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/hub.py), [deploy.py](https://github.com/quantbagel/rfx/blob/main/rfx/python/rfx/deploy.py), [workflow CLI guide](https://github.com/quantbagel/rfx/blob/main/docs/workflow-cli.md).

The historical policy bundle used:

~~~text
rfx_config.json
model.safetensors
normalizer.json            # optional
robot_config               # embedded or externally resolved
training metadata          # metadata
~~~

rfx_config.json was the primary policy descriptor. model.safetensors held weights. normalizer.json was optional. Robot configuration and training metadata could be embedded.

Historical deployment accepted policy_source, optional robot, config, port, rate_hz, duration, mock, device, warmup_s, and verbose.

A Python policy source used _load_policy_from_py; other sources went through load_policy. Robot configuration was then resolved before the control loop. Built-in robot names included so101, go2, g1, and innate.

The historical CLI commands were:

~~~text
rfx record
rfx deploy
rfx doctor
~~~

rfx train and rfx runs were described as secondary workflow metadata/artifact-lineage utilities.

### B.5 Historical merged-PR trajectory

**Provenance:** [all historical pull requests API](https://api.github.com/repos/quantbagel/rfx/pulls?state=all&per_page=100). These are historical signals only.

| PR | Historical signal |
|---|---|
| #1 | Fixed packaged Rust-extension imports from _rfx to ._rfx. |
| #2 | Added disconnected guard and idempotent hardware disconnect cleanup. |
| #3 | Loaded rfx._rfx once and tolerated optional missing Rust exports. |
| #4 | Moved Go2 control toward unitree_sdk2py. |
| #5 | Added system-Python fallback for Unitree SDK Go2 commands. |
| #6 | Used /usr/bin/python3 for the Unitree SDK subprocess backend. |
| #7 | Added direct Dust DDS sport-command publishing for Go2 in Rust. |
| #8 | Published Go2 sport requests directly in the subprocess backend. |
| #9 | Merged/closed entry with no useful architectural detail in the gathered metadata. |
| #10 | Closed rename-src-to-rfx proposal; not mainline evidence. |
| #11 | Corrected NumPy array conversion in _jax_to_torch. |
| #12 | Added simulation extras. |
| #13 | Expanded/re-exported rfx-sdk-go2, rfx-sdk-sim, and rfx-sdk-lerobot packages. |
| #14 | Expanded rfx doctor diagnostics. |
| #15 | Added deployment tests. |
| #16 | Added environment tests. |
| #17 | Added comprehensive deploy-pipeline coverage, reported as 222 tests. |
| #18 | Open proposal to add INNATE_CONFIG to robot re-exports; not mainline evidence. |
| #19 | Open documentation/onboarding/config re-export improvements; not mainline evidence. |

The historical trajectory concentrated on Rust/Python packaging, optional-extension handling, hardware cleanup, Go2 backends, simulation/LeRobot packaging, diagnostics, and deployment-test seams. It does not establish a relationship to current reflex-sdk.

## C. Separate reflex-dev/reflex framework disambiguation

Everything in this section is **CURRENT FRAMEWORK EVIDENCE**, but it refers to the separate reflex-dev/reflex web framework, not the current robotics reflex-sdk wheel.

**Provenance:** [reflex-dev/reflex repository](https://github.com/reflex-dev/reflex), checked commit [dd96aea556948ea95217ef1d8b5431546dc58363](https://github.com/reflex-dev/reflex/commit/dd96aea556948ea95217ef1d8b5431546dc58363), [reflex/state.py](https://github.com/reflex-dev/reflex/blob/main/reflex/state.py), [reflex/app.py](https://github.com/reflex-dev/reflex/blob/main/reflex/app.py), [StateManager](https://github.com/reflex-dev/reflex/blob/main/reflex/istate/manager/__init__.py).

A bounded search of the checked reflex/ package found no matches for:

~~~text
rfx
rfx_config
LeRobot
trajectory
robotics
~~~

This means only that those names were not found in the inspected package snapshot. It does not rule out private applications, plugins, dependencies, branches, or other repositories.

The framework’s architecture is state/event oriented:

- BaseState represents server-side per-client state;
- Delta is a dictionary shaped like dict[str, dict[str, Any]];
- dirty variables and dirty substates track changes;
- event handlers/reducers mutate state;
- StateUpdate carries resolved changes to the client;
- WebSocket/Socket.IO delivery is keyed by client token;
- StateManager supports memory, disk, and Redis implementations.

The checked framework package’s public vocabulary is therefore distinct from the robotics SDK’s Observation, ActionChunk, recording, dataset, training, and deployment vocabulary. No gathered primary source establishes migration, code lineage, or shared implementation.

## D. Additional current documentation URLs

The current SDK report also consulted these first-party pages:

- [Quickstart](https://tryreflex.ai/docs/quickstart)
- [SDK overview](https://tryreflex.ai/docs/sdk/overview)
- [CLI connect](https://tryreflex.ai/docs/cli/connect)
- [CLI datasets](https://tryreflex.ai/docs/cli/datasets)
- [CLI training](https://tryreflex.ai/docs/cli/training)
- [CLI artifacts](https://tryreflex.ai/docs/cli/artifacts)
- [Custom-model deployment](https://tryreflex.ai/docs/guides/deploy-custom-model)
- [Observability](https://tryreflex.ai/docs/guides/observability)

## E. Final consolidated boundary

**CURRENT ROBOTICS SDK:** The public reflex-sdk 0.9.2 wheel exposes a complete robot-side inference and platform-management surface: connectors, cameras, WebSocket/WebRTC/edge/hosted transports, observations, action chunks, recording writers, dataset registration/upload/validation, training jobs, low-level LoRA control, policy registration, models, deployments, sessions, robot schemas, pairing, and heartbeats.

**HISTORICAL ROBOTICS SDK:** quantbagel/rfx was a separate alpha robotics project organized around robot observe/act/reset, episode/frame collection, LeRobot datasets, policy bundles, hardware adapters, simulation, and deployment.

**SEPARATE FRAMEWORK:** reflex-dev/reflex is a state/event/delta web framework and should not be conflated with either robotics package.

**UNRESOLVED:** The public evidence does not establish whether current reflex-sdk is a rename, rewrite, fork, or parallel successor to quantbagel/rfx; does not establish the complete backend response schemas; and does not establish the complete session → recording → dataset → training → artifact → deployment lineage graph.
