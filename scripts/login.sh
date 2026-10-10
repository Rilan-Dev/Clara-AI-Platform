#!/bin/bash
# Login helper: signs in via API, injects token into browser localStorage AND
# clara_platform_token cookie (middleware requires the cookie for admin pages).
# usage: ./login.sh <email> <password>
set -u
EMAIL="${1:-admin@clara.ai}"
PASS="${2:-Admin1234!}"
RESP=$(curl -s --max-time 60 -X POST ${AUDIT_BASE:-http://localhost:3000}/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('accessToken') or '')")
if [ -z "$TOKEN" ]; then echo "LOGIN FAILED: $RESP"; exit 1; fi
agent-browser open ${AUDIT_BASE:-http://localhost:3000}/login >/dev/null 2>&1
agent-browser eval "localStorage.setItem('clara-platform-token', '$TOKEN'); 'token set'" >/dev/null 2>&1
agent-browser cookies set clara_platform_token "$TOKEN" >/dev/null 2>&1
agent-browser cookies set clara_token "$TOKEN" >/dev/null 2>&1
echo "logged in as $EMAIL (token+cookie set)"
