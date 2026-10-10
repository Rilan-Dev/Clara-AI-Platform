#!/usr/bin/env bash
# Measure live production API latency on clara.rag.amazetechclans.com.
# Public endpoints only (authenticated ones need a session cookie); the
# /api/health internals report DB + Qdrant latency from WITHIN the Vercel
# function, which is the authoritative cross-region measurement.
set -u
BASE="https://clara.rag.amazetechclans.com"

measure() {
  local label="$1"; local path="$2"; local n="${3:-3}"
  echo "=== $label ($n calls) ==="
  for i in $(seq 1 "$n"); do
    curl -s -o /tmp/perf_body.json -w "  call$i: HTTP %{http_code} total=%{time_total}s\n" \
      "$BASE$path" --max-time 30
    sleep 1
  done
}

echo "############ BASELINE INFO ############"
date -u
echo

echo "############ /api/health — DB + Qdrant internal latency (warm-pool test) ############"
for i in 1 2 3 4; do
  curl -s "$BASE/api/health" --max-time 30 -o /tmp/health.json
  python3 - << 'PYEOF'
import json
try:
    d = json.load(open('/tmp/health.json'))
    db = d['checks']['database']; q = d['checks']['qdrant']
    print(f"  call: overall={d['status']} db={db['status']}/{db['latencyMs']}ms "
          f"qdrant={q['status']}/{q.get('latencyMs')}ms uptime={d['uptime']['human']}")
except Exception as e:
    print(f"  parse error: {e}")
PYEOF
  sleep 2
done
echo

measure "health" "/api/health" 3
measure "auth 401 gate (middleware only)" "/api/auth/me" 3
measure "services-status 401 (route + auth JOIN miss)" "/api/platform/services-status" 3
measure "kbs/all 401" "/api/kbs/all" 3
measure "orgs 401" "/api/orgs" 3
