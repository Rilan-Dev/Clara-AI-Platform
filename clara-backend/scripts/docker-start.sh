#!/bin/sh
set -eu

node server.js &
SERVER_PID=$!

if [ -n "${LOCAL_INIT_SECRET:-}" ]; then
  ATTEMPT=0

  while true; do
    if curl -fsS -X POST -H "x-clara-init-secret: ${LOCAL_INIT_SECRET}" "http://127.0.0.1:${PORT:-3000}/api/internal/init" >/dev/null 2>&1; then
      break
    fi

    ATTEMPT=$((ATTEMPT + 1))

    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      wait "$SERVER_PID"
      exit 1
    fi

    if [ "$ATTEMPT" -ge 60 ]; then
      echo "[startup] Timed out waiting for backend init route" >&2
      kill "$SERVER_PID" 2>/dev/null || true
      wait "$SERVER_PID" || true
      exit 1
    fi

    sleep 2
  done
fi

wait "$SERVER_PID"
