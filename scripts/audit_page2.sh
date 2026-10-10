#!/bin/bash
# Mobile audit: screenshot page after waiting for real content (not just networkidle).
# usage: ./audit_page2.sh <path> <name>
set -u
BASE=${AUDIT_BASE:-http://localhost:3000}
PATH_="$1"; NAME="$2"
agent-browser open "$BASE$PATH_" >/dev/null 2>&1
# wait until body has meaningful text (>=120 chars) or timeout ~40s
for i in $(seq 1 20); do
  LEN=$(agent-browser eval "document.body.innerText.trim().length" 2>/dev/null | tr -d '"')
  [ "${LEN:-0}" -ge 120 ] 2>/dev/null && break
  sleep 2
done
sleep 2
agent-browser screenshot "/home/z/my-project/download/mobile-audit/$NAME.png" >/dev/null 2>&1
echo "[$NAME] url=$(agent-browser get url 2>/dev/null) bodyLen=${LEN:-0}"
