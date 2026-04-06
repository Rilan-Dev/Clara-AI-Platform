#!/bin/sh
set -eu

# Use custom start.mjs which monkey-patches http.createServer to attach the
# server-side voice WebSocket relay before Next.js starts listening.
# Updated deployment to force DNS refresh (v1.0.1).
# voice-relay.mjs is co-located in scripts/ and does NOT expose any AI secrets.
node scripts/start.mjs &
SERVER_PID=$!

if [ -n "${LOCAL_INIT_SECRET:-}" ]; then
  # Run init in the background after a short delay to avoid blocking startup
  (
    sleep 10
    echo "[startup] Triggering internal init..."
    curl -fsS -X POST -H "x-clara-init-secret: ${LOCAL_INIT_SECRET}" "http://127.0.0.1:${PORT:-3000}/api/internal/init" >/dev/null 2>&1 || echo "[startup] Init trigger failed (non-fatal)"
  ) &
fi

wait "$SERVER_PID"
