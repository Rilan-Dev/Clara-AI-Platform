#!/usr/bin/env bash
# Complete the authed live verification: login as platform admin (seed default
# creds or .env ADMIN_PASSWORD), then check /api/platform/stats and /dashboard.
set -u
cd /home/z/my-project/Clara-AI-Platform

COOKIE=/home/z/my-project/scripts/cookies-admin.txt
rm -f "$COOKIE"

ADMIN_EMAIL="admin@clara.ai"
ENV_PASS=$(grep -E '^ADMIN_PASSWORD' .env | cut -d= -f2 | tr -d '"')

try_login() {
  local pass="$1"
  local code
  code=$(curl -s -c "$COOKIE" -o /tmp/login2.json -w "%{http_code}" --max-time 15 \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$pass\"}" \
    http://localhost:3000/api/auth/login)
  echo "$code"
}

echo "── login attempt 1: .env ADMIN_PASSWORD ──"
CODE=$(try_login "$ENV_PASS")
echo "HTTP $CODE"; head -c 200 /tmp/login2.json; echo
if [ "$CODE" != "200" ]; then
  echo "── login attempt 2: seed default Admin1234! ──"
  CODE=$(try_login "Admin1234!")
  echo "HTTP $CODE"; head -c 200 /tmp/login2.json; echo
fi

if [ "$CODE" = "200" ]; then
  echo
  echo "── GET /api/platform/stats (authed) ──"
  curl -s -b "$COOKIE" --max-time 15 http://localhost:3000/api/platform/stats | head -c 600; echo
  echo
  echo "── GET /api/platform/revenue (authed) ──"
  curl -s -b "$COOKIE" --max-time 15 http://localhost:3000/api/platform/revenue | head -c 400; echo
  echo
  echo "── GET /dashboard (authed) ──"
  curl -s -b "$COOKIE" -o /tmp/dash2.html -w "HTTP %{http_code}  size=%{size_download}B\n" --max-time 30 http://localhost:3000/dashboard
  grep -oiE "dashboard|organisations|revenue|MRR" /tmp/dash2.html | sort | uniq -c | sort -rn | head -5 || echo "no keywords (client-rendered?)"
else
  echo "LOGIN FAILED with known credential candidates — skipping authed checks"
fi
