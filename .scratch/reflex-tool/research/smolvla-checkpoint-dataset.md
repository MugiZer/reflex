# SmolVLA checkpoint + replay dataset — decision (#117)

**Decision: default stands.** Official base `lerobot/smolvla_base` + official paper reference
`lerobot/svla_so100_pickplace`. No T4-infeasibility found for *inference-only replay*.
All ids/revisions verified via HF Hub API on 2026-09-08. No code written.

## Pinned revisions

| Artifact | id | revision (sha) | lastModified | Source |
|---|---|---|---|---|
| Checkpoint | `lerobot/smolvla_base` | `c83c3163b8ca9b7e67c509fffd9121e66cb96205` | 2026-01-22 | https://huggingface.co/api/models/lerobot/smolvla_base |
| Dataset | `lerobot/svla_so100_pickplace` | `728583b5eaf9e739a7f119e2def466fa1d552402` | 2026-07-16 | https://huggingface.co/api/datasets/lerobot/svla_so100_pickplace |

Pin by sha (`revision=` in `from_pretrained` / `LeRobotDataset`) — both repos' `main` has moved
before (dataset storage migrated v2.1 → v3.0 layout, see below).

## Checkpoint: `lerobot/smolvla_base`

- 450M params (BF16 446.8M + F32 3.3M), `model.safetensors` ~1.82 GB usedStorage.
  Sources: API above; https://huggingface.co/lerobot/smolvla_base; paper https://arxiv.org/abs/2506.01844
- Config (`.../raw/main/config.json`): `chunk_size=50`, `n_action_steps=50`, flow-matching
  `num_steps=10`; `max_state_dim=32`, `max_action_dim=32`; VLM backbone
  `HuggingFaceTB/SmolVLM2-500M-Video-Instruct`, `attention_mode=cross_attn`,
  `freeze_vision_encoder=true`, `train_expert_only=true`.
- Declared `input_features`: `observation.state` [6] + 3 generic visual slots
  (`camera1/2/3`, 3×256×256, `resize_imgs_with_padding=[512,512]`); declared
  `output_features`: `action` [6]. Preprocessor (`policy_preprocessor.json`) ships an **empty**
  `rename_map` — replay code must map dataset keys (`observation.images.top/wrist`) to the
  policy's expected image keys. Normalization: VISUAL=IDENTITY, STATE/ACTION=MEAN_STD
  (stats in `policy_preprocessor_step_5_normalizer_processor.safetensors`); tokenizer
  `SmolVLM2-500M-Video-Instruct`, `max_length=48`, `task_key="task"`.
- License/auth: **no license field in model card frontmatter** (`cardData` has none; config
  `"license": null`) — treat reuse terms as UNVERIFIED beyond paper/blog open-release claims.
  `private=false`, `gated=false` → **no HF auth needed** for read/clone.

## Dataset: `lerobot/svla_so100_pickplace` (paper's official Pick-Place ref)

- This is the dataset the SmolVLA docs/paper name as *the* SO100 PickPlace reference:
  https://huggingface.co/docs/lerobot/en/smolvla ("reference that was used in the SmolVLA paper"),
  paper §real-world eval ("Pick-Place dataset: lerobot/svla_so100_pickplace").
- `meta/info.json` (raw main): `robot_type=so100`, `codebase_version=v3.0`, 50 episodes /
  19,631 frames / 100 videos, `fps=30`, single train split `0:50`, single `task_index`.
- Observation fields: `observation.state` float32[6]
  (`main_shoulder_pan/lift, main_elbow_flex, main_wrist_flex/roll, main_gripper`);
  **two cameras** `observation.images.top` + `observation.images.wrist`, 480×640×3,
  **AV1, yuv420p**, 30 fps. `action` float32[6], same joint names.
- Language: single task; exact string bytes live in `meta/tasks.parquet` (**not byte-verified
  here** — read at runtime). Paper paraphrase: "pick up the cube and place it in the box"
  (5 cube start positions × 10 episodes); docs example nearby: "Put lego brick into the
  transparent box".
- Size: `data_files_size_in_mb=100` + `video_files_size_in_mb=500` (Hub `usedStorage` ~941 MB).
- License/auth: `apache-2.0`, `private=false`, `gated=false` → **no HF auth needed**.
- Layout drift warning: dataset card text still shows v2.1 paths but raw `meta/info.json`
  is now **v3.0** (`data/chunk-*/file-*.parquet`, `videos/{video_key}/chunk-*/file-*.parquet`).
  Replay env needs a lerobot version that reads v3.0 (or pin the sha above).

## Observation→action path (inference-only replay)

`LeRobotDataset(repo_id, revision=sha)` frame → `make_pre_post_processors` (rename →
batch → newline/task tokenize → device → normalize) → `policy.select_action(frame)` →
postprocess (unnormalize) → **continuous action chunk 50×6** (one 6-DoF SO100 joint+gripper
target per step, flow-matching, 10 integration steps). Model card's canonical snippet is the
reference: https://huggingface.co/lerobot/smolvla_base (load with `SmolVLAPolicy`,
`torch.inference_mode()`).

## T4 16 GB fit: YES for inference (training out of scope)

- Weights ~1.8 GB; SmolVLA blog: "small enough to run on CPU… or even a MacBook"
  (https://huggingface.co/blog/smolvla); community finetune card reports ~2 GB VRAM
  minimum for inference; third-party guide: 6 GB min inference (https://vnrobo.com/en/blog/vla-lerobot-12-smolvla-training).
  **Peak T4 VRAM for this exact pair is UNVERIFIED** — measure on smoke (#123) — but a
  0.5B model + 2×512px images + 50×6 chunk leaves large headroom under 16 GB.
- T4 note: T4 (Turing) has no native bf16; run inference in fp32/fp16, not bf16.
  Finetune reference cost (context only): 20k steps ~4 h on a single A100, batch 64.

## Image/video decode deps

- `pip install "lerobot[smolvla]"` + dataset extra (`datasets`, `torchcodec`, `av`/`pyav`).
  LeRobot decodes with **TorchCodec by default, requires `ffmpeg`**
  (`conda install ffmpeg -c conda-forge`): https://huggingface.co/docs/lerobot/en/installation
- Dataset videos are **AV1 mp4** → ffmpeg must include an AV1 decoder (encode-side
  `libsvtav1` note in install docs; decode path is what replay needs).
- Known Colab pothole (UNVERIFIED for current torch/lerobot pins): phospho guide reports
  `RuntimeError: Could not load libtorchcodec` on Colab, fixed by `pip install torchcodec==0.2.1`
  + runtime restart; `dataset.video_backend=pyav` fallback exists. Re-verify on smoke (#118).

## Fallback pick (only if default blocked)

**`lerobot/svla_so101_pickplace` @ `f641879e22172be7e8161d5e6c1503c2d2feb657`**
(2025-09-27, apache-2.0, public/ungated): 50 eps / 11,939 frames, `robot_type=so100_follower`,
cameras `side`+`up`, lego task ("put the pink lego brick into the transparent box" per paper).
Caveat: paper states SmolVLA was **not** pretrained on SO101 data → better generalization probe,
slightly riskier replay match. Second fallback: `lerobot/svla_so100_stacking` @
`933bcc61148b1b560d1a13753b47eac54a085561` (56 eps / 22,956 frames, same SO100 embodiment).
Source: https://huggingface.co/api/datasets/lerobot/svla_so101_pickplace,
https://huggingface.co/api/datasets/lerobot/svla_so100_stacking

## For downstream tickets

- #119: replay corpus = fixed episode subset of the pinned dataset sha (5 cube positions × N),
  single-task; record `meta/tasks.parquet` string at build time.
- #118: env must cover `lerobot[smolvla]`, torchcodec+ffmpeg (AV1), v3.0-layout-capable lerobot;
  re-verify torchcodec pin + T4 peak VRAM on smoke.
- #120: adapter maps `top/wrist` → policy image keys, 512-pad resize, MEAN_STD per shipped stats.
