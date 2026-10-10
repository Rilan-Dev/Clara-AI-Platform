#!/usr/bin/env bash
# Boot Clara production server in background and verify Phase 2 acceptance criteria
# against the live remote DB (180.188.231.138). Read-only page checks + admin login.
set -u
cd /home/z/my-project/Clara-AI-Platform

LOG=/home/z/my-project/scripts/server.log
COOKIE=/home/z/my-project/scripts/cookies.txt
rm -f "$LOG" "$COOKIE"

echo "── starting server (npm start, background) ──"
nohup npm start > "$LOG" 2>&1 &
SERVER_PID=$!
echo "server pid: $SERVER_PID"

# wait for readiness (up to 90s)
READY=0
for i in $(seq 1 90); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/api/subscriptions/plans; then
    READY=1; break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "SERVER FAILED TO START — last 40 log lines:"; tail -40 "$LOG"; kill $SERVER_PID 2>/dev/null; exit 1
fi
echo "── server ready after ~${i}s ──"
echo

echo "── [1] GET / (marketing landing page) ──"
curl -s -o /tmp/landing.html -w "HTTP %{http_code}  size=%{size_download}B\n" --max-time 30 http://localhost:3000/
grep -oiE "Clara|Knowledge|Voice|Pricing|Assistant" /tmp/landing.html | sort | uniq -c | sort -rn | head -6 || echo "NO MARKETING KEYWORDS FOUND"

echo
echo "── [2] GET /pricing (live plan data from DB) ──"
curl -s -o /tmp/pricing.html -w "HTTP %{http_code}  size=%{size_download}B\n" --max-time 30 http://localhost:3000/pricing
for plan in free starter pro enterprise; do
  grep -qi "$plan" /tmp/pricing.html && echo "  plan '$plan' present ✓" || echo "  plan '$plan' MISSING ✗"
done

echo
echo "── [3] GET /api/subscriptions/plans (public JSON) ──"
curl -s --max-time 15 http://localhost:3000/api/subscriptions/plans | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{const j=JSON.parse(d);const plans=j.plans||j;
    if(Array.isArray(plans)){console.log('  HTTP JSON OK — plans:',plans.length);
      plans.forEach(p=>console.log('   -',p.id??p.planId??p.name,'| price:',p.price_usd??p.price??'?','| KBs:',p.max_kbs??'?','| voice:',p.voice_enabled??'?'));}
    else console.log('  unexpected shape:',d.slice(0,200));
  }catch(e){console.log('  NON-JSON:',d.slice(0,200))}
});"

echo
echo "── [4] POST /api/auth/login (admin) → session ──"
ADMIN_USER=$(grep -E '^ADMIN_USERNAME' .env | cut -d= -f2 | tr -d '"')
ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD' .env | cut -d= -f2 | tr -d '"')
curl -s -c "$COOKIE" -o /tmp/login.json -w "HTTP %{http_code}\n" --max-time 15 \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  http://localhost:3000/api/auth/login
head -c 300 /tmp/login.json; echo

echo
echo "── [5] GET /api/platform/stats (authed super-admin) ──"
curl -s -b "$COOKIE" --max-time 15 http://localhost:3000/api/platform/stats | head -c 500; echo

echo
echo "── [6] GET /dashboard (authed) ──"
curl -s -b "$COOKIE" -o /tmp/dash.html -w "HTTP %{http_code}  size=%{size_download}B\n" --max-time 30 http://localhost:3000/dashboard

echo
echo "── [7] outbox relay API auth (RabbitMQ Task 7: internal endpoints) ──"
WS=$(grep -E '^WORKER_SECRET' .env | cut -d= -f2 | tr -d '"')
echo -n "  no-token  → HTTP "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 http://localhost:3000/api/internal/outbox
echo -n "  bad-token → HTTP "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 -H "Authorization: Bearer wrong" http://localhost:3000/api/internal/outbox
echo -n "  good-token → HTTP "
curl -s -o /tmp/outbox.json -w "%{http_code}\n" --max-time 15 -H "Authorization: Bearer $WS" "http://localhost:3000/api/internal/outbox?limit=5"
head -c 200 /tmp/outbox.json; echo

echo
echo "── server still running (pid $SERVER_PID); log tail: ──"
tail -15 "$LOG"
