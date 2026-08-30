# Reflex public SDK and data/training-system map

Checked 2026-08-29. This report consolidates the public package, official documentation, and implementation evidence gathered for Phase 1. It covers the public SDK/package surface only; it is not a literature review or project recommendation.

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

