# Reflex Phase 1 Research: Historical `quantbagel/rfx` and Current Reflex

## Scope and conclusion

This report records the historical architecture of `quantbagel/rfx` and compares it with the current public `reflex-dev/reflex` source. The purpose is to preserve useful architectural instincts for later reverse engineering without treating the historical robotics SDK as current Reflex behavior.

**Conclusion:** the evidence supports two different architectural centers of gravity. **[HISTORICAL]** `quantbagel/rfx` was an alpha robotics SDK organized around robot observation/action/reset, episode recording, LeRobot datasets, policy bundles, deployment, and Rust/Python hardware seams. **[CURRENT]** Reflex is organized around server-side per-client state, event handlers, dirty-state deltas, WebSocket/Socket.IO delivery, and pluggable state managers. No gathered primary source establishes migration, code lineage, or shared implementation between them.

## Claim and provenance discipline

- Every statement about `quantbagel/rfx` in this document is explicitly marked **[HISTORICAL]**.
- Statements about Reflex are marked **[CURRENT]** and refer to the public source snapshot checked at commit [`dd96aea556948ea95217ef1d8b5431546dc58363`](https://github.com/reflex-dev/reflex/commit/dd96aea556948ea95217ef1d8b5431546dc58363), whose commit message was `Event processor fix (#6801)`.
- Historical repository metadata and pull-request status came from official GitHub API pages; package/module behavior came from official GitHub source, raw files, and repository documentation.
- The Firecrawl Developer Index was attempted first for the historical README/issues/merged-PR lookup. The indexed README result was available in the earlier research pass; a later Developer Index request returned `Auth required`, so the remaining evidence was checked against targeted official GitHub pages, raw files, and the GitHub API. No bulk crawl was used.
- Absence claims are bounded: “not found” means not found in the inspected current `reflex/` package snapshot or named historical files, not proof that no private application, external dependency, branch, or older commit contains the term.

## Executive evidence table

| Question | Finding | Exact provenance |
|---|---|---|
| Repository age/status | **[HISTORICAL]** The repository metadata reports creation on 2026-02-01, latest push on 2026-03-25, public/non-archived status, default branch `main`, and two open issues. **[HISTORICAL]** The package was version `0.2.0`, Python `>=3.13`, and marked `Development Status :: 3 - Alpha`. **[HISTORICAL]** GitHub showed no releases and no tags. | [repository API](https://api.github.com/repos/quantbagel/rfx), [`pyproject.toml`](https://github.com/quantbagel/rfx/blob/main/pyproject.toml), [releases](https://github.com/quantbagel/rfx/releases) |
| Package shape | **[HISTORICAL]** A Rust workspace (`rfx-core`, `rfx-python`/PyO3) backed a Python SDK with robot protocols/config, real hardware, simulation, teleoperation, collection, model hub, agents, skills, decorators, and observation/JIT support. | [`rfx/` tree](https://github.com/quantbagel/rfx/tree/main/rfx), [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md) |
| Robot control loop | **[HISTORICAL]** The central interface was summarized as `observation = robot.observe(); robot.act(action); robot.reset()`. | [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md) |
| Recording unit | **[HISTORICAL]** Collection was episode/frame based: `start_episode`, repeated `add_frame`, then `save_episode`. | [`_recorder.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_recorder.py), [`collection/__init__.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/__init__.py) |
| Dataset schema | **[HISTORICAL]** The wrapper identified itself as a LeRobot dataset backed by parquet and videos, with state/action float32 vectors and optional uint8 camera features. | [`_dataset.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_dataset.py) |
| Policy bundle | **[HISTORICAL]** `rfx_config.json` described the policy; `model.safetensors` held normal weights; `normalizer.json` was optional; `robot_config` and training metadata could be embedded. | [`nn.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/nn.py), [`hub.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/hub.py) |
| Deployment seam | **[HISTORICAL]** Deployment resolved local/Hugging Face/Python policy sources, robot configs, optional normalizers, hardware connections, rate, duration, warmup, and jitter/control-loop behavior. | [`deploy.py`](https://github.com/quantbagel/rfx/blob/main/rfx/python/rfx/deploy.py), [CLI workflow guide](https://github.com/quantbagel/rfx/blob/main/docs/workflow-cli.md) |
| Current Reflex boundary | **[CURRENT]** The checked Reflex package has no matches for `rfx`, `rfx_config`, `LeRobot`, `trajectory`, or `robotics`; its source vocabulary is state/event/delta oriented. | [current `reflex/` source tree](https://github.com/reflex-dev/reflex/tree/main/reflex), [checked commit](https://github.com/reflex-dev/reflex/commit/dd96aea556948ea95217ef1d8b5431546dc58363) |

## 1. Historical `quantbagel/rfx`: age, status, and repository shape

### Repository status

- **[HISTORICAL]** GitHub API metadata reports `created_at: 2026-02-01T03:03:13Z`, `updated_at: 2026-07-10T15:55:39Z`, and `pushed_at: 2026-03-25T06:20:02Z`.
- **[HISTORICAL]** The repository was public, non-archived, non-disabled, MIT licensed, Python-oriented, and used `main` as its default branch.
- **[HISTORICAL]** The repository page showed 83 commits, one branch, and zero tags at the time checked. The latest displayed commit was `277467a6ddf79e146b884c9f2fa72b340bbf4376`, `fix: compiling issue with cli`, dated 2026-03-25; GitHub displayed a failed status for that commit.
- **[HISTORICAL]** The releases page stated that there were no releases.
- **[HISTORICAL]** `pyproject.toml` identified the project as `rfx-sdk`, version `0.2.0`, described it as AI-native robotics middleware, and classified it as alpha. It required Python `>=3.13`.

### Top-level and package layout

**[HISTORICAL]** The repository tree included:

- `.cargo`, `.github/workflows`, `.moon`, and `.githooks` infrastructure;
- `cli`, `docs`, `examples`, `packages`, `rfx`, `rfxJIT`, and `scripts`;
- Rust/Cargo configuration alongside `pyproject.toml`;
- `.claude/skills/rfx-bootstrap-install`.

**[HISTORICAL]** The `rfx` workspace README described two Rust components:

- `rfx-core`: math, control, hardware drivers, communication, and neural-space definitions;
- `rfx-python`: PyO3 bindings exposing the compiled `_rfx` extension.

**[HISTORICAL]** The Python package layout described in the SDK guide included:

```text
rfx/python/rfx/
├── robot/
├── collection/
├── real/
├── sim/
├── runtime/
├── hub.py
├── session.py
├── deploy.py
├── decorators.py
├── node.py
└── observation.py
```

**[HISTORICAL]** The package also described robot protocol/configuration, simulation, real hardware, teleoperation, model-hub integration, agents, skills, decorators, and JIT/observation support. The package build configuration used Maturin with:

```toml
manifest-path = "rfx/crates/rfx-python/Cargo.toml"
python-source = "rfx/python"
module-name = "rfx._rfx"
```

Source: [`pyproject.toml`](https://github.com/quantbagel/rfx/blob/main/pyproject.toml), [`rfx/` tree](https://github.com/quantbagel/rfx/tree/main/rfx), [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md).

## 2. Historical robot, observation, and configuration model

### Robot control interface

**[HISTORICAL]** The documented control shape was:

```python
observation = robot.observe()
robot.act(action)
robot.reset()
```

**[HISTORICAL]** The design goal was one API across simulation, data collection, and real hardware. The SDK guide treated simulation and collection as first-class rather than as separate experimental utilities.

Source: [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md).

### `RobotConfig`

**[HISTORICAL]** [`robot/config.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/robot/config.py) defined dataclasses for:

- `CameraConfig`;
- `JointConfig`;
- `RobotConfig`.

**[HISTORICAL]** `RobotConfig` fields included `name`, `urdf_path`, `state_dim`, `action_dim`, `max_state_dim`, `max_action_dim`, `cameras`, `joints`, `control_freq_hz`, and `hardware`.

**[HISTORICAL]** Configuration could be loaded from dictionaries or YAML. Nested camera and joint records were populated by `from_dict`; `to_dict` serialized the result; search paths included the current working directory, package configuration directories, and `RFX_CONFIG_DIR`.

**[HISTORICAL]** Built-in robot configurations included:

| Built-in | State/action dimensions | Control rate |
|---|---:|---:|
| `SO101_CONFIG` | state 12, action 6, max state/action 64 | 50 Hz |
| `GO2_CONFIG` | state 36, action 12, max state/action 64 | 200 Hz |
| `G1_CONFIG` | state 69, action 29, max state 128, max action 64 | 50 Hz |
| `INNATE_CONFIG` | state 12, action 6 | not established in the inspected excerpt |

### Observation representation

**[HISTORICAL]** [`observation.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/observation.py) defined `ObservationSpec` with `state_dim`, `max_state_dim=64`, optional `image_shape`, `num_cameras`, and `language_dim`.

**[HISTORICAL]** `make_observation` returned a dictionary containing `state`, optional `images`, and optional `language`. State vectors were padded or truncated to the configured maximum; `unpad_action` reversed the action padding. `ObservationBuffer` provided frame stacking.

## 3. Historical collection and dataset recording

### Dataset wrapper and schema

**[HISTORICAL]** [`_dataset.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_dataset.py) imported `LeRobotDataset` from either:

```python
lerobot.common.datasets.lerobot_dataset
lerobot.datasets.lerobot_dataset
```

**[HISTORICAL]** The wrapper described itself as “This IS a LeRobot dataset.” It stored parquet and videos on disk and supported push/pull through the Hugging Face Hub.

**[HISTORICAL]** `_build_features` created:

- `observation.state`: float32, shape `(state_dim,)`;
- `action`: float32, shape `(state_dim,)`;
- `observation.images.<name>`: uint8 image features with configured shape.

**[HISTORICAL]** The dataset wrapper exposed creation/opening, `from_hub`, `push`, and summary operations. `validate` delegated to `workflow.quality.validate_dataset` when available; if that path failed, it returned basic statistics with a `"passed": True` fallback.

### `Recorder`

**[HISTORICAL]** [`_recorder.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_recorder.py) was thread-safe and tracked `_episode_active`, `_current_task`, and `_frame_count`. It could also write an MCAP sidecar.

**[HISTORICAL]** `start_episode(task="default")` rejected a second active episode, set the active flag and task, reset the frame count, and used an MCAP identifier of the form `episode_{dataset.num_episodes}`.

**[HISTORICAL]** `add_frame(state, action=None, images=None)` rejected inactive recording. It wrote:

- `observation.state` from `state`;
- `action` from the supplied action, or a copy of `state` when action was omitted;
- image fields named `observation.images.<camera_name>`.

It attempted multiple underlying LeRobot `add_frame` signatures for version compatibility, incremented the frame count, and wrote MCAP data when enabled.

**[HISTORICAL]** `save_episode()` rejected inactive recording, invoked the underlying dataset finalizer when present, reset active/frame-count state, saved MCAP data, and returned the number of frames. No `abort_episode`, discard, or rollback method was found.

### `collect` lifecycle

**[HISTORICAL]** [`collection/__init__.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/__init__.py) exposed parameters for output, episode count, duration, task, FPS, state dimension, camera names, Hub push, MCAP, YAML config, port, rate, mock mode, camera IDs, and an injectable `robot_factory`.

**[HISTORICAL]** Its normal lifecycle was:

1. Resolve a built-in robot (`so101`, `go2`, or `g1`), YAML config, or state-dimension override.
2. Create the recorder, robot, and camera rig.
3. For each episode, call `robot.reset()` and `recorder.start_episode(task=task)`.
4. Repeatedly call `robot.observe()`, extract state/images, and call `recorder.add_frame`.
5. Optionally generate a mock action.
6. On normal completion, call `recorder.save_episode()`.
7. Close the camera rig and disconnect the robot in `finally`, swallowing disconnect exceptions.

**[HISTORICAL]** A `KeyboardInterrupt` during the recording sleep set `interrupted=True`, broke the current loop, saved the current episode, and stopped additional episodes.

**[HISTORICAL]** A zero-frame episode raised instead of being saved.

**[HISTORICAL]** If an exception occurred during observation, camera extraction, frame insertion, or another operation before `save_episode()`, the inspected wrapper only guaranteed final cleanup. It did not explicitly abort or roll back the recorder. The exact fate of underlying partial LeRobot buffers therefore remained an external dependency question.

## 4. Historical policy artifacts and deployment

### Policy registry and files

**[HISTORICAL]** [`nn.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/nn.py) defined a `Policy` base class, a `_POLICY_REGISTRY`, and `register_policy`. A policy needed `config_dict()` for self-description.

**[HISTORICAL]** A normal policy save produced:

```text
model.safetensors
rfx_config.json
normalizer.json        # optional
```

**[HISTORICAL]** `rfx_config.json` contained:

```json
{
  "rfx_version": "...",
  "policy_type": "...",
  "policy_config": {},
  "robot_config": {},
  "training": {}
}
```

`robot_config` and `training` were optional. `normalizer.json` was separate from the main descriptor.

**[HISTORICAL]** `Policy.load()` used `policy_type` to select the registered class and `policy_config` to reconstruct it before loading `model.safetensors`. A bare `.safetensors` path took a legacy path that instantiated the class with no bundle descriptor. An unknown policy type raised an error.

**[HISTORICAL]** Policy implementations included MLP, JIT, actor-critic, and Torch JIT variants. `TorchJitPolicy` stored `model.pt`; its config included `model_path`, `obs_keys`, and `device`, and it concatenated selected dictionary observation keys.

### Hub loading and authority chain

**[HISTORICAL]** [`hub.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/hub.py) resolved local paths or `hf://` sources with `snapshot_download`, read `rfx_config.json`, reconstructed the policy, rebuilt `RobotConfig` from `config["robot_config"]` when present, and loaded `normalizer.json` optionally.

**[HISTORICAL]** It returned a `LoadedPolicy` containing `policy`, `robot_config`, `normalizer`, and the raw config. Its call path normalized dictionary observations when a normalizer existed and handled Torch-native versus tinygrad conversion. `policy_type` defaulted to `"unknown"` when absent; `training_info` read from `config.get("training", {})`.

**[HISTORICAL]** The practical authority chain was therefore:

1. `rfx_config.json` for policy type and constructor configuration;
2. `model.safetensors` or `model.pt` for weights, depending on policy implementation;
3. embedded `robot_config` for robot shape/configuration when present;
4. `normalizer.json` for input normalization when present;
5. explicit deployment config, built-in config, or YAML/external defaults when embedded configuration was absent or overridden;
6. `training` as metadata, not as an inference prerequisite.

**[HISTORICAL]** The inspected save/load code recorded `rfx_version`, but no version-validation behavior was established in the gathered excerpts.

### Deployment path

**[HISTORICAL]** [`deploy.py`](https://github.com/quantbagel/rfx/blob/main/rfx/python/rfx/deploy.py) imported `LoadedPolicy`, `load_policy`, built-in robot configurations, and `Session`. Its built-in config map included `so101`, `go2`, `g1`, and `innate`.

**[HISTORICAL]** The public deployment API accepted `policy_source`, optional `robot`, `config`, `port`, `rate_hz`, `duration`, `mock`, `device`, `warmup_s`, and `verbose`.

**[HISTORICAL]** A `.py` policy source used `_load_policy_from_py`; other sources went through `load_policy`. `_resolve_robot_config` then resolved the robot/configuration before the control loop. The CLI and docs described policy loading, config resolution, hardware connection, control rate, jitter, warmup, and duration handling.

## 5. Historical CLI and workflow conventions

**[HISTORICAL]** The primary CLI commands in [`workflow-cli.md`](https://github.com/quantbagel/rfx/blob/main/docs/workflow-cli.md) were:

- `rfx record` for collection;
- `rfx deploy` for running a policy;
- `rfx doctor` for diagnostics.

**[HISTORICAL]** `rfx train` and `rfx runs` were described as secondary workflow metadata and artifact-lineage utilities rather than the primary execution path.

**[HISTORICAL]** `rfx record` exposed controls for episode count, duration, FPS, rate, config, port, camera IDs, mock mode, Hub push, MCAP, and state dimension. `rfx deploy` accepted policy directories, `hf://` sources, or Python policy files.

## 6. Historical merged-PR trajectory

The source for merge status was the official [all-PR API listing](https://api.github.com/repos/quantbagel/rfx/pulls?state=all&per_page=100). The entries below are **[HISTORICAL]** and summarize only high-signal changes relevant to architecture, packaging, deployment, and seams.

| PR | Status and historical architectural signal |
|---|---|
| [#1](https://github.com/quantbagel/rfx/pull/1) | **[HISTORICAL]** Merged 2026-02-06. Fixed packaged Rust-extension imports from `_rfx` to `._rfx`, matching the configured `rfx._rfx` module and preventing fallback behavior where `rfx.Go2` became `None`. |
| [#2](https://github.com/quantbagel/rfx/pull/2) | **[HISTORICAL]** Merged 2026-02-06. Added an `_disconnected` guard in `python/rfx/real/base.py`; routed destructor cleanup through idempotent `disconnect`. |
| [#3](https://github.com/quantbagel/rfx/pull/3) | **[HISTORICAL]** Merged 2026-02-06. Loaded `rfx._rfx` once and used `getattr` for optional Rust exports so a missing `ControlLoopStats` did not disable the critical Go2 API. |
| [#4](https://github.com/quantbagel/rfx/pull/4) | **[HISTORICAL]** Merged 2026-02-06. Switched Go2 control toward the `unitree_sdk2py` backend. |
| [#5](https://github.com/quantbagel/rfx/pull/5) | **[HISTORICAL]** Merged 2026-02-06. Added system-Python fallback for Unitree SDK Go2 commands. |
| [#6](https://github.com/quantbagel/rfx/pull/6) | **[HISTORICAL]** Merged 2026-02-06. Used `/usr/bin/python3` for the Unitree SDK subprocess backend. |
| [#7](https://github.com/quantbagel/rfx/pull/7) | **[HISTORICAL]** Merged 2026-02-06. Implemented direct Dust DDS sport-command publishing for Go2 in Rust. |
| [#8](https://github.com/quantbagel/rfx/pull/8) | **[HISTORICAL]** Merged 2026-02-06. Published Go2 sport requests directly in the subprocess backend. |
| [#9](https://github.com/quantbagel/rfx/pull/9) | **[HISTORICAL]** Merged/closed 2026-02-12, but the gathered metadata did not provide a useful architectural body. |
| [#10](https://github.com/quantbagel/rfx/pull/10) | **[HISTORICAL]** Closed 2026-02-12 without a merge. The “rename src to rfx” proposal is not mainline evidence. |
| [#11](https://github.com/quantbagel/rfx/pull/11) | **[HISTORICAL]** Merged 2026-02-23. Corrected NumPy array conversion in `_jax_to_torch`. |
| [#12](https://github.com/quantbagel/rfx/pull/12) | **[HISTORICAL]** Merged 2026-02-25. Added simulation extras. |
| [#13](https://github.com/quantbagel/rfx/pull/13) | **[HISTORICAL]** Merged 2026-03-04. Flesh-out/re-exported `rfx-sdk-go2`, `rfx-sdk-sim`, and `rfx-sdk-lerobot` extension packages from the core SDK with optional dependency subsets. |
| [#14](https://github.com/quantbagel/rfx/pull/14) | **[HISTORICAL]** Merged 2026-03-04. Expanded `rfx doctor` diagnostics. |
| [#15](https://github.com/quantbagel/rfx/pull/15) | **[HISTORICAL]** Merged 2026-03-05. Added deployment tests. |
| [#16](https://github.com/quantbagel/rfx/pull/16) | **[HISTORICAL]** Merged 2026-03-05. Added environment tests. |
| [#17](https://github.com/quantbagel/rfx/pull/17) | **[HISTORICAL]** Merged 2026-03-05. Added comprehensive deploy-pipeline coverage, reported as 222 tests. |
| [#18](https://github.com/quantbagel/rfx/pull/18) | **[HISTORICAL]** Open in the gathered metadata; proposed adding `INNATE_CONFIG` to robot re-exports. It is not mainline evidence. |
| [#19](https://github.com/quantbagel/rfx/pull/19) | **[HISTORICAL]** Open in the gathered metadata; proposed documentation accuracy/onboarding improvements and config re-exports. It is not mainline evidence. |

**[HISTORICAL]** The PR trajectory shows repeated work at Rust/Python packaging, optional-extension handling, real-hardware cleanup, Go2 backend boundaries, simulation/LeRobot packaging, and deployment-test seams. It does not by itself establish any relationship to current Reflex.

## 7. Current Reflex evidence

### Package overlap search

**[CURRENT]** The checked official Reflex source snapshot was a shallow checkout of the `reflex` package at [`dd96aea`](https://github.com/reflex-dev/reflex/commit/dd96aea556948ea95217ef1d8b5431546dc58363). A direct case-insensitive search of that package for `rfx`, `rfx_config`, `LeRobot`, `trajectory`, and `robotics` returned no matches.

**[CURRENT]** This supports the bounded statement that the inspected current Reflex package does not expose those historical robotics names. It does not establish anything about user applications, plugins, external packages, hidden branches, or the complete Git history.

### State instances

**[CURRENT]** [`reflex/state.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/state.py) defines `Delta` as `dict[str, dict[str, Any]]` and defines `BaseState` with class-level registries and instance-level dirty tracking.

**[CURRENT]** The inspected `BaseState` shape included `vars`, `base_vars`, `computed_vars`, `inherited_vars`, `backend_vars`, `inherited_backend_vars`, and `event_handlers`. Per-instance state included `dirty_vars` and `dirty_substates`, along with related tracking needed to resolve updates.

### Event handlers and reducer shape

**[CURRENT]** [`reflex/app.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/app.py) defines a reducer shape equivalent to an asynchronous event-to-`StateUpdate` function. Event handlers mutate server-side state; Reflex then resolves the resulting delta.

**[CURRENT]** The current documentation states that event handlers are the mechanism through which application state changes, with handlers executing on the backend while the frontend receives updates through the WebSocket connection: [Basics](https://reflex.dev/docs/getting-started/basics/) and [State overview](https://reflex.dev/docs/state/overview).

### State updates and WebSocket delivery

**[CURRENT]** `StateUpdate` in [`state.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/state.py) is the update sent to the frontend. `serialize_state_update` serializes the dataclass to a dictionary.

**[CURRENT]** The event-processing path in [`app.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/app.py) obtains `delta = await state._get_resolved_delta()`, calls `state._clean()`, and emits `StateUpdate(delta=delta)` when the delta is non-empty.

**[CURRENT]** The WebSocket/Socket.IO connection path associates a client token with a socket session. `emit_update` sends the update to the socket associated with that token.

### State-manager persistence

**[CURRENT]** [`reflex/istate/manager/__init__.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/istate/manager/__init__.py) defines an abstract `StateManager` for managing many client states. Its interface includes `get_state`, `set_state`, `modify_state`, and `modify_state_with_links`; the modification context is designed to hold exclusive state-modification access.

**[CURRENT]** `StateManager.create()` selects memory, disk, or Redis implementations based on configuration. The current Reflex documentation describes server-side per-user state, token-to-state mapping, and Redis as the production-oriented option: [How Reflex Works](https://reflex.dev/docs/advanced-onboarding/how-reflex-works/).

**[CURRENT]** The current PyPI project page reports a later public Reflex package release, `0.9.8.post1`, released 2026-08-18, with Python `>=3.10,<4` and beta development status: [PyPI Reflex](https://pypi.org/project/reflex/). This is package-release metadata, not evidence about the internal code of the historical robotics repository.

## 8. Current-versus-historical separation

| Dimension | Current Reflex | Historical `quantbagel/rfx` |
|---|---|---|
| State unit | **[CURRENT]** Per-client server-side `BaseState` instance with dirty variables/substates. | **[HISTORICAL]** Robot observations/actions and collection episode/frame state. |
| Control/event unit | **[CURRENT]** Event handlers/reducers produce state updates. | **[HISTORICAL]** `robot.observe()`, `robot.act(action)`, and `robot.reset()` drive robot interaction. |
| Update representation | **[CURRENT]** `Delta` wrapped in `StateUpdate`. | **[HISTORICAL]** LeRobot frame records containing observation state, action, and optional images. |
| Transport | **[CURRENT]** WebSocket/Socket.IO delivery keyed by client token. | **[HISTORICAL]** Hardware SDK, subprocess, DDS, MCAP, local dataset, and Hugging Face Hub seams. |
| Persistence | **[CURRENT]** Memory, disk, or Redis state managers. | **[HISTORICAL]** Parquet/video datasets and self-describing policy bundles. |
| Artifact authority | **[CURRENT]** No robotics policy-bundle schema was found in the inspected package. | **[HISTORICAL]** `rfx_config.json`, weights, optional normalizer, embedded robot config, and external deployment overrides. |
| Lifecycle | **[CURRENT]** Resolve dirty state, clean it, and emit the resulting update. | **[HISTORICAL]** Reset, start episode, add frames, save episode; interruption and partial-recording behavior have specific limitations. |
| Lineage | **[CURRENT]** No `rfx`/LeRobot/robotics references found in the inspected package. | **[HISTORICAL]** Separate alpha robotics SDK repository. No evidence here of migration into Reflex. |

## 9. Direct answers to the high-value reverse-engineering questions

### Does current Reflex import `rfx`, `rfx_config.json`, LeRobot, or robotics modules?

**[CURRENT]** No such imports or names were found in the checked current `reflex/` package snapshot. This is a bounded source-search result, not a universal negative about all Reflex applications or dependencies.

**[HISTORICAL]** The old robotics package did use `rfx._rfx`, `rfx_config.json`, LeRobot dataset classes, robot-specific configs, and hardware-specific modules. That establishes historical architecture only.

### Is trajectory a current type?

**[CURRENT]** No current `Trajectory` type or trajectory-specific symbol was found in the inspected package. The current concepts are events, state instances, deltas, and state updates.

**[HISTORICAL]** The inspected robotics recording code used episodes and frames rather than a generic `Trajectory` class.

### Which artifact fields are authoritative for deployability?

**[HISTORICAL]** `rfx_config.json` was the primary policy descriptor; weight files were required for execution; embedded `robot_config` and optional `normalizer.json` affected deployment correctness; explicit config/robot inputs and built-in/YAML defaults could override or complete the embedded configuration; `training` was metadata.

### What is the episode interruption/reset/partial-data lifecycle?

**[HISTORICAL]** Normal collection resets the robot, starts an episode, records frames, and saves the episode. Sleep-time interruption saves the current episode and stops subsequent episodes. Zero-frame episodes raise. Exceptions before save have cleanup but no explicit recorder abort or rollback path in the inspected wrapper.

### Which PRs landed and what seams changed?

**[HISTORICAL]** Merged PRs concentrated on extension-import packaging, optional Rust exports, idempotent hardware cleanup, Go2 SDK/subprocess/DDS control paths, simulation and LeRobot package re-exports, diagnostics, and deployment/environment test coverage. PR #10 was not merged; PRs #18 and #19 were open in the gathered metadata.

### How do current Reflex structures compare without assuming lineage?

**[CURRENT]** Reflex uses state instances, event handlers, dirty-variable resolution, `StateUpdate`/`Delta`, token-keyed WebSocket delivery, and memory/disk/Redis state managers.

**[HISTORICAL]** `rfx` used robot control loops, episode/frame recording, LeRobot datasets, policy bundles, and hardware/deployment adapters. The structural comparison is useful at the level of lifecycle and seams, but the evidence does not show shared lineage.

## 10. Unknowns and later reverse-engineering questions

### Unknowns

- Whether the target Reflex application contains private robotics adapters, custom dependencies, or generated code outside the public `reflex/` package.
- Whether a target application uses “trajectory” as an application-level label over ordinary state/event records.
- Whether deployment intentionally overrides embedded robot configuration and which precedence rule the target application implements.
- What exact LeRobot version and storage implementation the historical wrapper used at each commit.
- What the underlying LeRobot dataset does with a partially written episode when `save_episode()` is not reached.
- Whether the current target has a custom state manager, event namespace, persistence adapter, or WebSocket protocol layer.
- Whether any historical `rfx` design concepts were independently reimplemented elsewhere; no gathered source proves this.

### High-value questions for the next phase

1. Inspect the target repository’s full dependency graph and application code for `rfx`, `rfx_config.json`, LeRobot imports, robot names, and policy artifact loading—not just the installed Reflex package.
2. Search for domain types and persistence keys named `trajectory`, `episode`, `frame`, `rollout`, `dataset`, `policy`, or `normalizer`; trace each from producer to storage to consumer.
3. Identify the target’s authoritative deployment artifact by following the actual load path: policy descriptor, weight file, robot config, normalizer, and environment defaults.
4. Trace target recording failure paths: reset, start, interruption, exception during observation, zero-frame episode, save failure, retry, and cleanup.
5. Map target Reflex event flow from client event to handler to state-manager modification to resolved delta to WebSocket emission.
6. Compare any target custom state manager or persistence adapter against the current `StateManager` interface without inferring that it came from `rfx`.
7. If lineage matters, inspect the target repository’s Git history, dependency lockfiles, vendored code, and commit messages for explicit references to `quantbagel/rfx`; absence of a reference should remain an unknown rather than a proof of non-lineage.

## 11. Source register

### Historical `quantbagel/rfx` sources

- [Official repository](https://github.com/quantbagel/rfx)
- [Repository API metadata](https://api.github.com/repos/quantbagel/rfx)
- [Historical repository releases](https://github.com/quantbagel/rfx/releases)
- [Historical root tree](https://github.com/quantbagel/rfx/tree/main)
- [Historical `rfx/` tree](https://github.com/quantbagel/rfx/tree/main/rfx)
- [README](https://github.com/quantbagel/rfx/blob/main/README.md)
- [`pyproject.toml`](https://github.com/quantbagel/rfx/blob/main/pyproject.toml)
- [Python SDK guide](https://github.com/quantbagel/rfx/blob/main/docs/python-sdk.md)
- [CLI workflow guide](https://github.com/quantbagel/rfx/blob/main/docs/workflow-cli.md)
- [`robot/config.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/robot/config.py)
- [`observation.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/observation.py)
- [`collection/__init__.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/__init__.py)
- [`collection/_recorder.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_recorder.py)
- [`collection/_dataset.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/collection/_dataset.py)
- [`nn.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/nn.py)
- [`hub.py`](https://raw.githubusercontent.com/quantbagel/rfx/main/rfx/python/rfx/hub.py)
- [`deploy.py`](https://github.com/quantbagel/rfx/blob/main/rfx/python/rfx/deploy.py)
- [All historical pull requests API](https://api.github.com/repos/quantbagel/rfx/pulls?state=all&per_page=100)

### Current Reflex sources

- [Official Reflex repository](https://github.com/reflex-dev/reflex)
- [Checked current commit](https://github.com/reflex-dev/reflex/commit/dd96aea556948ea95217ef1d8b5431546dc58363)
- [Current `reflex/` source tree](https://github.com/reflex-dev/reflex/tree/main/reflex)
- [`reflex/state.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/state.py)
- [`reflex/app.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/app.py)
- [`reflex/istate/manager/__init__.py`](https://github.com/reflex-dev/reflex/blob/main/reflex/istate/manager/__init__.py)
- [Reflex basics](https://reflex.dev/docs/getting-started/basics/)
- [Reflex state overview](https://reflex.dev/docs/state/overview)
- [How Reflex works](https://reflex.dev/docs/advanced-onboarding/how-reflex-works/)
- [Current Reflex PyPI metadata](https://pypi.org/project/reflex/)

## Final boundary statement

**[HISTORICAL]** `quantbagel/rfx` is useful as a historical reference for robotics-oriented instincts: explicit observe/act/reset seams, episode/frame recording, typed robot configuration, self-describing policy bundles, normalizer handling, hardware/backend adapters, and deployment diagnostics.

**[CURRENT]** Those historical concepts should not be treated as current Reflex capabilities or internal bugs. Current Reflex evidence instead supports a state/event/delta model with token-keyed WebSocket delivery and configurable state persistence.

**[CURRENT + HISTORICAL]** Any claim that the two projects share lineage, that current Reflex has a trajectory system, or that a target application follows the historical `rfx` lifecycle requires direct evidence from the target repository.
