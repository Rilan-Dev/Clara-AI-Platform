#!/usr/bin/env bash
# Start the Clara production server (standalone + WS relay) against the
# remote infra, with env loaded from the repo .env.
set -euo pipefail
cd /home/z/my-project/Clara-AI-Platform

# stop any previous instance on our port (the standalone server renames its
# process to "next-server", so match both)
pkill -f "scripts/start.mjs" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

set -a
source .env
set +a
export PORT="${PORT:-3000}"

nohup node scripts/start.mjs > /home/z/my-project/scripts/server.log 2>&1 &
echo "server pid $!"

# wait for health
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "healthy after ${i}s"
    curl -s "http://localhost:${PORT}/api/health" | head -c 400
    echo
    exit 0
  fi
  sleep 1
done
echo "server did not become healthy in 60s; tail of log:"
tail -30 /home/z/my-project/scripts/server.log
exit 1
