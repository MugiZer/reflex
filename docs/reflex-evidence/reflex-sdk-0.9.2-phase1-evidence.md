# Reflex public SDK and robot-learning stack

## Phase 1 findings and source map

**Verification date:** 2026-08-29  
**Scope:** current public Reflex SDK, robot observations/actions, recording, dataset conversion and validation, training, artifacts, deployment, and inference.  
**Primary evidence:** published reflex-sdk 0.9.2 wheel plus first-party documentation at tryreflex.ai.  
**Historical evidence:** none. quantbagel/rfx was not used.

This report attributes implementation claims to exact files inside the published wheel. It attributes API/behavior claims to linked first-party documentation. It distinguishes verified facts, inferences, and unknowns.

## 1. Provenance and current-source status

### Package

Source: PyPI release page, https://pypi.org/project/reflex-sdk/0.9.2/

- Package: reflex-sdk
- Version inspected: 0.9.2
- Python module: reflex
- CLI: reflex
- Python requirement: >=3.9
- License metadata: Proprietary
- Package purpose: hosted Reflex training, datasets, managed instances, and action inference.
- Homepage: https://tryreflex.ai
- Repository recorded in package metadata: https://github.com/reflex-inc/reflex

The wheel entry point is:

~~~text
[console_scripts]
reflex = reflex.cli:main_reflex
~~~

The package description says:

~~~text
This package is intentionally separate from inference/, which owns model
serving and Prime worker runtime code.
~~~

The published wheel was inspected from the direct PyPI artifact linked by that release page and extracted into:

~~~text
C:\Users\moham\Documents\Codex\2026-08-29\reflex-phase1-research-2\work\wheel
~~~

### Source-404 issue

**VERIFIED:** The repository URL recorded in the package metadata returned 404 when checked on 2026-08-29.

**VERIFIED:** The inspected package metadata and version files did not contain a Git commit, tag, VCS revision, build ID, or source archive reference.

**UNKNOWN:** Which exact source commit or tag produced version 0.9.2. The 404 does not distinguish a moved, private, deleted, or renamed repository.

**Provenance rule for this report:** source-level findings are from the published 0.9.2 wheel paths, not from an unrecoverable Git revision.

## 2. Current package surface

Source: reflex/__init__.py and the module files listed in Section 16.

### Top-level observation/action/policy exports

~~~text
ActionChunk
ActionStream
Observation
Policy
RTCMode
Schema
build_infer_fn
load_policy
register_policy
registered_policies
infer_actions
action
connect
observation
~~~

### Top-level training exports

~~~text
AdamParams
AdapterHandle
Datum
ForwardBackwardResult
LoraTrainingClient
OptimStepResult
ServiceClient
cancel_training_job
create_training_job
full_finetune
full_train
get_training_job
list_training_jobs
lora_finetune
~~~

### Top-level service exports

~~~text
Client
create_dataset
get_dataset
list_datasets
complete_dataset
upload_dataset
register_huggingface_dataset
validate_dataset
create_deployment
create_deployment_from_spec
get_deployment
list_deployments
run_deployment_doctor
authorize_session
close_session
list_sessions
promote_session
create_pairing_token
claim_pairing_token
heartbeat_robot
list_robot_schemas
list_robots
register_robot
register_robot_schema
instance_status
provision_instance
teardown_instance
list_receipts
run_robot_execution_loop
RobotExecutionConfig
RobotExecutionResult
~~~

### Important wheel modules

| Source path in wheel | Role |
|---|---|
| reflex/actions.py | ActionStream, decorators, one-shot infer_actions, WebSocket framing. |
| reflex/connect_runner.py | YAML runner and closed-loop execution. |
| reflex/connectors/base.py | Observation, ActionChunk, RobotConnector. |
| reflex/connectors/shell.py | Subprocess observe/action connector. |
| reflex/connectors/yam_bimanual.py | i2rt YAM bimanual connector and safety logic. |
| reflex/cameras/base.py | CameraSource interface. |
| reflex/cameras/shm.py | Shared-memory camera reader. |
| reflex/cameras/v4l2.py | V4L2/webcam source. |
| reflex/cameras/realsense.py | RealSense source. |
| reflex/transports/base.py | InferenceRequest and Transport interface. |
| reflex/transports/webrtc.py | WebRTC DataChannel transport. |
| reflex/transports/_webrtc_client.py | SDP signaling and per-call DataChannel client. |
| reflex/transports/_webrtc_streaming_client.py | Sustained DataChannel client. |
| reflex/transports/edge_http.py | HTTP inference transport. |
| reflex/transports/hosted.py | Hosted/session-mediated transport. |
| reflex/recording/__init__.py | Recorder registry and SessionRecorder. |
| reflex/recording/lerobot.py | Single-episode LeRobot-compatible writer. |
| reflex/recording/jsonl.py | JSONL plus JPEG/NumPy sidecars. |
| reflex/recording/mcap.py | MCAP writer with JSON messages. |
| reflex/recording/rerun.py | Rerun RRD writer. |
| reflex/recording/cloud.py | Cloud recording upload/commit path. |
| reflex/datasets.py | Dataset registration/upload/validation wrappers. |
| reflex/training.py | High-level training and low-level LoRA client. |
| reflex/models.py | HF deployment and deprecated LoRA import/upload paths. |
| reflex/deployments.py, sessions.py, robots.py, instances.py, receipts.py | Platform API wrappers. |
| reflex/policy.py, reflex/policies/hf_generic.py | Policy abstractions and generic HF inference. |

## 3. Observation and action contracts

### Python dataclasses

Source: reflex/connectors/base.py.

~~~python
@dataclass
class Observation:
    state: list[float]
    cameras: dict[str, Any] = field(default_factory=dict)
    task: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

@dataclass
class ActionChunk:
    actions: list[list[float]]
    metadata: dict[str, Any] = field(default_factory=dict)
~~~

Source: reflex/transports/base.py.

~~~python
@dataclass
class InferenceRequest:
    observation: Observation
    control_step: int = 0
    extra: dict[str, Any] = field(default_factory=dict)
~~~

RobotConnector methods:

~~~text
start()
get_observation()
apply_action(action_chunk)
safe_stop(reason="")
stop()
~~~

CameraSource methods:

~~~text
start()
read()
stop()
~~~

### Documented logical JSON

Source: https://tryreflex.ai/docs/guides/observation-action-schema

The docs say all public inference paths exchange observations and action chunks.

Observation fields:

| Field | Type | Required | Meaning |
|---|---|---:|---|
| state | list[float] | yes | Proprioception; length depends on embodiment. |
| images | dict[str, ...] | no | Camera names to base64 JPEG or raw bytes. |
| prompt | string | no | Per-step prompt override. |
| seq | int | no | Caller sequence; SDK fills one if omitted. |
| capture_time_ns | int | no | Capture wall-clock nanoseconds. |
| request_id | string | no | Inference idempotency key. |
| max_gpu_seconds | float | no | Per-request GPU-time cap. |

Documented action chunk:

~~~json
{
  "type": "action_chunk",
  "seq": 17,
  "actions": [
    [0.0, 0.01, 0.02],
    [0.0, 0.02, 0.04],
    [0.0, 0.03, 0.06]
  ],
  "metadata": {
    "model": "pi0.5",
    "inference_ms": 0
  }
}
~~~

The docs call each inner action vector a consecutive target. They do not define universal units, coordinate frames, normalization, or action dimension. Metadata keys are not promised stable.

The server is documented to reject state vectors whose length does not match the embodiment's expected dimension.

Safe-stop payload:

~~~json
{
  "reason": "transport_error",
  "message": "websocket closed unexpectedly",
  "session_id": "session_..."
}
~~~

Shell behavior:

- observe command prints exactly one observation JSON object per line;
- action command receives one action-chunk JSON object on stdin;
- nonzero action-command exit invokes safe-stop.

## 4. Inference paths and wire formats

### 4.1 ActionStream

Sources: reflex/actions.py and https://tryreflex.ai/docs/sdk/action-stream

Source protocol:

~~~text
1. open a WebSocket with an API key
2. send observation frames with embodiment state and camera images
3. receive metered action_chunk frames
~~~

The URL helper maps an HTTP(S) base URL to /v1/actions or accepts ws/wss URLs. The implementation hand-builds WebSocket frames and serializes payloads as compact JSON text.

Constructor fields:

~~~python
ActionStream(
    *,
    url=None,
    api_key=None,
    prompt: str,
    model=None,
    lora=None,
    robot=None,
    action_adapter=None,
    cameras=None,
    hz=None,
    chunk_size=None,
    max_gpu_seconds=None,
    session_id="",
    timeout=30.0,
    connect_retry_seconds=None,
)
~~~

Lifecycle:

~~~text
session.open -> session.ready
observation -> action_chunk
session.close
~~~

send_observation emits state, images, prompt, sequence, request ID, capture timestamp, and GPU cap. Byte images are normalized to an encoding/data object. recv_action waits for action_chunk and raises on an error frame. The default transient-connect retry budget is 90 seconds, bounded by timeout; retryable handshake codes include 403, 404, 408, 425, 429, and 5xx.

Public methods/properties:

~~~text
open()
close()
send_observation(...)
send_observation_frame(frame)
recv_action()
send_raw(frame)
receive()
ready
session_id
open_timing
~~~

### 4.2 Config runner WebRTC

Sources: reflex/transports/webrtc.py and reflex/transports/_webrtc_client.py. Docs: https://tryreflex.ai/docs/guides/connect-config

The source module states:

~~~text
one-shot SDP exchange via HTTPS POST to <url>/webrtc-offer
per-call observation sent as msgpack over the SCTP DataChannel
action chunk returned synchronously per call
~~~

The bundled client describes:

~~~text
1. HTTPS POST /webrtc-offer with an SDP offer
2. server returns SDP answer
3. establish DataChannel and send inference requests over UDP
~~~

After setup, inference uses the DataChannel rather than more HTTPS/TLS requests. Msgpack is the default when available; REFLEX_WIRE=json switches to JSON.

WebRTCTransport fields:

| Field | Default | Meaning |
|---|---:|---|
| url | required | Worker/signaling base URL. |
| timeout_s | 60.0 | Per-call inference timeout. |
| connect_timeout_s | 60.0 | Signaling plus ICE/DTLS budget. |
| img_size | 256 | Square camera resize before send. |
| camera_field_map | top/left/right mapping | Local camera channel to wire key. |
| state_field | state | Proprioception key. |
| instruction_field | prompt | Instruction key. |
| extra_payload | empty mapping | Merged into every call. |
| streaming | false | Sustained DataChannel client when true. |
| auth_token | none | Optional session token. |
| session_id | none | Optional dashboard/session ID. |
| deployment_id | none | Optional dashboard grouping. |
| robot_id | none | Optional dashboard grouping. |
| robot_name | none | Optional dashboard grouping. |

Per-call construction in reflex/transports/webrtc.py:

~~~python
{
    state_field: list(obs.state),
    instruction_field: obs.task,
    "images": self._encode_images(obs.cameras),
    **extra_payload,
}
~~~

Responses accept actions_aloha, actions_pi, or actions, normalize to list-of-lists, and place non-action response keys in ActionChunk.metadata.

Images are JPEG-encoded and resized to img_size square. The source documents a roughly 256 KB DataChannel message limit and includes an ndarray BGR conversion path, while the public CameraSource contract describes HWC RGB output.

### 4.3 Relation between ActionStream and WebRTC

**VERIFIED:** these are separate implementation paths.

- ActionStream is direct SDK/decorator/one-shot WebSocket plus JSON.
- target.kind: webrtc in reflex connect selects WebRTCTransport and DataChannel plus msgpack.
- target.kind: platform is documented as an older authenticated WebSocket path.
- reflex/connect_runner.py selects transports through build_transport.

**INFERENCE:** the documentation's shared observation/action claim means logical schema compatibility, not byte-level protocol interchangeability.

### 4.4 Edge and hosted paths

Source: reflex/transports/edge_http.py.

- HTTP POST inference.
- state field default: state.
- instruction field default: instruction.
- camera map defaults: top_cam, left_cam, right_cam.
- actions_path default: actions.
- encoding supports json_numpy and json.
- dotted response paths are supported.
- one- and two-dimensional outputs normalize to list-of-lists.

Source: reflex/transports/hosted.py.

- uses a hosted/session-mediated path involving Convex rendezvous and worker infrastructure;
- payload includes session ID, control step, task, state, and images;
- exact server-side implementation is not present in the wheel.

## 5. YAML runner and execution semantics

Sources: reflex/connect_runner.py, https://tryreflex.ai/docs/guides/connect-config, https://tryreflex.ai/docs/quickstart

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

Session-level fields:

| Field | Default | Meaning |
|---|---:|---|
| mode | dry_run | dry_run or apply_actions. |
| max_steps | 0 | Zero means run until interrupted. |
| control_period_s | 0.0 | Minimum seconds per iteration. |
| stop_on_error | true | Stop after safe-stop-worthy error. |
| pipeline_inference | true | Prefetch next inference while current chunk is applied. |
| heartbeat_interval_s | 10.0 | Heartbeat callback interval. |

RunnerResult fields:

~~~text
steps
applied_steps
safe_stops
errors
last_action_chunk
~~~

The source rebinds the prefetched request before recording so the observation/action association remains correct in pipelined runs.

pipeline_inference overlaps inference with hardware application. It does not blend or merge action vectors from different chunks.

## 6. Robot and camera configuration

### YAM bimanual

Source: reflex/connectors/yam_bimanual.py. Docs: https://tryreflex.ai/docs/guides/connect-config

Example:

~~~yaml
hardware:
  kind: yam_bimanual
  config:
    left:  { channel: can1, gripper: linear_4310 }
    right: { channel: can0, gripper: linear_4310 }
    hz: 25
    instruction: "pack the container and close the box"
    home_duration_s: 4.0
~~~

Source facts:

- lazy-imports i2rt;
- requires left.channel and right.channel;
- reads left/right joint positions;
- concatenates normal bimanual state as [left_7..., right_7...];
- default hz is 30;
- default zero_gravity_mode is false;
- default instruction is empty;
- default home_duration_s is 4.0;
- default home_pose is seven values ending in 1.0; the source comment identifies the gripper value as 1.0 rad;
- default chunk_boundary_max_delta is 0.02;
- default chunk_apply_horizon is 0, meaning all rows;
- default action_step_delay_s is 1/hz;
- validates action dimension and rejects non-finite values;
- commands both arms through command_joint_pos;
- stop and safe_stop home the arms and then release or retain torque according to keep_motors_on_after_stop.

### Camera configuration

The docs expose:

- v4l2/webcam: device default 0, optional width/height/FPS;
- realsense: first device by default, width 640, height 480, FPS 30, stream color or depth;
- shm: required name, wait default 5 seconds, path /dev/shm/reflex_cam_<name>.

The SHM broadcaster is not part of the SDK.

## 7. Action semantics, units, and chunk horizon

### Generic contract

**VERIFIED:** docs call action rows consecutive targets.

**UNKNOWN for generic models:** ActionChunk does not encode absolute versus delta semantics, physical units, joint order, coordinate frame, normalization, physical limits, chunk stride, overlap, or effective horizon.

### YAM connector

**VERIFIED:** current YAM code treats each raw action row as a desired joint-position target and computes a bounded move:

~~~python
l_safe = l_current + np.clip(
    l_desired - l_current,
    -per_step_max,
    per_step_max,
)
self._left.command_joint_pos(l_safe)
~~~

The same logic applies to the right arm.

**INFERENCE:** at the connector boundary, this is absolute-target behavior with a safety delta clamp; it is not an additive delta-action interface.

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

The quickstart's 30-by-14 chunk at hz 25 is approximately 1.2 seconds when fully applied. The config default is 30 Hz, where 30 rows is approximately 1 second.

**UNKNOWN:** whether hosted MolmoAct2/pi0.5 transforms or unnormalizes values before the YAM connector receives them. The YAM connector itself has no model-specific unnormalization.

No public field specifies action-vector blending or chunk overlap.

## 8. Shared-memory camera layout

Source: reflex/cameras/shm.py. Docs: https://tryreflex.ai/docs/guides/connect-config

### Path and behavior

For camera name name, the reader opens:

~~~text
/dev/shm/reflex_cam_name
~~~

It uses read-only os.open plus mmap, avoiding Python's multiprocessing shared-memory resource tracker. It maps a read-only NumPy view and returns a copy from read.

### Reader-consumed binary layout

The source defines HEADER_SIZE = 64 and MAGIC = 0xCAFEFACE.

| Byte offset | Type | Meaning |
|---:|---|---|
| 0 | little-endian uint32 | Magic 0xCAFEFACE. |
| 4 | little-endian uint32 | Width. |
| 8 | little-endian uint32 | Height. |
| 12 | little-endian uint32 | Channels. |
| 16 | little-endian uint64 | Sequence counter. |
| 24-63 | 40 bytes | Not interpreted by the public reader. |
| 64 onward | raw uint8 | HWC payload, height x width x channels. |

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

**UNKNOWN:** publisher allocation/lifecycle, exact segment size, writer sequence order, dimension changes, stride/padding, timestamps, frame IDs, and bytes 24-63.

## 9. Recording and trajectory formats

### 9.1 Recorder registry

Source: reflex/recording/__init__.py.

Registered formats:

~~~text
lerobot
jsonl
mcap
rerun
~~~

Defaults:

~~~text
DEFAULT_FORMAT = lerobot
DEFAULT_ROOT = ~/.reflex/recordings
~~~

Default directory:

~~~text
~/.reflex/recordings/<user-slug>/<session-id>/
~~~

User slug:

- first 16 hexadecimal characters of SHA1(api_key);
- anonymous when no API key is present.

RecorderBackend methods:

~~~text
start(meta)
record_step(step, state, cameras, actions, metadata, embeddings)
stop() -> dict
~~~

SessionRecorder defaults:

~~~text
jpeg_quality=90
save_embeddings=False
queue_size=256
~~~

It uses a bounded nonblocking queue and worker thread; steps can be dropped under backpressure. Stop reports total steps, dropped steps, backend failures, duration, FPS, output directory, session ID, user slug, and backend summaries.

### 9.2 LeRobot writer

Source: reflex/recording/lerobot.py.

Directory:

~~~text
meta/info.json
meta/episodes.jsonl
meta/tasks.jsonl
data/chunk-000/episode_000000.parquet
videos/chunk-000/observation.images.<camera>/episode_000000.mp4
~~~

Constants:

~~~text
CODEBASE_VERSION = v2.0
CHUNK_DIR = chunk-000
~~~

Defaults:

~~~text
fps = 5.0, adjusted from control_period_s when supplied
task_label = reflex-connect-session unless instruction/prompt supplies one
repo_id = session ID or reflex-<unix timestamp>
jpeg_quality = 90
episode_index = 0
~~~

Task row:

~~~json
{"task_index": 0, "task": "reflex-connect-session"}
~~~

Data row:

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

Feature schema:

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
- missing state/action values zero-padded once dimensions are known;
- final row sets next.done true;
- OpenCV video fourcc is mp4v;
- pyarrow absence causes episode JSONL fallback;
- OpenCV absence causes JPEG frame fallback;
- Parquet state/action columns are explicitly cast to float32.

Critical limitation:

~~~text
Only the first action vector in an incoming chunk is written to action.
The variable-shaped full action chunk is omitted from Parquet.
The full chunk remains available in JSONL, MCAP, and Rerun.
~~~

This is an SDK-side writer format, not proof of the private validator's exact acceptance schema.

### 9.3 JSONL writer

Source: reflex/recording/jsonl.py.

Layout:

~~~text
meta.json
steps.jsonl
frames/<step>_<camera>.jpg
embeddings/<step>_<name>.npy when save_embeddings=True
~~~

Step record:

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

### 9.4 MCAP writer

Source: reflex/recording/mcap.py.

Output: session.mcap.

Channels:

~~~text
/observation/cameras/<name>
/observation/state
/action
/metadata
~~~

Messages are JSON-encoded. Camera messages include timestamp/frame index, JPEG base64, and dimensions. State messages include timestamp/frame index and state. Action messages include timestamp/frame index, first action row, and full chunk. Metadata messages include server timing fields. The source says Foxglove protobuf schemas are not yet used.

### 9.5 Rerun writer

Source: reflex/recording/rerun.py.

Output: session.rrd.

~~~text
world/cam/<name>   -> rr.Image
robot/state        -> rr.Tensor
robot/action       -> first action row
robot/action.chunk -> full chunk as rr.Tensor
metadata           -> text/document logging
~~~

### 9.6 Cloud recording

Sources: reflex/recording/cloud.py and https://tryreflex.ai/docs/guides/observability

Upload sequence:

1. Create recording row through publicApi:createRecordingUpload.
2. Upload session tarball to a presigned storage URL.
3. Commit through publicApi:commitRecordingUpload with IDs, size, SHA, and metadata.

First-party recording fields:

~~~text
id
sessionId
formats
sizeBytes
sha256
status
createdAt
~~~

The recording sessionId joins to session _id. CLI recording defaults to lerobot and supports lerobot, jsonl, mcap, and rerun.

## 10. Dataset registration, conversion, and validation

Source: reflex/datasets.py.

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

Local upload:

1. create_dataset posts to /v1/datasets with name, optional size, and request ID.
2. The service returns a presigned upload target.
3. upload_dataset uploads the artifact and calls /v1/datasets/{id}/complete.

HF registration:

~~~python
register_huggingface_dataset("hf://datasets/owner/repo")
~~~

The wrapper calls Convex publicApi:registerDataset.

Validation:

~~~python
convex_action(
    "publicApi:validateDataset",
    {"apiKey": ..., "datasetId": dataset_id},
)
~~~

First-party docs: https://tryreflex.ai/docs/cli/datasets

They state:

~~~text
A dataset must be registered and validated before it can be used in a training run.
~~~

Validation checks:

~~~text
episode layout, feature names, action shape
~~~

Success transitions the dataset to validated.

**VERIFIED conclusion:** validation is delegated to the Reflex service/API. The wheel does not contain a complete local validator.

**UNKNOWN:** exact backend schema, required feature names, camera dimensions, FPS/video rules, timestamp semantics, normalization metadata, action units, action semantics, and episode boundaries.

## 11. Training entry points and data formats

Source: reflex/training.py. Docs: https://tryreflex.ai/docs/sdk/training

### High-level training

Functions:

~~~text
create_training_job
lora_finetune
full_finetune
get_training_job
list_training_jobs
cancel_training_job
~~~

create_training_job requires exactly one of dataset_id or hf_source_uri.

Accepted base-model spellings:

~~~text
pi0.5
pi05
lerobot/pi05_base
~~~

All map to pi0.5. Other values raise a client-side error saying hosted Convex training supports base_model pi0.5.

Fine-tuning types:

~~~text
lora
full
~~~

Request fields include:

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

Epochs are clamped to at least 1. Documented terminal statuses are succeeded, failed, and stopped. The CLI says already checkpointed artifacts survive a stopped run.

### Parameter JSON

Source: reflex/training.py.

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

Current pi0.5 LoRA target modules:

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

### Low-level LoRA interface

Source: reflex/training.py.

~~~python
@dataclass(frozen=True)
class Datum:
    observation: dict[str, Any]
    actions: list[list[float]]
    loss_weights: list[float] | None = None
    metadata: dict[str, Any] | None = None
~~~

~~~python
@dataclass(frozen=True)
class AdamParams:
    learning_rate: float
    beta1: float = 0.9
    beta2: float = 0.95
    eps: float = 1e-8
    weight_decay: float = 0.0
    max_grad_norm: float | None = None
~~~

Methods:

~~~text
forward_backward(data, loss_fn="behavior_cloning", microbatch_size=None, request_id="")
optim_step(params, request_id="")
save_adapter(name="", version="")
save_state(name)
status()
~~~

Each method has an async variant. forward_backward posts to /v1/training-runs/{run_id}/forward-backward.

Result types:

~~~text
ForwardBackwardResult(loss, metrics, raw)
OptimStepResult(step, metrics, raw)
AdapterHandle(lora, name, version, adapter_id, raw)
~~~

**VERIFIED:** request-time values include base model, dataset ID or HF URI, training type, epochs, model name/version, request ID, and serialized parameters.

**UNKNOWN:** whether artifacts immutably retain dataset identity, base-model revision, training-code revision, environment, random seeds, normalization statistics, and exact checkpoint files.

## 12. Artifacts, LoRA files, and deployment

### Artifact metadata

Source: https://tryreflex.ai/docs/cli/artifacts

The docs define an artifact as the output of a successful training run. artifacts get returns:

~~~text
artifact name
artifact version
base model
training run that produced it
~~~

### Full Hugging Face deployment

Sources: reflex/models.py and https://tryreflex.ai/docs/guides/deploy-custom-model

Example:

~~~python
c.models.deploy(
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

Statuses:

~~~text
provisioning -> verifying -> ready
                         -> failed
~~~

verifying means model download plus a one-shot self-test.

Known pi0.5 repositories/configurations use an optimized openpi engine; other repositories use generic Hugging Face Transformers.

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

### LoRA import/upload

Source: reflex/models.py.

~~~text
import_from_hf(hf_repo, name, hf_revision=None, hf_token=None, ...)
upload_direct(adapter_file, adapter_config_json, name, ...)
~~~

import_from_hf:

- deprecated adapter-import path;
- accepts optional hf_revision;
- pulls the adapter into Reflex-owned storage.

upload_direct:

- deprecated for full-model deployment;
- requires a .safetensors adapter file;
- requires adapter_config.json as a path or dictionary;
- parses adapter_config.json locally and says the server revalidates it;
- enforces a 500 MB direct-upload cap;
- requests a presigned Convex storage URL;
- POSTs adapter bytes as application/octet-stream;
- calls publicApi:uploadModelDirect with storage ID, name, and adapter config JSON.

**VERIFIED:** public metadata exposes artifact name/version/base model/training run; adapter handles expose adapter name/version/ID; HF adapter import can accept a pinned revision.

**UNKNOWN:** actual artifact file manifest, tensor naming, base-model digest, dataset identity, normalization arrays, persisted hyperparameters, training-code revision, and reproducibility environment.

## 13. Sessions, deployments, and observability

Sources: reflex/client.py, reflex/deployments.py, reflex/sessions.py, reflex/robots.py, reflex/instances.py, reflex/receipts.py. Docs: https://tryreflex.ai/docs/guides/observability

Documented session fields:

~~~text
always: _id, baseModel, status, createdAt
optional: runtime, robotType, mode, endedAt, closeReason
~~~

Deployment/session helpers:

~~~text
create_deployment(name, model_id, robot_schema_id=None, runtime=None,
                  mode="dry_run", spec=None)
authorize_session(...)
promote_session
close_session
list_sessions
~~~

Robot/schema helpers include registration, listing, pairing-token creation/claim, and heartbeat.

**UNKNOWN:** exact server-side robot schema contents and whether it is authoritative for action dimensions, units, ordering, and coordinate frame.

## 14. Current versus historical

### Current evidence

- Published PyPI reflex-sdk 0.9.2 artifacts.
- Source files extracted from that wheel.
- First-party docs at tryreflex.ai/docs.
- Current 404 check of the repository URL recorded in package metadata.

### Historical evidence not used

No factual claim relies on quantbagel/rfx or another historical mirror. Comments inside the current wheel mentioning older implementations were not used as independent historical evidence.

## 15. High-value unresolved questions

1. Which Git commit/tag produced the published 0.9.2 wheel?
2. Is github.com/reflex-inc/reflex moved, private, deleted, or renamed?
3. What exact schema does publicApi:validateDataset enforce?
4. Does the server accept the exact LeRobot directory emitted by reflex/recording/lerobot.py?
5. For each hosted model/robot adapter, what are action units, ordering, frame, normalization, physical limits, chunk stride, and overlap policy?
6. Does MolmoAct2/pi0.5 transform or unnormalize actions before they reach a connector?
7. What exact files and metadata are inside a successful artifact/LoRA checkpoint?
8. Where are base-model revision, dataset identity, normalization statistics, hyperparameters, and training-code revision persisted?
9. Where is the SHM broadcaster, and what do bytes 24-63 contain?
10. Is first-row-only LeRobot action sufficient for training, and how are full action chunks used or discarded?
11. Are ActionStream JSON and WebRTC msgpack guaranteed schema-equivalent across all models?

## 16. Source index

### Package and repository

- https://pypi.org/project/reflex-sdk/
- https://pypi.org/project/reflex-sdk/0.9.2/
- https://pypi.org/pypi/reflex-sdk/0.9.2/json
- https://github.com/reflex-inc/reflex

### First-party documentation

- https://tryreflex.ai/docs
- https://tryreflex.ai/docs/quickstart
- https://tryreflex.ai/docs/guides/observation-action-schema
- https://tryreflex.ai/docs/guides/connect-config
- https://tryreflex.ai/docs/cli/connect
- https://tryreflex.ai/docs/sdk/overview
- https://tryreflex.ai/docs/sdk/action-stream
- https://tryreflex.ai/docs/sdk/connect-decorator
- https://tryreflex.ai/docs/sdk/datasets
- https://tryreflex.ai/docs/cli/datasets
- https://tryreflex.ai/docs/sdk/training
- https://tryreflex.ai/docs/cli/training
- https://tryreflex.ai/docs/cli/artifacts
- https://tryreflex.ai/docs/guides/deploy-custom-model
- https://tryreflex.ai/docs/sdk/deployments
- https://tryreflex.ai/docs/sdk/types
- https://tryreflex.ai/docs/guides/observability

### Wheel paths inspected

~~~text
reflex/__init__.py
reflex/actions.py
reflex/connect_runner.py
reflex/connectors/base.py
reflex/connectors/shell.py
reflex/connectors/yam_bimanual.py
reflex/cameras/base.py
reflex/cameras/shm.py
reflex/cameras/v4l2.py
reflex/cameras/realsense.py
reflex/transports/base.py
reflex/transports/webrtc.py
reflex/transports/_webrtc_client.py
reflex/transports/_webrtc_streaming_client.py
reflex/transports/edge_http.py
reflex/transports/hosted.py
reflex/recording/__init__.py
reflex/recording/lerobot.py
reflex/recording/jsonl.py
reflex/recording/mcap.py
reflex/recording/rerun.py
reflex/recording/cloud.py
reflex/recording/s3_upload.py
reflex/datasets.py
reflex/training.py
reflex/models.py
reflex/deployments.py
reflex/sessions.py
reflex/robots.py
reflex/robot_runtime.py
reflex/policy.py
reflex/policies/hf_generic.py
reflex_sdk-0.9.2.dist-info/METADATA
reflex_sdk-0.9.2.dist-info/RECORD
reflex_sdk-0.9.2.dist-info/WHEEL
reflex_sdk-0.9.2.dist-info/entry_points.txt
~~~

