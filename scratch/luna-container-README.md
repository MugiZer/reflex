# Luna Pass-2 container

The image is deliberately built without this repository. Each controller call
mounts only a newly-created directory containing the current row's approved
values, the program's one-paper analyst skill, `AGENTS.md` Pass-2 contract, and complete
mechanism-recognition skill (including its lane references). The image mounts
one separate named Docker volume solely for normal Codex login state.

Before starting Luna, the controller may retrieve the selected row's single
public source on the host and stage it as `paper.md`: arXiv PDFs are converted
locally with AnyDoc; other supplied paper URLs or DOIs are converted with the
authenticated Firecrawl CLI. Neither Firecrawl credentials nor retrieval tools
are mounted into the Luna container.

## One-time login

Run this in a new PowerShell window after building the image. It uses your
normal Codex device login; it does not use an API key.

```powershell
$docker = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $docker run --rm -it --mount type=volume,src=luna-codex-auth,dst=/codex-auth --env CODEX_HOME=/codex-auth reflex-luna-pass2:latest codex login --device-auth
```

Confirm it worked with the same command ending in `codex login status`.

## Build and use

```powershell
$docker = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $docker build -t reflex-luna-pass2:latest -f pass2/luna-container/Dockerfile .
python pass2/luna_pass2_controller.py --program A --worker a-03 --limit 10 --concurrency 1 --docker-bin $docker
```

The controller launches `codex exec --ephemeral --ignore-user-config
--ignore-rules --skip-git-repo-check --search --model gpt-5.6-luna --config
model_reasoning_effort="medium" --sandbox danger-full-access`. Docker, not a
nested Codex sandbox, is the enforcing isolation seam: the container remains
read-only and receives only the temporary one-paper workspace. Strict Python
validation governs output. Do not bind-mount the repository or a home directory
into the Luna container.
