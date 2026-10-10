#!/bin/bash
# Quick KB upload + queue verification against local server.
# usage: kb_upload_test.sh [base_url]
set -eu
BASE="${1:-http://localhost:3000}"
EMAIL="demo@clara.ai"; PASS="Demo1234!"
ORG="10000000-0000-0000-0000-000000000001"

TOKEN=$(curl -s --max-time 30 -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
[ -z "$TOKEN" ] && { echo "login failed"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

# pick the Insurance FAQs KB
KB=$(curl -s --max-time 30 "$BASE/api/kbs/all" -H "$AUTH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k in d.get('kbs',[]):
    if k['id'].startswith('30000000'): print(k['id']); break
")
echo "KB=$KB"

# create a small test file
echo "Mobile audit upload test. Clara test document about insurance coverage for testing the ingest queue. $(date)" > /tmp/kb-test.txt

UP=$(curl -s --max-time 120 -X POST "$BASE/api/kbs/$KB/documents" -H "$AUTH" -F "files=@/tmp/kb-test.txt")
echo "UPLOAD RESP: $UP" | head -c 400; echo

DOC=$(echo "$UP" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    rs=d.get('results') or []
    print(rs[0].get('documentId') or rs[0].get('id','') if rs else '')
except Exception: print('')
")
echo "DOC=$DOC"
[ -z "$DOC" ] && exit 1

# poll status up to 30s
for i in $(seq 1 15); do
  sleep 2
  S=$(curl -s --max-time 30 "$BASE/api/kbs/$KB/documents/$DOC" -H "$AUTH" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    doc=d.get('document') or d
    print(doc.get('status','?'))
except Exception: print('ERR')
")
  echo "poll$i: status=$S"
  [ "$S" = "ready" ] || [ "$S" = "failed" ] && break
done