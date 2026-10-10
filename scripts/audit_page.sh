#!/bin/bash
# Mobile audit helper: visit URL, wait, screenshot, restart dev server if it died.
# usage: ./audit_page.sh <path> <name> [full]
set -u
BASE=http://localhost:3000
PATH_="$1"; NAME="$2"; FULL="${3:-}"
ensure_server() {
  if ! pgrep -f "next dev" >/dev/null; then
    echo "[audit] server dead -> restarting"
    cd /home/z/my-project/Clara-AI-Platform
    (nohup bash -c 'exec setsid env NODE_OPTIONS="--max-old-space-size=1536" npx next dev -p 3000 > /tmp/next-dev.log 2>&1' >/dev/null 2>&1 & disown)
    sleep 10
  fi
}
ensure_server
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "$BASE$PATH_" 2>/dev/null)
  [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ] && break
  echo "[audit] warmup try$i code=$code"
  ensure_server
  sleep 3
done
agent-browser open "$BASE$PATH_" >/dev/null 2>&1
agent-browser wait --load networkidle --timeout 120000 >/dev/null 2>&1
sleep 2
if [ "$FULL" = "full" ]; then
  agent-browser screenshot "/home/z/my-project/download/mobile-audit/$NAME.png" --full >/dev/null 2>&1
else
  agent-browser screenshot "/home/z/my-project/download/mobile-audit/$NAME.png" >/dev/null 2>&1
fi
echo "[audit] saved $NAME.png url=$(agent-browser get url 2>/dev/null)"
