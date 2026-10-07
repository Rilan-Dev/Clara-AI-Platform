#!/usr/bin/env bash
set -euo pipefail

# Clara self-hosted deployment: build heavyweight images one at a time.
# This prevents backend + worker + bridge builds from saturating a small VPS
# or home server during Docker image creation.
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"

echo "==> Building Clara backend (shared dependency stage)"
docker compose build clara-backend

echo "==> Building Clara worker (reuses the backend dependency cache)"
docker compose build clara-worker

echo "==> Building RabbitMQ bridge"
docker compose build clara-rabbitmq-bridge

echo "==> Starting services without rebuilding"
docker compose up -d --remove-orphans

echo "==> Clara service status"
docker compose ps
