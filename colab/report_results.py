"""Publish a Colab run summary to GitHub via repository_dispatch."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def publish(result: dict, output_path: str | Path = "/content/reflex_runs/run_result.json") -> bool:
    """Write a local result and optionally send it to GitHub Actions.

    Set REFLEX_GITHUB_TOKEN in Colab Secrets to enable the GitHub upload.
    The token needs Actions: write permission for repository_dispatch.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")

    token = os.environ.get("REFLEX_GITHUB_TOKEN")
    if not token:
        print(f"result saved locally (set REFLEX_GITHUB_TOKEN to publish): {path}")
        return False

    repository = os.environ.get("REFLEX_GITHUB_REPO", "MugiZer/reflex")
    payload = {"event_type": "colab-test-result", "client_payload": result}
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/dispatches",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2026-03-10",
            "Content-Type": "application/json",
            "User-Agent": "reflex-colab",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 204:
                raise RuntimeError(f"GitHub returned HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub dispatch failed ({exc.code}): {detail}") from exc

    print(f"published {result['run_id']} to {repository}")
    return True

