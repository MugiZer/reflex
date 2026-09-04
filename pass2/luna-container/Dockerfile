FROM node:22-bookworm-slim
ARG CODEX_VERSION=0.145.0
RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@openai/codex@${CODEX_VERSION}"
WORKDIR /work
