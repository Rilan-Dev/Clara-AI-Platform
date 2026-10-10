#!/usr/bin/env bash
# Manual reproduction: boot the standalone server WITHOUT DATABASE_URL and
# capture the full output + exit behavior.
set -uo pipefail
OUT=/tmp/clara-boot-test
mkdir -p "$OUT"

# Build a sanitized environment from the repo .env (without sourcing it into
# this shell): parse KEY=VALUE lines like the e2e scripts do.
python3 - <<'EOF' > /tmp/clara-boot-test/envfile
import re
for line in open("/home/z/my-project/Clara-AI-Platform/.env"):
    m = re.match(r"^\s*([A-Z0-9_]+)=(.*)$", line)
    if m:
        k, v = m.group(1), m.group(2).strip().strip('"').strip("'")
        if k in ("DATABASE_URL", "E2E_BASE_URL"):
            continue
        print(f"{k}={v}")
EOF

# load into a clean sub-environment
set -a
source /tmp/clara-boot-test/envfile
set +a
export PORT=3199
export HOSTNAME=127.0.0.1
export NODE_ENV=production

cd /tmp/clara-boot-test   # empty cwd: no .env can be re-loaded
timeout 30 node /home/z/my-project/Clara-AI-Platform/scripts/start.mjs > "$OUT/boot.log" 2>&1
code=$?
echo "EXIT_CODE=$code (124 = still running after 30s, killed by timeout)"
echo "──── boot.log ────"
cat "$OUT/boot.log"
