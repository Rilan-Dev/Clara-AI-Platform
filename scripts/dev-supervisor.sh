#!/bin/bash
# Clara dev server supervisor — keeps the Next.js dev server running.
# Heap capped at 1536MB to stay under the container's cgroup memory limit
# (OOM killer terminated next-server at 2.1GB RSS in earlier runs).
# Usage: setsid nohup bash /home/z/my-project/scripts/dev-supervisor.sh > /home/z/my-project/dev-supervisor.log 2>&1 < /dev/null &

cd /home/z/my-project/Clara-AI-Platform
export NODE_OPTIONS="--max-old-space-size=1536"
export NEXT_TELEMETRY_DISABLED=1

while true; do
  if ! ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "[$(date '+%H:%M:%S')] Dev server down — starting..."
    npm run dev >> /home/z/my-project/dev-server.log 2>&1 &
    SERVER_PID=$!
    # Wait for port to come up (max 60s)
    for i in $(seq 1 60); do
      if ss -tln 2>/dev/null | grep -q ":3000 "; then
        echo "[$(date '+%H:%M:%S')] Dev server up (pid $SERVER_PID)"
        break
      fi
      sleep 1
    done
  fi
  sleep 10
done
